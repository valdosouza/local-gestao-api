'use strict';

require('dotenv').config();


const express      = require('express');
const cors         = require('cors');
const swaggerUi    = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const env      = require('./src/config/env');
const { initPool, destroyPool } = require('./src/config/database');
const { authenticateToken } = require('./src/auth/infrastructure/jwt.middleware');

// ----------------------------------------------------------------
// Inicializa pool Firebird antes de subir o servidor
// ----------------------------------------------------------------
initPool();

// ----------------------------------------------------------------
// App Express
// ----------------------------------------------------------------
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);

  // Guarda o corpo das respostas de erro para registrar o motivo da recusa
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) res.locals.errorBody = body;
    return json(body);
  };

  // [RES] status + tempo; em erro, as mensagens (campo: motivo), nunca os valores enviados
  res.on('finish', () => {
    let line = `[RES] ${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`;
    if (res.locals.logContext) line += ` ${res.locals.logContext}`;
    const body = res.locals.errorBody;
    if (body) {
      const reasons = Array.isArray(body.details) ? body.details : [body.error];
      line += ` | ${reasons.filter(Boolean).join(' | ')}`;
    }
    console.log(line);
  });

  next();
});
// ----------------------------------------------------------------
// Swagger / OpenAPI 3.0
// ----------------------------------------------------------------
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Local Gestão API',
      version: '1.0.0',
      description: 'API REST para sistema de gestão ERP em rede local — Firebird 2.5',
    },
    servers: [
      {
        url: `${env.apiBaseUrl}/api/v1`,
        description: env.NODE_ENV === 'production' ? 'Produção' : 'Desenvolvimento',
      },
    ],
    components: {
      schemas: {},
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Informe o token JWT obtido em POST /auth/login. Formato: Bearer {token}',
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  // Arquivos que contêm anotações JSDoc com @swagger
  apis: ['./src/**/**.routes.js', './src/**/*.controller.js', './server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ----------------------------------------------------------------
// Rotas base
// ----------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({
    message: 'Bem-vindo à Local Gestão API',
    docs: '/api-docs',
    health: '/api/v1/health',
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Verifica se a API está rodando
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API rodando corretamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: boolean
 *                   example: true
 */
app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({ result: true });
});

// Módulos de rotas — login público
app.use('/api/v1/auth',           require('./src/auth/auth.routes'));
app.use('/api/v1/institutions',   require('./src/institution/institution.routes'));

// Todas as rotas abaixo exigem JWT válido
app.use(authenticateToken);

app.use('/api/v1/budgets',        require('./src/budget/budget.routes'));
app.use('/api/v1/products',       require('./src/product/product.routes'));
app.use('/api/v1/customers',      require('./src/customer/customer.routes'));
app.use('/api/v1/salesmen',       require('./src/salesman/salesman.routes'));
app.use('/api/v1/price-lists',    require('./src/price_list/price_list.routes'));
app.use('/api/v1/prices',         require('./src/price/price.routes'));
app.use('/api/v1/stock-lists',    require('./src/stock_list/stock_list.routes'));
app.use('/api/v1/stock-balance',  require('./src/stock_balance/stock_balance.routes'));
app.use('/api/v1/payment-types',  require('./src/payment_type/payment_type.routes'));
app.use('/api/v1/product-images', require('./src/product_image/product_image.routes'));
app.use('/api/v1/stock-control',  require('./src/stock_control/stock_control.routes'));
app.use('/api/v1/order-sales',    require('./src/order_sale/order_sale.routes'));
app.use('/api/v1/permission',     require('./src/permission/permission.routes'));

// ----------------------------------------------------------------
// Handler 404
// ----------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ----------------------------------------------------------------
// Handler de erros globais
// ----------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[ERROR]', err);
  }
  const isServerError = status >= 500;
  res.status(status).json({
    error: (!isServerError || env.isDev) ? err.message : 'Erro interno no servidor.',
    ...(env.isDev && isServerError && { stack: err.stack }),
  });
});

// ----------------------------------------------------------------
// Start
// ----------------------------------------------------------------

const server = app.listen(env.PORT, () => {
  const baseUrl = env.apiBaseUrl.replace(/\/api\/v1$/, '');
  console.log(`[APP] local-gestao-api rodando em ${baseUrl}`);
  console.log(`[APP] Documentação Swagger: ${baseUrl}/api-docs`);
  console.log(`[APP] Ambiente: ${env.NODE_ENV}`);
});

// ----------------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------------
async function shutdown(signal) {
  console.log(`\n[APP] Sinal ${signal} recebido — encerrando...`);
  server.close(async () => {
    await destroyPool();
    console.log('[APP] Servidor encerrado com sucesso.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception — servidor mantido no ar:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection — servidor mantido no ar:', reason);
});

module.exports = app; // útil para testes
