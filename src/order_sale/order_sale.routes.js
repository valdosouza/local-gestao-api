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
 *     description: |
 *       Pedidos de venda (TB_PEDIDO + TB_ITENS_NFL + TB_CTRL_ESTOQUE).
 *
 *       Cada pedido enviado pela API fica vinculado ao código do sistema de origem em
 *       TB_PEDIDO_FROM_EXTERIOR: você envia o seu código em `order.id` e ele volta nas respostas
 *       como `externalId`, ao lado do número interno do Gestão (`id`).
 */

/**
 * @swagger
 * /order-sales:
 *   get:
 *     summary: Lista pedidos de venda com paginação e filtros
 *     description: |
 *       Ordenados do mais recente para o mais antigo (número interno decrescente).
 *       Cada pedido traz `externalId`/`externalSource` quando foi recebido por integração
 *       (API ou MAGAZORD); pedidos lançados direto no Gestão vêm com esses campos nulos.
 *     tags: [Order Sales]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
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
 *         schema: { type: string, format: date, example: "2026-10-01" }
 *         description: Data do pedido a partir de (AAAA-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *         description: Data do pedido até (AAAA-MM-DD)
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
 *       401:
 *         $ref: '#/components/responses/OrderSaleUnauthorized'
 */
router.get('/', orderSaleCtrl.listOrders);

/**
 * @swagger
 * /order-sales/{id}:
 *   get:
 *     summary: Busca um pedido de venda pelo número interno
 *     description: |
 *       `id` é o número interno do Gestão (PED_CODIGO), o mesmo devolvido em `order.id` no POST.
 *       O código do seu sistema vem em `externalId`.
 *     tags: [Order Sales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Número interno do pedido (PED_CODIGO)
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderSale'
 *       401:
 *         $ref: '#/components/responses/OrderSaleUnauthorized'
 *       404:
 *         $ref: '#/components/responses/OrderSaleNotFound'
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
 *         description: Número interno do pedido (PED_CODIGO)
 *     responses:
 *       200:
 *         description: Itens do pedido, por sequência
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrderSaleItem'
 *       401:
 *         $ref: '#/components/responses/OrderSaleUnauthorized'
 *       404:
 *         $ref: '#/components/responses/OrderSaleNotFound'
 */
router.get('/:id/items', orderSaleCtrl.listOrderItems);

/**
 * @swagger
 * /order-sales:
 *   post:
 *     summary: Cria (ou regrava) um pedido de venda completo
 *     description: |
 *       Grava o cliente (se o CPF/CNPJ ainda não existir), o endereço, o pedido, os itens e a saída de
 *       estoque, sempre com os códigos do Gestão. O código do pedido no **seu** sistema vai em `order.id`
 *       (obrigatório) e fica vinculado ao número interno em TB_PEDIDO_FROM_EXTERIOR.
 *
 *       **Código externo × número interno**
 *       - No envio, `order.id` é o seu código (ex.: `"PED-2026-0001"`).
 *       - Na resposta, `order.id` é o número interno do Gestão (PED_CODIGO) e o seu código volta em
 *         `order.externalId` (com `order.externalSource = "API"`).
 *
 *       **Reenvio do mesmo `order.id`**
 *       - Pedido ainda aberto no Gestão (`invoiced = N`): o pedido anterior tem o estoque estornado e é
 *         apagado, e o novo é gravado **com outro número interno**. Guarde o `externalId` como referência
 *         estável e atualize o número interno a cada resposta.
 *       - Pedido faturado (`S`), na lixeira (`A`) ou cancelado (`C`): 400 "Pedido já processado" e nada é alterado.
 *
 *       **Validação antes de gravar**: nada é gravado se houver qualquer problema. Todos os problemas vêm
 *       de uma vez, com o caminho do campo e como corrigir:
 *       - obrigatórios: `order.id`, `order.userId`, `order.date`, `order.customerName`, `order.fiscalDocument`,
 *         `order.salesmanId` e ao menos um item com `productId`, `quantity` e `unitPrice`;
 *       - CPF/CNPJ válido; vendedor cadastrado e ativo (sem demissão; 0 não é aceito);
 *         `institutionId` e `paymentTypeId`, se enviados, precisam existir;
 *       - tamanho máximo dos textos (ver `maxLength` em OrderSaleInput) e sem emojis/símbolos fora do WIN1252;
 *       - CEP com 8 dígitos (com ou sem máscara), UF válida, datas AAAA-MM-DD ou DD/MM/AAAA, hora HH:MM[:SS];
 *       - campos numéricos numéricos; `quantity` maior que zero.
 *     tags: [Order Sales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderSaleInput'
 *           example:
 *             order:
 *               id: "PED-2026-0001"
 *               userId: 3
 *               date: "2026-10-14"
 *               hour: "08:30"
 *               customerName: "João da Silva"
 *               fiscalDocument: "529.982.247-25"
 *               email: "joao@email.com"
 *               birthFoundation: "1977-10-09"
 *               street: "Rua Tal"
 *               buildingNumber: "28"
 *               complement: "Casa A"
 *               neighborhood: "Centro"
 *               zipcode: "81770-090"
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
 *         description: Pedido gravado. `order.id` é o número interno; `order.externalId` é o código enviado.
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
 *             example:
 *               order:
 *                 id: 375085
 *                 externalId: "PED-2026-0001"
 *                 externalSource: "API"
 *                 number: null
 *                 type: 1
 *                 userId: 3
 *                 date: "2026-10-14"
 *                 hour: "08:30"
 *                 customerId: 80297
 *                 salesmanId: 7
 *                 paymentTypeId: 1
 *                 addressId: 91234
 *                 quantityProducts: 2
 *                 totalProducts: 700
 *                 freight: 25
 *                 discount: 0
 *                 total: 725
 *                 invoiced: "N"
 *                 institutionId: 1
 *                 observation: "Pedido via integração"
 *                 approved: "N"
 *               items:
 *                 - id: 1001780
 *                   sequence: 1
 *                   orderId: 375085
 *                   productId: 200
 *                   quantity: 2
 *                   unitPrice: 350
 *                   discount: 0
 *                   discountPct: 0
 *                   stockListId: 1
 *                   priceListId: 1
 *       400:
 *         description: |
 *           Pedido não gravado. Em erros de validação, `fields` lista cada campo com problema
 *           (caminho no JSON, motivo/como corrigir e valor recebido) e `details` traz as mesmas
 *           mensagens prontas para exibir. Reenvio de pedido já processado traz só `error`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             examples:
 *               validacao:
 *                 summary: Campos inválidos (todos listados de uma vez)
 *                 value:
 *                   error: "Pedido não gravado: corrija os campos indicados e envie novamente."
 *                   details:
 *                     - "order.complement: Complemento tem 32 caracteres; o máximo aceito é 25. Abrevie o texto."
 *                     - "order.salesmanId: Vendedor demitido em 28/09/2026 não pode receber pedidos. Use um vendedor ativo (GET /salesmen?active=true)."
 *                     - "items[0].quantity: Quantidade deve ser maior que zero."
 *                   fields:
 *                     - field: "order.complement"
 *                       message: "Complemento tem 32 caracteres; o máximo aceito é 25. Abrevie o texto."
 *                       received: "APARTAMENTO 1203 BLOCO B TORRE 2"
 *                     - field: "order.salesmanId"
 *                       message: "Vendedor demitido em 28/09/2026 não pode receber pedidos. Use um vendedor ativo (GET /salesmen?active=true)."
 *                       received: 496
 *                     - field: "items[0].quantity"
 *                       message: "Quantidade deve ser maior que zero."
 *                       received: 0
 *               jaProcessado:
 *                 summary: Reenvio de pedido faturado, na lixeira ou cancelado
 *                 value:
 *                   error: 'Pedido já processado. Excluído. Código externo: "PED-2026-0001", Pedido interno: 375085'
 *       401:
 *         $ref: '#/components/responses/OrderSaleUnauthorized'
 *       500:
 *         description: Erro inesperado no servidor (detalhes ficam no log da API).
 *         content:
 *           application/json:
 *             example:
 *               error: "Erro interno no servidor."
 */
router.post('/', orderSaleCtrl.createOrder);


// ===================================================================
// Schemas Swagger
// ===================================================================

/**
 * @swagger
 * components:
 *   responses:
 *     OrderSaleUnauthorized:
 *       description: Token JWT ausente, inválido ou expirado (obtenha um em POST /auth/login)
 *       content:
 *         application/json:
 *           example:
 *             error: "Token de autenticacao nao fornecido."
 *     OrderSaleNotFound:
 *       description: Pedido não encontrado
 *       content:
 *         application/json:
 *           example:
 *             error: "Pedido #375085 não encontrado."
 *
 *   schemas:
 *     OrderSale:
 *       type: object
 *       description: |
 *         Datas e hora: no POST voltam como foram enviadas (ex.: "2026-10-14", "08:30");
 *         nos GETs voltam como data/hora ISO em UTC (ex.: date "2026-10-14T03:00:00.000Z",
 *         hour "1970-01-01T11:30:00.000Z").
 *       properties:
 *         id:                  { type: integer, example: 375085, description: "Número interno do pedido no Gestão (PED_CODIGO). Muda a cada reenvio de um pedido aberto." }
 *         externalId:          { type: string, nullable: true, example: "PED-2026-0001", description: "Código do pedido no sistema de origem (TB_PEDIDO_FROM_EXTERIOR.ID_EXTERIOR) — o order.id enviado no POST. Nulo para pedidos lançados direto no Gestão." }
 *         externalSource:      { type: string, nullable: true, example: "API", description: "Origem do vínculo (KIND): API = enviado por esta API; MAGAZORD = integração Magazord do ERP." }
 *         number:              { type: integer, example: 1050, nullable: true }
 *         type:                { type: integer, example: 1, description: "1 = Venda" }
 *         userId:              { type: integer, example: 3 }
 *         date:                { type: string, example: "2026-10-14" }
 *         hour:                { type: string, example: "08:30", nullable: true }
 *         customerId:          { type: integer, example: 80297, description: "Cliente (TB_EMPRESA.EMP_CODIGO), encontrado ou criado pelo CPF/CNPJ" }
 *         salesmanId:          { type: integer, example: 7, nullable: true }
 *         paymentTypeId:       { type: integer, example: 1, nullable: true }
 *         paymentTerms:        { type: string, nullable: true }
 *         addressId:           { type: integer, example: 91234 }
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
 *         deliveryDate:        { type: string, nullable: true }
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
 *         id:          { type: integer, example: 1001780, description: "Código interno do item (TB_ITENS_NFL.ITF_CODIGO, gerador GN_ITENS_NFL)" }
 *         sequence:    { type: integer, example: 1 }
 *         orderId:     { type: integer, example: 375085, description: "Número interno do pedido" }
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
 *           required: [id, userId, date, customerName, fiscalDocument, salesmanId]
 *           description: |
 *             Campos preenchidos internamente pela API (NÃO enviar):
 *             type, invoiced, presenceIndicator, terminal, approved, deliveryAddressId
 *           properties:
 *             id:                 { type: string, maxLength: 50, example: "PED-2026-0001", description: "Obrigatório. Código do pedido no SEU sistema. Fica vinculado ao número interno (TB_PEDIDO_FROM_EXTERIOR) e volta como externalId. Reenviar o mesmo código regrava o pedido se ele ainda estiver aberto." }
 *             userId:             { type: integer, description: "Código do usuário (retornado no login)", example: 3 }
 *             date:               { type: string, example: "2026-10-14", description: "Data do pedido. Formato AAAA-MM-DD ou DD/MM/AAAA" }
 *             hour:               { type: string, example: "08:30", description: "Formato HH:MM ou HH:MM:SS", nullable: true }
 *             customerName:       { type: string, maxLength: 100, example: "João da Silva", description: "Usado só se o CPF/CNPJ ainda não estiver cadastrado" }
 *             fiscalDocument:     { type: string, example: "529.982.247-25", description: "CPF (11 dígitos) ou CNPJ (14 dígitos) válido, com ou sem máscara. Identifica o cliente." }
 *             email:              { type: string, maxLength: 100, example: "joao@email.com", nullable: true }
 *             birthFoundation:    { type: string, example: "1977-10-09", description: "Data de nascimento (PF) ou fundação (PJ). Formato AAAA-MM-DD ou DD/MM/AAAA", nullable: true }
 *             street:             { type: string, maxLength: 100, example: "Rua Tal" }
 *             buildingNumber:     { type: string, maxLength: 10, example: "28" }
 *             complement:         { type: string, maxLength: 25, example: "Casa A", nullable: true }
 *             neighborhood:       { type: string, maxLength: 100, example: "Centro" }
 *             zipcode:            { type: string, example: "81770-090", description: "8 dígitos, com ou sem máscara (gravado só com dígitos)" }
 *             cityName:           { type: string, maxLength: 60, example: "Curitiba" }
 *             stateAbbreviation:  { type: string, minLength: 2, maxLength: 2, example: "PR", description: "Sigla da UF (EX para exterior)" }
 *             salesmanId:         { type: integer, minimum: 1, example: 7, description: "Obrigatório. Código do vendedor (retornado no login); precisa ser vendedor ativo, sem demissão (GET /salesmen?active=true). 0 não é aceito." }
 *             paymentTypeId:      { type: integer, example: 1, nullable: true, description: "Se enviado, precisa existir (GET /payment-types)" }
 *             quantityProducts:   { type: number, example: 2 }
 *             totalProducts:      { type: number, example: 700 }
 *             freightValue:       { type: number, example: 25 }
 *             discountValue:      { type: number, example: 0 }
 *             totalValue:         { type: number, example: 725 }
 *             institutionId:      { type: integer, example: 1, nullable: true, description: "Estabelecimento. Se enviado, precisa existir (GET /institutions)" }
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
 *               sequence:    { type: integer, example: 1, nullable: true, description: "Se omitido, usa a posição no array (1, 2, 3...)" }
 *               quantity:    { type: number, minimum: 0, exclusiveMinimum: true, example: 2, description: "Maior que zero (aceita fração)" }
 *               unitPrice:   { type: number, example: 350 }
 *               discount:    { type: number, default: 0 }
 *               discountPct: { type: number, default: 0 }
 *               stockListId: { type: integer, example: 1, nullable: true, description: "Se enviado, registra a saída do estoque (TB_CTRL_ESTOQUE) nesse estoque" }
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
 */

module.exports = router;
