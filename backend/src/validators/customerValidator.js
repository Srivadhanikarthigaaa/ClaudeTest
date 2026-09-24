// FRD Section 15.2 — Customer create/update request validation.
const { required, isType, isOneOf } = require('./rules');
const validateFields = require('./validateFields');

const ELIGIBILITY_STATUS_RULES = [required, isType('string'), isOneOf(['Eligible', 'CreditHold', 'Unknown'])];

// CHANGE1 requirement 1: keys are the lowerCamelCase wire field names.
const CUSTOMER_CREATE_SCHEMA = {
  customerId: [required, isType('string')],
  eligibilityStatus: ELIGIBILITY_STATUS_RULES,
};

// FR-CUST-03: update touches only eligibilityStatus (customerId comes from the path).
const CUSTOMER_UPDATE_SCHEMA = {
  eligibilityStatus: ELIGIBILITY_STATUS_RULES,
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
