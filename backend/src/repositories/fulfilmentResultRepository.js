// FRD Section 16.4 (FulfilmentResult). Used only by the Fulfilment Service
// (FRD Section 9.3/9.4) — all queries parameterized via .input().
const { sql, getRequest } = require('../database/pool');

async function findByOrderId(orderId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), orderId)
    .query(
      `SELECT OrderId, Status, Reason, ReleasedQuantity, BackorderedQuantity
       FROM dbo.FulfilmentResult WHERE OrderId = @OrderId`
    );
  return result.recordset[0] || null;
}

async function create({ OrderId, Status, Reason, ReleasedQuantity, BackorderedQuantity }, transaction) {
  const request = await getRequest(transaction);
  await request
    .input('OrderId', sql.VarChar(50), OrderId)
    .input('Status', sql.VarChar(20), Status)
    .input('Reason', sql.VarChar(50), Reason ?? null)
    .input('ReleasedQuantity', sql.Int, ReleasedQuantity)
    .input('BackorderedQuantity', sql.Int, BackorderedQuantity)
    .query(
      `INSERT INTO dbo.FulfilmentResult (OrderId, Status, Reason, ReleasedQuantity, BackorderedQuantity)
       VALUES (@OrderId, @Status, @Reason, @ReleasedQuantity, @BackorderedQuantity)`
    );
  return { OrderId, Status, Reason: Reason ?? null, ReleasedQuantity, BackorderedQuantity };
}

module.exports = { findByOrderId, create };
