// Integration tests — see customerRepository.test.js header for prerequisites.
// Uses the seeded CUST001/PROD001 (FRD Section 39) to satisfy Order's FK to Customer.
const orderRepository = require('../../src/repositories/orderRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_ORDER_ID = 'TESTORD-REPO-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('OrderRepository', () => {
  test('create() persists a new order', async () => {
    const created = await orderRepository.create({
      OrderId: TEST_ORDER_ID,
      CustomerId: 'CUST001',
      CustomerType: 'Standard',
      ProductId: 'PROD001',
      Quantity: 5,
      PromisedDeliveryDate: '2026-09-25',
    });
    expect(created.OrderId).toBe(TEST_ORDER_ID);
  });

  test('findById() returns the created order', async () => {
    const found = await orderRepository.findById(TEST_ORDER_ID);
    expect(found).toMatchObject({
      OrderId: TEST_ORDER_ID,
      CustomerId: 'CUST001',
      CustomerType: 'Standard',
      ProductId: 'PROD001',
      Quantity: 5,
    });
  });

  test('findById() returns null for an order that does not exist', async () => {
    const found = await orderRepository.findById('NO-SUCH-ORDER');
    expect(found).toBeNull();
  });

  // Phase 11 — CRUD lifecycle: referential integrity (FK_Order_Customer).
  test('create() with a non-existent CustomerId is rejected', async () => {
    await expect(
      orderRepository.create({
        OrderId: 'TESTORD-REPO-BADFK',
        CustomerId: 'NO-SUCH-CUSTOMER',
        CustomerType: 'Standard',
        ProductId: 'PROD001',
        Quantity: 5,
        PromisedDeliveryDate: '2026-09-25',
      })
    ).rejects.toThrow();
  });
});
