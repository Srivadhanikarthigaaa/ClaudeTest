const { validateInventoryCreate, validateInventoryUpdate } = require('../../src/validators/inventoryValidator');

const VALID_INVENTORY = {
  productId: 'PROD001',
  warehouseId: 'WH-A',
  availableQuantity: 20,
  earliestDispatchDate: '2026-09-20',
};

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateInventoryCreate (FRD 15.3)', () => {
  test('accepts a valid inventory row', () => {
    expect(validateInventoryCreate(VALID_INVENTORY).errors).toEqual([]);
  });

  test('rejects a missing productId', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, productId: undefined });
    expect(errorFor(errors, 'productId').reason).toBe('is required');
  });

  test('rejects a warehouseId outside {WH-A, WH-B, WH-C}', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, warehouseId: 'WH-D' });
    expect(errorFor(errors, 'warehouseId').reason).toMatch(/must be one of/);
  });

  test('rejects non-positive availableQuantity', () => {
    expect(errorFor(validateInventoryCreate({ ...VALID_INVENTORY, availableQuantity: 0 }).errors, 'availableQuantity').reason)
      .toBe('must be greater than 0');
    expect(errorFor(validateInventoryCreate({ ...VALID_INVENTORY, availableQuantity: -5 }).errors, 'availableQuantity').reason)
      .toBe('must be greater than 0');
  });

  test('rejects a malformed earliestDispatchDate', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, earliestDispatchDate: '20-09-2026' });
    expect(errorFor(errors, 'earliestDispatchDate').reason).toBe('must match YYYY-MM-DD exactly');
  });
});

describe('validateInventoryUpdate (FR-INV-03)', () => {
  test('accepts a valid update with no productId/warehouseId in the body', () => {
    expect(validateInventoryUpdate({ availableQuantity: 15, earliestDispatchDate: '2026-09-22' }).errors).toEqual([]);
  });

  test('rejects a missing availableQuantity', () => {
    const { errors } = validateInventoryUpdate({ earliestDispatchDate: '2026-09-22' });
    expect(errorFor(errors, 'availableQuantity').reason).toBe('is required');
  });
});
