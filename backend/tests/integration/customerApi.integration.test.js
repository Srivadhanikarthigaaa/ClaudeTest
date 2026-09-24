// Phase 4 — POST/GET/PUT /customers against a live SQL Server, driven through
// the actual Express app (auth included), not just the repository directly.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/index');
const { getPool, closePool } = require('../../src/database/pool');

const TOKEN = jwt.sign({ sub: 'test' }, process.env.JWT_SECRET);
const TEST_CUSTOMER_ID = 'TESTCUST-API-001';

async function cleanup() {
  const pool = await getPool();
  await pool.request().input('CustomerId', TEST_CUSTOMER_ID).query('DELETE FROM dbo.Customer WHERE CustomerId = @CustomerId');
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('Customer API (Phase 4 / FR-AUTH-01)', () => {
  test('POST /customers with no token -> 401', async () => {
    const res = await request(app).post('/customers').send({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
    expect(res.status).toBe(401);
  });

  test('POST /customers creates a customer -> 201', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
  });

  test('POST /customers with a duplicate CustomerId -> 409', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
    expect(res.status).toBe(409);
  });

  test('POST /customers with an invalid EligibilityStatus -> 400', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ CustomerId: 'TESTCUST-API-BAD', EligibilityStatus: 'Active' });
    expect(res.status).toBe(400);
    expect(res.body.Errors[0].Field).toBe('EligibilityStatus');
  });

  test('GET /customers/:CustomerId -> 200', async () => {
    const res = await request(app).get(`/customers/${TEST_CUSTOMER_ID}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
  });

  test('GET /customers/:CustomerId for an unknown id -> 404', async () => {
    const res = await request(app).get('/customers/NO-SUCH-CUSTOMER').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ CustomerId: 'NO-SUCH-CUSTOMER', Error: 'Customer not found' });
  });

  test('PUT /customers/:CustomerId updates EligibilityStatus -> 200', async () => {
    const res = await request(app)
      .put(`/customers/${TEST_CUSTOMER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ EligibilityStatus: 'CreditHold' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'CreditHold' });
  });

  test('PUT /customers/:CustomerId for an unknown id -> 404', async () => {
    const res = await request(app)
      .put('/customers/NO-SUCH-CUSTOMER')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ EligibilityStatus: 'Eligible' });
    expect(res.status).toBe(404);
  });

  test('GET /customers includes the FRD Section 39 seed rows -> 200', async () => {
    const res = await request(app).get('/customers').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.CustomerId)).toEqual(expect.arrayContaining(['CUST001', 'CUST002', 'CUST003']));
  });
});
