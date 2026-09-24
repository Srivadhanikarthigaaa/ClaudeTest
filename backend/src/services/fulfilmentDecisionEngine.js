// FRD Section 9.4 (FR-FDE-01–07), Sections 17-21 (business rules).
// Pure, non-transactional decision logic — takes already-loaded rows,
// touches no DB. Used directly for manual verification against FRD Section
// 29 Tests 1-10, and reused (via the exported helpers) by the Fulfilment
// Service's transactional, row-locked path (Phase 7) so the qualification
// rule itself is defined in exactly one place.
const { BLOCKED_CREDIT, BLOCKED_INSUFFICIENT_INVENTORY, BLOCKED_DELIVERY_DATE } = require('./reasonCodes');

const WAREHOUSE_PRIORITY = ['WH-A', 'WH-B', 'WH-C'];

function toUtcMidnight(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// FR-FDE-02: each warehouse is checked independently against the FULL
// Quantity — never combined with another warehouse's stock (FRD Section 18).
function warehouseQualifies(row, quantity, promisedDeliveryDate) {
  if (!row) return false;
  return (
    row.AvailableQuantity >= quantity &&
    toUtcMidnight(row.EarliestDispatchDate) <= toUtcMidnight(promisedDeliveryDate)
  );
}

function isEligible(customer) {
  return !!customer && customer.EligibilityStatus === 'Eligible';
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

// FR-FDE-01: eligibility before inventory. FR-FDE-03: fixed priority
// WH-A -> WH-B -> WH-C, first qualifying warehouse wins. FR-FDE-05/06:
// exact ReleasedQuantity/BackorderedQuantity/Reason values per outcome.
function evaluate({ Quantity, PromisedDeliveryDate }, customer, inventoryRows) {
  if (!isEligible(customer)) {
    return { Status: 'Blocked', Reason: BLOCKED_CREDIT, ReleasedQuantity: 0, BackorderedQuantity: 0, Allocations: [] };
  }

  const rowsByWarehouse = Object.fromEntries(inventoryRows.map((r) => [r.WarehouseId, r]));

  for (const warehouseId of WAREHOUSE_PRIORITY) {
    if (warehouseQualifies(rowsByWarehouse[warehouseId], Quantity, PromisedDeliveryDate)) {
      return {
        Status: 'Released',
        Reason: null,
        ReleasedQuantity: Quantity,
        BackorderedQuantity: 0,
        Allocations: [{ WarehouseId: warehouseId, AllocatedQuantity: Quantity }],
      };
    }
  }

  return {
    Status: 'Blocked',
    Reason: reasonForNoQualifyingWarehouse(rowsByWarehouse, Quantity),
    ReleasedQuantity: 0,
    BackorderedQuantity: 0,
    Allocations: [],
  };
}

module.exports = {
  evaluate,
  warehouseQualifies,
  isEligible,
  reasonForNoQualifyingWarehouse,
  WAREHOUSE_PRIORITY,
};
