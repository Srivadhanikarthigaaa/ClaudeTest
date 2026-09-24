// CHANGE1 requirements 3-5, at the Fulfilment Service level with every
// repository and the transaction mocked — so the multi-warehouse decrements,
// the single Open backorder, and the idempotent-replay behaviour for each of
// the three statuses are all proven deterministically, without a live DB.
// The live-DB counterparts live in tests/integration/.
jest.mock('../../src/repositories/customerRepository');
jest.mock('../../src/repositories/inventoryRepository');
jest.mock('../../src/repositories/orderRepository');
jest.mock('../../src/repositories/fulfilmentResultRepository');
jest.mock('../../src/repositories/inventoryAllocationRepository');
jest.mock('../../src/repositories/backorderRepository');
jest.mock('../../src/database/pool');

const customerRepository = require('../../src/repositories/customerRepository');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const orderRepository = require('../../src/repositories/orderRepository');
const fulfilmentResultRepository = require('../../src/repositories/fulfilmentResultRepository');
const inventoryAllocationRepository = require('../../src/repositories/inventoryAllocationRepository');
const backorderRepository = require('../../src/repositories/backorderRepository');
const { beginTransaction } = require('../../src/database/pool');
const fulfilmentService = require('../../src/services/fulfilmentService');
const { RELEASED, PARTIALLY_RELEASED, BLOCKED } = require('../../src/services/statuses');
const { BLOCKED_INSUFFICIENT_INVENTORY } = require('../../src/services/reasonCodes');

const PRIORITY_ORDER = {
  OrderId: 'ORD-PRIO-001',
  CustomerId: 'CUST001',
  CustomerType: 'Priority',
  ProductId: 'PROD001',
  Quantity: 100,
  PromisedDeliveryDate: '2026-09-25',
};

const IN_TIME = '2026-09-20';

function fakeTransaction() {
  return { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
}

// Locks are taken WH-A, WH-B, WH-C in that order; `stock` gives each one's
// AvailableQuantity, or null for "no inventory row at all".
function givenStock(stock) {
  inventoryRepository.findForUpdate.mockImplementation(async (productId, warehouseId) => {
    const available = stock[warehouseId];
    if (available === undefined || available === null) return null;
    return { WarehouseId: warehouseId, AvailableQuantity: available, EarliestDispatchDate: IN_TIME };
  });
  inventoryRepository.decrementAvailableQuantity.mockResolvedValue(true);
}

// The service re-reads the persisted result after committing, so the mock has
// to answer "nothing yet" first and "here is what was written" second.
function givenNoExistingResultThen(persisted) {
  fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValueOnce(persisted);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT = '70';
  beginTransaction.mockResolvedValue(fakeTransaction());
  inventoryAllocationRepository.findByOrderId.mockResolvedValue([]);
  customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' });
  backorderRepository.OPEN = 'Open';
});

describe('Priority order — Partially Released (the worked example, end to end through the service)', () => {
  beforeEach(() => {
    givenStock({ 'WH-A': 40, 'WH-B': 35, 'WH-C': 0 });
    givenNoExistingResultThen({
      OrderId: PRIORITY_ORDER.OrderId,
      Status: PARTIALLY_RELEASED,
      Reason: null,
      ReleasedQuantity: 75,
      BackorderedQuantity: 25,
    });
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([
      { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
    ]);
  });

  test('persists the "Partially Released" status with released 75 / backordered 25', async () => {
    const { result } = await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(fulfilmentResultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ Status: PARTIALLY_RELEASED, Reason: null, ReleasedQuantity: 75, BackorderedQuantity: 25 }),
      expect.anything()
    );
    expect(result.Status).toBe(PARTIALLY_RELEASED);
  });

  test('decrements each contributing warehouse by its own allocated quantity', async () => {
    await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledTimes(2);
    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledWith('PROD001', 'WH-A', 40, expect.anything());
    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledWith('PROD001', 'WH-B', 35, expect.anything());
  });

  test('writes one allocation row per contributing warehouse and none for WH-C', async () => {
    await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(inventoryAllocationRepository.create).toHaveBeenCalledTimes(2);
    const warehouses = inventoryAllocationRepository.create.mock.calls.map(([row]) => row.WarehouseId);
    expect(warehouses).toEqual(['WH-A', 'WH-B']);
  });

  test('creates exactly ONE Open backorder, for the remainder only', async () => {
    await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(backorderRepository.create).toHaveBeenCalledTimes(1);
    expect(backorderRepository.create).toHaveBeenCalledWith(
      { OrderId: 'ORD-PRIO-001', ProductId: 'PROD001', BackorderedQuantity: 25, Status: 'Open' },
      expect.anything()
    );
  });

  test('locks all three warehouses before deciding, in WH-A -> WH-B -> WH-C order', async () => {
    await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(inventoryRepository.findForUpdate.mock.calls.map(([, warehouseId]) => warehouseId)).toEqual([
      'WH-A',
      'WH-B',
      'WH-C',
    ]);
  });
});

describe('Priority order — Released across warehouses (>= 100% combined)', () => {
  test('full cover creates no backorder at all', async () => {
    givenStock({ 'WH-A': 60, 'WH-B': 40, 'WH-C': 500 });
    givenNoExistingResultThen({
      OrderId: PRIORITY_ORDER.OrderId,
      Status: RELEASED,
      Reason: null,
      ReleasedQuantity: 100,
      BackorderedQuantity: 0,
    });

    const { result } = await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(result.Status).toBe(RELEASED);
    expect(backorderRepository.create).not.toHaveBeenCalled();
    expect(inventoryAllocationRepository.create).toHaveBeenCalledTimes(2); // WH-A and WH-B; WH-C not needed
  });
});

describe('Priority order — Blocked (below the threshold)', () => {
  test('nothing is decremented, no allocation and no backorder are written', async () => {
    givenStock({ 'WH-A': 30, 'WH-B': 20, 'WH-C': 0 }); // 50 of 100, under 70%
    givenNoExistingResultThen({
      OrderId: PRIORITY_ORDER.OrderId,
      Status: BLOCKED,
      Reason: BLOCKED_INSUFFICIENT_INVENTORY,
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
    });

    const { result } = await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(result.Status).toBe(BLOCKED);
    expect(inventoryRepository.decrementAvailableQuantity).not.toHaveBeenCalled();
    expect(inventoryAllocationRepository.create).not.toHaveBeenCalled();
    expect(backorderRepository.create).not.toHaveBeenCalled();
  });
});

describe('Priority order — a decrement that fails under lock aborts the whole order', () => {
  test('the transaction is rolled back rather than allocating a partial plan', async () => {
    const transaction = fakeTransaction();
    beginTransaction.mockResolvedValue(transaction);
    givenStock({ 'WH-A': 40, 'WH-B': 35, 'WH-C': 0 });
    // WH-A succeeds, WH-B reports "no rows affected" — impossible while the
    // lock is held, so it must abort, not silently release 40 of 75.
    inventoryRepository.decrementAvailableQuantity.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null);

    await expect(fulfilmentService.submitOrder(PRIORITY_ORDER)).rejects.toThrow(/decrement failed/i);

    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(fulfilmentResultRepository.create).not.toHaveBeenCalled();
    expect(backorderRepository.create).not.toHaveBeenCalled();
  });
});

// CHANGE1 requirement 5: replay must reuse the persisted result exactly,
// whatever that result was, and must not write anything a second time.
describe('Idempotent replay — for each of the three statuses', () => {
  const cases = [
    {
      status: RELEASED,
      persisted: { Status: RELEASED, Reason: null, ReleasedQuantity: 100, BackorderedQuantity: 0 },
      allocations: [
        { WarehouseId: 'WH-A', AllocatedQuantity: 60 },
        { WarehouseId: 'WH-B', AllocatedQuantity: 40 },
      ],
    },
    {
      status: PARTIALLY_RELEASED,
      persisted: { Status: PARTIALLY_RELEASED, Reason: null, ReleasedQuantity: 75, BackorderedQuantity: 25 },
      allocations: [
        { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
        { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
      ],
    },
    {
      status: BLOCKED,
      persisted: {
        Status: BLOCKED,
        Reason: BLOCKED_INSUFFICIENT_INVENTORY,
        ReleasedQuantity: 0,
        BackorderedQuantity: 0,
      },
      allocations: [],
    },
  ];

  test.each(cases)('$status: the stored result is returned unchanged and nothing is written again', async ({
    persisted,
    allocations,
  }) => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValue({ OrderId: PRIORITY_ORDER.OrderId, ...persisted });
    inventoryAllocationRepository.findByOrderId.mockResolvedValue(allocations);

    const { result, wasIdempotentReplay } = await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(wasIdempotentReplay).toBe(true);
    expect(result).toEqual({
      OrderId: PRIORITY_ORDER.OrderId,
      ...persisted,
      Allocations: allocations,
    });

    // The decision engine is never re-entered, so none of these can happen.
    expect(beginTransaction).not.toHaveBeenCalled();
    expect(inventoryRepository.findForUpdate).not.toHaveBeenCalled();
    expect(inventoryRepository.decrementAvailableQuantity).not.toHaveBeenCalled();
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(fulfilmentResultRepository.create).not.toHaveBeenCalled();
    expect(inventoryAllocationRepository.create).not.toHaveBeenCalled();
    expect(backorderRepository.create).not.toHaveBeenCalled();
  });

  test('two consecutive submissions of the same order produce byte-identical results', async () => {
    givenStock({ 'WH-A': 40, 'WH-B': 35, 'WH-C': 0 });
    const persisted = {
      OrderId: PRIORITY_ORDER.OrderId,
      Status: PARTIALLY_RELEASED,
      Reason: null,
      ReleasedQuantity: 75,
      BackorderedQuantity: 25,
    };
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([
      { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
      { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
    ]);
    // First call: nothing stored, then the freshly written row. Second call:
    // that same row, found up front.
    fulfilmentResultRepository.findByOrderId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persisted)
      .mockResolvedValue(persisted);

    const first = await fulfilmentService.submitOrder(PRIORITY_ORDER);
    const second = await fulfilmentService.submitOrder(PRIORITY_ORDER);

    expect(first.wasIdempotentReplay).toBe(false);
    expect(second.wasIdempotentReplay).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(backorderRepository.create).toHaveBeenCalledTimes(1);
    expect(inventoryAllocationRepository.create).toHaveBeenCalledTimes(2);
  });
});
