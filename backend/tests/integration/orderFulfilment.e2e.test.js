// Phase 11 — FRD Section 29's 12 mandated scenarios, run against the REAL
// Fulfilment Service and a live SQL Server (no mocks), each on its own
// dedicated ProductId so scenarios never interfere with each other or with
// the shared FRD Section 39 seed data. This is the live-DB counterpart to
// the pure-logic tests in tests/services/fulfilmentDecisionEngine.test.js.
const fulfilmentService = require('../../src/services/fulfilmentService');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const { getPool, closePool } = require('../../src/database/pool');
const { BLOCKED_CREDIT, BLOCKED_INSUFFICIENT_INVENTORY, BLOCKED_DELIVERY_DATE } = require('../../src/services/reasonCodes');
const { OrderNotFoundError } = require('../../src/services/errors');

const createdProductIds = new Set();
const createdOrderIds = new Set();

async function seedInventory(productId, rows) {
  createdProductIds.add(productId);
  for (const row of rows) {
    await inventoryRepository.create({ ProductId: productId, ...row });
  }
}

function order(orderId, overrides) {
  createdOrderIds.add(orderId);
  return {
    OrderId: orderId,
    CustomerId: 'CUST001',
    CustomerType: 'Standard',
    ProductId: 'UNSET',
    Quantity: 1,
    PromisedDeliveryDate: '2026-09-25',
    ...overrides,
  };
}

async function cleanupAll() {
  const pool = await getPool();
  for (const orderId of createdOrderIds) {
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.InventoryAllocation WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.FulfilmentResult WHERE OrderId = @OrderId');
    await pool.request().input('OrderId', orderId).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
  }
  for (const productId of createdProductIds) {
    await pool.request().input('ProductId', productId).query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
  }
}

afterAll(async () => {
  await cleanupAll();
  await closePool();
});

describe('FRD Section 29 — live E2E against MOBDB_DEV', () => {
  test('Test 1: eligible + single warehouse -> Released, WH-A, Allocated 20', async () => {
    await seedInventory('TESTPROD-E2E-01', [
      { WarehouseId: 'WH-A', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-B', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-C', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-01', { ProductId: 'TESTPROD-E2E-01', Quantity: 20 })
    );
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);
  });

  test('Test 2: WH-A and WH-B both qualify -> WH-A selected (priority)', async () => {
    await seedInventory('TESTPROD-E2E-02', [
      { WarehouseId: 'WH-A', AvailableQuantity: 50, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-B', AvailableQuantity: 50, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-02', { ProductId: 'TESTPROD-E2E-02', Quantity: 20 })
    );
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);
  });

  test('Test 3: WH-A cannot, WH-B can -> WH-B selected', async () => {
    await seedInventory('TESTPROD-E2E-03', [
      { WarehouseId: 'WH-A', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-B', AvailableQuantity: 60, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-C', AvailableQuantity: 60, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-03', { ProductId: 'TESTPROD-E2E-03', Quantity: 60 })
    );
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 60 }]);
  });

  test('Test 4: WH-A and WH-B both can -> WH-A selected', async () => {
    await seedInventory('TESTPROD-E2E-04', [
      { WarehouseId: 'WH-A', AvailableQuantity: 60, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-B', AvailableQuantity: 60, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-C', AvailableQuantity: 60, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-04', { ProductId: 'TESTPROD-E2E-04', Quantity: 60 })
    );
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 60 }]);
  });

  test('Test 5: no single warehouse can -> Blocked, no combining', async () => {
    await seedInventory('TESTPROD-E2E-05', [
      { WarehouseId: 'WH-A', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-B', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
      { WarehouseId: 'WH-C', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-05', { ProductId: 'TESTPROD-E2E-05', Quantity: 60 })
    );
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe(BLOCKED_INSUFFICIENT_INVENTORY);
    expect(result.Allocations).toEqual([]);
  });

  test('Test 6: credit hold -> Blocked, blocked-credit, no allocations', async () => {
    await seedInventory('TESTPROD-E2E-06', [{ WarehouseId: 'WH-A', AvailableQuantity: 100, EarliestDispatchDate: '2026-09-20' }]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-06', { CustomerId: 'CUST003', ProductId: 'TESTPROD-E2E-06', Quantity: 20 })
    );
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe(BLOCKED_CREDIT);
    expect(result.Allocations).toEqual([]);
  });

  test('Test 7: unknown eligibility -> Blocked, blocked-credit, no allocations', async () => {
    await seedInventory('TESTPROD-E2E-07', [{ WarehouseId: 'WH-A', AvailableQuantity: 100, EarliestDispatchDate: '2026-09-20' }]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-07', { CustomerId: 'CUST002', ProductId: 'TESTPROD-E2E-07', Quantity: 20 })
    );
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe(BLOCKED_CREDIT);
    expect(result.Allocations).toEqual([]);
  });

  test('Test 8: dispatch-date failure (enough quantity, date too late) -> Blocked', async () => {
    await seedInventory('TESTPROD-E2E-08', [{ WarehouseId: 'WH-A', AvailableQuantity: 100, EarliestDispatchDate: '2026-10-01' }]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-08', { ProductId: 'TESTPROD-E2E-08', Quantity: 20 })
    );
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe(BLOCKED_DELIVERY_DATE);
    expect(result.Allocations).toEqual([]);
  });

  test('Test 9: alternate warehouse by date — WH-A fails date, WH-B qualifies -> WH-B selected', async () => {
    await seedInventory('TESTPROD-E2E-09', [
      { WarehouseId: 'WH-A', AvailableQuantity: 100, EarliestDispatchDate: '2026-10-01' },
      { WarehouseId: 'WH-B', AvailableQuantity: 100, EarliestDispatchDate: '2026-09-20' },
    ]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-09', { ProductId: 'TESTPROD-E2E-09', Quantity: 20 })
    );
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 20 }]);
  });

  test('Test 10: quantity and date both valid -> Released, WH-A, Allocated 60', async () => {
    await seedInventory('TESTPROD-E2E-10', [{ WarehouseId: 'WH-A', AvailableQuantity: 100, EarliestDispatchDate: '2026-09-20' }]);
    const { result } = await fulfilmentService.submitOrder(
      order('TESTORD-E2E-10', { ProductId: 'TESTPROD-E2E-10', Quantity: 60 })
    );
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 60 }]);
  });

  test('Test 11: duplicate completed order -> identical result, no double allocation, no double deduction', async () => {
    await seedInventory('TESTPROD-E2E-11', [{ WarehouseId: 'WH-A', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' }]);
    const payload = order('TESTORD-E2E-11', { ProductId: 'TESTPROD-E2E-11', Quantity: 20 });

    const first = await fulfilmentService.submitOrder(payload);
    const second = await fulfilmentService.submitOrder(payload);

    expect(first.wasIdempotentReplay).toBe(false);
    expect(second.wasIdempotentReplay).toBe(true);
    expect(second.result).toEqual(first.result);

    const row = await inventoryRepository.findByProductAndWarehouse('TESTPROD-E2E-11', 'WH-A');
    expect(row.AvailableQuantity).toBe(0); // deducted exactly once, not twice
  });

  test('Test 12: unknown order -> OrderNotFoundError (maps to the exact 404 shape at the HTTP layer)', async () => {
    await expect(fulfilmentService.getOrderResult('TESTORD-E2E-UNKNOWN')).rejects.toThrow(OrderNotFoundError);
  });
});
