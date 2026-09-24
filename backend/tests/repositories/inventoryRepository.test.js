// Integration tests — see customerRepository.test.js header for prerequisites.
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_PRODUCT_ID = 'TESTPROD-REPO-001';
const TEST_WAREHOUSE_ID = 'WH-A';

async function cleanup() {
  const pool = await getPool();
  await pool
    .request()
    .input('ProductId', TEST_PRODUCT_ID)
    .query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('InventoryRepository', () => {
  test('create() persists a new inventory row', async () => {
    const created = await inventoryRepository.create({
      ProductId: TEST_PRODUCT_ID,
      WarehouseId: TEST_WAREHOUSE_ID,
      AvailableQuantity: 30,
      EarliestDispatchDate: '2026-09-20',
    });
    expect(created.ProductId).toBe(TEST_PRODUCT_ID);
  });

  test('findByProductAndWarehouse() returns the created row', async () => {
    const found = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(found.AvailableQuantity).toBe(30);
  });

  test('findAllByProduct() returns the seeded PROD001 rows for all three warehouses (FRD Section 39)', async () => {
    const rows = await inventoryRepository.findAllByProduct('PROD001');
    const byWarehouse = Object.fromEntries(rows.map((r) => [r.WarehouseId, r.AvailableQuantity]));
    expect(byWarehouse['WH-A']).toBe(20);
    expect(byWarehouse['WH-B']).toBe(20);
    expect(byWarehouse['WH-C']).toBe(20);
  });

  test('update() changes AvailableQuantity and EarliestDispatchDate', async () => {
    const updated = await inventoryRepository.update(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, {
      AvailableQuantity: 25,
      EarliestDispatchDate: '2026-10-01',
    });
    expect(updated).toBe(true);
    const found = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(found.AvailableQuantity).toBe(25);
  });

  test('decrementAvailableQuantity() succeeds when enough stock is available', async () => {
    const succeeded = await inventoryRepository.decrementAvailableQuantity(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, 10);
    expect(succeeded).toBe(true);
    const found = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(found.AvailableQuantity).toBe(15);
  });

  test('decrementAvailableQuantity() fails (no rows affected) when it would go negative', async () => {
    const succeeded = await inventoryRepository.decrementAvailableQuantity(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, 1000);
    expect(succeeded).toBe(false);
    const found = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(found.AvailableQuantity).toBe(15);
  });

  test('two concurrent decrements against exactly the available quantity: only one succeeds', async () => {
    await inventoryRepository.update(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, {
      AvailableQuantity: 10,
      EarliestDispatchDate: '2026-10-01',
    });
    const [first, second] = await Promise.all([
      inventoryRepository.decrementAvailableQuantity(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, 10),
      inventoryRepository.decrementAvailableQuantity(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, 10),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const found = await inventoryRepository.findByProductAndWarehouse(TEST_PRODUCT_ID, TEST_WAREHOUSE_ID);
    expect(found.AvailableQuantity).toBe(0);
  });

  // Phase 11 — CRUD lifecycle: uniqueness constraint.
  test('create() with a duplicate (ProductId, WarehouseId) is rejected (PK_Inventory)', async () => {
    await expect(
      inventoryRepository.create({
        ProductId: TEST_PRODUCT_ID,
        WarehouseId: TEST_WAREHOUSE_ID,
        AvailableQuantity: 5,
        EarliestDispatchDate: '2026-09-20',
      })
    ).rejects.toThrow();
  });
});
