// Integration tests — require a reachable SQL Server with Phase 1's schema
// and seed data already loaded (see database/README.md). Run with `npm test`
// from backend/ once backend/.env points at a reachable instance.
const customerRepository = require('../../src/repositories/customerRepository');
const { getPool, closePool } = require('../../src/database/pool');

const TEST_CUSTOMER_ID = 'TESTCUST-REPO-001';

async function cleanup() {
  const pool = await getPool();
  await pool
    .request()
    .input('CustomerId', TEST_CUSTOMER_ID)
    .query('DELETE FROM dbo.Customer WHERE CustomerId = @CustomerId');
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closePool();
});

describe('CustomerRepository', () => {
  test('create() persists a new customer', async () => {
    const created = await customerRepository.create({
      CustomerId: TEST_CUSTOMER_ID,
      EligibilityStatus: 'Eligible',
    });
    expect(created).toEqual({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
  });

  test('findById() returns the created customer', async () => {
    const found = await customerRepository.findById(TEST_CUSTOMER_ID);
    expect(found).toEqual({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' });
  });

  test('findById() returns null for a customer that does not exist', async () => {
    const found = await customerRepository.findById('NO-SUCH-CUSTOMER');
    expect(found).toBeNull();
  });

  test('update() changes EligibilityStatus', async () => {
    const updated = await customerRepository.update(TEST_CUSTOMER_ID, { EligibilityStatus: 'CreditHold' });
    expect(updated).toBe(true);
    const found = await customerRepository.findById(TEST_CUSTOMER_ID);
    expect(found.EligibilityStatus).toBe('CreditHold');
  });

  test('list() includes the seeded customers (FRD Section 39)', async () => {
    const customers = await customerRepository.list();
    const byId = Object.fromEntries(customers.map((c) => [c.CustomerId, c.EligibilityStatus]));
    expect(byId.CUST001).toBe('Eligible');
    expect(byId.CUST002).toBe('Unknown');
    expect(byId.CUST003).toBe('CreditHold');
  });

  // Phase 11 — CRUD lifecycle: uniqueness constraint.
  test('create() with a duplicate CustomerId is rejected (PK_Customer)', async () => {
    await expect(
      customerRepository.create({ CustomerId: TEST_CUSTOMER_ID, EligibilityStatus: 'Eligible' })
    ).rejects.toThrow();
  });
});
