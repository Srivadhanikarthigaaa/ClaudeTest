// FRD Section 55 (Fulfilment Service composition), Section 9.3/9.4 (workflow),
// Section 56/57 (atomic transaction + concurrency), FR-BE-06/07.
const customerRepository = require('../repositories/customerRepository');
const inventoryRepository = require('../repositories/inventoryRepository');
const orderRepository = require('../repositories/orderRepository');
const fulfilmentResultRepository = require('../repositories/fulfilmentResultRepository');
const inventoryAllocationRepository = require('../repositories/inventoryAllocationRepository');
const { beginTransaction } = require('../database/pool');
const { warehouseQualifies, reasonForNoQualifyingWarehouse, isEligible, WAREHOUSE_PRIORITY } = require('./fulfilmentDecisionEngine');
const { BLOCKED_CREDIT } = require('./reasonCodes');
const { CustomerNotFoundError, OrderNotFoundError } = require('./errors');

async function buildResponse(orderId, fulfilmentResult, transaction) {
  const allocations = await inventoryAllocationRepository.findByOrderId(orderId, transaction);
  return {
    OrderId: orderId,
    Status: fulfilmentResult.Status,
    Reason: fulfilmentResult.Reason,
    ReleasedQuantity: fulfilmentResult.ReleasedQuantity,
    BackorderedQuantity: fulfilmentResult.BackorderedQuantity,
    Allocations: allocations.map(({ WarehouseId, AllocatedQuantity }) => ({ WarehouseId, AllocatedQuantity })),
  };
}

// FRD Section 57/FR-BE-07 (Phase 7): re-checks each warehouse UNDER an
// UPDLOCK/HOLDLOCK row lock, in priority order, inside the same transaction
// that will decrement it — so "sufficient quantity" can never be read by two
// concurrent transactions for the same row at once. If the selected
// warehouse no longer qualifies once we hold its lock (another transaction
// won the race), this simply falls through to the next warehouse in
// priority order — exactly like the non-transactional evaluate() does,
// never an error.
async function decideUnderLock({ ProductId, Quantity, PromisedDeliveryDate }, transaction) {
  const lockedRowsByWarehouse = {};

  for (const warehouseId of WAREHOUSE_PRIORITY) {
    const lockedRow = await inventoryRepository.findForUpdate(ProductId, warehouseId, transaction);
    if (!lockedRow) continue;
    lockedRowsByWarehouse[warehouseId] = lockedRow;

    if (!warehouseQualifies(lockedRow, Quantity, PromisedDeliveryDate)) continue;

    const decremented = await inventoryRepository.decrementAvailableQuantity(ProductId, warehouseId, Quantity, transaction);
    if (!decremented) continue; // guarded by the lock above, but never trust it blindly

    return {
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: Quantity,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: warehouseId, AllocatedQuantity: Quantity }],
    };
  }

  return {
    Status: 'Blocked',
    Reason: reasonForNoQualifyingWarehouse(lockedRowsByWarehouse, Quantity),
    ReleasedQuantity: 0,
    BackorderedQuantity: 0,
    Allocations: [],
  };
}

// FRD Section 9.3/16, FR-ORD-03, Section 29 Test 11: an OrderId with an
// existing persisted result is returned unchanged, without ever invoking
// the decision engine again.
async function submitOrder(orderInput) {
  const existing = await fulfilmentResultRepository.findByOrderId(orderInput.OrderId);
  if (existing) {
    return { result: await buildResponse(orderInput.OrderId, existing), wasIdempotentReplay: true };
  }

  // FRD Section 30 item 1: CustomerId not found -> 404, nothing persisted.
  // Checked before opening the transaction, since eligibility/inventory
  // never run at all in this case.
  const customer = await customerRepository.findById(orderInput.CustomerId);
  if (!customer) {
    throw new CustomerNotFoundError(orderInput.CustomerId);
  }

  const transaction = await beginTransaction();
  try {
    // FR-FDE-01: eligibility before inventory. Only Eligible customers reach
    // the row-locked warehouse evaluation; CreditHold/Unknown block
    // immediately without touching Inventory at all.
    const decision = !isEligible(customer)
      ? { Status: 'Blocked', Reason: BLOCKED_CREDIT, ReleasedQuantity: 0, BackorderedQuantity: 0, Allocations: [] }
      : await decideUnderLock(orderInput, transaction);

    await orderRepository.create(orderInput, transaction);
    await fulfilmentResultRepository.create(
      {
        OrderId: orderInput.OrderId,
        Status: decision.Status,
        Reason: decision.Reason,
        ReleasedQuantity: decision.ReleasedQuantity,
        BackorderedQuantity: decision.BackorderedQuantity,
      },
      transaction
    );
    for (const allocation of decision.Allocations) {
      await inventoryAllocationRepository.create(
        { OrderId: orderInput.OrderId, WarehouseId: allocation.WarehouseId, AllocatedQuantity: allocation.AllocatedQuantity },
        transaction
      );
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const persisted = await fulfilmentResultRepository.findByOrderId(orderInput.OrderId);
  return { result: await buildResponse(orderInput.OrderId, persisted), wasIdempotentReplay: false };
}

// FRD Section 9.5 (FR-RET-01/02).
async function getOrderResult(orderId) {
  const result = await fulfilmentResultRepository.findByOrderId(orderId);
  if (!result) {
    throw new OrderNotFoundError(orderId);
  }
  return buildResponse(orderId, result);
}

module.exports = { submitOrder, getOrderResult };
