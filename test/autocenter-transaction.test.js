'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require.resolve('../src/config/database');
let statements=[],commit=false,rollback=false,failTable=null,op=null;
const head={CTC_CODIGO:11,CTC_CODMHA:7,CTC_CODPED:0,CTC_CODUSU:3,CTC_CODVDO:8,CTC_DATA:new Date(2026,10,2),CTC_STATUS:'N',CTC_APROVADO:'N',CTC_EMUSO:'',CTC_VL_COTACAO:0};
async function q(_trx,sql,params=[]){statements.push({sql,params});if(failTable&&sql.startsWith('INSERT INTO '+failTable))throw Error('Falha simulada');
 if(sql.startsWith('SELECT * FROM TB_APP'))return op?[op]:[];
 if(sql.startsWith('SELECT * FROM TB_COTACAO'))return [head];
 if(sql.startsWith('SELECT * FROM TB_ITENS')||sql.startsWith('SELECT * FROM TB_VEHICLE')||sql.startsWith('SELECT * FROM TB_VEICULO'))return [];
 if(sql.startsWith('SELECT FPT_DESCRICAO'))return [{FPT_DESCRICAO:'Dinheiro'}];
 if(sql.startsWith('SELECT PRO_TIPO'))return [{PRO_TIPO:params[0]===3?'S':'P',PRO_ATIVO:'S'}];
 if(sql.startsWith('SELECT '))return [{OK:1}];return [];
}
require.cache[path]={id:path,filename:path,loaded:true,exports:{query:async sql=>[{ID:sql.includes('GN_COTACAO')?11:22}],queryInTransaction:q,
 withTransaction:async fn=>{try{const value=await fn({transaction:'única'});commit=true;return value;}catch(e){rollback=true;throw e;}}}};
const repo=require('../src/autocenter/repository'),{fixture}=require('./fixtures/autocenter');
const input=()=>({budgetId:null,institutionId:7,user:{sub:3,level:1,salesmanId:8},operationId:'request_123456',document:fixture()});
test.beforeEach(()=>{statements=[];commit=false;rollback=false;failTable=null;op=null;head.CTC_EMUSO='';});
test('cabeçalho, itens, veículo, vínculo, checklist e chave de envio compartilham transação',async()=>{
 const d=input();d.document.items[0].stockId=1;d.document.items[0].priceListId=1;
 await repo.save(d);assert.equal(commit,true);assert.equal(rollback,false);
 for(const table of ['TB_APP_BUDGET_OP','TB_COTACAO','TB_ITENS_CTC','TB_VEICULO'])assert.ok(statements.some(s=>s.sql.startsWith('INSERT INTO '+table)));
 for(const table of ['TB_VEHICLE_SO','TB_VEHICLE_CHECKLIST'])assert.ok(statements.some(s=>s.sql.startsWith('UPDATE OR INSERT INTO '+table)));
 const discount=statements.find(s=>s.sql.startsWith('UPDATE TB_COTACAO SET "CTC_QT_PRODUTO"'));
 assert.equal(discount.params[2],30);assert.equal(discount.params[3],3);assert.equal(discount.params[5],64.31);
});
test('falha em item impede commit de cabeçalho e da operação',async()=>{
 const d=input();d.document.items[0].stockId=1;d.document.items[0].priceListId=1;failTable='TB_ITENS_CTC';
 await assert.rejects(repo.save(d),/Falha simulada/);assert.equal(commit,false);assert.equal(rollback,true);
});
test('orçamento em uso no desktop e versão divergente são recusados antes de escrever',async()=>{
 const d=input();d.budgetId=11;head.CTC_EMUSO='DESKTOP';await assert.rejects(repo.save(d),e=>e.status===409);head.CTC_EMUSO='';
 await assert.rejects(repo.save(d),e=>e.status===409);assert.ok(!statements.some(s=>s.sql.startsWith('INSERT')));
});
test('repetir uma operação confirmada devolve orçamento sem inserir novamente',async()=>{
 const {hash,validate}=require('../src/autocenter/document'),d=input();validate(d.document);
 op={USER_ID:3,INSTITUTION_ID:7,BUDGET_ID:11,PAYLOAD_HASH:hash({budgetId:null,institutionId:7,document:d.document})};
 await repo.save(d);assert.ok(!statements.some(s=>s.sql.startsWith('INSERT')||s.sql.startsWith('UPDATE')));
 d.document.header.contact='mudança';await assert.rejects(repo.save(d),e=>e.status===409);
});

test('observações são enviadas como BLOB ANSI, preservando acentos e euro',async()=>{
 const d=input();d.document.header.notes='Óleo, revisão €';d.document.items[0].stockId=1;d.document.items[0].priceListId=1;
 await repo.save(d);const stmt=statements.find(s=>s.sql.startsWith('INSERT INTO TB_COTACAO'));
 assert.ok(stmt.params.some(p=>Buffer.isBuffer(p)&&new TextDecoder('windows-1252').decode(p)==='Óleo, revisão €'));
});
