// FRD Section 15.1 — POST /orders request validation.
const { required, isType, isPositive, isOneOf, isISODate } = require('./rules');
const validateFields = require('./validateFields');

const ORDER_SUBMISSION_SCHEMA = {
  OrderId: [required, isType('string')],
  CustomerId: [required, isType('string')],
  CustomerType: [required, isType('string'), isOneOf(['Standard', 'Priority'])],
  ProductId: [required, isType('string')],
  Quantity: [required, isType('integer'), isPositive],
  // Section 30 item 8 (open question): no past-date lower bound yet, per the
  // FRD's documented default. If that gets confirmed, add one more rule
  // function here (e.g. isNotBeforeToday) — no other change needed.
  PromisedDeliveryDate: [required, isISODate],
};

function validateOrderSubmission(payload) {
  return { errors: validateFields(payload, ORDER_SUBMISSION_SCHEMA) };
}

module.exports = { validateOrderSubmission, ORDER_SUBMISSION_SCHEMA };
