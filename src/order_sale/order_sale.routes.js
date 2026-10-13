'use strict';

const { Router } = require('express');
const orderSaleCtrl = require('./infrastructure/order_sale.controller');

const router = Router();

// ===================================================================
// PEDIDOS DE VENDA — TB_PEDIDO
// ===================================================================

/**
 * @swagger
 * tags:
 *   - name: Order Sales
 *     description: Pedidos de venda (TB_PEDIDO + TB_ITENS_NFL + TB_CTRL_ESTOQUE)
 */

/**
 * @swagger
 * /order-sales:
 *   get:
 *     summary: Lista pedidos de venda com paginação e filtros
 *     tags: [Order Sales]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Registros por página (máx. 100)
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Número de registros a pular
 *       - in: query
 *         name: institutionId
 *         schema: { type: integer }
 *         description: Filtro por estabelecimento (PED_CODMHA)
 *       - in: query
 *         name: customerId
 *         schema: { type: integer }
 *         description: Filtro por cliente (PED_CODEMP)
 *       - in: query
 *         name: salesmanId
 *         schema: { type: integer }
 *         description: Filtro por vendedor (PED_CODVDO)
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *         description: Filtro por usuário (PED_CODUSU)
 *       - in: query
 *         name: invoiced
 *         schema: { type: string, enum: [N, S, A, C] }
 *         description: "Filtro por situação: N=Aberto, S=Faturado, A=Lixeira, C=Cancelado"
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date, example: "2024-01-01" }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date, example: "2024-12-31" }
 *     responses:
 *       200:
 *         description: Lista paginada de pedidos de venda
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderSale'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 */
router.get('/', orderSaleCtrl.listOrders);

/**
 * @swagger
 * /order-sales/{id}:
 *   get:
 *     summary: Busca um pedido de venda por ID
 *     tags: [Order Sales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderSale'
 *       404:
 *         description: Não encontrado
 */
router.get('/:id', orderSaleCtrl.getOrder);

/**
 * @swagger
 * /order-sales/{id}/items:
 *   get:
 *     summary: Lista os itens de um pedido de venda
 *     tags: [Order Sales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de itens do pedido
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrderSaleItem'
 *       404:
 *         description: Pedido não encontrado
 */
router.get('/:id/items', orderSaleCtrl.listOrderItems);

/**
 * @swagger
 * /order-sales:
 *   post:
 *     summary: Cria um pedido de venda completo
 *     tags: [Order Sales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderSaleInput'
 *           example:
 *             order:
 *               id: "MG-50001"
 *               userId: 3
 *               date: "2024-06-15"
 *               hour: "08:00"
 *               customerName: "João da Silva"
 *               fiscalDocument: "123.456.789-00"
 *               email: "joao@email.com"
 *               birthFoundation: "1977-10-09"
 *               street: "Rua Tal"
 *               buildingNumber: "28"
 *               complement: "Casa A"
 *               neighborhood: "Centro"
 *               zipcode: "81770090"
 *               cityName: "Curitiba"
 *               stateAbbreviation: "PR"
 *               salesmanId: 7
 *               paymentTypeId: 1
 *               quantityProducts: 2
 *               totalProducts: 700
 *               freightValue: 25
 *               discountValue: 0
 *               totalValue: 725
 *               institutionId: 1
 *               observation: "Pedido via integração"
 *             items:
 *               - productId: 200
 *                 sequence: 1
 *                 quantity: 2
 *                 unitPrice: 350
 *                 discount: 0
 *                 discountPct: 0
 *                 stockListId: 1
 *                 priceListId: 1
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order:
 *                   $ref: '#/components/schemas/OrderSale'
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderSaleItem'
 *       400:
 *         description: |
 *           Dados inválidos, pedido faturado ou campo obrigatório ausente.
 *           Em erros de validação, `fields` lista cada campo com problema (caminho no JSON),
 *           o motivo/como corrigir e o valor recebido; `details` traz as mesmas mensagens em texto.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Pedido não gravado: corrija os campos indicados e envie novamente."
 *               details:
 *                 - "order.complement: Complemento tem 32 caracteres; o máximo aceito é 25. Abrevie o texto."
 *                 - "order.zipcode: CEP deve ter 8 dígitos; foram informados 7. Ex.: 81770090 ou 81770-090."
 *               fields:
 *                 - field: "order.complement"
 *                   message: "Complemento tem 32 caracteres; o máximo aceito é 25. Abrevie o texto."
 *                   received: "APARTAMENTO 1203 BLOCO B TORRE 2"
 *                 - field: "order.zipcode"
 *                   message: "CEP deve ter 8 dígitos; foram informados 7. Ex.: 81770090 ou 81770-090."
 *                   received: "8177-009"
 */
router.post('/', orderSaleCtrl.createOrder);


// ===================================================================
// Schemas Swagger
// ===================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderSale:
 *       type: object
 *       properties:
 *         id:                  { type: integer, example: 5001 }
 *         number:              { type: integer, example: 1050, nullable: true }
 *         type:                { type: integer, example: 1, description: "1 = Venda" }
 *         userId:              { type: integer, example: 3 }
 *         date:                { type: string, format: date, example: "2024-06-15" }
 *         hour:                { type: string, example: "08:00", nullable: true }
 *         customerId:          { type: integer, example: 42 }
 *         salesmanId:          { type: integer, example: 7, nullable: true }
 *         paymentTypeId:       { type: integer, example: 1, nullable: true }
 *         paymentTerms:        { type: string, nullable: true }
 *         addressId:           { type: integer, example: 10 }
 *         quantityProducts:    { type: number, example: 2 }
 *         totalProducts:       { type: number, example: 700 }
 *         ipi:                 { type: number, example: 0 }
 *         freight:             { type: number, example: 25 }
 *         discountPercent:     { type: number, example: 0 }
 *         discount:            { type: number, example: 0 }
 *         total:               { type: number, example: 725 }
 *         invoiced:            { type: string, example: "N", description: "N=Aberto, S=Faturado, A=Lixeira, C=Cancelado" }
 *         deliveryAddressId:   { type: integer }
 *         billingAddressId:    { type: integer, nullable: true }
 *         collectionAddressId: { type: integer, nullable: true }
 *         institutionId:       { type: integer, example: 1, nullable: true }
 *         observation:         { type: string, nullable: true }
 *         presenceIndicator:   { type: integer, example: 2 }
 *         terminal:            { type: integer, example: 0 }
 *         deliveryDate:        { type: string, format: date, nullable: true }
 *         approved:            { type: string, example: "N" }
 *         budgetId:            { type: integer, nullable: true }
 *         webId:               { type: integer, nullable: true }
 *         webNumber:           { type: integer, nullable: true }
 *         carrierCode:         { type: integer, nullable: true }
 *         natureCode:          { type: integer, nullable: true }
 *         updatedAt:           { type: string, format: date-time, nullable: true }
 *
 *     OrderSaleItem:
 *       type: object
 *       properties:
 *         id:          { type: integer, example: 8001 }
 *         sequence:    { type: integer, example: 1 }
 *         orderId:     { type: integer, example: 5001 }
 *         invoiceId:   { type: integer, example: 0 }
 *         productId:   { type: integer, example: 200 }
 *         quantity:    { type: number, example: 2 }
 *         costPrice:   { type: number, example: 0 }
 *         unitPrice:   { type: number, example: 350 }
 *         discount:    { type: number, example: 0 }
 *         discountPct: { type: number, example: 0 }
 *         commission:  { type: number, example: 0 }
 *         ipiPct:      { type: number, example: 0 }
 *         icmsPct:     { type: number, example: 0 }
 *         dispatch:    { type: string, example: "S" }
 *         stock:       { type: string, example: "S" }
 *         operation:   { type: string, example: "V" }
 *         stockListId: { type: integer, example: 1, nullable: true }
 *         priceListId: { type: integer, example: 1, nullable: true }
 *
 *     OrderSaleInput:
 *       type: object
 *       required: [order, items]
 *       properties:
 *         order:
 *           type: object
 *           required: [userId, date, customerName, fiscalDocument]
 *           description: |
 *             Campos preenchidos internamente pela API (NÃO enviar):
 *             type, invoiced, presenceIndicator, terminal, approved, deliveryAddressId
 *           properties:
 *             id:                 { type: string, maxLength: 50, description: "Código externo do pedido (referência do sistema de terceiro). Usado para controlar duplicidade via TB_PEDIDO_FROM_EXTERIOR.", example: "MG-50001" }
 *             userId:             { type: integer, description: "Código do usuário (retornado no login)", example: 3 }
 *             date:               { type: string, example: "2024-06-15", description: "Formato YYYY-MM-DD ou DD/MM/YYYY" }
 *             hour:               { type: string, example: "08:00", description: "Formato HH:MM ou HH:MM:SS", nullable: true }
 *             customerName:       { type: string, maxLength: 100, example: "João da Silva" }
 *             fiscalDocument:     { type: string, description: "CPF ou CNPJ (com ou sem máscara)", example: "123.456.789-00" }
 *             email:              { type: string, maxLength: 100, example: "joao@email.com", nullable: true }
 *             birthFoundation:    { type: string, format: date, example: "1977-10-09", description: "Data de nascimento (PF) ou fundação (PJ). Formato YYYY-MM-DD ou DD/MM/YYYY", nullable: true }
 *             street:             { type: string, maxLength: 100, example: "Rua Tal" }
 *             buildingNumber:     { type: string, maxLength: 10, example: "28" }
 *             complement:         { type: string, maxLength: 25, example: "Casa A", nullable: true }
 *             neighborhood:       { type: string, maxLength: 100, example: "Centro" }
 *             zipcode:            { type: string, description: "8 dígitos, com ou sem máscara (gravado só com dígitos)", example: "81770090" }
 *             cityName:           { type: string, maxLength: 60, example: "Curitiba" }
 *             stateAbbreviation:  { type: string, minLength: 2, maxLength: 2, example: "PR" }
 *             salesmanId:         { type: integer, description: "Código do vendedor (retornado no login)", example: 7, nullable: true }
 *             paymentTypeId:      { type: integer, example: 1, nullable: true }
 *             quantityProducts:   { type: number, example: 2 }
 *             totalProducts:      { type: number, example: 700 }
 *             freightValue:       { type: number, example: 25 }
 *             discountValue:      { type: number, example: 0 }
 *             totalValue:         { type: number, example: 725 }
 *             institutionId:      { type: integer, example: 1, nullable: true }
 *             observation:        { type: string, nullable: true }
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             type: object
 *             required: [productId, quantity, unitPrice]
 *             description: |
 *               Campos preenchidos internamente pela API (NÃO enviar):
 *               id, orderId, invoiceId, costPrice, commission, dispatch, stock, operation
 *             properties:
 *               productId:   { type: integer, example: 200 }
 *               sequence:    { type: integer, example: 1, nullable: true }
 *               quantity:    { type: number, example: 2 }
 *               unitPrice:   { type: number, example: 350 }
 *               discount:    { type: number, default: 0 }
 *               discountPct: { type: number, default: 0 }
 *               stockListId: { type: integer, example: 1, nullable: true }
 *               priceListId: { type: integer, example: 1, nullable: true }
 *
 *     ValidationError:
 *       type: object
 *       properties:
 *         error:   { type: string, description: "Resumo do problema" }
 *         details:
 *           type: array
 *           description: "Mensagens prontas para exibir, no formato 'campo: mensagem'"
 *           items: { type: string }
 *         fields:
 *           type: array
 *           description: "Um registro por campo com problema — use `field` para destacar o campo na tela"
 *           items:
 *             type: object
 *             properties:
 *               field:    { type: string, description: "Caminho do campo no JSON enviado", example: "items[0].quantity" }
 *               message:  { type: string, description: "O que está errado e como corrigir" }
 *               received: { description: "Valor recebido (omitido quando o campo não foi enviado)" }
 *
 *     OrderSaleUpdateInput:
 *       type: object
 *       properties:
 *         salesmanId:          { type: integer, nullable: true }
 *         paymentTypeId:       { type: integer, nullable: true }
 *         totalProducts:       { type: number }
 *         freight:             { type: number }
 *         discount:            { type: number }
 *         total:               { type: number }
 *         institutionId:       { type: integer, nullable: true }
 *         observation:         { type: string, nullable: true }
 *         deliveryDate:        { type: string, nullable: true }
 */

module.exports = router;
