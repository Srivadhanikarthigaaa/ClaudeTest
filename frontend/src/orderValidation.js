// Mirrors backend/src/validators/orderValidator.js (FRD Section 15.1) —
// client-side convenience only, never a substitute for server validation
// (FRD Section 59, FR-VAL-05). Returns { [fieldName]: reason } for each
// invalid field, empty object when the form is valid.
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

export function validateOrderForm(values) {
  const errors = {};

  if (!values.OrderId) errors.OrderId = 'is required';
  if (!values.CustomerId) errors.CustomerId = 'is required';

  if (!values.CustomerType) {
    errors.CustomerType = 'is required';
  } else if (!['Standard', 'Priority'].includes(values.CustomerType)) {
    errors.CustomerType = 'must be one of: Standard, Priority';
  }

  if (!values.ProductId) errors.ProductId = 'is required';

  if (values.Quantity === '' || values.Quantity === null || values.Quantity === undefined) {
    errors.Quantity = 'is required';
  } else {
    const quantity = Number(values.Quantity);
    if (!Number.isInteger(quantity)) errors.Quantity = 'must be an integer';
    else if (quantity <= 0) errors.Quantity = 'must be greater than 0';
  }

  if (!values.PromisedDeliveryDate) {
    errors.PromisedDeliveryDate = 'is required';
  } else if (!isISODate(values.PromisedDeliveryDate)) {
    errors.PromisedDeliveryDate = 'must match YYYY-MM-DD exactly';
  }

  return errors;
}
