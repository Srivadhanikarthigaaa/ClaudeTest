// FRD Section 15.1 — POST /orders request validation.
const { required, isType, isPositive, isOneOf, isISODate } = require('./rules');
const validateFields = require('./validateFields');

// CHANGE1 requirement 1: the keys here are the wire field names, so they are
// lowerCamelCase — they are what a 400 response reports back as `field`.
// Validation runs against the raw request body, before
// api/serializers.js maps it onto the PascalCase domain model.
const ORDER_SUBMISSION_SCHEMA = {
  orderId: [required, isType('string')],
  customerId: [required, isType('string')],
  customerType: [required, isType('string'), isOneOf(['Standard', 'Priority'])],
  productId: [required, isType('string')],
  quantity: [required, isType('integer'), isPositive],
  // Section 30 item 8 (open question): no past-date lower bound yet, per the
  // FRD's documented default. If that gets confirmed, add one more rule
  // function here (e.g. isNotBeforeToday) — no other change needed.
  promisedDeliveryDate: [required, isISODate],
};

function validateOrderSubmission(payload) {
  return { errors: validateFields(payload, ORDER_SUBMISSION_SCHEMA) };
}

module.exports = { validateOrderSubmission, ORDER_SUBMISSION_SCHEMA };
