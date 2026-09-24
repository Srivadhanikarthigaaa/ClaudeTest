// Direct implementation of FRD Section 29 Tests 1-10 against the pure
// decision engine — the best available substitute for "manually run Tests
// 1-10 against the seeded data" while MOBDB_DEV connectivity is unreliable
// from this environment. No DB involved: inventory rows are passed in directly.
const { evaluate } = require('../../src/services/fulfilmentDecisionEngine');
const { BLOCKED_CREDIT, BLOCKED_INSUFFICIENT_INVENTORY, BLOCKED_DELIVERY_DATE } = require('../../src/services/reasonCodes');

const ELIGIBLE = { CustomerId: 'CUST001', EligibilityStatus: 'Eligible' };
const UNKNOWN = { CustomerId: 'CUST002', EligibilityStatus: 'Unknown' };
const CREDIT_HOLD = { CustomerId: 'CUST003', EligibilityStatus: 'CreditHold' };

function row(warehouseId, availableQuantity, earliestDispatchDate) {
  return { WarehouseId: warehouseId, AvailableQuantity: availableQuantity, EarliestDispatchDate: earliestDispatchDate };
}

describe('FRD Section 29 — Tests 1-10', () => {
  test('Test 1: eligible + single warehouse -> Released, WH-A, Allocated 20', () => {
    const rows = [row('WH-A', 20, '2026-09-20'), row('WH-B', 20, '2026-09-20'), row('WH-C', 20, '2026-09-20')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result).toEqual({
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }],
    });
  });

  test('Test 2: WH-A and WH-B both qualify -> WH-A selected (priority)', () => {
    const rows = [row('WH-A', 50, '2026-09-20'), row('WH-B', 50, '2026-09-20')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);
  });

  test('Test 3: WH-A cannot, WH-B can -> WH-B selected', () => {
    const rows = [row('WH-A', 20, '2026-09-20'), row('WH-B', 60, '2026-09-20'), row('WH-C', 60, '2026-09-20')];
    const result = evaluate({ Quantity: 60, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 60 }]);
  });

  test('Test 4: WH-A and WH-B both can -> WH-A selected', () => {
    const rows = [row('WH-A', 60, '2026-09-20'), row('WH-B', 60, '2026-09-20'), row('WH-C', 60, '2026-09-20')];
    const result = evaluate({ Quantity: 60, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 60 }]);
  });

  test('Test 5: no single warehouse can -> Blocked, no combining', () => {
    const rows = [row('WH-A', 20, '2026-09-20'), row('WH-B', 20, '2026-09-20'), row('WH-C', 20, '2026-09-20')];
    const result = evaluate({ Quantity: 60, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Status).toBe('Blocked');
    expect(result.Allocations).toEqual([]);
    expect(result.Reason).toBe(BLOCKED_INSUFFICIENT_INVENTORY);
  });

  test('Test 6: credit hold -> Blocked, blocked-credit, no allocations', () => {
    const rows = [row('WH-A', 100, '2026-09-20')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, CREDIT_HOLD, rows);
    expect(result).toEqual({
      Status: 'Blocked',
      Reason: BLOCKED_CREDIT,
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
      Allocations: [],
    });
  });

  test('Test 7: unknown eligibility -> Blocked, blocked-credit, no allocations', () => {
    const rows = [row('WH-A', 100, '2026-09-20')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, UNKNOWN, rows);
    expect(result).toEqual({
      Status: 'Blocked',
      Reason: BLOCKED_CREDIT,
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
      Allocations: [],
    });
  });

  test('Test 8: dispatch-date failure (enough quantity, date too late) -> Blocked', () => {
    const rows = [row('WH-A', 100, '2026-10-01')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Status).toBe('Blocked');
    expect(result.Allocations).toEqual([]);
    expect(result.Reason).toBe(BLOCKED_DELIVERY_DATE);
  });

  test('Test 9: alternate warehouse by date — WH-A fails date, WH-B qualifies -> WH-B selected', () => {
    const rows = [row('WH-A', 100, '2026-10-01'), row('WH-B', 100, '2026-09-20')];
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 20 }]);
  });

  test('Test 10: quantity and date both valid -> Released, WH-A, Allocated 60', () => {
    const rows = [row('WH-A', 100, '2026-09-20')];
    const result = evaluate({ Quantity: 60, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, rows);
    expect(result).toEqual({
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 60,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: 'WH-A', AllocatedQuantity: 60 }],
    });
  });

  test('Section 30 item 3: ProductId with zero inventory rows anywhere -> Blocked/insufficient-inventory', () => {
    const result = evaluate({ Quantity: 20, PromisedDeliveryDate: '2026-09-25' }, ELIGIBLE, []);
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe(BLOCKED_INSUFFICIENT_INVENTORY);
  });
});
