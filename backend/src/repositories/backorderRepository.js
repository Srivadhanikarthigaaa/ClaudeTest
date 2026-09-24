// CHANGE1 requirement 3 — dbo.Backorder (OrderId, ProductId,
// BackorderedQuantity, Status = 'Open'). See
// database/schema/003_change1_backorder_and_multi_allocation.sql.
// All queries parameterized via .input().
const { sql, getRequest } = require('../database/pool');

const OPEN = 'Open';

// BackorderId is DB-generated (same implementation choice as
// InventoryAllocation.AllocationId) — OUTPUT reads back the generated value.
// The table's UNIQUE (OrderId) constraint is what makes "exactly one
// backorder per order" a database invariant rather than a convention, so a
// duplicate insert fails loudly instead of quietly doubling the backlog.
async function create({ OrderId, ProductId, BackorderedQuantity, Status = OPEN }, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), OrderId)
    .input('ProductId', sql.VarChar(50), ProductId)
    .input('BackorderedQuantity', sql.Int, BackorderedQuantity)
    .input('Status', sql.VarChar(20), Status)
    .query(
      `INSERT INTO dbo.Backorder (OrderId, ProductId, BackorderedQuantity, Status)
       OUTPUT inserted.BackorderId
       VALUES (@OrderId, @ProductId, @BackorderedQuantity, @Status)`
    );
  return { BackorderId: result.recordset[0].BackorderId, OrderId, ProductId, BackorderedQuantity, Status };
}

async function findByOrderId(orderId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), orderId)
    .query(
      `SELECT BackorderId, OrderId, ProductId, BackorderedQuantity, Status
       FROM dbo.Backorder WHERE OrderId = @OrderId`
    );
  return result.recordset;
}

module.exports = { create, findByOrderId, OPEN };
