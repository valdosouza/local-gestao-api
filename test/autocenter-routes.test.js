'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const permission=require('../src/permission/application/permission.service'),repo=require('../src/autocenter/repository');
let allowed=false,calls=0,last;
permission.checkPermission=async args=>{last=args;return {result:allowed};};
repo.get=async(id,inst)=>{calls++;return {id,institutionId:inst};};
repo.save=async()=>{calls++;throw Error('Não pode gravar');};
let server,url;
test.before(async()=>{
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={sub:3,level:0};next();});app.use(require('../src/autocenter/routes'));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;
});
test.after(()=>new Promise(r=>server.close(r)));
test('POST não aceita nível enviado pelo cliente como permissão',async()=>{
 const response=await fetch(url+'/budgets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userLevel:1,userId:999,institutionId:7})});
 assert.equal(response.status,403);assert.equal(calls,0);assert.equal(last.userId,3);assert.equal(last.userLevel,0);assert.equal(last.kind,'Inserir');
});
test('consulta exige estabelecimento e encaminha o recorte correto',async()=>{
 allowed=true;let r=await fetch(url+'/budgets/42');assert.equal(r.status,400);assert.equal(calls,0);
 r=await fetch(url+'/budgets/42?institutionId=7');assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:42,institutionId:7});
});
