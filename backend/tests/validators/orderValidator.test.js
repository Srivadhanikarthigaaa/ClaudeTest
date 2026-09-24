const { validateOrderSubmission } = require('../../src/validators/orderValidator');

const VALID_ORDER = {
  orderId: 'ORD1001',
  customerId: 'CUST001',
  customerType: 'Standard',
  productId: 'PROD001',
  quantity: 60,
  promisedDeliveryDate: '2026-09-25',
};

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateOrderSubmission (FRD 15.1)', () => {
  test('accepts a fully valid order', () => {
    expect(validateOrderSubmission(VALID_ORDER).errors).toEqual([]);
  });

  test('rejects a missing orderId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, orderId: undefined });
    expect(errorFor(errors, 'orderId').reason).toBe('is required');
  });

  test('rejects a missing customerId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, customerId: undefined });
    expect(errorFor(errors, 'customerId').reason).toBe('is required');
  });

  test('rejects customerType outside {Standard, Priority}', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, customerType: 'VIP' });
    expect(errorFor(errors, 'customerType').reason).toMatch(/must be one of/);
  });

  test('rejects customerType with wrong case (case-sensitive)', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, customerType: 'standard' });
    expect(errorFor(errors, 'customerType').reason).toMatch(/must be one of/);
  });

  test('rejects a missing productId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, productId: undefined });
    expect(errorFor(errors, 'productId').reason).toBe('is required');
  });

  test('rejects non-positive quantity', () => {
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, quantity: 0 }).errors, 'quantity').reason)
      .toBe('must be greater than 0');
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, quantity: -5 }).errors, 'quantity').reason)
      .toBe('must be greater than 0');
  });

  test('rejects a non-integer quantity', () => {
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, quantity: 10.5 }).errors, 'quantity').reason)
      .toBe('must be an integer');
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, quantity: '10' }).errors, 'quantity').reason)
      .toBe('must be an integer');
  });

  test('rejects an ambiguous DD-MM-YYYY promisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, promisedDeliveryDate: '25-09-2026' });
    expect(errorFor(errors, 'promisedDeliveryDate').reason).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects an ambiguous MM-DD-YYYY promisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, promisedDeliveryDate: '09-25-2026' });
    expect(errorFor(errors, 'promisedDeliveryDate').reason).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects a calendar-invalid promisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, promisedDeliveryDate: '2026-02-30' });
    expect(errorFor(errors, 'promisedDeliveryDate').reason).toBe('must be a valid calendar date');
  });

  test('reports every invalid field at once, not just the first', () => {
    const { errors } = validateOrderSubmission({
      orderId: 'ORD1001',
      customerId: 'CUST001',
      customerType: 'VIP',
      productId: 'PROD001',
      quantity: -1,
      promisedDeliveryDate: '25-09-2026',
    });
    const fields = errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['customerType', 'quantity', 'promisedDeliveryDate'])
    );
  });
});
