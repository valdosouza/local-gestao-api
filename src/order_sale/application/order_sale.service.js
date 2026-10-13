'use strict';

const orderSaleRepository     = require('../infrastructure/order_sale.repository');
const orderSaleItemRepository = require('../infrastructure/order_sale.item.repository');
const stockControlRepository  = require('../../stock_control/infrastructure/stock_control.repository');

// ---------------------------------------------------------------------------
// Helpers de erro HTTP
// ---------------------------------------------------------------------------
function notFound(msg) {
  const err = new Error(msg);
  err.status = 404;
  return err;
}

function badRequest(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------
function parseDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw badRequest('Formato de data inválido. Use YYYY-MM-DD ou DD/MM/YYYY.');

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

const FROM_EXTERIOR_KIND = 'API';

// ---------------------------------------------------------------------------
// Order Sales — Leitura
// ---------------------------------------------------------------------------

async function listOrders({ limit = 20, offset = 0, filters = {} } = {}) {
  const parsedLimit  = Math.min(Math.max(Number(limit), 1), 100);
  const parsedOffset = Math.max(Number(offset), 0);

  const { data, total } = await orderSaleRepository.findAll({
    limit:   parsedLimit,
    offset:  parsedOffset,
    filters,
  });

  return {
    data: data.map((o) => o.toJSON()),
    meta: { total, limit: parsedLimit, offset: parsedOffset },
  };
}

async function getOrderById(id) {
  const order = await orderSaleRepository.findById(id);
  if (!order) throw notFound(`Pedido #${id} não encontrado.`);
  return order.toJSON();
}

async function listOrderItems(orderId) {
  const order = await orderSaleRepository.findById(orderId);
  if (!order) throw notFound(`Pedido #${orderId} não encontrado.`);

  const items = await orderSaleItemRepository.findByOrderId(orderId);
  return items.map((i) => i.toJSON());
}

// ---------------------------------------------------------------------------
// Pipeline: Criação de pedido de venda completo
//
// Referência Delphi: GeraPedidoCompleto (tas_mg_pedido.pas, linha 265)
//   1. ValidaGeraPedidoCompleto — verifica TB_PEDIDO_FROM_EXTERIOR
//   2. Se pedido anterior existe: DesregistrarEstoque → DeletaItens → Delete
//   3. ValidaCreateClienteSetes — busca/cria empresa + cliente + endereço
//   4. GeraPedido — insere TB_PEDIDO
//   5. GeraPedidoItens — insere TB_ITENS_NFL + TB_CTRL_ESTOQUE
//   6. GeraVinculoFromExterior — insere TB_PEDIDO_FROM_EXTERIOR
// ---------------------------------------------------------------------------

async function createOrder(payload) {
  const { order, items } = payload;

  // --- Validações de entrada ---
  if (!order)              throw badRequest('Objeto "order" é obrigatório.');
  if (!order.userId)       throw badRequest('Campo obrigatório ausente: order.userId.');
  if (!order.date)         throw badRequest('Campo obrigatório ausente: order.date.');
  if (!order.fiscalDocument) throw badRequest('Campo obrigatório ausente: order.fiscalDocument.');
  if (!order.customerName) throw badRequest('Campo obrigatório ausente: order.customerName.');

  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('Campo obrigatório ausente: items (deve ser um array não vazio).');
  }

  for (let i = 0; i < items.length; i++) {
    if (!items[i].productId)            throw badRequest(`items[${i}]: campo obrigatório ausente: productId.`);
    if (items[i].quantity === undefined) throw badRequest(`items[${i}]: campo obrigatório ausente: quantity.`);
    if (items[i].unitPrice === undefined) throw badRequest(`items[${i}]: campo obrigatório ausente: unitPrice.`);
  }

  const parsedDate = parseDate(order.date);
  const externalId = order.id ? String(order.id) : null;

  // --- 1. ValidaGeraPedidoCompleto: verifica se pedido já existe via FROM_EXTERIOR ---
  if (externalId) {
    const existingLink = await orderSaleRepository.findFromExterior(externalId, FROM_EXTERIOR_KIND);

    if (existingLink) {
      const existingOrder = await orderSaleRepository.findById(existingLink.orderId);
      if (existingOrder) {
        // Verifica status do pedido: só permite se estiver 'N' (aberto)
        if (existingOrder.invoiced === 'S') {
          throw badRequest(`Pedido já processado. Faturado. Código externo: "${externalId}", Pedido interno: ${existingOrder.id}`);
        }
        if (existingOrder.invoiced === 'A') {
          throw badRequest(`Pedido já processado. Excluído. Código externo: "${externalId}", Pedido interno: ${existingOrder.id}`);
        }
        if (existingOrder.invoiced === 'C') {
          throw badRequest(`Pedido já processado. Cancelado. Código externo: "${externalId}", Pedido interno: ${existingOrder.id}`);
        }
        // Pedido existe mas está 'N' (aberto): limpa para regravar
        // Reverte movimentos de estoque (em vez de deletar, para manter rastreamento)
        await stockControlRepository.reverseOrderStockEntries(existingOrder.id, parsedDate);
        await orderSaleItemRepository.deleteByOrderId(existingOrder.id);
        await orderSaleRepository.delete(existingOrder.id);
      }
      await orderSaleRepository.deleteFromExterior(externalId, FROM_EXTERIOR_KIND);
    }
  }

  // --- 2. ValidaCreateClienteSetes: busca ou cria empresa/cliente/endereço ---
  let customerId;
  let addressId;

  const existingEmpresa = await orderSaleRepository.findEmpresaByDocument(order.fiscalDocument);

  if (existingEmpresa) {
    customerId = existingEmpresa.id;

    const isCliente = await orderSaleRepository.clienteExists(customerId);
    if (!isCliente) {
      await orderSaleRepository.createCliente(customerId);
    }

    const endereco = await orderSaleRepository.findEnderecoPrincipal(customerId);
    if (endereco) {
      addressId = endereco.id;
    } else {
      addressId = await orderSaleRepository.createEndereco({
        empCodigo:         customerId,
        fiscalDocument:    order.fiscalDocument,
        street:            order.street,
        buildingNumber:    order.buildingNumber,
        complement:        order.complement,
        neighborhood:      order.neighborhood,
        zipcode:           order.zipcode,
        cityName:          order.cityName,
        stateAbbreviation: order.stateAbbreviation,
      });
    }
  } else {
    customerId = await orderSaleRepository.createEmpresa({
      customerName:      order.customerName,
      fiscalDocument:    order.fiscalDocument,
      email:             order.email,
      birthFoundation:   parseDate(order.birthFoundation),
      salesmanId:        order.salesmanId,
    });

    await orderSaleRepository.createCliente(customerId);

    addressId = await orderSaleRepository.createEndereco({
      empCodigo:         customerId,
      fiscalDocument:    order.fiscalDocument,
      street:            order.street,
      buildingNumber:    order.buildingNumber,
      complement:        order.complement,
      neighborhood:      order.neighborhood,
      zipcode:           order.zipcode,
      cityName:          order.cityName,
      stateAbbreviation: order.stateAbbreviation,
    });
  }

  // --- 3. GeraPedido: insere cabeçalho em TB_PEDIDO ---
  const createdOrder = await orderSaleRepository.create({
    type:              1,
    userId:            order.userId,
    date:              parsedDate,
    hour:              order.hour || null,
    customerId:        customerId,
    salesmanId:        order.salesmanId       ?? null,
    paymentTypeId:     order.paymentTypeId    ?? null,
    paymentTerms:      null,
    addressId:         addressId,
    quantityProducts:  order.quantityProducts ?? 0,
    totalProducts:     order.totalProducts    ?? 0,
    ipi:               0,
    freight:           order.freightValue     ?? 0,
    discountPercent:   0,
    discount:          order.discountValue    ?? 0,
    total:             order.totalValue       ?? 0,
    invoiced:          'N',
    deliveryAddressId: addressId,
    institutionId:     order.institutionId    ?? null,
    observation:       order.observation      ?? null,
    presenceIndicator: 2,
    terminal:          0,
    approved:          'N',
  });

  // --- 4. GeraPedidoItens: insere itens em TB_ITENS_NFL + registra estoque ---
  const insertedItems = [];

  for (let seq = 0; seq < items.length; seq++) {
    const itemData = items[seq];

    const item = await orderSaleItemRepository.create({
      sequence:    itemData.sequence    ?? (seq + 1),
      orderId:     createdOrder.id,
      invoiceId:   0,
      productId:   itemData.productId,
      quantity:    itemData.quantity,
      costPrice:   0,
      unitPrice:   itemData.unitPrice,
      discount:    itemData.discount    ?? 0,
      discountPct: itemData.discountPct ?? 0,
      commission:  0,
      dispatch:    'S',
      stock:       'S',
      operation:   'V',
      stockListId: itemData.stockListId ?? null,
      priceListId: itemData.priceListId ?? null,
    });

    insertedItems.push(item.toJSON());

    // Registra movimentação de estoque (saída)
    if (item.stockListId) {
      await stockControlRepository.create({
        terminal:    0,
        link:        'P',
        control:     createdOrder.id,
        itemControl: item.id,
        stockListId: item.stockListId,
        operation:   'S',
        productId:   item.productId,
        quantity:    item.quantity,
        date:        parsedDate,
        type:        'Venda',
      });
    }
  }

  // --- 5. GeraVinculoFromExterior: vincula código externo ao interno ---
  if (externalId) {
    await orderSaleRepository.insertFromExterior(externalId, FROM_EXTERIOR_KIND, createdOrder.id);
  }

  return {
    order: createdOrder.toJSON(),
    items: insertedItems,
  };
}

// ---------------------------------------------------------------------------
// Atualização parcial do cabeçalho
// ---------------------------------------------------------------------------

async function updateOrder(id, data) {
  const existing = await orderSaleRepository.findById(id);
  if (!existing) throw notFound(`Pedido #${id} não encontrado.`);

  // Verifica status do pedido: só permite editar se estiver 'N' (aberto)
  if (existing.invoiced === 'S') {
    throw badRequest(`Pedido já processado. Faturado. Pedido: ${id}`);
  }
  if (existing.invoiced === 'A') {
    throw badRequest(`Pedido já processado. Excluído. Pedido: ${id}`);
  }
  if (existing.invoiced === 'C') {
    throw badRequest(`Pedido já processado. Cancelado. Pedido: ${id}`);
  }

  const convertedData = { ...data };
  if (convertedData.date)         convertedData.date         = parseDate(convertedData.date);
  if (convertedData.deliveryDate) convertedData.deliveryDate = parseDate(convertedData.deliveryDate);

  const updated = await orderSaleRepository.update(id, convertedData);
  return updated.toJSON();
}

module.exports = {
  listOrders,
  getOrderById,
  listOrderItems,
  createOrder,
  updateOrder,
};
