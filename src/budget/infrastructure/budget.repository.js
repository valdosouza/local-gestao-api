'use strict';

const { query, withTransaction, queryInTransaction } = require('../../config/database');
const Budget = require('../domain/budget.entity');

class BudgetRepository {
  /**
   * Lista orçamentos com paginação e filtros opcionais.
   *
   * Filtros suportados:
   *   status       {string}  — filtra por CTC_STATUS
   *   userId       {number}  — filtra por CTC_CODUSU
   *   customerId   {number}  — filtra por CTC_CODEMP
   *   salesmanId   {number}  — filtra por CTC_CODVDO
   *   institutionId {number} — filtra por CTC_CODMHA
   *   dateFrom     {string}  — data inicial (YYYY-MM-DD)
   *   dateTo       {string}  — data final   (YYYY-MM-DD)
   */
  async findAll({ limit = 20, offset = 0, filters = {} } = {}) {
    const conditions = [];
    const params     = [];

    conditions.push('c.CTC_CODPED = 0');

    // Os mesmos filtros são aplicados à contagem e à página, com parâmetros.
    const number = typeof filters.number === 'string' ? filters.number.trim() : '';
    const customerName = typeof filters.customerName === 'string' ? filters.customerName.trim() : '';
    if (number) {
      conditions.push("(COALESCE(c.CTC_NUMERO, '') CONTAINING ? OR CAST(c.CTC_CODIGO AS VARCHAR(20)) = ?)");
      params.push(number, number);
    }
    if (customerName) {
      conditions.push("COALESCE(c.CTC_FANTASIA, '') CONTAINING ?");
      params.push(customerName);
    }

    if (filters.status) {
      conditions.push('c.CTC_STATUS = ?');
      params.push(filters.status);
    }
    if (filters.userId) {
      conditions.push('c.CTC_CODUSU = ?');
      params.push(Number(filters.userId));
    }
    if (filters.customerId) {
      conditions.push('c.CTC_CODEMP = ?');
      params.push(Number(filters.customerId));
    }
    if (filters.salesmanId) {
      conditions.push('c.CTC_CODVDO = ?');
      params.push(Number(filters.salesmanId));
    }
    if (filters.institutionId) {
      conditions.push('c.CTC_CODMHA = ?');
      params.push(Number(filters.institutionId));
    }
    if (filters.dateFrom) {
      conditions.push('c.CTC_DATA >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('c.CTC_DATA <= ?');
      params.push(filters.dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Contagem total para paginação
    const countSql = `SELECT COUNT(*) AS TOTAL FROM TB_COTACAO c ${where}`;
    const countResult = await query(countSql, params);
    const total = Number(countResult[0]?.TOTAL ?? 0);

    // Dados paginados — Firebird 2.5 usa FIRST/SKIP
    const dataSql = `
      SELECT FIRST ? SKIP ?
        c.CTC_CODIGO,
        c.CTC_CODPED,
        c.CTC_NUMERO,
        c.CTC_CODUSU,
        c.CTC_DATA,
        c.CTC_CODEMP,
        c.CTC_FANTASIA,
        c.CTC_CODFPG,
        c.CTC_PRAZO,
        c.CTC_QT_PRODUTO,
        c.CTC_VL_PRODUTO,
        c.CTC_VL_FRETE,
        c.CTC_ALIQ_DESCONTO,
        c.CTC_VL_DESCONTO,
        c.CTC_VL_COTACAO,
        c.CTC_CONTATO,
        c.CTC_VALIDADE,
        c.CTC_PRZ_ENTREGA,
        c.CTC_CODVDO,
        c.CTC_CODMHA,
        c.CTC_STATUS
      FROM TB_COTACAO c
      ${where}
      ORDER BY c.CTC_CODIGO DESC
    `;
    const rows = await query(dataSql, [Number(limit), Number(offset), ...params]);
    const data = rows.map((row) => new Budget(row));

    return { data, total };
  }

  /**
   * Busca um orçamento por ID.
   * @returns {Promise<Budget|null>}
   */
  async findById(id) {
    const sql = `
      SELECT
        c.CTC_CODIGO,
        c.CTC_CODPED,
        c.CTC_NUMERO,
        c.CTC_CODUSU,
        c.CTC_DATA,
        c.CTC_CODEMP,
        c.CTC_FANTASIA,
        c.CTC_CODFPG,
        c.CTC_PRAZO,
        c.CTC_QT_PRODUTO,
        c.CTC_VL_PRODUTO,
        c.CTC_VL_FRETE,
        c.CTC_ALIQ_DESCONTO,
        c.CTC_VL_DESCONTO,
        c.CTC_VL_COTACAO,
        c.CTC_CONTATO,
        c.CTC_VALIDADE,
        c.CTC_PRZ_ENTREGA,
        c.CTC_CODVDO,
        c.CTC_CODMHA,
        c.CTC_STATUS
      FROM TB_COTACAO c
      WHERE c.CTC_CODIGO = ?
    `;
    const rows = await query(sql, [Number(id)]);
    if (!rows.length) return null;
    return new Budget(rows[0]);
  }

  /**
   * Insere um novo orçamento.
   * GEN_ID é chamado fora da transação (conexão própria) para evitar
   * crash interno do node-firebird ao executar GEN_ID dentro de trx.
   * @returns {Promise<Budget>}
   */
  async create(data) {
    const genRows = await query('SELECT GEN_ID(GN_COTACAO, 1) AS NEW_ID FROM RDB$DATABASE');
    const newId = genRows[0].NEW_ID;

    await withTransaction(async (trx) => {

      await queryInTransaction(trx, `
        INSERT INTO TB_COTACAO (
          CTC_CODIGO, CTC_CODPED, CTC_NUMERO, CTC_CODUSU, CTC_DATA,
          CTC_CODEMP, CTC_FANTASIA, CTC_CODFPG, CTC_PRAZO,
          CTC_QT_PRODUTO, CTC_VL_PRODUTO, CTC_VL_FRETE,
          CTC_ALIQ_DESCONTO, CTC_VL_DESCONTO, CTC_VL_COTACAO,
          CTC_CONTATO, CTC_VALIDADE, CTC_PRZ_ENTREGA,
          CTC_CODVDO, CTC_CODMHA, CTC_STATUS,CTC_APROVADO
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ? ,?
        )
      `, [
        newId,
        0,
        data.number          ?? null,
        data.userId,
        data.date,
        data.customerId      ?? null,
        data.customerName    ?? null,
        data.paymentTypeId   ?? null,
        data.paymentTerms    ?? null,
        data.quantityProducts ?? 0,
        data.totalProducts    ?? 0,
        data.freight          ?? 0,
        data.discountPercent  ?? 0,
        data.discountValue    ?? 0,
        data.total            ?? 0,
        data.contact          ?? null,
        data.validity         ?? null,
        data.deliveryTime     ?? null,
        data.salesmanId       ?? null,
        data.institutionId    ?? null,
        data.status           ?? 'A',
        data.approved         ?? 'N',
      ]);
    });

    return this.findById(newId);
  }

  /**
   * Atualiza um orçamento existente.
   * @returns {Promise<Budget>}
   */
  async update(id, data) {
    const fields  = [];
    const params  = [];

    const map = {
      orderId:          'CTC_CODPED',
      number:           'CTC_NUMERO',
      userId:           'CTC_CODUSU',
      date:             'CTC_DATA',
      customerId:       'CTC_CODEMP',
      customerName:     'CTC_FANTASIA',
      paymentTypeId:    'CTC_CODFPG',
      paymentTerms:     'CTC_PRAZO',
      quantityProducts: 'CTC_QT_PRODUTO',
      totalProducts:    'CTC_VL_PRODUTO',
      freight:          'CTC_VL_FRETE',
      discountPercent:  'CTC_ALIQ_DESCONTO',
      discountValue:    'CTC_VL_DESCONTO',
      total:            'CTC_VL_COTACAO',
      contact:          'CTC_CONTATO',
      validity:         'CTC_VALIDADE',
      deliveryTime:     'CTC_PRZ_ENTREGA',
      salesmanId:       'CTC_CODVDO',
      institutionId:    'CTC_CODMHA',
      status:           'CTC_STATUS',
    };

    for (const [jsKey, dbCol] of Object.entries(map)) {
      if (data[jsKey] !== undefined) {
        fields.push(`${dbCol} = ?`);
        params.push(data[jsKey]);
      }
    }

    if (!fields.length) {
      return this.findById(id);
    }

    params.push(Number(id));
    await query(`UPDATE TB_COTACAO SET ${fields.join(', ')} WHERE CTC_CODIGO = ?`, params);

    return this.findById(id);
  }
}

module.exports = new BudgetRepository();
