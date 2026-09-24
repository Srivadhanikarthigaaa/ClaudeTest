// Integration tests — see customerRepository.test.js header for prerequisites.
// FulfilmentResult.OrderId FKs to Order, so this suite creates its own parent
// Order row and cleans up child-then-parent.
const orderRepository = require('../../src/repositories/orderRepository');
const fulfilmentResultRepository = require('../../src/repositories/fulfilmentResultRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_ORDER_ID = 'TESTORD-REPO-FR-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.FulfilmentResult WHERE OrderId = @OrderId');
  await pool.request().input('OrderId', TEST_ORDER_ID).query('DELETE FROM dbo.[Order] WHERE OrderId = @OrderId');
}

beforeAll(async () => {
  await cleanup();
  await orderRepository.create({
    OrderId: TEST_ORDER_ID,
    CustomerId: 'CUST001',
    CustomerType: 'Standard',
    ProductId: 'PROD001',
    Quantity: 5,
    PromisedDeliveryDate: '2026-09-25',
  });
});

afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('FulfilmentResultRepository', () => {
  test('findByOrderId() returns null before a result exists', async () => {
    const found = await fulfilmentResultRepository.findByOrderId(TEST_ORDER_ID);
    expect(found).toBeNull();
  });

  test('create() persists a Blocked result with a Reason', async () => {
    const created = await fulfilmentResultRepository.create({
      OrderId: TEST_ORDER_ID,
      Status: 'Blocked',
      Reason: 'blocked-credit',
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
    });
    expect(created.Status).toBe('Blocked');
  });

  test('findByOrderId() returns the persisted result', async () => {
    const found = await fulfilmentResultRepository.findByOrderId(TEST_ORDER_ID);
    expect(found).toEqual({
      OrderId: TEST_ORDER_ID,
      Status: 'Blocked',
      Reason: 'blocked-credit',
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
    });
  });
});
