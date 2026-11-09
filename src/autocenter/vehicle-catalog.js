'use strict';

const Firebird = require('node-firebird');
const db = require('../config/database');
const permission = require('../permission/application/permission.service');
const {fail, id} = require('./document');

const catalogs = {
  brands: {table: 'TB_MARCA_VEICULO', code: 'MRC_CODIGO', label: 'MRC_DESCRICAO', generator: 'GN_MARCAMODELO', menu: 'Fr_MarcaModelo'},
  models: {table: 'TB_MODELO', code: 'MOD_CODIGO', label: 'MOD_DESCRICAO', generator: 'GN_MODELO', menu: 'Fr_MarcaModelo'},
  kinds: {table: 'TB_TP_VEICULO', code: 'TPV_CODIGO', label: 'TPV_DESCRICAO', menu: 'Fr_Tp_Veiculo'},
  colors: {table: 'TB_COLOR', code: 'ID', label: 'DESCRIPTION', menu: 'Fr_Veiculo'},
};

async function canCreate(user, kind) {
  const catalog = catalogs[kind];
  if (!catalog) return false;
  const result = await permission.checkPermission({
    userId: Number(user.sub), userLevel: user.level,
    menu: catalog.menu, kind: 'Inserir', situation: 'S',
  });
  return result.result;
}

async function create(user, kind, input) {
  const catalog = catalogs[kind];
  if (!catalog) fail('Cadastro indisponível para inclusão pelo app.', 404);
  if (!await canCreate(user, kind)) fail('Usuário sem permissão para incluir neste cadastro.', 403);
  const label = typeof input.label === 'string' ? input.label.trim().toUpperCase() : '';
  if (!label || label.length > 100 || /[\x00-\x1f\x7f]/.test(label)) {
    fail('Informe uma descrição de até 100 caracteres.');
  }
  const brandId = kind === 'models' ? id(Number(input.brandId), 'marca') : null;
  // Os mesmos generators usados pelos controllers Delphi de marca/modelo.
  const generatedId = catalog.generator
    ? Number((await db.query(`SELECT GEN_ID(${catalog.generator}, 1) AS ID FROM RDB$DATABASE`))[0].ID)
    : null;
  try {
    return await db.withTransaction(async transaction => {
      const q = (sql, params = []) => db.queryInTransaction(transaction, sql, params);
      if (brandId && !(await q('SELECT MRC_CODIGO FROM TB_MARCA_VEICULO WHERE MRC_CODIGO = ?', [brandId])).length) {
        fail('Marca não encontrada. Selecione a marca novamente.');
      }
      const scope = brandId ? ' AND MOD_CODMRC = ?' : '';
      const existing = await q(
        `SELECT FIRST 1 ${catalog.code} AS ID, ${catalog.label} AS LABEL FROM ${catalog.table} WHERE UPPER(TRIM(${catalog.label})) = ?${scope} ORDER BY ${catalog.code}`,
        brandId ? [label, brandId] : [label],
      );
      if (existing.length) return {id: existing[0].ID, label: existing[0].LABEL.trim(), created: false};
      // Tipo segue getNextByField do Delphi. TB_COLOR não possui generator.
      // SERIALIZABLE protege o próximo código e a inclusão, mesmo na tabela vazia.
      const code = generatedId ?? Number((await q(`SELECT COALESCE(MAX(${catalog.code}), 0) + 1 AS ID FROM ${catalog.table}`))[0].ID);
      id(code, 'cadastro');
      const columns = [catalog.code, catalog.label];
      const values = [code, label];
      if (brandId) { columns.push('MOD_CODMRC'); values.push(brandId); }
      if (kind === 'brands') { columns.push('MRC_CODFAB'); values.push(0); }
      await q(`INSERT INTO ${catalog.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
      return {id: code, label, created: true};
    }, {isolation: Firebird.ISOLATION_SERIALIZABLE, wait: false});
  } catch (error) {
    if (/lock conflict|deadlock|update conflicts|violation of PRIMARY|violation of UNIQUE/i.test(error.message)) {
      fail('O cadastro está sendo atualizado no Gestão. Pesquise novamente antes de repetir a inclusão.', 409);
    }
    throw error;
  }
}

module.exports = {canCreate, create};
