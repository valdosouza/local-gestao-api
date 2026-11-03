'use strict';

const { Router } = require('express');
const budgetCtrl     = require('./infrastructure/budget.controller');
const budgetItemCtrl = require('./infrastructure/budget.item.controller');

const router = Router();

// ===================================================================
// ORÇAMENTOS — TB_COTACAO
// ===================================================================

/**
 * @swagger
 * tags:
 *   - name: Budgets
 *     description: Gestão de orçamentos (TB_COTACAO)
 *   - name: Budget Items
 *     description: Itens dos orçamentos (TB_ITENS_CTC)
 */

/**
 * @swagger
 * /budgets:
 *   get:
 *     summary: Lista orçamentos com paginação e filtros
 *     tags: [Budgets]
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
 *         name: number
 *         schema: { type: string }
 *         description: Parte do número do orçamento ou código interno exato
 *       - in: query
 *         name: customerName
 *         schema: { type: string }
 *         description: Parte do nome do cliente gravado no orçamento
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filtro por status (ex. A, I, F)
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *         description: Filtro por usuário (CTC_CODUSU)
 *       - in: query
 *         name: customerId
 *         schema: { type: integer }
 *         description: Filtro por cliente (CTC_CODEMP)
 *       - in: query
 *         name: salesmanId
 *         schema: { type: integer }
 *         description: Filtro por vendedor (CTC_CODVDO)
 *       - in: query
 *         name: institutionId
 *         schema: { type: integer }
 *         description: Filtro por instituição (CTC_CODMHA)
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date, example: "2024-03-07" }
 *         description: Data inicial
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date, example: "2024-12-31" }
 *         description: Data final
 *     responses:
 *       200:
 *         description: Lista paginada de orçamentos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Budget'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 */
router.get('/', budgetCtrl.listBudgets);

/**
 * @swagger
 * /budgets/{id}:
 *   get:
 *     summary: Busca um orçamento por ID
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Orçamento encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Budget'
 *       404:
 *         description: Não encontrado
 */
router.get('/:id', budgetCtrl.getBudget);

/**
 * @swagger
 * /budgets:
 *   post:
 *     summary: Cria um novo orçamento
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetInput'
 *     responses:
 *       201:
 *         description: Orçamento criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Budget'
 *       400:
 *         description: Dados inválidos
 */
router.post('/', budgetCtrl.createBudget);

/**
 * @swagger
 * /budgets/{id}:
 *   put:
 *     summary: Atualiza um orçamento existente
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetInput'
 *     responses:
 *       200:
 *         description: Orçamento atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Budget'
 *       404:
 *         description: Não encontrado
 */
router.put('/:id', budgetCtrl.updateBudget);

// ===================================================================
// ITENS DO ORÇAMENTO — TB_ITENS_CTC
// ===================================================================

/**
 * @swagger
 * /budgets/{id}/items:
 *   get:
 *     summary: Lista os itens de um orçamento
 *     tags: [Budget Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de itens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BudgetItem'
 *       404:
 *         description: Orçamento não encontrado
 */
router.get('/:id/items', budgetItemCtrl.listItems);

/**
 * @swagger
 * /budgets/{id}/items/{itemId}:
 *   get:
 *     summary: Busca um item específico do orçamento
 *     tags: [Budget Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Item encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BudgetItem'
 *       404:
 *         description: Não encontrado
 */
router.get('/:id/items/:itemId', budgetItemCtrl.getItem);

/**
 * @swagger
 * /budgets/{id}/items:
 *   post:
 *     summary: Adiciona um item ao orçamento
 *     tags: [Budget Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetItemInput'
 *     responses:
 *       201:
 *         description: Item criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BudgetItem'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Orçamento não encontrado
 */
router.post('/:id/items', budgetItemCtrl.createItem);

/**
 * @swagger
 * /budgets/{id}/items/{itemId}:
 *   put:
 *     summary: Atualiza um item do orçamento
 *     tags: [Budget Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetItemInput'
 *     responses:
 *       200:
 *         description: Item atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BudgetItem'
 *       404:
 *         description: Não encontrado
 */
router.put('/:id/items/:itemId', budgetItemCtrl.updateItem);

/**
 * @swagger
 * /budgets/{id}/items/{itemId}:
 *   delete:
 *     summary: Remove um item do orçamento
 *     tags: [Budget Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Item removido
 *       404:
 *         description: Não encontrado
 */
router.delete('/:id/items/:itemId', budgetItemCtrl.deleteItem);

// ===================================================================
// Schemas Swagger (reutilizados em outros módulos)
// ===================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         total:  { type: integer, example: 150 }
 *         limit:  { type: integer, example: 20 }
 *         offset: { type: integer, example: 0 }
 *
 *     Budget:
 *       type: object
 *       properties:
 *         id:               { type: integer, example: 1001 }
 *         orderId:          { type: integer, example: 500 }
 *         number:           { type: string,  example: "ORC-2024-001" }
 *         userId:           { type: integer, example: 3 }
 *         date:             { type: string, format: date, example: "2024-06-15" }
 *         customerId:       { type: integer, example: 42, nullable: true }
 *         customerName:     { type: string,  example: "Empresa Teste Ltda", nullable: true }
 *         paymentTypeId:    { type: integer, example: 1, nullable: true }
 *         paymentTerms:     { type: string,  example: "30/60/90 dias", nullable: true }
 *         quantityProducts: { type: number,  example: 5 }
 *         totalProducts:    { type: number,  example: 1500.00 }
 *         freight:          { type: number,  example: 50.00 }
 *         discountPercent:  { type: number,  example: 5.00 }
 *         discountValue:    { type: number,  example: 75.00 }
 *         total:            { type: number,  example: 1475.00 }
 *         contact:          { type: string,  example: "João Silva", nullable: true }
 *         validity:         { type: string,  example: "30 dias", nullable: true }
 *         deliveryTime:     { type: string,  example: "5 dias úteis", nullable: true }
 *         salesmanId:       { type: integer, example: 7, nullable: true }
 *         institutionId:    { type: integer, example: 1, nullable: true }
 *         status:           { type: string,  example: "A" }
 *
 *     BudgetInput:
 *       type: object
 *       required: [userId, date]
 *       properties:
 *         orderId:          { type: integer }
 *         number:           { type: string }
 *         userId:           { type: integer }
 *         date:             { type: string, example: "31/12/2024", description: "Formato DD/MM/YYYY" }
 *         customerId:       { type: integer, nullable: true }
 *         customerName:     { type: string,  nullable: true }
 *         paymentTypeId:    { type: integer, nullable: true }
 *         paymentTerms:     { type: string,  nullable: true }
 *         quantityProducts: { type: number }
 *         totalProducts:    { type: number }
 *         freight:          { type: number }
 *         discountPercent:  { type: number }
 *         discountValue:    { type: number }
 *         total:            { type: number }
 *         contact:          { type: string,  nullable: true }
 *         validity:         { type: string,  nullable: true }
 *         deliveryTime:     { type: string,  nullable: true }
 *         salesmanId:       { type: integer, nullable: true }
 *         institutionId:    { type: integer, nullable: true }
 *         status:           { type: string,  default: "A" }
 *
 *     BudgetItem:
 *       type: object
 *       properties:
 *         id:              { type: integer, example: 5001 }
 *         budgetId:        { type: integer, example: 1001 }
 *         type:            { type: string,  example: "P", nullable: true }
 *         productId:       { type: integer, example: 200, nullable: true }
 *         description:     { type: string,  example: "Produto XYZ" }
 *         quantity:        { type: number,  example: 2 }
 *         unitPrice:       { type: number,  example: 350.00 }
 *         commission:      { type: number,  example: 5.00 }
 *         discountValue:   { type: number,  example: 0 }
 *         discountPercent: { type: number,  example: 0 }
 *         stockId:         { type: integer, example: 1, nullable: true }
 *         priceListId:     { type: integer, example: 1, nullable: true }
 *         costPrice:       { type: number,  example: 200.00 }
 *         sequence:        { type: integer, example: 1, nullable: true }
 *
 *     BudgetItemInput:
 *       type: object
 *       required: [description, quantity, unitPrice]
 *       properties:
 *         type:            { type: string,  nullable: true }
 *         productId:       { type: integer, nullable: true }
 *         description:     { type: string }
 *         quantity:        { type: number }
 *         unitPrice:       { type: number }
 *         commission:      { type: number }
 *         discountValue:   { type: number }
 *         discountPercent: { type: number }
 *         stockId:         { type: integer, nullable: true }
 *         priceListId:     { type: integer, nullable: true }
 *         costPrice:       { type: number }
 *         sequence:        { type: integer, nullable: true }
 */

module.exports = router;
