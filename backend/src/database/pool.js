// Shared connection pool (FRD Section 54 — Backend Architecture / database layer).
// Repositories never build their own connection; they call getRequest() here so
// every query is parameterized through mssql's Request#input, never string-built.
const sql = require('mssql');

let poolPromise = null;

function getConfig() {
  return {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      encrypt: true,
    },
    // This environment's network path to the DB host has been observed to be
    // intermittent (plain TCP timeouts interspersed with successful
    // connections) — longer than the mssql/tedious defaults so a slow-but-
    // working connection doesn't get killed prematurely.
    connectionTimeout: 20000,
    requestTimeout: 30000,
  };
}

function getPool() {
  if (!poolPromise) {
    // A failed connection attempt must not permanently wedge this module —
    // clear the cached (rejected) promise so the next call retries fresh,
    // instead of every future getPool() re-awaiting the same failure forever.
    poolPromise = sql.connect(getConfig()).catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

// Repository calls pass `transaction` through here so several repository
// calls can share one atomic transaction (Phase 7 — FRD 56/FR-BE-06/07:
// order + fulfilment result + allocation + inventory decrement as one unit).
// With no transaction, the call runs directly against the pool.
async function getRequest(transaction) {
  if (transaction) return new sql.Request(transaction);
  const pool = await getPool();
  return pool.request();
}

async function beginTransaction() {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  return transaction;
}

async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

module.exports = { sql, getPool, getRequest, beginTransaction, closePool };
