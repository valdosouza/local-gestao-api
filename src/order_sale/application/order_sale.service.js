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

const INVOICED_LABEL = { N: 'aberto', S: 'faturado', A: 'na lixeira', C: 'cancelado' };

/** Código externo já recebido pela API: 409 com o pedido existente — nada é alterado. */
function alreadyReceived(externalId, existingOrder) {
  const situation = INVOICED_LABEL[existingOrder.invoiced] ?? existingOrder.invoiced;
  const err = new Error(
    `Pedido já recebido: o código externo "${externalId}" é o pedido interno ${existingOrder.id} (${situation}). Nada foi alterado.`
  );
  err.status = 409;
  err.order  = existingOrder.toJSON();
  return err;
}

/** Violação da chave (KIND, ID_EXTERIOR): outro envio do mesmo código gravou o vínculo antes. */
function isDuplicateLinkError(err) {
  const msg = err?.message ?? '';
  return /PRIMARY or UNIQUE KEY/i.test(msg) && /TB_PEDIDO_FROM_EXTERIOR/i.test(msg);
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
// Pipeline: Criação de pedido de venda completo — passo a passo (ver createOrder)
//
// Referência Delphi: GeraPedidoCompleto (tas_mg_pedido.pas, linha 265), com uma diferença:
// código externo já recebido NÃO é regravado — a API responde 409 com o pedido existente.
//   1. Verifica TB_PEDIDO_FROM_EXTERIOR (KIND = 'API')
//   2. Reserva PED_CODIGO (GN_PEDIDO) e grava o vínculo (GeraVinculoFromExterior)
//   3. ValidaCreateClienteSetes — busca/cria empresa + cliente + endereço
//   4. GeraPedido — insere TB_PEDIDO
//   5. GeraPedidoItens — insere TB_ITENS_NFL + TB_CTRL_ESTOQUE
// ---------------------------------------------------------------------------

async function createOrder(payload) {
  const { order, items } = payload;

  // --- Validações de entrada ---
  if (!order)              throw badRequest('Objeto "order" é obrigatório.');
  if (order.id === undefined || order.id === null || String(order.id).trim() === '') {
    throw badRequest('Campo obrigatório ausente: order.id (código externo do pedido).');
  }
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
  const externalId = String(order.id);

  try {
    // Gravação passo a passo, cada passo na sua transação curta (trx = null). Numa transação
    // única com várias instruções, o protocolo "lazy" do node-firebird 1.1.10 desalinha as
    // respostas: o driver quebrou ou deixou a transação aberta para sempre (produção, 14/10
    // 14:04 e 14:13), travando os pedidos seguintes. Não voltar a usar withTransaction aqui.
    return await persistOrder(null, { order, items, externalId, parsedDate });
  } catch (err) {
    // Dois envios simultâneos do mesmo código: o outro gravou o vínculo primeiro
    if (isDuplicateLinkError(err)) {
      const link = await orderSaleRepository.findFromExterior(externalId, FROM_EXTERIOR_KIND);
      const existingOrder = link && await orderSaleRepository.findById(link.orderId);
      if (existingOrder) throw alreadyReceived(externalId, existingOrder);
    }
    throw err;
  }
}

/**
 * Grava o pedido completo. Com trx, tudo dentro dela; sem trx (uso atual), cada passo
 * na sua transação curta. O vínculo é gravado primeiro: se um passo seguinte falhar, o
 * reenvio encontra o vínculo sem pedido e libera o código (passo 1).
 */
async function persistOrder(trx, { order, items, externalId, parsedDate }) {
  // --- 1. Código externo já recebido? Não regrava: devolve o pedido existente (409) ---
  const existingLink = await orderSaleRepository.findFromExterior(externalId, FROM_EXTERIOR_KIND, trx);
  if (existingLink) {
    const existingOrder = await orderSaleRepository.findById(existingLink.orderId, trx);
    // Aberto e sem itens = gravação anterior interrompida (pedido da API sempre tem item)
    const interrupted = existingOrder && existingOrder.invoiced === 'N'
      && (await orderSaleItemRepository.findByOrderId(existingOrder.id)).length === 0;
    if (existingOrder && !interrupted) throw alreadyReceived(externalId, existingOrder);
    if (interrupted) await orderSaleRepository.delete(existingOrder.id);
    // Vínculo sem pedido (apagado no ERP) ou de gravação interrompida: libera o código
    await orderSaleRepository.deleteFromExterior(externalId, FROM_EXTERIOR_KIND, trx);
  }

  // --- 2. Reserva o número interno e grava o vínculo antes do resto. Em dois envios
  //        simultâneos do mesmo código, o segundo espera aqui e falha na chave do vínculo ---
  const orderId = await orderSaleRepository.nextId(trx);
  await orderSaleRepository.insertFromExterior(externalId, FROM_EXTERIOR_KIND, orderId, trx);

  // --- 3. ValidaCreateClienteSetes: busca ou cria empresa/cliente/endereço ---
  let customerId;
  let addressId;

  const existingEmpresa = await orderSaleRepository.findEmpresaByDocument(order.fiscalDocument, trx);

  if (existingEmpresa) {
    customerId = existingEmpresa.id;

    const isCliente = await orderSaleRepository.clienteExists(customerId, trx);
    if (!isCliente) {
      await orderSaleRepository.createCliente(customerId, trx);
    }

    const endereco = await orderSaleRepository.findEnderecoPrincipal(customerId, trx);
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
      }, trx);
    }
  } else {
    customerId = await orderSaleRepository.createEmpresa({
      customerName:      order.customerName,
      fiscalDocument:    order.fiscalDocument,
      email:             order.email,
      birthFoundation:   parseDate(order.birthFoundation),
      salesmanId:        order.salesmanId,
    }, trx);

    await orderSaleRepository.createCliente(customerId, trx);

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
    }, trx);
  }

  // --- 4. GeraPedido: insere cabeçalho em TB_PEDIDO com o número reservado ---
  const createdOrder = await orderSaleRepository.create({
    id:                orderId,
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
  }, trx);

  // --- 5. GeraPedidoItens: insere itens em TB_ITENS_NFL + registra estoque ---
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
    }, trx);

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
      }, trx);
    }
  }

  // Devolve o código externo junto do número interno (order.id do payload ≠ order.id da resposta)
  createdOrder.externalId     = externalId;
  createdOrder.externalSource = FROM_EXTERIOR_KIND;

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
