// FRD Section 9.1, Section 22.3 (inferred contract, Section 30 item 10).
const { validateCustomerCreate, validateCustomerUpdate } = require('../validators/customerValidator');
const ValidationError = require('../validators/ValidationError');
const customerRepository = require('../repositories/customerRepository');
const { CustomerNotFoundError } = require('../services/errors');

async function create(req, res, next) {
  try {
    const { errors } = validateCustomerCreate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);
    const created = await customerRepository.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

// FR-SRCH-02: list view shows CustomerId + EligibilityStatus for all customers.
async function list(req, res, next) {
  try {
    const customers = await customerRepository.list();
    res.status(200).json(customers);
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const customer = await customerRepository.findById(req.params.CustomerId);
    if (!customer) throw new CustomerNotFoundError(req.params.CustomerId);
    res.status(200).json(customer);
  } catch (err) {
    next(err);
  }
}

// FR-CUST-03: update touches only EligibilityStatus.
async function update(req, res, next) {
  try {
    const { errors } = validateCustomerUpdate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);

    const existing = await customerRepository.findById(req.params.CustomerId);
    if (!existing) throw new CustomerNotFoundError(req.params.CustomerId);

    await customerRepository.update(req.params.CustomerId, req.body);
    res.status(200).json({ CustomerId: req.params.CustomerId, EligibilityStatus: req.body.EligibilityStatus });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, get, update };
