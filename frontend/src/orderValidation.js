// Mirrors backend/src/validators/orderValidator.js (FRD Section 15.1) —
// client-side convenience only, never a substitute for server validation
// (FRD Section 59, FR-VAL-05). Returns { [fieldName]: reason } for each
// invalid field, empty object when the form is valid.
//
// CHANGE1 requirement 1: the field names here are the lowerCamelCase wire
// names, so a server-returned `field` and a client-computed key land in the
// same slot of the form's error map.
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

  if (!values.orderId) errors.orderId = 'is required';
  if (!values.customerId) errors.customerId = 'is required';

  if (!values.customerType) {
    errors.customerType = 'is required';
  } else if (!['Standard', 'Priority'].includes(values.customerType)) {
    errors.customerType = 'must be one of: Standard, Priority';
  }

  if (!values.productId) errors.productId = 'is required';

  if (values.quantity === '' || values.quantity === null || values.quantity === undefined) {
    errors.quantity = 'is required';
  } else {
    const quantity = Number(values.quantity);
    if (!Number.isInteger(quantity)) errors.quantity = 'must be an integer';
    else if (quantity <= 0) errors.quantity = 'must be greater than 0';
  }

  if (!values.promisedDeliveryDate) {
    errors.promisedDeliveryDate = 'is required';
  } else if (!isISODate(values.promisedDeliveryDate)) {
    errors.promisedDeliveryDate = 'must match YYYY-MM-DD exactly';
  }

  return errors;
}
