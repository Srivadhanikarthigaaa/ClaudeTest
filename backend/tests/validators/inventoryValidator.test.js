const { validateInventoryCreate, validateInventoryUpdate } = require('../../src/validators/inventoryValidator');

const VALID_INVENTORY = {
  ProductId: 'PROD001',
  WarehouseId: 'WH-A',
  AvailableQuantity: 20,
  EarliestDispatchDate: '2026-09-20',
};

function errorFor(errors, field) {
  return errors.find((e) => e.field === field);
}

describe('validateInventoryCreate (FRD 15.3)', () => {
  test('accepts a valid inventory row', () => {
    expect(validateInventoryCreate(VALID_INVENTORY).errors).toEqual([]);
  });

  test('rejects a missing ProductId', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, ProductId: undefined });
    expect(errorFor(errors, 'ProductId').reason).toBe('is required');
  });

  test('rejects a WarehouseId outside {WH-A, WH-B, WH-C}', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, WarehouseId: 'WH-D' });
    expect(errorFor(errors, 'WarehouseId').reason).toMatch(/must be one of/);
  });

  test('rejects non-positive AvailableQuantity', () => {
    expect(errorFor(validateInventoryCreate({ ...VALID_INVENTORY, AvailableQuantity: 0 }).errors, 'AvailableQuantity').reason)
      .toBe('must be greater than 0');
    expect(errorFor(validateInventoryCreate({ ...VALID_INVENTORY, AvailableQuantity: -5 }).errors, 'AvailableQuantity').reason)
      .toBe('must be greater than 0');
  });

  test('rejects a malformed EarliestDispatchDate', () => {
    const { errors } = validateInventoryCreate({ ...VALID_INVENTORY, EarliestDispatchDate: '20-09-2026' });
    expect(errorFor(errors, 'EarliestDispatchDate').reason).toBe('must match YYYY-MM-DD exactly');
  });
});

describe('validateInventoryUpdate (FR-INV-03)', () => {
  test('accepts a valid update with no ProductId/WarehouseId in the body', () => {
    expect(validateInventoryUpdate({ AvailableQuantity: 15, EarliestDispatchDate: '2026-09-22' }).errors).toEqual([]);
  });

  test('rejects a missing AvailableQuantity', () => {
    const { errors } = validateInventoryUpdate({ EarliestDispatchDate: '2026-09-22' });
    expect(errorFor(errors, 'AvailableQuantity').reason).toBe('is required');
  });
});
