'use strict';

const orderSaleService = require('../application/order_sale.service');
const { validateOrderPayload } = require('./order_sale.validator');

/**
 * GET /api/v1/order-sales
 */
async function listOrders(req, res, next) {
  try {
    const { limit = 20, offset = 0, ...filters } = req.query;
    const result = await orderSaleService.listOrders({
      limit:   Number(limit),
      offset:  Number(offset),
      filters,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/order-sales/:id
 */
async function getOrder(req, res, next) {
  try {
    const order = await orderSaleService.getOrderById(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/order-sales/:id/items
 */
async function listOrderItems(req, res, next) {
  try {
    const items = await orderSaleService.listOrderItems(req.params.id);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/order-sales
 * Valida o payload antes de criar o pedido de venda completo.
 */
async function createOrder(req, res, next) {
  // Identificação do pedido na linha [RES] do log
  const externalId = req.body?.order?.id;
  res.locals.logContext = `externo=${externalId ?? '-'}`;

  try {
    // Executa validações
    const validation = await validateOrderPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error:   'Pedido não gravado: corrija os campos indicados e envie novamente.',
        details: validation.errors.map((e) => `${e.field}: ${e.message}`),
        fields:  validation.errors,
      });
    }

    // Se passou nas validações, cria o pedido
    const result = await orderSaleService.createOrder(req.body);
    res.locals.logContext += ` pedido=${result.order.id} itens=${result.items.length}`;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listOrders, getOrder, listOrderItems, createOrder };
