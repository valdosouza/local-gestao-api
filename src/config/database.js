'use strict';

const Firebird = require('node-firebird');
const env = require('./env');

// ----------------------------------------------------------------
// Configuração do pool de conexões
// ----------------------------------------------------------------
const poolOptions = {
  host:     env.firebird.host,
  port:     env.firebird.port,
  database: env.firebird.database,
  user:     env.firebird.user,
  password: env.firebird.password,
  charset:  env.firebird.charset,

  // Opções recomendadas para Firebird 2.5
  lowercase_keys: false,   // mantém os nomes de coluna em MAIÚSCULO (padrão FB)
  role:           null,
  pageSize:       4096,
};

let pool = null;

/**
 * Inicializa o pool de conexões com o Firebird.
 * Deve ser chamado uma única vez no startup da aplicação.
 */
function initPool() {
  if (pool) return pool;

  pool = Firebird.pool(env.pool.max, poolOptions, {});

  console.log(
    `[DB] Pool Firebird criado — host: ${env.firebird.host}:${env.firebird.port} | max: ${env.pool.max}`
  );

  return pool;
}

/**
 * Obtém uma conexão do pool.
 * @returns {Promise<import('node-firebird').Database>}
 */
function getConnection() {
  return new Promise((resolve, reject) => {
    if (!pool) {
      return reject(new Error('[DB] Pool não inicializado. Chame initPool() primeiro.'));
    }

    pool.get((err, db) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

/**
 * Executa uma query SQL com parâmetros e libera a conexão automaticamente.
 *
 * @param {string} sql     - Instrução SQL com placeholders `?`
 * @param {Array}  params  - Parâmetros posicionais
 * @returns {Promise<Array>} Linhas retornadas (SELECT) ou metadados (INSERT/UPDATE/DELETE)
 */
const QUERY_TIMEOUT_MS = 30_000;

// READ COMMITTED + REC_VERSION + READ ONLY + NO WAIT: lê a última versão confirmada
// sem esperar transações abertas do ERP. A constante ISOLATION_READ_COMMITTED_READ_ONLY
// do node-firebird usa NO_REC_VERSION + WAIT sem limite, e a leitura ficava parada até o
// ERP confirmar a gravação (timeouts no /synch). No node-firebird, ISOLATION_READ_UNCOMMITTED
// é read_committed + rec_version (o Firebird não tem leitura suja).
const READ_ONLY_TRANSACTION = {
  isolation: Firebird.ISOLATION_READ_UNCOMMITTED,
  readOnly:  true,
  wait:      false,
};

async function queryReadOnly(sql, params = []) {
  const db = await getConnection();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      db.detach();
      const err = new Error(`[DB] Query timeout após ${QUERY_TIMEOUT_MS}ms`);
      err.status = 504;
      reject(err);
    }, QUERY_TIMEOUT_MS);

    db.transaction(READ_ONLY_TRANSACTION, (txErr, transaction) => {
      if (txErr) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.detach();
        return reject(txErr);
      }

      transaction.query(sql, params, (err, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        transaction.rollback(() => db.detach());
        if (err) return reject(err);
        resolve(result ?? []);
      });
    });
  });
}

async function query(sql, params = []) {
  const db = await getConnection();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      db.detach();
      const err = new Error(`[DB] Query timeout após ${QUERY_TIMEOUT_MS}ms`);
      err.status = 504;
      reject(err);
    }, QUERY_TIMEOUT_MS);

    db.query(sql, params, (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db.detach();
      if (err) return reject(err);
      resolve(result ?? []);
    });
  });
}

/**
 * Executa múltiplas queries dentro de uma única transação.
 * Faz rollback automático em caso de erro.
 *
 * @param {Function} callback - async (transaction) => { ... }
 *   Dentro do callback, use: await queryInTransaction(transaction, sql, params)
 * @returns {Promise<void>}
 */
async function withTransaction(callback) {
  const db = await getConnection();

  return new Promise((resolve, reject) => {
    db.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err, transaction) => {
      if (err) {
        db.detach();
        return reject(err);
      }

      try {
        await callback(transaction);

        transaction.commit((commitErr) => {
          db.detach();
          if (commitErr) return reject(commitErr);
          resolve();
        });
      } catch (callbackErr) {
        transaction.rollback(() => {
          db.detach();
          reject(callbackErr);
        });
      }
    });
  });
}

/**
 * Executa uma query dentro de uma transação já aberta.
 *
 * @param {object} transaction - Instância de transação do node-firebird
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Array>}
 */
function queryInTransaction(transaction, sql, params = []) {
  return new Promise((resolve, reject) => {
    transaction.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result ?? []);
    });
  });
}

/**
 * Encerra o pool de conexões (para uso em testes ou graceful shutdown).
 */
function destroyPool() {
  return new Promise((resolve) => {
    if (!pool) return resolve();
    pool.destroy(() => {
      pool = null;
      console.log('[DB] Pool Firebird encerrado.');
      resolve();
    });
  });
}

module.exports = {
  initPool,
  getConnection,
  query,
  queryReadOnly,
  withTransaction,
  queryInTransaction,
  destroyPool,
};
