// FRD Section 15.3 — Inventory create/update request validation.
const { required, isType, isPositive, isOneOf, isISODate } = require('./rules');
const validateFields = require('./validateFields');

const AVAILABLE_QUANTITY_RULES = [required, isType('integer'), isPositive];
const EARLIEST_DISPATCH_DATE_RULES = [required, isISODate];

// CHANGE1 requirement 1: keys are the lowerCamelCase wire field names.
const INVENTORY_CREATE_SCHEMA = {
  productId: [required, isType('string')],
  warehouseId: [required, isType('string'), isOneOf(['WH-A', 'WH-B', 'WH-C'])],
  availableQuantity: AVAILABLE_QUANTITY_RULES,
  earliestDispatchDate: EARLIEST_DISPATCH_DATE_RULES,
};

// FR-INV-03: update touches only availableQuantity/earliestDispatchDate
// (productId + warehouseId identify the existing row and come from the path).
const INVENTORY_UPDATE_SCHEMA = {
  availableQuantity: AVAILABLE_QUANTITY_RULES,
  earliestDispatchDate: EARLIEST_DISPATCH_DATE_RULES,
};

function validateInventoryCreate(payload) {
  return { errors: validateFields(payload, INVENTORY_CREATE_SCHEMA) };
}

function validateInventoryUpdate(payload) {
  return { errors: validateFields(payload, INVENTORY_UPDATE_SCHEMA) };
}

module.exports = {
  validateInventoryCreate,
  validateInventoryUpdate,
  INVENTORY_CREATE_SCHEMA,
  INVENTORY_UPDATE_SCHEMA,
};
