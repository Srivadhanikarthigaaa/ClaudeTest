const { validateCustomerCreate, validateCustomerUpdate } = require('../../src/validators/customerValidator');

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateCustomerCreate (FRD 15.2)', () => {
  test('accepts a valid customer', () => {
    expect(validateCustomerCreate({ customerId: 'CUST001', eligibilityStatus: 'Eligible' }).errors).toEqual([]);
  });

  test('rejects a missing customerId', () => {
    const { errors } = validateCustomerCreate({ eligibilityStatus: 'Eligible' });
    expect(errorFor(errors, 'customerId').reason).toBe('is required');
  });

  test('rejects an eligibilityStatus outside the enum', () => {
    const { errors } = validateCustomerCreate({ customerId: 'CUST001', eligibilityStatus: 'Active' });
    expect(errorFor(errors, 'eligibilityStatus').reason).toMatch(/must be one of/);
  });

  test('rejects an eligibilityStatus with wrong case (case-sensitive)', () => {
    const { errors } = validateCustomerCreate({ customerId: 'CUST001', eligibilityStatus: 'eligible' });
    expect(errorFor(errors, 'eligibilityStatus').reason).toMatch(/must be one of/);
  });

  test.each(['Eligible', 'CreditHold', 'Unknown'])('accepts %p', (status) => {
    expect(validateCustomerCreate({ customerId: 'CUST001', eligibilityStatus: status }).errors).toEqual([]);
  });
});

describe('validateCustomerUpdate (FRD FR-CUST-03)', () => {
  test('accepts a valid eligibilityStatus with no customerId in the body', () => {
    expect(validateCustomerUpdate({ eligibilityStatus: 'CreditHold' }).errors).toEqual([]);
  });

  test('rejects a missing eligibilityStatus', () => {
    const { errors } = validateCustomerUpdate({});
    expect(errorFor(errors, 'eligibilityStatus').reason).toBe('is required');
  });
});
