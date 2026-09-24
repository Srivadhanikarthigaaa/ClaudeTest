const { validateCustomerCreate, validateCustomerUpdate } = require('../../src/validators/customerValidator');

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateCustomerCreate (FRD 15.2)', () => {
  test('accepts a valid customer', () => {
    expect(validateCustomerCreate({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' }).errors).toEqual([]);
  });

  test('rejects a missing CustomerId', () => {
    const { errors } = validateCustomerCreate({ EligibilityStatus: 'Eligible' });
    expect(errorFor(errors, 'CustomerId').reason).toBe('is required');
  });

  test('rejects an EligibilityStatus outside the enum', () => {
    const { errors } = validateCustomerCreate({ CustomerId: 'CUST001', EligibilityStatus: 'Active' });
    expect(errorFor(errors, 'EligibilityStatus').reason).toMatch(/must be one of/);
  });

  test('rejects an EligibilityStatus with wrong case (case-sensitive)', () => {
    const { errors } = validateCustomerCreate({ CustomerId: 'CUST001', EligibilityStatus: 'eligible' });
    expect(errorFor(errors, 'EligibilityStatus').reason).toMatch(/must be one of/);
  });

  test.each(['Eligible', 'CreditHold', 'Unknown'])('accepts %p', (status) => {
    expect(validateCustomerCreate({ CustomerId: 'CUST001', EligibilityStatus: status }).errors).toEqual([]);
  });
});

describe('validateCustomerUpdate (FRD FR-CUST-03)', () => {
  test('accepts a valid EligibilityStatus with no CustomerId in the body', () => {
    expect(validateCustomerUpdate({ EligibilityStatus: 'CreditHold' }).errors).toEqual([]);
  });

  test('rejects a missing EligibilityStatus', () => {
    const { errors } = validateCustomerUpdate({});
    expect(errorFor(errors, 'EligibilityStatus').reason).toBe('is required');
  });
});
