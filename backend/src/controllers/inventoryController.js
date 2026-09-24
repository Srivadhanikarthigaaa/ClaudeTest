// FRD Section 9.2, Section 22.3 (inferred contract, Section 30 item 10).
const { validateInventoryCreate, validateInventoryUpdate } = require('../validators/inventoryValidator');
const ValidationError = require('../validators/ValidationError');
const inventoryRepository = require('../repositories/inventoryRepository');
const { InventoryNotFoundError } = require('../services/errors');

async function create(req, res, next) {
  try {
    const { errors } = validateInventoryCreate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);
    const created = await inventoryRepository.create(req.body);
    res.status(201).json(created);
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
    res.status(200).json(rows);
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const row = await inventoryRepository.findByProductAndWarehouse(req.params.ProductId, req.params.WarehouseId);
    if (!row) throw new InventoryNotFoundError(req.params.ProductId, req.params.WarehouseId);
    res.status(200).json(row);
  } catch (err) {
    next(err);
  }
}

// FR-INV-03: update touches only AvailableQuantity/EarliestDispatchDate.
async function update(req, res, next) {
  try {
    const { errors } = validateInventoryUpdate(req.body);
    if (errors.length > 0) throw new ValidationError(errors);

    const existing = await inventoryRepository.findByProductAndWarehouse(req.params.ProductId, req.params.WarehouseId);
    if (!existing) throw new InventoryNotFoundError(req.params.ProductId, req.params.WarehouseId);

    await inventoryRepository.update(req.params.ProductId, req.params.WarehouseId, req.body);
    res.status(200).json({
      ProductId: req.params.ProductId,
      WarehouseId: req.params.WarehouseId,
      AvailableQuantity: req.body.AvailableQuantity,
      EarliestDispatchDate: req.body.EarliestDispatchDate,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, get, update };
