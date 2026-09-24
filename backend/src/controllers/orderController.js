// FRD Section 9.3 (POST /orders), Section 9.5 (GET /orders/{OrderId}).
const { validateOrderSubmission } = require('../validators/orderValidator');
const ValidationError = require('../validators/ValidationError');
const fulfilmentService = require('../services/fulfilmentService');

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
    const { result, wasIdempotentReplay } = await fulfilmentService.submitOrder(req.body);
    res.status(wasIdempotentReplay ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const result = await fulfilmentService.getOrderResult(req.params.OrderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { submitOrder, getOrder };
