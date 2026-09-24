// Phase 4 — POST/GET/PUT /inventory against a live SQL Server, driven through
// the actual Express app (auth included).
// CHANGE1 requirement 6: unchanged Stage 1 coverage, re-expressed in the
// renamed lowerCamelCase fields. The SQL in cleanup() keeps PascalCase
// because those are the actual column names.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/index');
const { getPool, closePool } = require('../../src/database/pool');

const TOKEN = jwt.sign({ sub: 'test' }, process.env.JWT_SECRET);
const TEST_PRODUCT_ID = 'TESTPROD-API-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('ProductId', TEST_PRODUCT_ID).query('DELETE FROM dbo.Inventory WHERE ProductId = @ProductId');
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('Inventory API (Phase 4 / FR-AUTH-01)', () => {
  test('POST /inventory with no token -> 401', async () => {
    const res = await request(app)
      .post('/inventory')
      .send({ productId: TEST_PRODUCT_ID, warehouseId: 'WH-A', availableQuantity: 15, earliestDispatchDate: '2026-09-20' });
    expect(res.status).toBe(401);
  });

  test('POST /inventory creates a row -> 201', async () => {
    const res = await request(app)
      .post('/inventory')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ productId: TEST_PRODUCT_ID, warehouseId: 'WH-A', availableQuantity: 15, earliestDispatchDate: '2026-09-20' });
    expect(res.status).toBe(201);
    expect(res.body.productId).toBe(TEST_PRODUCT_ID);
  });

  test('POST /inventory with a duplicate (productId, warehouseId) -> 409', async () => {
    const res = await request(app)
      .post('/inventory')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ productId: TEST_PRODUCT_ID, warehouseId: 'WH-A', availableQuantity: 5, earliestDispatchDate: '2026-09-20' });
    expect(res.status).toBe(409);
  });

  test('POST /inventory with an invalid warehouseId -> 400', async () => {
    const res = await request(app)
      .post('/inventory')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ productId: TEST_PRODUCT_ID, warehouseId: 'WH-D', availableQuantity: 5, earliestDispatchDate: '2026-09-20' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('warehouseId');
  });

  test('GET /inventory/:productId/:warehouseId -> 200', async () => {
    const res = await request(app).get(`/inventory/${TEST_PRODUCT_ID}/WH-A`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.availableQuantity).toBe(15);
  });

  test('GET /inventory/:productId/:warehouseId for an unknown row -> 404', async () => {
    const res = await request(app).get(`/inventory/${TEST_PRODUCT_ID}/WH-B`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ productId: TEST_PRODUCT_ID, warehouseId: 'WH-B', error: 'Inventory not found' });
  });

  test('PUT /inventory/:productId/:warehouseId updates the row -> 200', async () => {
    const res = await request(app)
      .put(`/inventory/${TEST_PRODUCT_ID}/WH-A`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ availableQuantity: 30, earliestDispatchDate: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(res.body.availableQuantity).toBe(30);
  });

  test('GET /inventory?productId=... filters by product', async () => {
    const res = await request(app).get(`/inventory?productId=${TEST_PRODUCT_ID}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].warehouseId).toBe('WH-A');
  });

  test('GET /inventory?warehouseId=... filters by warehouse (includes seeded PROD001)', async () => {
    const res = await request(app).get('/inventory?warehouseId=WH-A').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.productId)).toEqual(expect.arrayContaining(['PROD001', TEST_PRODUCT_ID]));
  });
});
