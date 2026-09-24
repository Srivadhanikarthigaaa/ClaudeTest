// Phase 11 / Phase 7 exit criteria: force a real failure partway through the
// atomic write set (after inventory is decremented and the FulfilmentResult
// row is written, but before the InventoryAllocation row lands) against a
// live SQL Server, and prove the whole transaction rolled back — no Order,
// no FulfilmentResult, no InventoryAllocation, and AvailableQuantity
// unchanged. Only inventoryAllocationRepository.create is mocked (to inject
// the failure); every other call is real, hitting the real DB inside a real
// transaction, so the rollback proven here is SQL Server's, not a JS mock's.
const fulfilmentService = require('../../src/services/fulfilmentService');
const orderRepository = require('../../src/repositories/orderRepository');
const fulfilmentResultRepository = require('../../src/repositories/fulfilmentResultRepository');
const inventoryAllocationRepository = require('../../src/repositories/inventoryAllocationRepository');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_PRODUCT_ID = 'TESTPROD-TXN-001';
const TEST_WAREHOUSE_ID = 'WH-A';
const TEST_ORDER_ID = 'TESTORD-TXN-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.InventoryAllocation WHERE OrderId = @OrderId');
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.FulfilmentResult WHERE OrderId = @OrderId');
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
  await pool.request().input('ProductId', TEST_PRODUCT_ID).query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
}

beforeAll(async () => {
  await cleanup();
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

describe('Transactional consistency (Phase 7 / Phase 11 forced-failure rollback)', () => {
  test('a failure right before allocation persistence leaves NO row committed anywhere', async () => {
    const injectedError = new Error('Injected failure for transactional-consistency test');
    const createSpy = jest.spyOn(inventoryAllocationRepository, 'create').mockRejectedValueOnce(injectedError);

    await expect(
      fulfilmentService.submitOrder({
        OrderId: TEST_ORDER_ID,
        CustomerId: 'CUST001',
        CustomerType: 'Standard',
        ProductId: TEST_PRODUCT_ID,
        Quantity: 20,
        PromisedDeliveryDate: '2026-09-25',
      })
    ).rejects.toThrow(injectedError.message);

    createSpy.mockRestore();

    const order = await orderRepository.findById(TEST_ORDER_ID);
    const fulfilmentResult = await fulfilmentResultRepository.findByOrderId(TEST_ORDER_ID);
    const allocations = await inventoryAllocationRepository.findByOrderId(TEST_ORDER_ID);
    const inventoryRow = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);

    expect(order).toBeNull();
    expect(fulfilmentResult).toBeNull();
    expect(allocations).toEqual([]);
    expect(inventoryRow.AvailableQuantity).toBe(20); // decrement rolled back too
  }, 30000);
});
