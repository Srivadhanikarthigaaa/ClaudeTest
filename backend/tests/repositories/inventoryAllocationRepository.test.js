// Integration tests — see customerRepository.test.js header for prerequisites.
// InventoryAllocation.OrderId FKs to Order, so this suite creates its own
// parent Order row and cleans up child-then-parent.
const orderRepository = require('../../src/repositories/orderRepository');
const inventoryAllocationRepository = require('../../src/repositories/inventoryAllocationRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_ORDER_ID = 'TESTORD-REPO-IA-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.InventoryAllocation WHERE OrderId = @OrderId');
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
}

beforeAll(async () => {
  await cleanup();
  await orderRepository.create({
    OrderId: TEST_ORDER_ID,
    CustomerId: 'CUST001',
    CustomerType: 'Standard',
    ProductId: 'PROD001',
    Quantity: 20,
    PromisedDeliveryDate: '2026-09-25',
  });
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('InventoryAllocationRepository', () => {
  test('findByOrderId() returns an empty array before an allocation exists', async () => {
    const found = await inventoryAllocationRepository.findByOrderId(TEST_ORDER_ID);
    expect(found).toEqual([]);
  });

  test('create() persists exactly one allocation and generates an AllocationId', async () => {
    const created = await inventoryAllocationRepository.create({
      OrderId: TEST_ORDER_ID,
      WarehouseId: 'WH-A',
      AllocatedQuantity: 20,
    });
    expect(created.AllocationId).toBeDefined();
    expect(created.WarehouseId).toBe('WH-A');
  });

  test('findByOrderId() returns the single persisted allocation', async () => {
    const found = await inventoryAllocationRepository.findByOrderId(TEST_ORDER_ID);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ OrderId: TEST_ORDER_ID, WarehouseId: 'WH-A', AllocatedQuantity: 20 });
  });

  // CHANGE1 requirement 3 replaced UQ_InventoryAllocation_OrderId ("at most
  // one allocation per order") with UQ_InventoryAllocation_Order_Warehouse
  // ("at most one allocation per order PER WAREHOUSE"), so a Priority order
  // can draw from several warehouses. Both halves of that new rule are
  // asserted below — see
  // database/schema/003_change1_backorder_and_multi_allocation.sql.
  test('a second allocation for the same order but a DIFFERENT warehouse is now allowed', async () => {
    const created = await inventoryAllocationRepository.create({
      OrderId: TEST_ORDER_ID,
      WarehouseId: 'WH-B',
      AllocatedQuantity: 5,
    });
    expect(created.AllocationId).toBeDefined();

    const found = await inventoryAllocationRepository.findByOrderId(TEST_ORDER_ID);
    expect(found).toHaveLength(2);
    // findByOrderId orders by WarehouseId, so a replay always reads the rows
    // back in the same WH-A -> WH-B -> WH-C order they were planned in.
    expect(found.map((a) => a.WarehouseId)).toEqual(['WH-A', 'WH-B']);
  });

  test('a second allocation for the same order AND the same warehouse is still rejected', async () => {
    await expect(
      inventoryAllocationRepository.create({
        OrderId: TEST_ORDER_ID,
        WarehouseId: 'WH-A',
        AllocatedQuantity: 1,
      })
    ).rejects.toThrow();
  });
});
