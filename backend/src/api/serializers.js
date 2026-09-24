// CHANGE1 requirement 1 — the single seam where the HTTP contract's
// lowerCamelCase field names meet the internal PascalCase domain model.
//
// The domain model and the repositories keep PascalCase because that is what
// the SQL Server columns are actually called (Customer.CustomerId,
// Inventory.AvailableQuantity, ...). Renaming the wire format everywhere
// *except* the database would otherwise scatter ad-hoc `body.orderId ->
// OrderId` conversions through every controller. Mapping here instead means
// exactly one file has to change if a field is ever renamed again, and the
// rest of the backend is untouched by the rename.
//
// The mappings are written out field by field rather than derived by a
// generic case-converting function: an explicit table cannot accidentally
// rewrite a *value* (WH-A, Partially Released), cannot silently pass through
// an unexpected client-supplied key, and reads as the API contract itself.

function toOrderInput(body = {}) {
  return {
    OrderId: body.orderId,
    CustomerId: body.customerId,
    CustomerType: body.customerType,
    ProductId: body.productId,
    Quantity: body.quantity,
    PromisedDeliveryDate: body.promisedDeliveryDate,
  };
}

// The POST /orders and GET /orders/{orderId} response body. `allocations` is
// an array since CHANGE1 allows a Priority order to draw from more than one
// warehouse; a Standard order still yields exactly one entry, and a Blocked
// order an empty array, as in Stage 1.
function toFulfilmentResponse(result) {
  return {
    orderId: result.OrderId,
    status: result.Status,
    reason: result.Reason,
    releasedQuantity: result.ReleasedQuantity,
    backorderedQuantity: result.BackorderedQuantity,
    allocations: result.Allocations.map(({ WarehouseId, AllocatedQuantity }) => ({
      warehouseId: WarehouseId,
      allocatedQuantity: AllocatedQuantity,
    })),
  };
}

function toCustomerInput(body = {}) {
  return {
    CustomerId: body.customerId,
    EligibilityStatus: body.eligibilityStatus,
  };
}

function toCustomerResponse(customer) {
  return {
    customerId: customer.CustomerId,
    eligibilityStatus: customer.EligibilityStatus,
  };
}

function toInventoryInput(body = {}) {
  return {
    ProductId: body.productId,
    WarehouseId: body.warehouseId,
    AvailableQuantity: body.availableQuantity,
    EarliestDispatchDate: body.earliestDispatchDate,
  };
}

function toInventoryResponse(row) {
  return {
    productId: row.ProductId,
    warehouseId: row.WarehouseId,
    availableQuantity: row.AvailableQuantity,
    earliestDispatchDate: row.EarliestDispatchDate,
  };
}

module.exports = {
  toOrderInput,
  toFulfilmentResponse,
  toCustomerInput,
  toCustomerResponse,
  toInventoryInput,
  toInventoryResponse,
};
