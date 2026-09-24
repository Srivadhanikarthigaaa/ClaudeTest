// CHANGE1 requirement 6, live-DB counterpart — every Priority scenario run
// against the REAL Fulfilment Service and a live SQL Server (no mocks), each
// on its own dedicated ProductId so scenarios never interfere with each other
// or with the shared FRD Section 39 seed data. This is to
// tests/services/priorityFulfilment.test.js what orderFulfilment.e2e.test.js
// is to fulfilmentDecisionEngine.test.js.
//
// Requires database/schema/003_change1_backorder_and_multi_allocation.sql to
// have been run.
const fulfilmentService = require('../../src/services/fulfilmentService');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const backorderRepository = require('../../src/repositories/backorderRepository');
const inventoryAllocationRepository = require('../../src/repositories/inventoryAllocationRepository');
const { getPool, closePool } = require('../../src/database/pool');
const { RELEASED, PARTIALLY_RELEASED, BLOCKED } = require('../../src/services/statuses');

const createdProductIds = new Set();
const createdOrderIds = new Set();

async function seedInventory(productId, rows) {
  createdProductIds.add(productId);
  for (const row of rows) {
    await inventoryRepository.create({ ProductId: productId, EarliestDispatchDate: '2026-09-20', ...row });
  }
}

function priorityOrder(orderId, overrides) {
  createdOrderIds.add(orderId);
  return {
    OrderId: orderId,
    CustomerId: 'CUST001',
    CustomerType: 'Priority',
    ProductId: 'UNSET',
    Quantity: 100,
    PromisedDeliveryDate: '2026-09-25',
    ...overrides,
  };
}

async function cleanupAll() {
  const pool = await getPool();
  for (const orderId of createdOrderIds) {
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.Backorder WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.InventoryAllocation WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.FulfilmentResult WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
  }
  for (const productId of createdProductIds) {
    await pool.request().input('ProductId', productId).query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
  }
}

beforeAll(() => {
  // Pin the threshold so this suite asserts against 70% regardless of what
  // the runner's .env happens to say.
  process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT = '70';
});

afterAll(async () => {
  await cleanupAll();
  await closePool();
});

describe('CHANGE1 Priority fulfilment — live E2E against MOBDB_DEV', () => {
  test('the worked example: qty 100, WH-A=40 / WH-B=35 / WH-C=0 -> released 75, backordered 25', async () => {
    const productId = 'TESTPROD-PRIO-01';
    await seedInventory(productId, [
      { WarehouseId: 'WH-A', AvailableQuantity: 40 },
      { WarehouseId: 'WH-B', AvailableQuantity: 35 },
      { WarehouseId: 'WH-C', AvailableQuantity: 0 },
    ]);

    const { result } = await fulfilmentService.submitOrder(priorityOrder('TESTORD-PRIO-01', { ProductId: productId }));

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.ReleasedQuantity).toBe(75);
    expect(result.BackorderedQuantity).toBe(25);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
    ]);

    // Both contributing warehouses were actually drained, WH-C untouched.
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-A')).AvailableQuantity).toBe(0);
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-B')).AvailableQuantity).toBe(0);
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-C')).AvailableQuantity).toBe(0);

    const backorders = await backorderRepository.findByOrderId('TESTORD-PRIO-01');
    expect(backorders).toHaveLength(1);
    expect(backorders[0]).toMatchObject({ ProductId: productId, BackorderedQuantity: 25, Status: 'Open' });
  });

  test('exactly 70% available -> Partially Released', async () => {
    const productId = 'TESTPROD-PRIO-02';
    await seedInventory(productId, [{ WarehouseId: 'WH-A', AvailableQuantity: 70 }]);

    const { result } = await fulfilmentService.submitOrder(priorityOrder('TESTORD-PRIO-02', { ProductId: productId }));

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.ReleasedQuantity).toBe(70);
    expect(result.BackorderedQuantity).toBe(30);
    expect(await backorderRepository.findByOrderId('TESTORD-PRIO-02')).toHaveLength(1);
  });

  test('just under 70% (69 of 100) -> Blocked, no allocation, no backorder, no stock consumed', async () => {
    const productId = 'TESTPROD-PRIO-03';
    await seedInventory(productId, [{ WarehouseId: 'WH-A', AvailableQuantity: 69 }]);

    const { result } = await fulfilmentService.submitOrder(priorityOrder('TESTORD-PRIO-03', { ProductId: productId }));

    expect(result.Status).toBe(BLOCKED);
    expect(result.ReleasedQuantity).toBe(0);
    expect(result.BackorderedQuantity).toBe(0);
    expect(result.Allocations).toEqual([]);
    expect(await backorderRepository.findByOrderId('TESTORD-PRIO-03')).toEqual([]);
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-A')).AvailableQuantity).toBe(69);
  });

  test('>= 100% combined across warehouses -> Released, multiple allocations, NO backorder', async () => {
    const productId = 'TESTPROD-PRIO-04';
    await seedInventory(productId, [
      { WarehouseId: 'WH-A', AvailableQuantity: 60 },
      { WarehouseId: 'WH-B', AvailableQuantity: 60 },
    ]);

    const { result } = await fulfilmentService.submitOrder(priorityOrder('TESTORD-PRIO-04', { ProductId: productId }));

    expect(result.Status).toBe(RELEASED);
    expect(result.ReleasedQuantity).toBe(100);
    expect(result.BackorderedQuantity).toBe(0);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 60 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 40 },
    ]);
    expect(await backorderRepository.findByOrderId('TESTORD-PRIO-04')).toEqual([]);

    // WH-B gave up only the outstanding 40, keeping 20 — the total allocated
    // never exceeds the requested quantity.
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-A')).AvailableQuantity).toBe(0);
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-B')).AvailableQuantity).toBe(20);
  });

  test('a warehouse that cannot dispatch in time contributes nothing', async () => {
    const productId = 'TESTPROD-PRIO-05';
    await seedInventory(productId, [
      { WarehouseId: 'WH-A', AvailableQuantity: 40 },
      { WarehouseId: 'WH-B', AvailableQuantity: 500, EarliestDispatchDate: '2026-10-01' },
      { WarehouseId: 'WH-C', AvailableQuantity: 35 },
    ]);

    const { result } = await fulfilmentService.submitOrder(priorityOrder('TESTORD-PRIO-05', { ProductId: productId }));

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
      { WarehouseId: 'WH-C', AllocatedQuantity: 35 },
    ]);
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-B')).AvailableQuantity).toBe(500);
  });

  test('a Priority order for a CreditHold customer is still Blocked before inventory is touched', async () => {
    const productId = 'TESTPROD-PRIO-06';
    await seedInventory(productId, [{ WarehouseId: 'WH-A', AvailableQuantity: 500 }]);

    const { result } = await fulfilmentService.submitOrder(
      priorityOrder('TESTORD-PRIO-06', { ProductId: productId, CustomerId: 'CUST003' })
    );

    expect(result.Status).toBe(BLOCKED);
    expect(result.Reason).toBe('blocked-credit');
    expect((await inventoryRepository.findByProductAndWarehouse(productId, 'WH-A')).AvailableQuantity).toBe(500);
  });

  test('the SAME inventory that partially releases a Priority order still Blocks a Standard one', async () => {
    const productId = 'TESTPROD-PRIO-07';
    await seedInventory(productId, [
      { WarehouseId: 'WH-A', AvailableQuantity: 40 },
      { WarehouseId: 'WH-B', AvailableQuantity: 35 },
    ]);

    const standard = await fulfilmentService.submitOrder(
      priorityOrder('TESTORD-PRIO-07-STD', { ProductId: productId, CustomerType: 'Standard' })
    );

    expect(standard.result.Status).toBe(BLOCKED);
    expect(standard.result.Allocations).toEqual([]);

    // Nothing was consumed, so the Priority order over the same rows can
    // still take its 75.
    const priority = await fulfilmentService.submitOrder(
      priorityOrder('TESTORD-PRIO-07-PRI', { ProductId: productId })
    );
    expect(priority.result.Status).toBe(PARTIALLY_RELEASED);
    expect(priority.result.ReleasedQuantity).toBe(75);
  });
});

// CHANGE1 requirement 5, against the real database: replaying a submission
// must reuse the persisted result exactly, for every status, with no second
// allocation row, no second backorder row and no second stock deduction.
describe('CHANGE1 idempotent replay — live, for each status', () => {
  const cases = [
    { label: 'Released', suffix: 'REL', stock: [{ WarehouseId: 'WH-A', AvailableQuantity: 60 }, { WarehouseId: 'WH-B', AvailableQuantity: 60 }], status: RELEASED, allocationCount: 2, backorderCount: 0 },
    { label: 'Partially Released', suffix: 'PART', stock: [{ WarehouseId: 'WH-A', AvailableQuantity: 40 }, { WarehouseId: 'WH-B', AvailableQuantity: 35 }], status: PARTIALLY_RELEASED, allocationCount: 2, backorderCount: 1 },
    { label: 'Blocked', suffix: 'BLK', stock: [{ WarehouseId: 'WH-A', AvailableQuantity: 10 }], status: BLOCKED, allocationCount: 0, backorderCount: 0 },
  ];

  test.each(cases)('$label: a replay returns the identical result and writes nothing twice', async ({
    suffix,
    stock,
    status,
    allocationCount,
    backorderCount,
  }) => {
    const productId = `TESTPROD-PRIO-IDEM-${suffix}`;
    const orderId = `TESTORD-PRIO-IDEM-${suffix}`;
    await seedInventory(productId, stock);

    const payload = priorityOrder(orderId, { ProductId: productId });
    const first = await fulfilmentService.submitOrder(payload);
    const stockAfterFirst = await Promise.all(
      stock.map((row) => inventoryRepository.findByProductAndWarehouse(productId, row.WarehouseId))
    );

    const second = await fulfilmentService.submitOrder(payload);

    expect(first.wasIdempotentReplay).toBe(false);
    expect(second.wasIdempotentReplay).toBe(true);
    expect(first.result.Status).toBe(status);
    expect(second.result).toEqual(first.result);

    expect(await inventoryAllocationRepository.findByOrderId(orderId)).toHaveLength(allocationCount);
    expect(await backorderRepository.findByOrderId(orderId)).toHaveLength(backorderCount);

    // Stock is untouched by the replay — deducted exactly once.
    for (const [index, row] of stock.entries()) {
      const after = await inventoryRepository.findByProductAndWarehouse(productId, row.WarehouseId);
      expect(after.AvailableQuantity).toBe(stockAfterFirst[index].AvailableQuantity);
    }
  });
});
