'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// Substitui o módulo antes de carregar o repositório: nenhuma conexão Firebird.
const db = require.resolve('../src/config/database');
const calls = [];
require.cache[db] = {id:db,filename:db,loaded:true,exports:{
  query:async (sql,params)=>{calls.push({sql,params:[...params]});return /COUNT/.test(sql)?[{TOTAL:27}]:[];},
  withTransaction:()=>{throw new Error('Teste não pode gravar');},
  queryInTransaction:()=>{throw new Error('Teste não pode gravar');},
}};
const repo = require('../src/budget/infrastructure/budget.repository');
test('filtros globais parametrizados, contagem e página com mesmo recorte',async()=>{
  calls.length=0;
  const result=await repo.findAll({limit:20,offset:20,filters:{number:' ORC-23 ',customerName:" O'BRIEN ",institutionId:7,dateFrom:'2026-01-01',dateTo:'2026-12-31'}});
  assert.equal(result.total,27);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].params,['ORC-23','ORC-23',"O'BRIEN",7,'2026-01-01','2026-12-31']);
  assert.deepEqual(calls[1].params,[20,20,...calls[0].params]);
  for(const {sql} of calls){
    assert.match(sql,/CTC_CODPED = 0/);
    assert.match(sql,/CTC_NUMERO.*CONTAINING/);
    assert.ok(sql.includes('CAST(c.CTC_CODIGO AS VARCHAR(20)) = ?'));
    assert.match(sql,/CTC_FANTASIA.*CONTAINING/);
    assert.ok(sql.includes('CTC_CODMHA = ?'));
    assert.ok(!sql.includes("O'BRIEN"));
  }
});
test('filtros vazios mantêm a consulta existente',async()=>{
  calls.length=0;
  await repo.findAll({filters:{number:'  ',customerName:'  ',institutionId:7}});
  assert.deepEqual(calls[0].params,[7]);
  assert.ok(!calls[0].sql.includes('CONTAINING'));
});
