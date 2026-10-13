'use strict';

const { query, withTransaction, queryInTransaction } = require('../../config/database');
const OrderSaleItem = require('../domain/order_sale.item.entity');

const SELECT_COLS = `
  ITF_CODIGO, ITF_SEQUENCIA, ITF_CODPED, ITF_CODNFL,
  ITF_CODPRO, ITF_QTDE, ITF_VL_CUSTO, ITF_VL_UNIT,
  ITF_VL_DESC, ITF_AQ_DESC, ITF_AQ_COM, ITF_AQ_IPI, ITF_AQ_ICMS,
  ITF_DESPACHO, ITF_ESTOQUE, ITF_OPER, ITF_CODEST, ITF_CODTPR
`;

class OrderSaleItemRepository {
  /**
   * Lista todos os itens de um pedido.
   * @returns {Promise<OrderSaleItem[]>}
   */
  async findByOrderId(orderId) {
    const rows = await query(
      `SELECT ${SELECT_COLS} FROM TB_ITENS_NFL WHERE ITF_CODPED = ? ORDER BY ITF_SEQUENCIA ASC, ITF_CODIGO ASC`,
      [Number(orderId)]
    );
    return rows.map((r) => new OrderSaleItem(r));
  }

  /**
   * Busca um item pelo ID.
   * @returns {Promise<OrderSaleItem|null>}
   */
  async findById(id) {
    const rows = await query(
      `SELECT ${SELECT_COLS} FROM TB_ITENS_NFL WHERE ITF_CODIGO = ?`,
      [Number(id)]
    );
    if (!rows.length) return null;
    return new OrderSaleItem(rows[0]);
  }

  /**
   * Próximo ITF_CODIGO pelo gerador GN_ITENS_NFL — o mesmo que o ERP usa.
   * MAX + 1 não avançava o gerador: o próximo item lançado no ERP recebia o mesmo
   * código e sobrescrevia o item gravado pela API.
   */
  async #nextCodigo(trx) {
    const rows = await queryInTransaction(trx, 'SELECT GEN_ID(GN_ITENS_NFL, 1) AS NEW_ID FROM RDB$DATABASE');
    return Number(rows[0].NEW_ID);
  }

  /**
   * Insere um item de pedido de venda.
   * Referência Delphi: GeraPedidoItens (tas_mg_pedido.pas, linha 289).
   * @returns {Promise<OrderSaleItem>}
   */
  async create(data) {
    let newId;

    await withTransaction(async (trx) => {
      newId = await this.#nextCodigo(trx);

      await queryInTransaction(trx, `
        INSERT INTO TB_ITENS_NFL (
          ITF_CODIGO, ITF_SEQUENCIA, ITF_CODPED, ITF_CODNFL,
          ITF_CODPRO, ITF_QTDE, ITF_VL_CUSTO, ITF_VL_UNIT,
          ITF_VL_DESC, ITF_AQ_DESC, ITF_AQ_COM, ITF_AQ_IPI, ITF_AQ_ICMS,
          ITF_DESPACHO, ITF_ESTOQUE, ITF_OPER, ITF_CODEST, ITF_CODTPR
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `, [
        newId,
        data.sequence    ?? null,
        data.orderId,
        data.invoiceId   ?? 0,
        data.productId,
        data.quantity    ?? 0,
        data.costPrice   ?? 0,
        data.unitPrice   ?? 0,
        data.discount    ?? 0,
        data.discountPct ?? 0,
        data.commission  ?? 0,
        data.ipiPct      ?? 0,
        data.icmsPct     ?? 0,
        data.dispatch    ?? 'S',
        data.stock       ?? 'S',
        data.operation   ?? 'V',
        data.stockListId ?? null,
        data.priceListId ?? null,
      ]);
    });

    return this.findById(newId);
  }

  /**
   * Remove todos os itens de um pedido.
   * @returns {Promise<void>}
   */
  async deleteByOrderId(orderId) {
    await query('DELETE FROM TB_ITENS_NFL WHERE ITF_CODPED = ?', [Number(orderId)]);
  }
}

module.exports = new OrderSaleItemRepository();
