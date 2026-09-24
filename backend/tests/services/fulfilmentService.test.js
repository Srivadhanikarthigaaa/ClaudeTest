// Unit tests with every repository/transaction mocked — proves Phase 5's
// idempotency mechanic and Phase 7's transactional/fallthrough behavior
// deterministically, without needing a live SQL Server connection.
jest.mock('../../src/repositories/customerRepository');
jest.mock('../../src/repositories/inventoryRepository');
jest.mock('../../src/repositories/orderRepository');
jest.mock('../../src/repositories/fulfilmentResultRepository');
jest.mock('../../src/repositories/inventoryAllocationRepository');
jest.mock('../../src/database/pool');

const customerRepository = require('../../src/repositories/customerRepository');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const orderRepository = require('../../src/repositories/orderRepository');
const fulfilmentResultRepository = require('../../src/repositories/fulfilmentResultRepository');
const inventoryAllocationRepository = require('../../src/repositories/inventoryAllocationRepository');
const { beginTransaction } = require('../../src/database/pool');
const fulfilmentService = require('../../src/services/fulfilmentService');
const { CustomerNotFoundError, OrderNotFoundError } = require('../../src/services/errors');

const ORDER_INPUT = {
  OrderId: 'ORD1001',
  CustomerId: 'CUST001',
  CustomerType: 'Standard',
  ProductId: 'PROD001',
  Quantity: 20,
  PromisedDeliveryDate: '2026-09-25',
};

function fakeTransaction() {
  return { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  beginTransaction.mockResolvedValue(fakeTransaction());
  inventoryAllocationRepository.findByOrderId.mockResolvedValue([]);
});

describe('submitOrder — idempotency (FRD Section 29 Test 11)', () => {
  test('an OrderId with an existing result is returned unchanged, without opening a transaction', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValue({
      OrderId: 'ORD1001',
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
    });
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);

    const { result, wasIdempotentReplay } = await fulfilmentService.submitOrder(ORDER_INPUT);

    expect(wasIdempotentReplay).toBe(true);
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);
    expect(beginTransaction).not.toHaveBeenCalled();
    expect(customerRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.create).not.toHaveBeenCalled();
  });
});

describe('submitOrder — CustomerId not found (FRD Section 30 item 1)', () => {
  test('throws CustomerNotFoundError and persists nothing', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValue(null);
    customerRepository.findById.mockResolvedValue(null);

    await expect(fulfilmentService.submitOrder(ORDER_INPUT)).rejects.toThrow(CustomerNotFoundError);

    expect(beginTransaction).not.toHaveBeenCalled();
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(fulfilmentResultRepository.create).not.toHaveBeenCalled();
  });
});

describe('submitOrder — eligibility short-circuit (FR-FDE-01)', () => {
  test('CreditHold blocks before ever touching Inventory', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      OrderId: 'ORD1001',
      Status: 'Blocked',
      Reason: 'blocked-credit',
      ReleasedQuantity: 0,
      BackorderedQuantity: 0,
    });
    customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST003', EligibilityStatus: 'CreditHold' });

    const { result, wasIdempotentReplay } = await fulfilmentService.submitOrder(ORDER_INPUT);

    expect(wasIdempotentReplay).toBe(false);
    expect(result.Status).toBe('Blocked');
    expect(result.Reason).toBe('blocked-credit');
    expect(inventoryRepository.findForUpdate).not.toHaveBeenCalled();
    expect(fulfilmentResultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ Status: 'Blocked', Reason: 'blocked-credit' }),
      expect.anything()
    );
  });
});

describe('submitOrder — Released path (Phase 7 row-locked transaction)', () => {
  test('WH-A qualifies under lock -> allocation created, decrement called, transaction committed', async () => {
    const transaction = fakeTransaction();
    beginTransaction.mockResolvedValue(transaction);
    fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      OrderId: 'ORD1001',
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
    });
    customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' });
    inventoryRepository.findForUpdate.mockResolvedValueOnce({
      WarehouseId: 'WH-A',
      AvailableQuantity: 20,
      EarliestDispatchDate: '2026-09-20',
    });
    inventoryRepository.decrementAvailableQuantity.mockResolvedValue(true);
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);

    const { result } = await fulfilmentService.submitOrder(ORDER_INPUT);

    expect(result.Status).toBe('Released');
    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledWith('PROD001', 'WH-A', 20, transaction);
    expect(inventoryAllocationRepository.create).toHaveBeenCalledWith(
      { OrderId: 'ORD1001', WarehouseId: 'WH-A', AllocatedQuantity: 20 },
      transaction
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  test('WH-A no longer qualifies under lock -> falls through to WH-B, never errors', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      OrderId: 'ORD1001',
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
    });
    customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' });
    inventoryRepository.findForUpdate
      .mockResolvedValueOnce({ WarehouseId: 'WH-A', AvailableQuantity: 5, EarliestDispatchDate: '2026-09-20' }) // lost the race
      .mockResolvedValueOnce({ WarehouseId: 'WH-B', AvailableQuantity: 20, EarliestDispatchDate: '2026-09-20' });
    inventoryRepository.decrementAvailableQuantity.mockResolvedValue(true);
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([{ WarehouseId: 'WH-B', AllocatedQuantity: 20 }]);

    const { result } = await fulfilmentService.submitOrder(ORDER_INPUT);

    expect(result.Status).toBe('Released');
    expect(result.Allocations).toEqual([{ WarehouseId: 'WH-B', AllocatedQuantity: 20 }]);
    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledTimes(1);
    expect(inventoryRepository.decrementAvailableQuantity).toHaveBeenCalledWith('PROD001', 'WH-B', 20, expect.anything());
  });

  test('a persistence failure rolls back the whole transaction', async () => {
    const transaction = fakeTransaction();
    beginTransaction.mockResolvedValue(transaction);
    fulfilmentResultRepository.findByOrderId.mockResolvedValueOnce(null);
    customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' });
    inventoryRepository.findForUpdate.mockResolvedValue({
      WarehouseId: 'WH-A',
      AvailableQuantity: 20,
      EarliestDispatchDate: '2026-09-20',
    });
    inventoryRepository.decrementAvailableQuantity.mockResolvedValue(true);
    orderRepository.create.mockRejectedValue(new Error('duplicate key'));

    await expect(fulfilmentService.submitOrder(ORDER_INPUT)).rejects.toThrow('duplicate key');
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(fulfilmentResultRepository.create).not.toHaveBeenCalled();
  });
});

describe('getOrderResult (FRD Section 9.5)', () => {
  test('throws OrderNotFoundError for an unknown OrderId', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValue(null);
    await expect(fulfilmentService.getOrderResult('ORD9999')).rejects.toThrow(OrderNotFoundError);
  });

  test('returns the persisted result for a known OrderId', async () => {
    fulfilmentResultRepository.findByOrderId.mockResolvedValue({
      OrderId: 'ORD1001',
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
    });
    inventoryAllocationRepository.findByOrderId.mockResolvedValue([{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }]);

    const result = await fulfilmentService.getOrderResult('ORD1001');
    expect(result).toEqual({
      OrderId: 'ORD1001',
      Status: 'Released',
      Reason: null,
      ReleasedQuantity: 20,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: 'WH-A', AllocatedQuantity: 20 }],
    });
  });
});
