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
    const res = await request(app).post('/customers').send({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'Eligible' });
    expect(res.status).toBe(401);
  });

  test('POST /customers creates a customer -> 201', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'Eligible' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'Eligible' });
  });

  test('POST /customers with a duplicate customerId -> 409', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'Eligible' });
    expect(res.status).toBe(409);
  });

  test('POST /customers with an invalid eligibilityStatus -> 400', async () => {
    const res = await request(app)
      .post('/customers')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ customerId: 'TESTCUST-API-BAD', eligibilityStatus: 'Active' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('eligibilityStatus');
  });

  test('GET /customers/:customerId -> 200', async () => {
    const res = await request(app).get(`/customers/${TEST_CUSTOMER_ID}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'Eligible' });
  });

  test('GET /customers/:customerId for an unknown id -> 404', async () => {
    const res = await request(app).get('/customers/NO-SUCH-CUSTOMER').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ customerId: 'NO-SUCH-CUSTOMER', error: 'Customer not found' });
  });

  test('PUT /customers/:customerId updates eligibilityStatus -> 200', async () => {
    const res = await request(app)
      .put(`/customers/${TEST_CUSTOMER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ eligibilityStatus: 'CreditHold' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ customerId: TEST_CUSTOMER_ID, eligibilityStatus: 'CreditHold' });
  });

  test('PUT /customers/:customerId for an unknown id -> 404', async () => {
    const res = await request(app)
      .put('/customers/NO-SUCH-CUSTOMER')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ eligibilityStatus: 'Eligible' });
    expect(res.status).toBe(404);
  });

  test('GET /customers includes the FRD Section 39 seed rows -> 200', async () => {
    const res = await request(app).get('/customers').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.customerId)).toEqual(expect.arrayContaining(['CUST001', 'CUST002', 'CUST003']));
  });
});
