// FRD Section 9.3 (POST /orders), Section 9.5 (GET /orders/{orderId}).
// CHANGE1 requirement 1: the request/response field names on this boundary
// are lowerCamelCase; api/serializers.js maps them to and from the internal
// PascalCase domain model.
const { validateOrderSubmission } = require('../validators/orderValidator');
const ValidationError = require('../validators/ValidationError');
const fulfilmentService = require('../services/fulfilmentService');
const { toOrderInput, toFulfilmentResponse } = require('../api/serializers');

async function submitOrder(req, res, next) {
  try {
    const { errors } = validateOrderSubmission(req.body);
    if (errors.length > 0) {
      throw new ValidationError(errors);
    }

    // FRD Section 30 item 9 (open question): first-time creation -> 201,
    // idempotent replay -> 200, per the FRD's own proposed distinction.
    // Revisit both branches together if confirmed otherwise; the service
    // call itself is unaffected either way.
    const { result, wasIdempotentReplay } = await fulfilmentService.submitOrder(toOrderInput(req.body));
    res.status(wasIdempotentReplay ? 200 : 201).json(toFulfilmentResponse(result));
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const result = await fulfilmentService.getOrderResult(req.params.orderId);
    res.status(200).json(toFulfilmentResponse(result));
  } catch (err) {
    next(err);
  }
}

module.exports = { submitOrder, getOrder };
