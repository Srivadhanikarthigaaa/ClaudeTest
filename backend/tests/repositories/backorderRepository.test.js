// CHANGE1 requirement 3 — dbo.Backorder against a live SQL Server.
// Integration tests: see customerRepository.test.js header for prerequisites,
// and run database/schema/003_change1_backorder_and_multi_allocation.sql
// first. Backorder.OrderId FKs to [Order], so this suite creates its own
// parent Order row and cleans up child-then-parent.
const orderRepository = require('../../src/repositories/orderRepository');
const backorderRepository = require('../../src/repositories/backorderRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_ORDER_ID = 'TESTORD-REPO-BO-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.Backorder WHERE OrderId = @OrderId');
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
}

beforeAll(async () => {
  await cleanup();
  await orderRepository.create({
    OrderId: TEST_ORDER_ID,
    CustomerId: 'CUST001',
    CustomerType: 'Priority',
    ProductId: 'PROD001',
    Quantity: 100,
    PromisedDeliveryDate: '2026-09-25',
  });
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('BackorderRepository', () => {
  test('findByOrderId() returns an empty array before a backorder exists', async () => {
    expect(await backorderRepository.findByOrderId(TEST_ORDER_ID)).toEqual([]);
  });

  test('create() persists the backorder as Open and generates a BackorderId', async () => {
    const created = await backorderRepository.create({
      OrderId: TEST_ORDER_ID,
      ProductId: 'PROD001',
      BackorderedQuantity: 25,
    });

    expect(created.BackorderId).toBeDefined();
    expect(created.Status).toBe('Open'); // defaulted, not passed in
  });

  test('findByOrderId() returns the single persisted backorder', async () => {
    const found = await backorderRepository.findByOrderId(TEST_ORDER_ID);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      OrderId: TEST_ORDER_ID,
      ProductId: 'PROD001',
      BackorderedQuantity: 25,
      Status: 'Open',
    });
  });

  // CHANGE1 requirement 5: "exactly one backorder" is a database invariant
  // (UQ_Backorder_OrderId), not just something the service is careful about.
  test('a second backorder for the same order is rejected by the database', async () => {
    await expect(
      backorderRepository.create({ OrderId: TEST_ORDER_ID, ProductId: 'PROD001', BackorderedQuantity: 5 })
    ).rejects.toThrow();
  });
});
