// FRD Section 9.2, Section 22.3 (inferred contract, Section 30 item 10).
// CHANGE1 requirement 1: lowerCamelCase on the wire, mapped by api/serializers.js.
const { validateInventoryCreate, validateInventoryUpdate } = require('../validators/inventoryValidator');
const ValidationError = require('../validators/ValidationError');
const inventoryRepository = require('../repositories/inventoryRepository');
const { InventoryNotFoundError } = require('../services/errors');
const { toInventoryInput, toInventoryResponse } = require('../api/serializers');

async function create(req, res, next) {
  try {
    const { errors } = validateInventoryCreate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);
    const created = await inventoryRepository.create(toInventoryInput(req.body));
    res.status(201).json(toInventoryResponse(created));
  } catch (err) {
    next(err);
  }
}

// FR-INV-02/FR-SRCH-01: ?warehouseId=&productId= filters; neither = list all.
async function list(req, res, next) {
  try {
    const { warehouseId, productId } = req.query;
    let rows;
    if (productId && warehouseId) {
      const row = await inventoryRepository.findByProductAndWarehouse(productId, warehouseId);
      rows = row ? [row] : [];
    } else if (productId) {
      rows = await inventoryRepository.findAllByProduct(productId);
    } else if (warehouseId) {
      rows = await inventoryRepository.findAllByWarehouse(warehouseId);
    } else {
      rows = await inventoryRepository.listAll();
    }
    res.status(200).json(rows.map(toInventoryResponse));
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const row = await inventoryRepository.findByProductAndWarehouse(req.params.productId, req.params.warehouseId);
    if (!row) throw new InventoryNotFoundError(req.params.productId, req.params.warehouseId);
    res.status(200).json(toInventoryResponse(row));
  } catch (err) {
    next(err);
  }
}

// FR-INV-03: update touches only availableQuantity/earliestDispatchDate.
async function update(req, res, next) {
  try {
    const { errors } = validateInventoryUpdate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);

    const existing = await inventoryRepository.findByProductAndWarehouse(req.params.productId, req.params.warehouseId);
    if (!existing) throw new InventoryNotFoundError(req.params.productId, req.params.warehouseId);

    const changes = {
      AvailableQuantity: req.body.availableQuantity,
      EarliestDispatchDate: req.body.earliestDispatchDate,
    };
    await inventoryRepository.update(req.params.productId, req.params.warehouseId, changes);
    res.status(200).json(
      toInventoryResponse({ ProductId: req.params.productId, WarehouseId: req.params.warehouseId, ...changes })
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, get, update };
