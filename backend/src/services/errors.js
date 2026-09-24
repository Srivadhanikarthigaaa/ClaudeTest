// Error types the Fulfilment Service can throw. Each carries an HTTP
// `status` so middleware/errorHandler.js can map it without knowing any
// business-logic details — see FRD Section 28/58.

// FRD Section 30 item 1 (open question): implemented as 404 per the FRD's
// own proposed default. Nothing is persisted when this is thrown (FRD 28:
// "CustomerId not found" -> 404, not persisted).
class CustomerNotFoundError extends Error {
  constructor(customerId) {
    super(`Customer not found: ${customerId}`);
    this.name = 'CustomerNotFoundError';
    this.status = 404;
    this.customerId = customerId;
  }
}

// FRD Section 9.5/34 — GET /orders/{OrderId} for an OrderId with no
// persisted result.
class OrderNotFoundError extends Error {
  constructor(orderId) {
    super(`Order not found: ${orderId}`);
    this.name = 'OrderNotFoundError';
    this.status = 404;
    this.orderId = orderId;
  }
}

// FRD Section 22.3 (inferred Customer/Inventory contract, Section 30 item 10)
// — GET/PUT /inventory/{ProductId}/{WarehouseId} for a row that doesn't exist.
class InventoryNotFoundError extends Error {
  constructor(productId, warehouseId) {
    super(`Inventory not found: ${productId}/${warehouseId}`);
    this.name = 'InventoryNotFoundError';
    this.status = 404;
    this.productId = productId;
    this.warehouseId = warehouseId;
  }
}

module.exports = { CustomerNotFoundError, OrderNotFoundError, InventoryNotFoundError };
