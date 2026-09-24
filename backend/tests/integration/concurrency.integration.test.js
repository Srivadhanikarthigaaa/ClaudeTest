// Phase 11 / Phase 7 exit criteria: a real concurrency test against a live
// SQL Server — no mocks. Fires more than two simultaneous requests
// (the security review explicitly asks for "more than two") at a single
// warehouse row holding exactly enough stock for ONE of them, and proves
// the Phase 7 row-locking strategy (UPDLOCK/HOLDLOCK) holds: exactly one
// Released, the rest correctly fall through to Blocked, AvailableQuantity
// never goes negative, and never more than one allocation is created.
const fulfilmentService = require('../../src/services/fulfilmentService');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const { getPool, closePool } = require('../../src/database/pool');
const { BLOCKED_INSUFFICIENT_INVENTORY } = require('../../src/services/reasonCodes');

const TEST_PRODUCT_ID = 'TESTPROD-CONCURRENCY-001';
const TEST_WAREHOUSE_ID = 'WH-A';
const CONTENDER_COUNT = 5;
const TEST_ORDER_IDS = Array.from({ length: CONTENDER_COUNT }, (_, i) => `TESTORD-CONC-${i + 1}`);

async function cleanup() {
  const pool = await getPool();
  for (const orderId of TEST_ORDER_IDS) {
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.InventoryAllocation WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.FulfilmentResult WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
  }
  await pool.request().input('ProductId', TEST_PRODUCT_ID).query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
}

beforeAll(async () => {
  await cleanup();
  // Deliberately only ONE warehouse row, holding exactly enough for one
  // contender — forces genuine contention with no fallthrough warehouse.
  await inventoryRepository.create({
    ProductId: TEST_PRODUCT_ID,
    WarehouseId: TEST_WAREHOUSE_ID,
    AvailableQuantity: 20,
    EarliestDispatchDate: '2026-09-20',
  });
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('Concurrency (Phase 7 / Phase 11 security review — N > 2 contenders)', () => {
  test(`${CONTENDER_COUNT} simultaneous requests for the same 20 units: exactly one Released, no negative inventory, no double allocation`, async () => {
    const results = await Promise.all(
      TEST_ORDER_IDS.map((orderId) =>
        fulfilmentService.submitOrder({
          OrderId: orderId,
          CustomerId: 'CUST001',
          CustomerType: 'Standard',
          ProductId: TEST_PRODUCT_ID,
          Quantity: 20,
          PromisedDeliveryDate: '2026-09-25',
        })
      )
    );

    const released = results.filter((r) => r.result.Status === 'Released');
    const blocked = results.filter((r) => r.result.Status === 'Blocked');

    expect(released).toHaveLength(1);
    expect(blocked).toHaveLength(CONTENDER_COUNT - 1);
    for (const { result } of blocked) {
      expect(result.Reason).toBe(BLOCKED_INSUFFICIENT_INVENTORY);
      expect(result.Allocations).toEqual([]);
    }

    const finalRow = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(finalRow.AvailableQuantity).toBe(0); // never negative, exactly depleted once

    const pool = await getPool();
    const allocations = await pool
      .request()
      .input('ProductId', TEST_PRODUCT_ID)
      .query(
        `SELECT ia.AllocationId, ia.AllocatedQuantity FROM dbo.InventoryAllocation ia
         JOIN dbo.[Order] o ON o.OrderId = ia.OrderId
         WHERE o.ProductId = @ProductId`
      );
    expect(allocations.recordset).toHaveLength(1); // never more than one allocation against these units
    expect(allocations.recordset[0].AllocatedQuantity).toBe(20);
  }, 30000);
});
