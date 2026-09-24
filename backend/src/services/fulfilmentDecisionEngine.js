// FRD Section 9.4 (FR-FDE-01–07), Sections 17-21 (business rules), plus
// CHANGE1 requirement 4 (Priority multi-warehouse fulfilment).
// Pure, non-transactional decision logic — takes already-loaded rows,
// touches no DB. Used directly for manual verification against FRD Section
// 29 Tests 1-10, and reused (via the exported helpers) by the Fulfilment
// Service's transactional, row-locked path (Phase 7) so the qualification
// rule itself is defined in exactly one place.
const { BLOCKED_CREDIT, BLOCKED_INSUFFICIENT_INVENTORY, BLOCKED_DELIVERY_DATE } = require('./reasonCodes');
const { RELEASED, PARTIALLY_RELEASED, BLOCKED } = require('./statuses');
const { getPartialReleaseThresholdPercent } = require('../config/fulfilmentConfig');

const WAREHOUSE_PRIORITY = ['WH-A', 'WH-B', 'WH-C'];
const PRIORITY_CUSTOMER_TYPE = 'Priority';

function toUtcMidnight(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// CHANGE1 ASSUMPTION (flagged — see docs/CHANGE1.md): the change document
// restates the quantity rules for Priority orders but not the date rule.
// Date feasibility is kept as a gate on whether a warehouse can contribute at
// all, because Stage 1 (FRD Section 20) established it and nothing in the
// change document withdraws it. A warehouse that cannot dispatch in time
// contributes zero, exactly as it would have been skipped in Stage 1.
function dateFeasible(row, promisedDeliveryDate) {
  if (!row) return false;
  return toUtcMidnight(row.EarliestDispatchDate) <= toUtcMidnight(promisedDeliveryDate);
}

// FR-FDE-02: for a STANDARD customer each warehouse is checked independently
// against the FULL Quantity — never combined with another warehouse's stock
// (FRD Section 18). CHANGE1 leaves this rule untouched.
function warehouseQualifies(row, quantity, promisedDeliveryDate) {
  if (!row) return false;
  return row.AvailableQuantity >= quantity && dateFeasible(row, promisedDeliveryDate);
}

function isEligible(customer) {
  return !!customer && customer.EligibilityStatus === 'Eligible';
}

function isPriority(order) {
  return !!order && order.CustomerType === PRIORITY_CUSTOMER_TYPE;
}

// Integer comparison of "is `available` at least thresholdPercent of
// `requested`?" — see config/fulfilmentConfig.js for why percent-as-integer.
function meetsThreshold(available, requested, thresholdPercent) {
  return available * 100 >= requested * thresholdPercent;
}

// FRD Section 30 item 2 / Section 30 item 3: distinguishes "nothing had
// enough quantity" (also covers a ProductId with zero inventory rows at all,
// per the FRD's documented A2 assumption) from "something had quantity but
// every candidate failed on date". Both literals are placeholders pending
// confirmation (see reasonCodes.js), but which one applies is fully
// determined by FRD 18/20's own rules.
function reasonForNoQualifyingWarehouse(rowsByWarehouse, quantity) {
  const anyHadEnoughQuantity = WAREHOUSE_PRIORITY.some((id) => {
    const row = rowsByWarehouse[id];
    return row && row.AvailableQuantity >= quantity;
  });
  return anyHadEnoughQuantity ? BLOCKED_DELIVERY_DATE : BLOCKED_INSUFFICIENT_INVENTORY;
}

// The Priority analogue of reasonForNoQualifyingWarehouse, built on the same
// shape of question: "would ignoring the date have changed the answer?" If the
// combined stock across all three warehouses would have cleared the threshold
// had dates been ignored, the blocking cause was the date; otherwise there
// simply wasn't enough stock.
function reasonForBlockedPriority(rowsByWarehouse, quantity, thresholdPercent) {
  const totalIgnoringDate = WAREHOUSE_PRIORITY.reduce(
    (sum, id) => sum + (rowsByWarehouse[id] ? rowsByWarehouse[id].AvailableQuantity : 0),
    0
  );
  return meetsThreshold(totalIgnoringDate, quantity, thresholdPercent)
    ? BLOCKED_DELIVERY_DATE
    : BLOCKED_INSUFFICIENT_INVENTORY;
}

// CHANGE1 requirement 4: walk WH-A -> WH-B -> WH-C in that fixed order and
// take from each date-feasible warehouse only as much as is still outstanding.
// `remaining` is what enforces "never allocate more than the requested
// quantity in total" — every warehouse is capped by it and the loop stops the
// moment it reaches zero, so the sum of AllocatedQuantity can never exceed
// Quantity no matter how much stock exists.
function planPriorityAllocations(rowsByWarehouse, quantity, promisedDeliveryDate) {
  const allocations = [];
  let remaining = quantity;

  for (const warehouseId of WAREHOUSE_PRIORITY) {
    if (remaining <= 0) break;
    const row = rowsByWarehouse[warehouseId];
    if (!dateFeasible(row, promisedDeliveryDate)) continue;

    const take = Math.min(row.AvailableQuantity, remaining);
    if (take <= 0) continue;

    allocations.push({ WarehouseId: warehouseId, AllocatedQuantity: take });
    remaining -= take;
  }

  return allocations;
}

// CHANGE1 requirement 4, the three outcomes for a Priority order:
//   >= 100% of Quantity available  -> Released, full allocation, NO backorder
//   >= threshold and < 100%        -> Partially Released, allocate what there
//                                     is, exactly one backorder for the rest
//   <  threshold                   -> Blocked, no allocation, no backorder
//
// CHANGE1 ASSUMPTION (flagged — see docs/CHANGE1.md): the >= 100% case is
// reported as Released with no backorder row. The change document does not say
// so explicitly, but the alternative (Partially Released, or a backorder of
// zero units) would mean persisting an Open backorder that has nothing
// outstanding in it.
function decidePriority({ Quantity, PromisedDeliveryDate }, rowsByWarehouse, thresholdPercent) {
  const allocations = planPriorityAllocations(rowsByWarehouse, Quantity, PromisedDeliveryDate);
  const releasedQuantity = allocations.reduce((sum, a) => sum + a.AllocatedQuantity, 0);

  if (releasedQuantity >= Quantity) {
    return {
      Status: RELEASED,
      Reason: null,
      ReleasedQuantity: releasedQuantity,
      BackorderedQuantity: 0,
      Allocations: allocations,
    };
  }

  if (meetsThreshold(releasedQuantity, Quantity, thresholdPercent)) {
    return {
      Status: PARTIALLY_RELEASED,
      Reason: null,
      ReleasedQuantity: releasedQuantity,
      BackorderedQuantity: Quantity - releasedQuantity,
      Allocations: allocations,
    };
  }

  return {
    Status: BLOCKED,
    Reason: reasonForBlockedPriority(rowsByWarehouse, Quantity, thresholdPercent),
    ReleasedQuantity: 0,
    BackorderedQuantity: 0,
    Allocations: [],
  };
}

// The Stage 1 rule, unchanged by CHANGE1: a Standard order's FULL quantity
// must come from ONE warehouse. FR-FDE-03: fixed priority WH-A -> WH-B ->
// WH-C, first qualifying warehouse wins.
function decideStandard({ Quantity, PromisedDeliveryDate }, rowsByWarehouse) {
  for (const warehouseId of WAREHOUSE_PRIORITY) {
    if (warehouseQualifies(rowsByWarehouse[warehouseId], Quantity, PromisedDeliveryDate)) {
      return {
        Status: RELEASED,
        Reason: null,
        ReleasedQuantity: Quantity,
        BackorderedQuantity: 0,
        Allocations: [{ WarehouseId: warehouseId, AllocatedQuantity: Quantity }],
      };
    }
  }

  return {
    Status: BLOCKED,
    Reason: reasonForNoQualifyingWarehouse(rowsByWarehouse, Quantity),
    ReleasedQuantity: 0,
    BackorderedQuantity: 0,
    Allocations: [],
  };
}

// FR-FDE-01: eligibility before inventory, for both customer types.
// FR-FDE-05/06: exact ReleasedQuantity/BackorderedQuantity/Reason per outcome.
function evaluate(order, customer, inventoryRows, thresholdPercent = getPartialReleaseThresholdPercent()) {
  if (!isEligible(customer)) {
    return { Status: BLOCKED, Reason: BLOCKED_CREDIT, ReleasedQuantity: 0, BackorderedQuantity: 0, Allocations: [] };
  }

  const rowsByWarehouse = Object.fromEntries(inventoryRows.map((r) => [r.WarehouseId, r]));

  return isPriority(order)
    ? decidePriority(order, rowsByWarehouse, thresholdPercent)
    : decideStandard(order, rowsByWarehouse);
}

module.exports = {
  evaluate,
  decideStandard,
  decidePriority,
  planPriorityAllocations,
  meetsThreshold,
  dateFeasible,
  warehouseQualifies,
  isEligible,
  isPriority,
  reasonForNoQualifyingWarehouse,
  reasonForBlockedPriority,
  WAREHOUSE_PRIORITY,
  PRIORITY_CUSTOMER_TYPE,
};
