// FRD Section 55 (Fulfilment Service composition), Section 9.3/9.4 (workflow),
// Section 56/57 (atomic transaction + concurrency), FR-BE-06/07,
// plus CHANGE1 requirements 3-5 (Backorder, Priority fulfilment, idempotency).
const customerRepository = require('../repositories/customerRepository');
const inventoryRepository = require('../repositories/inventoryRepository');
const orderRepository = require('../repositories/orderRepository');
const fulfilmentResultRepository = require('../repositories/fulfilmentResultRepository');
const inventoryAllocationRepository = require('../repositories/inventoryAllocationRepository');
const backorderRepository = require('../repositories/backorderRepository');
const { beginTransaction } = require('../database/pool');
const {
  warehouseQualifies,
  reasonForNoQualifyingWarehouse,
  isEligible,
  isPriority,
  decidePriority,
  WAREHOUSE_PRIORITY,
} = require('./fulfilmentDecisionEngine');
const { RELEASED, BLOCKED } = require('./statuses');
const { getPartialReleaseThresholdPercent } = require('../config/fulfilmentConfig');
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
//
// This is the STANDARD-customer path and CHANGE1 leaves it exactly as Stage 1
// built it: the full quantity from a single warehouse or nothing.
async function decideStandardUnderLock({ ProductId, Quantity, PromisedDeliveryDate }, transaction) {
  const lockedRowsByWarehouse = {};

  for (const warehouseId of WAREHOUSE_PRIORITY) {
    const lockedRow = await inventoryRepository.findForUpdate(ProductId, warehouseId, transaction);
    if (!lockedRow) continue;
    lockedRowsByWarehouse[warehouseId] = lockedRow;

    if (!warehouseQualifies(lockedRow, Quantity, PromisedDeliveryDate)) continue;

    const decremented = await inventoryRepository.decrementAvailableQuantity(ProductId, warehouseId, Quantity, transaction);
    if (!decremented) continue; // guarded by the lock above, but never trust it blindly

    return {
      Status: RELEASED,
      Reason: null,
      ReleasedQuantity: Quantity,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: warehouseId, AllocatedQuantity: Quantity }],
    };
  }

  return {
    Status: BLOCKED,
    Reason: reasonForNoQualifyingWarehouse(lockedRowsByWarehouse, Quantity),
    ReleasedQuantity: 0,
    BackorderedQuantity: 0,
    Allocations: [],
  };
}

// CHANGE1 requirement 4 — the Priority path. A Priority order may draw from
// more than one warehouse, so unlike the Standard path it cannot decide
// warehouse-by-warehouse: the combined total has to be known before any
// outcome is known. All three rows are therefore locked FIRST (still in
// WH-A -> WH-B -> WH-C order, the same order the Standard path takes them in,
// so the two paths can never deadlock against each other), and only then is
// the plan computed and applied.
//
// Because every row the plan draws from is already held under
// UPDLOCK/HOLDLOCK when the plan is computed, no decrement here can lose a
// race the way the Standard path's can — a failed decrement would mean the
// lock did not hold, which is a broken invariant, not a business outcome, so
// it aborts the transaction rather than silently allocating less.
async function decidePriorityUnderLock({ ProductId, Quantity, PromisedDeliveryDate }, transaction) {
  const lockedRowsByWarehouse = {};
  for (const warehouseId of WAREHOUSE_PRIORITY) {
    const lockedRow = await inventoryRepository.findForUpdate(ProductId, warehouseId, transaction);
    if (lockedRow) lockedRowsByWarehouse[warehouseId] = lockedRow;
  }

  const decision = decidePriority(
    { Quantity, PromisedDeliveryDate },
    lockedRowsByWarehouse,
    getPartialReleaseThresholdPercent()
  );

  for (const allocation of decision.Allocations) {
    const decremented = await inventoryRepository.decrementAvailableQuantity(
      ProductId,
      allocation.WarehouseId,
      allocation.AllocatedQuantity,
      transaction
    );
    if (!decremented) {
      throw new Error(
        `Inventory decrement failed for ${ProductId}/${allocation.WarehouseId} while holding its row lock`
      );
    }
  }

  return decision;
}

// FRD Section 9.3/16, FR-ORD-03, Section 29 Test 11, CHANGE1 requirement 5:
// an OrderId with an existing persisted result is returned unchanged, without
// ever invoking the decision engine again — so no second allocation row and
// no second backorder row can be written, whatever the stored status is.
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
    // FR-FDE-01: eligibility before inventory, for both customer types. Only
    // Eligible customers reach the row-locked warehouse evaluation;
    // CreditHold/Unknown block immediately without touching Inventory at all.
    let decision;
    if (!isEligible(customer)) {
      decision = { Status: BLOCKED, Reason: BLOCKED_CREDIT, ReleasedQuantity: 0, BackorderedQuantity: 0, Allocations: [] };
    } else if (isPriority(orderInput)) {
      decision = await decidePriorityUnderLock(orderInput, transaction);
    } else {
      decision = await decideStandardUnderLock(orderInput, transaction);
    }

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
    // CHANGE1 requirement 4: exactly one Open backorder, and only when there
    // is something outstanding to back-order. A Released order (including a
    // Priority order fully covered across several warehouses) and a Blocked
    // order both leave BackorderedQuantity at 0 and so write no row at all.
    if (decision.BackorderedQuantity > 0) {
      await backorderRepository.create(
        {
          OrderId: orderInput.OrderId,
          ProductId: orderInput.ProductId,
          BackorderedQuantity: decision.BackorderedQuantity,
          Status: backorderRepository.OPEN,
        },
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
