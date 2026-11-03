'use strict';
const {Router}=require('express');
const db=require('../config/database');
const permission=require('../permission/application/permission.service');
const repo=require('./repository');
const {hash,fail,id}=require('./document');
const maps=require('./maps');
const router=Router();
const wrap=f=>async(req,res,next)=>{try{await f(req,res);}catch(e){if(!e.status && /lock conflict|deadlock|update conflicts/i.test(e.message))e=Object.assign(new Error('Outro usuário está alterando os dados. Atualize o orçamento antes de tentar novamente.'),{status:409});if(!e.status && /foreign key/i.test(e.message))e=Object.assign(new Error('O item possui vínculos no Gestão. Confira técnicos ou outros detalhes antes de excluí-lo.'),{status:409});next(e);}};
async function permit(user,kind){const result=await permission.checkPermission({userId:Number(user.sub),userLevel:user.level,menu:'Fr_Cotacao',kind,situation:'S'});if(!result.result)fail('Usuário sem permissão para esta operação.',403);}
const institution=req=>id(Number(req.query.institutionId??req.body?.institutionId),'estabelecimento');
router.get('/budgets/:id',wrap(async(req,res)=>{await permit(req.user,'Visualizar');res.json(await repo.get(id(Number(req.params.id),'orçamento'),institution(req)));}));
router.get('/operations/:key',wrap(async(req,res)=>{
 await permit(req.user,'Visualizar');const rows=await db.queryReadOnly('SELECT BUDGET_ID FROM TB_APP_BUDGET_OP WHERE OP_KEY = ? AND USER_ID = ? AND INSTITUTION_ID = ?',[req.params.key,Number(req.user.sub),institution(req)]);
 if(!rows.length)fail('Envio ainda não confirmado no servidor.',404);res.json({id:rows[0].BUDGET_ID});
}));
async function save(req,res){
 const budgetId=req.params.id?id(Number(req.params.id),'orçamento'):null;
 await permit(req.user,budgetId?'Alterar':'Inserir');
 const ready=await db.queryReadOnly("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'TB_APP_BUDGET_OP'");
 if(!ready.length)fail('O servidor precisa da atualização do AutoCenter. Contate o responsável pela instalação.',503);
 const result=await repo.save({budgetId,institutionId:institution(req),user:req.user,operationId:req.body.operationId,document:req.body.document});
 res.status(budgetId?200:201).json(result);
}
router.post('/budgets',wrap(save));router.put('/budgets/:id',wrap(save));
router.get('/catalog/:kind',wrap(async(req,res)=>{
 await permit(req.user,'Visualizar');const inst=institution(req),kind=req.params.kind;
 const offset=Math.max(0,Math.floor(Number(req.query.offset)||0)),limit=20,search=String(req.query.search||'').trim().slice(0,100);
 let table,code,label,where='1=1',params=[];
 const simple={brands:['TB_MARCA_VEICULO','MRC_CODIGO','MRC_DESCRICAO'],models:['TB_MODELO','MOD_CODIGO','MOD_DESCRICAO'],kinds:['TB_TP_VEICULO','TPV_CODIGO','TPV_DESCRICAO'],colors:['TB_COR_VEICULO','COR_CODIGO','COR_DESCRICAO'],stocks:['TB_ESTOQUES','ETS_CODIGO','ETS_DESCRICAO']};
 if(simple[kind]){
  [table,code,label]=simple[kind];
  if(kind==='models'){where+=' AND MOD_CODMRC = ?';params.push(id(Number(req.query.brandId),'marca'));}
  if(kind==='stocks'){where+=' AND ETS_CODMHA = ?';params.push(inst);}
 }else if(['products','services'].includes(kind)){
  table='TB_PRODUTO';code='PRO_CODIGO';label='PRO_DESCRICAO';where="PRO_ATIVO = 'S' AND "+(kind==='services'?"PRO_TIPO = 'S'":"COALESCE(PRO_TIPO, '') <> 'S'");
 }else if(kind==='prices'){
  const rows=await db.queryReadOnly('SELECT P.PRC_CODTPR AS ID,T.TPR_NOME AS LABEL,P.PRC_VL_VDA AS PRICE FROM TB_PRECO P JOIN TB_TABELA_PRECO T ON T.TPR_CODIGO = P.PRC_CODTPR WHERE P.PRC_CODPRO = ? AND T.TPR_CODEMP = ? ORDER BY T.TPR_NOME',[id(Number(req.query.productId),'produto'),inst]);
  return res.json({data:rows.map(r=>({id:r.ID,label:r.LABEL.trim(),price:Number(r.PRICE)})),meta:{total:rows.length,offset:0,limit:rows.length}});
 }else if(kind==='vehicles'){
  const rows=await db.queryReadOnly('SELECT FIRST 20 SKIP ? * FROM TB_VEICULO WHERE VEI_PLACA CONTAINING ? ORDER BY VEI_PLACA',[offset,search]);
  const count=await db.queryReadOnly('SELECT COUNT(*) AS TOTAL FROM TB_VEICULO WHERE VEI_PLACA CONTAINING ?',[search]);
  await repo.blobs(rows);
  return res.json({data:rows.map(r=>({id:r.VEI_CODIGO,label:r.VEI_PLACA,version:hash(r),value:maps.pick(r,maps.vehicle)})),meta:{total:Number(count[0].TOTAL),offset,limit}});
 }else fail('Pesquisa não encontrada.',404);
 if(search){where+=` AND (${label} CONTAINING ? OR CAST(${code} AS VARCHAR(20)) = ?)`;params.push(search,search);}
 const count=await db.queryReadOnly(`SELECT COUNT(*) AS TOTAL FROM ${table} WHERE ${where}`,params);
 const rows=await db.queryReadOnly(`SELECT FIRST ? SKIP ? ${code} AS ID,${label} AS LABEL FROM ${table} WHERE ${where} ORDER BY ${label}`,[limit,offset,...params]);
 res.json({data:rows.map(r=>({id:r.ID,label:r.LABEL.trim()})),meta:{total:Number(count[0].TOTAL),offset,limit}});
}));
module.exports=router;
