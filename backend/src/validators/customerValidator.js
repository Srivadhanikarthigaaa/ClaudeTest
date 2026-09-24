// FRD Section 15.2 — Customer create/update request validation.
const { required, isType, isOneOf } = require('./rules');
const validateFields = require('./validateFields');

const ELIGIBILITY_STATUS_RULES = [required, isType('string'), isOneOf(['Eligible', 'CreditHold', 'Unknown'])];

const CUSTOMER_CREATE_SCHEMA = {
  CustomerId: [required, isType('string')],
  EligibilityStatus: ELIGIBILITY_STATUS_RULES,
};

// FR-CUST-03: update touches only EligibilityStatus (CustomerId comes from the path).
const CUSTOMER_UPDATE_SCHEMA = {
  EligibilityStatus: ELIGIBILITY_STATUS_RULES,
};

function validateCustomerCreate(payload) {
  return { errors: validateFields(payload, CUSTOMER_CREATE_SCHEMA) };
}

function validateCustomerUpdate(payload) {
  return { errors: validateFields(payload, CUSTOMER_UPDATE_SCHEMA) };
}

module.exports = {
  validateCustomerCreate,
  validateCustomerUpdate,
  CUSTOMER_CREATE_SCHEMA,
  CUSTOMER_UPDATE_SCHEMA,
};
