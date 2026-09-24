// CHANGE1 requirement 6 — the Priority decision rules, tested against the
// pure decision engine (no DB, no mocks, inventory rows passed in directly),
// the same way tests/services/fulfilmentDecisionEngine.test.js covers the
// Stage 1 Standard rules.
//
// The threshold is passed in explicitly on every call rather than left to the
// environment, so these tests state the threshold they are asserting against
// instead of depending on whatever PARTIAL_RELEASE_THRESHOLD_PERCENT happens
// to be set to in the runner's .env. The default-and-override wiring itself
// is covered by tests/config/fulfilmentConfig.test.js and by the
// "reads the threshold from configuration" case at the end of this file.
const { evaluate, decidePriority } = require('../../src/services/fulfilmentDecisionEngine');
const { RELEASED, PARTIALLY_RELEASED, BLOCKED } = require('../../src/services/statuses');
const { BLOCKED_CREDIT, BLOCKED_INSUFFICIENT_INVENTORY, BLOCKED_DELIVERY_DATE } = require('../../src/services/reasonCodes');

const THRESHOLD = 70;
const PROMISED = '2026-09-25';
const IN_TIME = '2026-09-20';
const TOO_LATE = '2026-10-01';

const ELIGIBLE = { CustomerId: 'CUST001', EligibilityStatus: 'Eligible' };
const CREDIT_HOLD = { CustomerId: 'CUST003', EligibilityStatus: 'CreditHold' };

// rowsByWarehouse, the shape decidePriority() consumes.
function warehouses(spec) {
  return Object.fromEntries(
    Object.entries(spec).map(([warehouseId, [availableQuantity, earliestDispatchDate = IN_TIME]]) => [
      warehouseId,
      { WarehouseId: warehouseId, AvailableQuantity: availableQuantity, EarliestDispatchDate: earliestDispatchDate },
    ])
  );
}

function decide(quantity, spec, thresholdPercent = THRESHOLD) {
  return decidePriority({ Quantity: quantity, PromisedDeliveryDate: PROMISED }, warehouses(spec), thresholdPercent);
}

function totalAllocated(result) {
  return result.Allocations.reduce((sum, a) => sum + a.AllocatedQuantity, 0);
}

describe('CHANGE1 — the change document worked example', () => {
  test('qty 100 with WH-A=40, WH-B=35, WH-C=0 -> Partially Released, released 75, backordered 25', () => {
    const result = decide(100, { 'WH-A': [40], 'WH-B': [35], 'WH-C': [0] });

    expect(result).toEqual({
      Status: PARTIALLY_RELEASED,
      Reason: null,
      ReleasedQuantity: 75,
      BackorderedQuantity: 25,
      Allocations: [
        { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
        { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
      ],
    });
    // WH-C contributed nothing, so it gets no allocation row at all.
    expect(result.Allocations.map((a) => a.WarehouseId)).not.toContain('WH-C');
  });
});

describe('CHANGE1 — the 70% threshold boundary', () => {
  test('exactly 70% available -> Partially Released (the boundary is inclusive)', () => {
    const result = decide(100, { 'WH-A': [70] });

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.ReleasedQuantity).toBe(70);
    expect(result.BackorderedQuantity).toBe(30);
  });

  test('exactly 70% spread across all three warehouses -> Partially Released', () => {
    const result = decide(100, { 'WH-A': [30], 'WH-B': [25], 'WH-C': [15] });

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.ReleasedQuantity).toBe(70);
    expect(result.BackorderedQuantity).toBe(30);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 30 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 25 },
      { WarehouseId: 'WH-C', AllocatedQuantity: 15 },
    ]);
  });

  test('just under 70% (69 of 100) -> Blocked, nothing allocated, nothing backordered', () => {
    const result = decide(100, { 'WH-A': [69] });

    expect(result).toEqual({
      Status: BLOCKED,
      Reason: BLOCKED_INSUFFICIENT_INVENTORY,
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
      Allocations: [],
    });
  });

  test('a quantity where 70% is fractional still resolves exactly (7 of 10 passes, 6 of 10 blocks)', () => {
    expect(decide(10, { 'WH-A': [7] }).Status).toBe(PARTIALLY_RELEASED);
    expect(decide(10, { 'WH-A': [6] }).Status).toBe(BLOCKED);
    // 70% of 3 is 2.1, so 2 units is below the threshold and 3 is full cover.
    expect(decide(3, { 'WH-A': [2] }).Status).toBe(BLOCKED);
    expect(decide(3, { 'WH-A': [3] }).Status).toBe(RELEASED);
  });
});

describe('CHANGE1 — full cover (>= 100% combined)', () => {
  test('combined stock exactly meets the request -> Released, no backorder', () => {
    const result = decide(100, { 'WH-A': [60], 'WH-B': [40] });

    expect(result).toEqual({
      Status: RELEASED,
      Reason: null,
      ReleasedQuantity: 100,
      BackorderedQuantity: 0,
      Allocations: [
        { WarehouseId: 'WH-A', AllocatedQuantity: 60 },
        { WarehouseId: 'WH-B', AllocatedQuantity: 40 },
      ],
    });
  });

  test('a single warehouse covering the whole request -> Released from WH-A alone', () => {
    const result = decide(100, { 'WH-A': [500], 'WH-B': [500], 'WH-C': [500] });

    expect(result.Status).toBe(RELEASED);
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 100 }]);
  });

  test('warehouses are drawn from in WH-A -> WH-B -> WH-C priority order', () => {
    const result = decide(100, { 'WH-A': [10], 'WH-B': [10], 'WH-C': [500] });

    expect(result.Status).toBe(RELEASED);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 10 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 10 },
      { WarehouseId: 'WH-C', AllocatedQuantity: 80 },
    ]);
  });
});

describe('CHANGE1 — never allocate more than the requested quantity', () => {
  test('abundant stock everywhere still allocates exactly the requested quantity', () => {
    const result = decide(100, { 'WH-A': [1000], 'WH-B': [1000], 'WH-C': [1000] });

    expect(totalAllocated(result)).toBe(100);
    expect(result.ReleasedQuantity).toBe(100);
    expect(result.BackorderedQuantity).toBe(0);
  });

  test('a warehouse that would overshoot is capped at the outstanding remainder', () => {
    const result = decide(100, { 'WH-A': [30], 'WH-B': [1000], 'WH-C': [1000] });

    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 30 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 70 }, // capped at the remaining 70, not 1000
    ]);
    expect(totalAllocated(result)).toBe(100);
  });

  test('no outcome, at any stock level, ever allocates more than requested', () => {
    for (const available of [0, 1, 50, 69, 70, 99, 100, 101, 10000]) {
      const result = decide(100, { 'WH-A': [available], 'WH-B': [available], 'WH-C': [available] });
      expect(totalAllocated(result)).toBeLessThanOrEqual(100);
      expect(result.ReleasedQuantity).toBeLessThanOrEqual(100);
      expect(result.ReleasedQuantity + result.BackorderedQuantity).toBeLessThanOrEqual(100);
    }
  });
});

describe('CHANGE1 — date feasibility still gates a warehouse\'s contribution (flagged assumption)', () => {
  test('a warehouse that cannot dispatch in time contributes nothing', () => {
    const result = decide(100, { 'WH-A': [40], 'WH-B': [1000, TOO_LATE], 'WH-C': [35] });

    expect(result.Status).toBe(PARTIALLY_RELEASED);
    expect(result.ReleasedQuantity).toBe(75);
    expect(result.Allocations).toEqual([
      { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
      { WarehouseId: 'WH-C', AllocatedQuantity: 35 },
    ]);
  });

  test('plenty of stock but none of it dispatchable in time -> Blocked on the delivery date', () => {
    const result = decide(100, { 'WH-A': [500, TOO_LATE], 'WH-B': [500, TOO_LATE], 'WH-C': [500, TOO_LATE] });

    expect(result.Status).toBe(BLOCKED);
    expect(result.Reason).toBe(BLOCKED_DELIVERY_DATE);
    expect(result.Allocations).toEqual([]);
  });

  test('a dispatch date equal to the promised date is feasible', () => {
    const result = decide(100, { 'WH-A': [100, PROMISED] });
    expect(result.Status).toBe(RELEASED);
  });

  test('no stock anywhere -> Blocked on insufficient inventory, not on the date', () => {
    const result = decide(100, {});
    expect(result.Status).toBe(BLOCKED);
    expect(result.Reason).toBe(BLOCKED_INSUFFICIENT_INVENTORY);
  });
});

describe('CHANGE1 — the threshold is configuration, not a constant', () => {
  test('the same stock flips outcome when the configured threshold changes', () => {
    const stock = { 'WH-A': [50] };

    expect(decide(100, stock, 70).Status).toBe(BLOCKED);
    expect(decide(100, stock, 50).Status).toBe(PARTIALLY_RELEASED);
    expect(decide(100, stock, 25).Status).toBe(PARTIALLY_RELEASED);
  });

  test('evaluate() picks the threshold up from the environment when none is passed', () => {
    const previous = process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT;
    const order = { CustomerType: 'Priority', Quantity: 100, PromisedDeliveryDate: PROMISED };
    const rows = [{ WarehouseId: 'WH-A', AvailableQuantity: 50, EarliestDispatchDate: IN_TIME }];

    try {
      process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT = '70';
      expect(evaluate(order, ELIGIBLE, rows).Status).toBe(BLOCKED);

      process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT = '40';
      expect(evaluate(order, ELIGIBLE, rows).Status).toBe(PARTIALLY_RELEASED);
    } finally {
      if (previous === undefined) delete process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT;
      else process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT = previous;
    }
  });
});

describe('CHANGE1 — Priority orders through evaluate(), and Standard orders left alone', () => {
  test('eligibility is still checked before inventory for a Priority order', () => {
    const result = evaluate(
      { CustomerType: 'Priority', Quantity: 100, PromisedDeliveryDate: PROMISED },
      CREDIT_HOLD,
      [{ WarehouseId: 'WH-A', AvailableQuantity: 1000, EarliestDispatchDate: IN_TIME }]
    );

    expect(result).toEqual({
      Status: BLOCKED,
      Reason: BLOCKED_CREDIT,
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
      Allocations: [],
    });
  });

  test('the SAME inventory that partially releases a Priority order still Blocks a Standard one', () => {
    const rows = [
      { WarehouseId: 'WH-A', AvailableQuantity: 40, EarliestDispatchDate: IN_TIME },
      { WarehouseId: 'WH-B', AvailableQuantity: 35, EarliestDispatchDate: IN_TIME },
    ];

    const priority = evaluate({ CustomerType: 'Priority', Quantity: 100, PromisedDeliveryDate: PROMISED }, ELIGIBLE, rows);
    const standard = evaluate({ CustomerType: 'Standard', Quantity: 100, PromisedDeliveryDate: PROMISED }, ELIGIBLE, rows);

    expect(priority.Status).toBe(PARTIALLY_RELEASED);
    // Stage 1's rule, untouched: a Standard order never combines warehouses.
    expect(standard.Status).toBe(BLOCKED);
    expect(standard.Allocations).toEqual([]);
  });

  test('a Standard order still takes its full quantity from one warehouse', () => {
    const rows = [
      { WarehouseId: 'WH-A', AvailableQuantity: 40, EarliestDispatchDate: IN_TIME },
      { WarehouseId: 'WH-B', AvailableQuantity: 100, EarliestDispatchDate: IN_TIME },
    ];

    const standard = evaluate({ CustomerType: 'Standard', Quantity: 100, PromisedDeliveryDate: PROMISED }, ELIGIBLE, rows);

    expect(standard.Status).toBe(RELEASED);
    expect(standard.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 100 }]);
  });
});
