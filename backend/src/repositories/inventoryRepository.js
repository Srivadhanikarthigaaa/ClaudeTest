// FRD Section 16.2 (Inventory). All queries parameterized via .input().
const { sql, getRequest } = require('../database/pool');

async function create({ ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate }, transaction) {
  const request = await getRequest(transaction);
  await request
    .input('ProductId', sql.VarChar(50), ProductId)
    .input('WarehouseId', sql.VarChar(10), WarehouseId)
    .input('AvailableQuantity', sql.Int, AvailableQuantity)
    .input('EarliestDispatchDate', sql.Date, EarliestDispatchDate)
    .query(
      `INSERT INTO dbo.Inventory (ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate)
       VALUES (@ProductId, @WarehouseId, @AvailableQuantity, @EarliestDispatchDate)`
    );
  return { ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate };
}

async function findByProductAndWarehouse(productId, warehouseId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('ProductId', sql.VarChar(50), productId)
    .input('WarehouseId', sql.VarChar(10), warehouseId)
    .query(
      `SELECT ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate
       FROM dbo.Inventory WHERE ProductId = @ProductId AND WarehouseId = @WarehouseId`
    );
  return result.recordset[0] || null;
}

// Phase 7 concurrency strategy (FRD Section 57): takes an UPDLOCK+HOLDLOCK on
// the matching row for the life of the caller's transaction, so no other
// transaction can read or modify it until this one commits or rolls back.
// Must always be called with a transaction — the same hint outside a
// transaction releases immediately and provides no protection at all.
async function findForUpdate(productId, warehouseId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('ProductId', sql.VarChar(50), productId)
    .input('WarehouseId', sql.VarChar(10), warehouseId)
    .query(
      `SELECT ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate
       FROM dbo.Inventory WITH (UPDLOCK, HOLDLOCK)
       WHERE ProductId = @ProductId AND WarehouseId = @WarehouseId`
    );
  return result.recordset[0] || null;
}

// Used directly by the Fulfilment Decision Engine (Phase 6/7) to evaluate
// WH-A/WH-B/WH-C for one ProductId in a single round trip.
async function findAllByProduct(productId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('ProductId', sql.VarChar(50), productId)
    .query(
      `SELECT ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate
       FROM dbo.Inventory WHERE ProductId = @ProductId ORDER BY WarehouseId`
    );
  return result.recordset;
}

// FR-INV-02/FR-SRCH-01: Inventory Management screen's "filter by warehouse" view.
async function findAllByWarehouse(warehouseId, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('WarehouseId', sql.VarChar(10), warehouseId)
    .query(
      `SELECT ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate
       FROM dbo.Inventory WHERE WarehouseId = @WarehouseId ORDER BY ProductId`
    );
  return result.recordset;
}

// FR-INV-02: unfiltered "view inventory" list for the management screen.
async function listAll(transaction) {
  const request = await getRequest(transaction);
  const result = await request.query(
    `SELECT ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate
     FROM dbo.Inventory ORDER BY ProductId, WarehouseId`
  );
  return result.recordset;
}

async function update(productId, warehouseId, { AvailableQuantity, EarliestDispatchDate }, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('ProductId', sql.VarChar(50), productId)
    .input('WarehouseId', sql.VarChar(10), warehouseId)
    .input('AvailableQuantity', sql.Int, AvailableQuantity)
    .input('EarliestDispatchDate', sql.Date, EarliestDispatchDate)
    .query(
      `UPDATE dbo.Inventory
       SET AvailableQuantity = @AvailableQuantity, EarliestDispatchDate = @EarliestDispatchDate
       WHERE ProductId = @ProductId AND WarehouseId = @WarehouseId`
    );
  return result.rowsAffected[0] > 0;
}

// Supports the Phase 7 row-locking strategy (FRD Section 57): the WHERE clause
// re-checks AvailableQuantity >= @Quantity in the same statement that decrements
// it, so SQL Server's row lock on the matching (ProductId, WarehouseId) row
// covers the whole check-and-decrement — two concurrent callers can never both
// succeed against units that only one of them can have. Call this inside a
// transaction shared with the Order/FulfilmentResult/InventoryAllocation writes
// (FR-BE-06/07) and treat a `false` return as "lost the race" or "insufficient
// inventory" — the caller must not assume the decrement happened.
async function decrementAvailableQuantity(productId, warehouseId, quantity, transaction) {
  const request = await getRequest(transaction);
  const result = await request
    .input('ProductId', sql.VarChar(50), productId)
    .input('WarehouseId', sql.VarChar(10), warehouseId)
    .input('Quantity', sql.Int, quantity)
    .query(
      `UPDATE dbo.Inventory
       SET AvailableQuantity = AvailableQuantity - @Quantity
       WHERE ProductId = @ProductId AND WarehouseId = @WarehouseId AND AvailableQuantity >= @Quantity`
    );
  return result.rowsAffected[0] > 0;
}

module.exports = {
  create,
  findByProductAndWarehouse,
  findForUpdate,
  findAllByProduct,
  findAllByWarehouse,
  listAll,
  update,
  decrementAvailableQuantity,
};
