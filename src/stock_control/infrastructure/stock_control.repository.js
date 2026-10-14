'use strict';

const { query, withTransaction, queryInTransaction, runQuery, inTransaction } = require('../../config/database');
const StockControl = require('../domain/stock_control.entity');

class StockControlRepository {
  async findById(id, terminal, trx = null) {
    const rows = await runQuery(trx,
      `SELECT CET_CODIGO, CET_TERMINAL, CET_VINCULO, CET_CONTROLE, CET_ITEM_CTRL,
              CET_CODETS, CET_OPERACAO, CET_CODPRO, CET_QTDE, CET_DATA, UPDATE_AT, CET_TIPO
       FROM TB_CTRL_ESTOQUE
       WHERE CET_CODIGO = ? AND CET_TERMINAL = ?`,
      [Number(id), Number(terminal)]
    );
    if (!rows.length) return null;
    return new StockControl(rows[0]);
  }

  /** Com trx, grava dentro dela; sem trx, numa transação própria. */
  async create(data, trx = null) {
    const genRows = await runQuery(trx,
      'SELECT GEN_ID(GN_CTRL_ESTOQUE, 1) AS NEW_ID FROM RDB$DATABASE'
    );
    const newId = genRows[0].NEW_ID;

    return inTransaction(trx, async (t) => {
      await queryInTransaction(t,
        `INSERT INTO TB_CTRL_ESTOQUE (
          CET_CODIGO, CET_TERMINAL, CET_VINCULO, CET_CONTROLE, CET_ITEM_CTRL,
          CET_CODETS, CET_OPERACAO, CET_CODPRO, CET_QTDE, CET_DATA, UPDATE_AT, CET_TIPO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [
          newId,
          Number(data.terminal),
          data.link,
          data.control     ?? null,
          data.itemControl ?? null,
          data.stockListId ?? null,
          data.operation   ?? null,
          data.productId   ?? null,
          data.quantity    ?? null,
          data.date        ?? null,
          data.type        ?? null,
        ]
      );

      return this.findById(newId, data.terminal, t);
    });
  }

  /**
   * Reversa um movimento de estoque criando um registro inverso.
   * Referência Delphi: TControllerCtrlEstoque.Desregistra (linha 219).
   *
   * Em vez de deletar, insere um registro com operação inversa para rastreabilidade.
   * Se CET_OPERACAO = 'S' (saída), inverte para 'E' (entrada)
   * Se CET_OPERACAO = 'E' (entrada), inverte para 'S' (saída)
   *
   * @param {number} orderId - ID do pedido (CET_CONTROLE)
   * @param {string} operationDate - Data do movimento
   * @returns {Promise<void>}
   */
  async reverseOrderStockEntries(orderId, operationDate = null) {
    // Busca todos os registros de estoque para este pedido
    const rows = await query(
      `SELECT CET_CODIGO, CET_TERMINAL, CET_VINCULO, CET_CONTROLE, CET_ITEM_CTRL,
              CET_CODETS, CET_OPERACAO, CET_CODPRO, CET_QTDE, CET_DATA, CET_TIPO
       FROM TB_CTRL_ESTOQUE
       WHERE CET_VINCULO = 'P' AND CET_CONTROLE = ?
       ORDER BY CET_CODIGO DESC`,
      [Number(orderId)]
    );

    if (rows.length === 0) return;

    // Para cada registro, cria um inverso
    await withTransaction(async (trx) => {
      for (const row of rows) {
        const genRows = await queryInTransaction(trx,
          'SELECT GEN_ID(GN_CTRL_ESTOQUE, 1) AS NEW_ID FROM RDB$DATABASE'
        );
        const newId = genRows[0].NEW_ID;

        // Inverte a operação: S (saída) → E (entrada), E → S
        const inverseOperation = row.CET_OPERACAO === 'S' ? 'E' : 'S';

        // Insere o registro inverso
        await queryInTransaction(trx,
          `INSERT INTO TB_CTRL_ESTOQUE (
            CET_CODIGO, CET_TERMINAL, CET_VINCULO, CET_CONTROLE, CET_ITEM_CTRL,
            CET_CODETS, CET_OPERACAO, CET_CODPRO, CET_QTDE, CET_DATA, UPDATE_AT, CET_TIPO
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            newId,
            row.CET_TERMINAL,
            row.CET_VINCULO,
            row.CET_CONTROLE,
            row.CET_ITEM_CTRL,
            row.CET_CODETS,
            inverseOperation,
            row.CET_CODPRO,
            row.CET_QTDE,
            operationDate ?? row.CET_DATA,
            'ESTOQUE DEVOLVIDO',
          ]
        );
      }
    });
  }
}

module.exports = new StockControlRepository();
