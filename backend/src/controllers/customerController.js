// FRD Section 9.1, Section 22.3 (inferred contract, Section 30 item 10).
// CHANGE1 requirement 1: lowerCamelCase on the wire, mapped by api/serializers.js.
const { validateCustomerCreate, validateCustomerUpdate } = require('../validators/customerValidator');
const ValidationError = require('../validators/ValidationError');
const customerRepository = require('../repositories/customerRepository');
const { CustomerNotFoundError } = require('../services/errors');
const { toCustomerInput, toCustomerResponse } = require('../api/serializers');

async function create(req, res, next) {
  try {
    const { errors } = validateCustomerCreate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);
    const created = await customerRepository.create(toCustomerInput(req.body));
    res.status(201).json(toCustomerResponse(created));
  } catch (err) {
    next(err);
  }
}

// FR-SRCH-02: list view shows customerId + eligibilityStatus for all customers.
async function list(req, res, next) {
  try {
    const customers = await customerRepository.list();
    res.status(200).json(customers.map(toCustomerResponse));
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const customer = await customerRepository.findById(req.params.customerId);
    if (!customer) throw new CustomerNotFoundError(req.params.customerId);
    res.status(200).json(toCustomerResponse(customer));
  } catch (err) {
    next(err);
  }
}

// FR-CUST-03: update touches only eligibilityStatus.
async function update(req, res, next) {
  try {
    const { errors } = validateCustomerUpdate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);

    const existing = await customerRepository.findById(req.params.customerId);
    if (!existing) throw new CustomerNotFoundError(req.params.customerId);

    await customerRepository.update(req.params.customerId, { EligibilityStatus: req.body.eligibilityStatus });
    res.status(200).json(
      toCustomerResponse({ CustomerId: req.params.customerId, EligibilityStatus: req.body.eligibilityStatus })
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, get, update };
