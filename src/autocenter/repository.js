'use strict';
const db=require('../config/database');
const maps=require('./maps');
const {hash,validate,fail,id}=require('./document');
const env=require('../config/env');
const Firebird=require('node-firebird');
const transactionOptions={isolation:Firebird.ISOLATION_READ_UNCOMMITTED,wait:false};
const permission=require('../permission/application/permission.service');
const legacyEncoder=new Map(Array.from({length:256},(_,b)=>[new TextDecoder('windows-1252').decode(Uint8Array.of(b)),b]));
function parameter(column,value){
 if(!['CTC_OBS','OBS'].includes(column)||typeof value!=='string')return value;
 if((env.firebird.charset||'UTF8').toUpperCase()!=='WIN1252')return Buffer.from(value,'utf8');
 const bytes=[];for(const char of value){const b=legacyEncoder.get(char);if(b===undefined)fail('A observação contém um caractere não suportado pelo banco do Gestão.');bytes.push(b);}return Buffer.from(bytes);
}
async function blobs(rows){
 for(const row of rows)for(const key of Object.keys(row)){
  if(typeof row[key]==='function')row[key]=await new Promise((resolve,reject)=>row[key]((err,_name,stream)=>{
   if(err)return reject(err);const chunks=[];stream.on('data',c=>chunks.push(c));stream.on('error',reject);
   stream.on('end',()=>resolve(new TextDecoder((env.firebird.charset||'UTF8').toUpperCase()==='WIN1252'?'windows-1252':'utf-8').decode(Buffer.concat(chunks))));
  }));
  else if(typeof row[key]==='string'&&!['CTC_OBS','OBS','CTC_OBS_CORTE'].includes(key))row[key]=row[key].trimEnd();
 }
 return rows;
}
async function read(q,budgetId,institutionId,lock=false){
 const heads=await blobs(await q(`SELECT * FROM TB_COTACAO WHERE CTC_CODIGO = ? AND CTC_CODMHA = ?${lock?' WITH LOCK':''}`,[budgetId,institutionId]));
 if(!heads.length)fail('Orçamento não encontrado neste estabelecimento.',404);
 const head=heads[0];
 const items=await blobs(await q('SELECT * FROM TB_ITENS_CTC WHERE ICT_CODCTC = ? ORDER BY ICT_SEQUENCIA, ICT_CODIGO',[budgetId]));
 const links=await blobs(await q('SELECT * FROM TB_VEHICLE_SO WHERE TB_INSTITUTION_ID = ? AND TB_BUDGET_ID = ? AND TB_ORDER_ID = 0',[institutionId,budgetId]));
 const checks=await blobs(await q('SELECT * FROM TB_VEHICLE_CHECKLIST WHERE TB_INSTITUTION_ID = ? AND TB_BUDGET_ID = ? AND TB_ORDER_ID = 0',[institutionId,budgetId]));
 const vehicles=links.length?await blobs(await q(`SELECT * FROM TB_VEICULO WHERE VEI_PLACA = ?${lock?' WITH LOCK':''}`,[links[0].TB_VEHICLE_ID])):[];
 const version=hash({head,items,links,checks,vehicles});
 const vehicleData=vehicles.length?maps.pick(vehicles[0],maps.vehicle):{};
 if(vehicles.length)for(const [key,table,code,label] of [['brandId','TB_MARCA_VEICULO','MRC_CODIGO','MRC_DESCRICAO'],['modelId','TB_MODELO','MOD_CODIGO','MOD_DESCRICAO'],['kindId','TB_TP_VEICULO','TPV_CODIGO','TPV_DESCRICAO'],['colorId','TB_COR_VEICULO','COR_CODIGO','COR_DESCRICAO']]){
  const ref=vehicleData[key]>0?(await q('SELECT '+label+' AS LABEL FROM '+table+' WHERE '+code+' = ?',[vehicleData[key]]))[0]:null;
  vehicleData[key+'Label']=ref?.LABEL?.trim()||(vehicleData[key]>0?'Código '+vehicleData[key]:'Não informado');
 }

 return {raw:{head,items,links,checks,vehicles},version,
  header:{...maps.pick(head,maps.header),id:head.CTC_CODIGO,institutionId:head.CTC_CODMHA,salesmanId:head.CTC_CODVDO,
   date:head.CTC_DATA instanceof Date?`${head.CTC_DATA.getFullYear()}-${String(head.CTC_DATA.getMonth()+1).padStart(2,'0')}-${String(head.CTC_DATA.getDate()).padStart(2,'0')}`:String(head.CTC_DATA).slice(0,10),
   number:head.CTC_NUMERO||'',status:head.CTC_STATUS,approved:head.CTC_APROVADO,total:Number(head.CTC_VL_COTACAO||0),
   paymentLabel:(await q('SELECT FPT_DESCRICAO FROM TB_FORMAPAGTO WHERE FPT_CODIGO = ?',[head.CTC_CODFPG||0]))[0]?.FPT_DESCRICAO?.trim()||''},
  vehicleDirty:false,checklistDirty:false,
  items:items.map(r=>({...maps.pick(r,maps.item),id:r.ICT_CODIGO})),
  vehicle:links.length?{...vehicleData,...maps.pick(links[0],maps.link)}:null,
  checklist:checks.length?maps.pick(checks[0],maps.checklist):null,
  editable:!(head.CTC_CODPED>0)&&!['S'].includes(head.CTC_APROVADO)&&['A','N',''].includes(head.CTC_STATUS||'')&&['0',''].includes(head.CTC_TIPO||'')&&!(head.CTC_EMUSO||'').trim(),
 };
}
function publicDoc(doc){const {raw,...result}=doc;return result;}
function qFor(trx){return async(sql,params=[])=>blobs(await db.queryInTransaction(trx,sql,params));}
async function update(q,table,map,data,where,keys){
 const entries=Object.entries(map).filter(([k])=>data[k]!==undefined);
 if(entries.length)await q(`UPDATE ${table} SET ${entries.map(([,c])=>`"${c}" = ?`).join(', ')} WHERE ${where}`,[...entries.map(([k,c])=>parameter(c,data[k])),...keys]);
}
async function insert(q,table,values){const columns=Object.keys(values);await q(`INSERT INTO ${table} (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,Object.entries(values).map(([c,v])=>parameter(c,v)));}
function mapped(map,values){return Object.fromEntries(Object.entries(map).filter(([k])=>values[k]!==undefined).map(([k,c])=>[c,parameter(c,values[k])]));}
async function get(budgetId,institutionId){return db.withTransaction(async trx=>publicDoc(await read(qFor(trx),budgetId,institutionId)),{...transactionOptions,readOnly:true});}
async function ensureReferences(q,doc,institution,old){
 const costs=new Map();
 if(!(await q("SELECT EMP_CODIGO FROM TB_EMPRESA WHERE EMP_CODIGO = ? AND EMP_TIPO = 0 AND EMP_ATIVA = 'S'",[institution])).length)fail('Estabelecimento inválido.');
 if(!(await q('SELECT CLI_CODEMP FROM TB_CLIENTE WHERE CLI_CODEMP = ?',[doc.header.customerId])).length)fail('Cliente não encontrado.');
 if(!(await q('SELECT FPT_CODIGO FROM TB_FORMAPAGTO WHERE FPT_CODIGO = ?',[doc.header.paymentTypeId])).length)fail('Forma de pagamento não encontrada.');
 for(const item of doc.items){
  const rows=await q('SELECT PRO_TIPO, PRO_ATIVO, PRO_VL_CUSTO FROM TB_PRODUTO WHERE PRO_CODIGO = ?',[item.productId]);
  if(!rows.length||(rows[0].PRO_TIPO==='S')!==(item.type==='S'))fail('Produto/serviço incompatível com o cadastro.');
  costs.set(item.productId,Number(rows[0].PRO_VL_CUSTO||0));
  if(!item.id&&rows[0].PRO_ATIVO!=='S')fail('Produto/serviço inativo.');
  const previous=old?.raw.items.find(r=>r.ICT_CODIGO===item.id);
  if(item.type==='P'&&(!previous||previous.ICT_CODEST!==item.stockId||previous.ICT_CODTPR!==item.priceListId)){
   id(item.stockId,'estoque');id(item.priceListId,'tabela de preço');
   if(!(await q('SELECT ETS_CODIGO FROM TB_ESTOQUES WHERE ETS_CODIGO = ? AND ETS_CODMHA = ?',[item.stockId,institution])).length)fail('Estoque de outro estabelecimento.');
   if(!(await q('SELECT TPR_CODIGO FROM TB_TABELA_PRECO WHERE TPR_CODIGO = ? AND TPR_CODEMP = ?',[item.priceListId,institution])).length)fail('Tabela de preços de outro estabelecimento.');
  }
 }
 if(doc.vehicle && doc.vehicleDirty!==false){const v=doc.vehicle;
  for(const [table,column,key] of [['TB_MARCA_VEICULO','MRC_CODIGO','brandId'],['TB_TP_VEICULO','TPV_CODIGO','kindId'],['TB_COR_VEICULO','COR_CODIGO','colorId']]){
   if(!(await q(`SELECT ${column} FROM ${table} WHERE ${column} = ?`,[v[key]])).length)fail('Cadastro auxiliar de veículo inválido.');
  }
  if(!(await q('SELECT MOD_CODIGO FROM TB_MODELO WHERE MOD_CODIGO = ? AND MOD_CODMRC = ?',[v.modelId,v.brandId])).length)fail('Modelo não pertence à marca selecionada.');
 }
 return costs;
}
async function save({budgetId,institutionId,user,operationId,document}){
 id(institutionId,'estabelecimento');if(!/^[a-zA-Z0-9_-]{10,80}$/.test(operationId||''))fail('Identificador de envio inválido.');
 if(!budgetId){document.vehicleDirty=true;document.checklistDirty=true;}
 const totals=validate(document);const payloadHash=hash({budgetId:budgetId||null,institutionId,document});
 // Generators são independentes de transação no Firebird. Lacunas após rollback são normais.
 const newBudget=budgetId?0:Number((await db.query('SELECT GEN_ID(GN_COTACAO, 1) AS ID FROM RDB$DATABASE'))[0].ID);
 const newItemIds=[];for(const i of document.items)if(!i.id)newItemIds.push(Number((await db.query('SELECT GEN_ID(GN_ITENS_CTC, 1) AS ID FROM RDB$DATABASE'))[0].ID));
 const vehicleId=document.vehicle?Number((await db.query('SELECT GEN_ID(GN_VEICULO, 1) AS ID FROM RDB$DATABASE'))[0].ID):0;
 return db.withTransaction(async trx=>{
  const q=qFor(trx);
  const op=(await q('SELECT * FROM TB_APP_BUDGET_OP WHERE OP_KEY = ?',[operationId]))[0];
  if(op){if(op.USER_ID!==Number(user.sub)||op.INSTITUTION_ID!==institutionId||op.PAYLOAD_HASH!==payloadHash)fail('Identificador de envio já utilizado para outro conteúdo.',409);return publicDoc(await read(q,op.BUDGET_ID,institutionId));}
  let old;
  if(budgetId){old=await read(q,budgetId,institutionId,true);if(!old.editable)fail('Orçamento em uso no desktop, aprovado, encerrado ou convertido em pedido. Feche a edição no Gestão antes de continuar.',409);
   if(!document.version||old.version!==document.version)fail('O orçamento ou veículo mudou no ERP. Reabra os dados atuais antes de salvar; seu pendente foi mantido.',409);
   for(const i of document.items)if(i.id&&!old.raw.items.some(r=>r.ICT_CODIGO===i.id))fail('Item não pertence ao orçamento.');
   if(old.raw.items.some(r=>!document.items.some(i=>i.id===r.ICT_CODIGO))){
    const allowed=await permission.checkPermission({userId:Number(user.sub),userLevel:user.level,menu:'Fr_Cotacao',kind:'Excluir',situation:'S'});
    if(!allowed.result)fail('Usuário sem permissão para excluir itens.',403);
   }
  }else if(document.items.some(i=>i.id))fail('Novo orçamento não pode reutilizar IDs de itens.');
  if(document.checklist&&document.checklistDirty!==false&&document.vehicleDirty===false&&!old?.raw.links.length)fail('Confirme o vínculo do veículo antes de gravar o checklist.');
  const costs=await ensureReferences(q,document,institutionId,old);
  const target=budgetId||newBudget;
  await insert(q,'TB_APP_BUDGET_OP',{OP_KEY:operationId,USER_ID:Number(user.sub),INSTITUTION_ID:institutionId,BUDGET_ID:target,PAYLOAD_HASH:payloadHash});
  const h=document.header;
  if(!budgetId){id(Number(user.salesmanId),'vendedor do usuário');
   await insert(q,'TB_COTACAO',{CTC_CODIGO:target,CTC_CODPED:0,CTC_TIPO:'0',CTC_CODUSU:Number(user.sub),CTC_CODVDO:Number(user.salesmanId),CTC_CODMHA:institutionId,CTC_STATUS:'N',CTC_APROVADO:'N',CTC_EMUSO:'',...mapped(maps.header,h)});
  }else await update(q,'TB_COTACAO',maps.header,h,'CTC_CODIGO = ? AND CTC_CODMHA = ?',[target,institutionId]);
  await update(q,'TB_COTACAO',{quantity:'CTC_QT_PRODUTO',products:'CTC_VL_PRODUTO',services:'CTC_VL_SERVICO',discount:'CTC_VL_DESCONTO',discountPercent:'CTC_ALIQ_DESCONTO',total:'CTC_VL_COTACAO'},totals,'CTC_CODIGO = ?',[target]);
  for(const previous of old?.raw.items??[])if(!document.items.some(i=>i.id===previous.ICT_CODIGO))await q('DELETE FROM TB_ITENS_CTC WHERE ICT_CODIGO = ? AND ICT_CODCTC = ?',[previous.ICT_CODIGO,target]);
  for(const [sequence,i] of document.items.entries()){
   const values={...i,stockId:i.type==='S'?0:i.stockId,priceListId:i.type==='S'?0:i.priceListId};
   if(i.id)await update(q,'TB_ITENS_CTC',maps.item,values,'ICT_CODIGO = ? AND ICT_CODCTC = ?',[i.id,target]);
   else await insert(q,'TB_ITENS_CTC',{ICT_CODIGO:newItemIds.shift(),ICT_CODCTC:target,ICT_CODPED:0,ICT_DISPON:'S',ICT_VL_CUSTO:costs.get(i.productId)??0,ICT_SEQUENCIA:sequence+1,...mapped(maps.item,values)});
  }
  if(document.vehicle && document.vehicleDirty!==false){
   const v=document.vehicle;const row=(await q('SELECT * FROM TB_VEICULO WHERE VEI_PLACA = ? WITH LOCK',[v.plate]))[0];
   if(row&&row.VEI_CODEMP>0&&row.VEI_CODEMP!==h.customerId)fail('Veículo pertence a outro cliente. Confira o cadastro no Gestão.',409);
   if(row&&(!old?.raw.vehicles.length||old.raw.vehicles[0].VEI_PLACA!==v.plate)){
    if(!document.vehicleVersion||hash(row)!==document.vehicleVersion)fail('Confirme a versão atual do veículo pela pesquisa de placas antes de salvar.',409);
   }
   if(row)await update(q,'TB_VEICULO',maps.vehicle,v,'VEI_CODIGO = ?',[row.VEI_CODIGO]);
   else await insert(q,'TB_VEICULO',{VEI_CODIGO:vehicleId,VEI_CODEMP:h.customerId,...mapped(maps.vehicle,v)});
   const keys={TB_INSTITUTION_ID:institutionId,TB_BUDGET_ID:target,TB_ORDER_ID:0};
   await q(`UPDATE OR INSERT INTO TB_VEHICLE_SO (${Object.keys({...keys,MOBILE:(old?.raw.links[0]?.MOBILE??0),...mapped(maps.link,v)}).map(c=>`"${c}"`).join(',')}) VALUES (${Object.keys({...keys,MOBILE:(old?.raw.links[0]?.MOBILE??0),...mapped(maps.link,v)}).map(()=>'?').join(',')}) MATCHING (TB_INSTITUTION_ID,TB_BUDGET_ID,TB_ORDER_ID)`,Object.values({...keys,MOBILE:(old?.raw.links[0]?.MOBILE??0),...mapped(maps.link,v)}));
  }
  if(document.checklist && document.checklistDirty!==false){
   const values={TB_INSTITUTION_ID:institutionId,TB_BUDGET_ID:target,TB_ORDER_ID:0,MOBILE:(old?.raw.checks[0]?.MOBILE??0),...mapped(maps.checklist,document.checklist)};
   await q('UPDATE OR INSERT INTO TB_VEHICLE_CHECKLIST ('+Object.keys(values).map(c=>'"'+c+'"').join(',')+') VALUES ('+Object.keys(values).map(()=>'?').join(',')+') MATCHING (TB_INSTITUTION_ID,TB_BUDGET_ID,TB_ORDER_ID)',Object.values(values));
  }

  return publicDoc(await read(q,target,institutionId));
 },transactionOptions);
}
module.exports={get,save,read,publicDoc,qFor,blobs};
