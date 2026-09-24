// FRD Section 16.5 (InventoryAllocation). All queries parameterized via .input().
const { sql, getRequest } = require('../database/pool');

// AllocationId is DB-generated (see database/README.md: implementation choice,
// not an FRD-defined value) — OUTPUT reads back the generated value.
async function create({ OrderId, WarehouseId, AllocatedQuantity }, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), OrderId)
    .input('WarehouseId', sql.VarChar(10), WarehouseId)
    .input('AllocatedQuantity', sql.Int, AllocatedQuantity)
    .query(
      `INSERT INTO dbo.InventoryAllocation (OrderId, WarehouseId, AllocatedQuantity)
       OUTPUT inserted.AllocationId
       VALUES (@OrderId, @WarehouseId, @AllocatedQuantity)`
    );
  return { AllocationId: result.recordset[0].AllocationId, OrderId, WarehouseId, AllocatedQuantity };
}

async function findByOrderId(orderId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('OrderId', sql.VarChar(50), orderId)
    .query(
      // ORDER BY WarehouseId matters since CHANGE1: a Priority order can hold
      // several allocation rows, and an idempotent replay has to return them
      // in the same order every time — which an unordered SELECT does not
      // guarantee. WarehouseId sorts WH-A, WH-B, WH-C, i.e. the same priority
      // order the allocations were planned in.
      `SELECT AllocationId, OrderId, WarehouseId, AllocatedQuantity
       FROM dbo.InventoryAllocation WHERE OrderId = @OrderId
       ORDER BY WarehouseId`
    );
  return result.recordset;
}

module.exports = { create, findByOrderId };
