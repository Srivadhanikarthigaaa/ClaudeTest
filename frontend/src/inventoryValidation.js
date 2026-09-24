// Mirrors backend/src/validators/inventoryValidator.js (FRD Section 15.3) —
// client-side convenience only, never a substitute for server validation.
const WAREHOUSE_IDS = ['WH-A', 'WH-B', 'WH-C'];

function isISODate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateInventoryForm(values, { isCreate }) {
  const errors = {};

  if (isCreate) {
    if (!values.ProductId) errors.ProductId = 'is required';
    if (!values.WarehouseId) {
      errors.WarehouseId = 'is required';
    } else if (!WAREHOUSE_IDS.includes(values.WarehouseId)) {
      errors.WarehouseId = `must be one of: ${WAREHOUSE_IDS.join(', ')}`;
    }
  }

  if (values.AvailableQuantity === '' || values.AvailableQuantity === null || values.AvailableQuantity === undefined) {
    errors.AvailableQuantity = 'is required';
  } else {
    const quantity = Number(values.AvailableQuantity);
    if (!Number.isInteger(quantity)) errors.AvailableQuantity = 'must be an integer';
    else if (quantity <= 0) errors.AvailableQuantity = 'must be greater than 0';
  }

  if (!values.EarliestDispatchDate) {
    errors.EarliestDispatchDate = 'is required';
  } else if (!isISODate(values.EarliestDispatchDate)) {
    errors.EarliestDispatchDate = 'must match YYYY-MM-DD exactly';
  }

  return errors;
}

export { WAREHOUSE_IDS };
