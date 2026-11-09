'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/config/database');
const permission = require('../src/permission/application/permission.service');
const catalog = require('../src/autocenter/vehicle-catalog');
const Firebird = require('node-firebird');
let allowed, statements, rows, generated;
permission.checkPermission = async args => ({result: args.menu === 'Fr_Cotacao' || (allowed && args.userId === 3 && ['Fr_MarcaModelo', 'Fr_Tp_Veiculo', 'Fr_Veiculo'].includes(args.menu))});
db.query = async () => { generated++; return [{ID: 42}]; };
db.queryInTransaction = async (_transaction, sql, params = []) => {
  statements.push({sql, params});
  if (sql.includes('FROM TB_MARCA_VEICULO WHERE MRC_CODIGO')) return params[0] === 7 ? [{MRC_CODIGO: 7}] : [];
  if (sql.includes('UPPER(TRIM(')) return rows;
  if (sql.includes('MAX(TPV_CODIGO)')) return [{ID: 20}];
  if (sql.includes('MAX(ID)') && sql.includes('FROM TB_COLOR')) return [{ID: 17}];
  if (sql.startsWith('INSERT')) return [];
  throw Error('SQL inesperado ' + sql);
};
db.withTransaction = async (fn, options) => {
  assert.deepEqual(options, {isolation: Firebird.ISOLATION_SERIALIZABLE, wait: false});
  return fn({});
};
db.queryReadOnly = async sql => {
  assert.ok(sql.includes('FROM TB_COLOR'), sql);
  if (sql.includes('COUNT(*)')) return [{TOTAL: 1}];
  return [{ID: 4, LABEL: 'BRANCA'}];
};
let server, url;
test.before(async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = {sub: 3, level: 0}; next(); });
  app.use(require('../src/autocenter/routes'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({error: err.message}));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { allowed = true; statements = []; rows = []; generated = 0; });

test('rota de cores retorna IDs do cadastro usado pelo Delphi', async () => {
  const response = await fetch(url + '/catalog/colors?institutionId=2');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, [{id: 4, label: 'BRANCA'}]);
  assert.equal(body.canCreate, true);
});
test('permissão de orçamento não autoriza cadastro e nível do corpo é ignorado', async () => {
  allowed = false;
  const response = await fetch(url + '/catalog/brands?institutionId=2', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: 'Teste', userLevel: 1})});
  assert.equal(response.status, 403); assert.equal(generated, 0); assert.equal(statements.length, 0);
});
test('marca usa generator e fabricante zero como o Delphi', async () => {
  const result = await catalog.create({sub: 3, level: 0}, 'brands', {label: ' Nova marca '});
  assert.deepEqual(result, {id: 42, label: 'NOVA MARCA', created: true});
  assert.deepEqual(statements.at(-1).params, [42, 'NOVA MARCA', 0]);
});
test('modelo exige marca existente e grava o vínculo correto', async () => {
  await assert.rejects(catalog.create({sub: 3}, 'models', {label: 'Modelo', brandId: 9}), /Marca não encontrada/);
  assert.ok(!statements.some(s => s.sql.startsWith('INSERT')));
  const result = await catalog.create({sub: 3}, 'models', {label: 'Modelo', brandId: 7});
  assert.equal(result.id, 42); assert.deepEqual(statements.at(-1).params, [42, 'MODELO', 7]);
});
test('repetição reutiliza o cadastro existente na mesma marca', async () => {
  rows = [{ID: 13, LABEL: 'MODELO '}];
  const result = await catalog.create({sub: 3}, 'models', {label: ' modelo ', brandId: 7});
  assert.deepEqual(result, {id: 13, label: 'MODELO', created: false});
  assert.deepEqual(statements.at(-1).params, ['MODELO', 7]);
  assert.ok(!statements.some(s => s.sql.startsWith('INSERT')));
});
test('tipo usa próximo código sob transação serializável e valida a descrição', async () => {
  const result = await catalog.create({sub: 3}, 'kinds', {label: 'Utilitário'});
  assert.equal(result.id, 20); assert.equal(generated, 0);
  for (const label of ['', ' '.repeat(4), 'a'.repeat(101), 'nome\nquebrado']) {
    await assert.rejects(catalog.create({sub: 3}, 'kinds', {label}), /descrição/);
  }
});
test('POST de cor grava TB_COLOR e repetir o nome reutiliza o ID', async () => {
  const post = () => fetch(url + '/catalog/colors?institutionId=2', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({label: ' Verde escuro '}),
  });
  const response = await post();
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {id: 17, label: 'VERDE ESCURO', created: true});
  assert.equal(generated, 0);
  assert.deepEqual(statements.at(-1), {
    sql: 'INSERT INTO TB_COLOR (ID, DESCRIPTION) VALUES (?, ?)',
    params: [17, 'VERDE ESCURO'],
  });
  rows = [{ID: 17, LABEL: 'VERDE ESCURO'}]; statements = [];
  const retry = await post();
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), {id: 17, label: 'VERDE ESCURO', created: false});
  assert.ok(!statements.some(s => s.sql.startsWith('INSERT')));
});

test('cor exige Inserir em Veículos tanto na oferta quanto no POST', async () => {
  allowed = false;
  const list = await fetch(url + '/catalog/colors?institutionId=2');
  assert.equal((await list.json()).canCreate, false);
  const response = await fetch(url + '/catalog/colors?institutionId=2', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({label: 'Verde escuro', userLevel: 1}),
  });
  assert.equal(response.status, 403);
  assert.equal(statements.length, 0);
});
