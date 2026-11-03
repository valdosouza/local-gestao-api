'use strict';
// Migração aditiva e idempotente; não altera tabelas/linhas comerciais do ERP.
const fs=require('node:fs'),path=require('node:path');
const db=require('../src/config/database');
(async()=>{
 db.initPool();
 try{
  const existing=await db.queryReadOnly("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'TB_APP_BUDGET_OP'");
  if(existing.length){console.log('Controle de envios AutoCenter já disponível.');return;}
  if(!process.argv.includes('--apply')){console.log('Pendente: TB_APP_BUDGET_OP. Para aplicar: node scripts/setup-autocenter.js --apply');process.exitCode=2;return;}
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/001-autocenter.sql'),'utf8').replace(/^--.*$/gm,'').trim().replace(/;$/,'');
  await db.query(sql);console.log('Controle de envios AutoCenter criado; nenhum registro comercial foi alterado.');
 }finally{process.exit(process.exitCode||0);}
})().catch(e=>{console.error(e.message);process.exit(1);});
