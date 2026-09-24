const { validateOrderSubmission } = require('../../src/validators/orderValidator');

const VALID_ORDER = {
  OrderId: 'ORD1001',
  CustomerId: 'CUST001',
  CustomerType: 'Standard',
  ProductId: 'PROD001',
  Quantity: 60,
  PromisedDeliveryDate: '2026-09-25',
};

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateOrderSubmission (FRD 15.1)', () => {
  test('accepts a fully valid order', () => {
    expect(validateOrderSubmission(VALID_ORDER).errors).toEqual([]);
  });

  test('rejects a missing OrderId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, OrderId: undefined });
    expect(errorFor(errors, 'OrderId').reason).toBe('is required');
  });

  test('rejects a missing CustomerId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, CustomerId: undefined });
    expect(errorFor(errors, 'CustomerId').reason).toBe('is required');
  });

  test('rejects CustomerType outside {Standard, Priority}', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, CustomerType: 'VIP' });
    expect(errorFor(errors, 'CustomerType').reason).toMatch(/must be one of/);
  });

  test('rejects CustomerType with wrong case (case-sensitive)', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, CustomerType: 'standard' });
    expect(errorFor(errors, 'CustomerType').reason).toMatch(/must be one of/);
  });

  test('rejects a missing ProductId', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, ProductId: undefined });
    expect(errorFor(errors, 'ProductId').reason).toBe('is required');
  });

  test('rejects non-positive Quantity', () => {
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, Quantity: 0 }).errors, 'Quantity').reason)
      .toBe('must be greater than 0');
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, Quantity: -5 }).errors, 'Quantity').reason)
      .toBe('must be greater than 0');
  });

  test('rejects a non-integer Quantity', () => {
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, Quantity: 10.5 }).errors, 'Quantity').reason)
      .toBe('must be an integer');
    expect(errorFor(validateOrderSubmission({ ...VALID_ORDER, Quantity: '10' }).errors, 'Quantity').reason)
      .toBe('must be an integer');
  });

  test('rejects an ambiguous DD-MM-YYYY PromisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, PromisedDeliveryDate: '25-09-2026' });
    expect(errorFor(errors, 'PromisedDeliveryDate').reason).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects an ambiguous MM-DD-YYYY PromisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, PromisedDeliveryDate: '09-25-2026' });
    expect(errorFor(errors, 'PromisedDeliveryDate').reason).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects a calendar-invalid PromisedDeliveryDate', () => {
    const { errors } = validateOrderSubmission({ ...VALID_ORDER, PromisedDeliveryDate: '2026-02-30' });
    expect(errorFor(errors, 'PromisedDeliveryDate').reason).toBe('must be a valid calendar date');
  });

  test('reports every invalid field at once, not just the first', () => {
    const { errors } = validateOrderSubmission({
      OrderId: 'ORD1001',
      CustomerId: 'CUST001',
      CustomerType: 'VIP',
      ProductId: 'PROD001',
      Quantity: -1,
      PromisedDeliveryDate: '25-09-2026',
    });
    const fields = errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['CustomerType', 'Quantity', 'PromisedDeliveryDate'])
    );
  });
});
