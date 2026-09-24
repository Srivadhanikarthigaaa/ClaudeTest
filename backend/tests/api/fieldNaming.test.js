// CHANGE1 requirement 1 & 6 — the HTTP contract itself: every request field,
// response field and error field on EVERY endpoint (the pre-existing Stage 1
// ones included, not just the new Priority path) is lowerCamelCase, and the
// partial status reads "Partially Released" with a space.
//
// The service and the Customer/Inventory repositories are mocked, so this
// suite runs the real Express app, the real routes, the real validators, the
// real serializers and the real error handler with NO database — it is about
// the wire format, not about persistence.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-field-naming-suite';

jest.mock('../../src/services/fulfilmentService');
jest.mock('../../src/repositories/customerRepository');
jest.mock('../../src/repositories/inventoryRepository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/index');
const fulfilmentService = require('../../src/services/fulfilmentService');
const customerRepository = require('../../src/repositories/customerRepository');
const inventoryRepository = require('../../src/repositories/inventoryRepository');
const { PARTIALLY_RELEASED, RELEASED, BLOCKED } = require('../../src/services/statuses');
const { OrderNotFoundError, CustomerNotFoundError, InventoryNotFoundError } = require('../../src/services/errors');

const TOKEN = jwt.sign({ sub: 'field-naming-test' }, process.env.JWT_SECRET);
const auth = (req) => req.set('Authorization', `Bearer ${TOKEN}`);

const VALID_ORDER_BODY = {
  orderId: 'ORD-CAMEL-001',
  customerId: 'CUST001',
  customerType: 'Priority',
  productId: 'PROD001',
  quantity: 100,
  promisedDeliveryDate: '2026-09-25',
};

// What the service layer returns internally — PascalCase, as the domain
// model and the SQL columns use. The serializers are what must turn this
// into lowerCamelCase on the wire.
const INTERNAL_PARTIAL_RESULT = {
  OrderId: 'ORD-CAMEL-001',
  Status: PARTIALLY_RELEASED,
  Reason: null,
  ReleasedQuantity: 75,
  BackorderedQuantity: 25,
  Allocations: [
    { WarehouseId: 'WH-A', AllocatedQuantity: 40 },
    { WarehouseId: 'WH-B', AllocatedQuantity: 35 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /orders — request and response field names', () => {
  test('a lowerCamelCase body reaches the service as the PascalCase domain model', async () => {
    fulfilmentService.submitOrder.mockResolvedValue({ result: INTERNAL_PARTIAL_RESULT, wasIdempotentReplay: false });

    await auth(request(app).post('/orders')).send(VALID_ORDER_BODY).expect(201);

    expect(fulfilmentService.submitOrder).toHaveBeenCalledWith({
      OrderId: 'ORD-CAMEL-001',
      CustomerId: 'CUST001',
      CustomerType: 'Priority',
      ProductId: 'PROD001',
      Quantity: 100,
      PromisedDeliveryDate: '2026-09-25',
    });
  });

  test('the response body is entirely lowerCamelCase, including nested allocations', async () => {
    fulfilmentService.submitOrder.mockResolvedValue({ result: INTERNAL_PARTIAL_RESULT, wasIdempotentReplay: false });

    const res = await auth(request(app).post('/orders')).send(VALID_ORDER_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      orderId: 'ORD-CAMEL-001',
      status: 'Partially Released',
      reason: null,
      releasedQuantity: 75,
      backorderedQuantity: 25,
      allocations: [
        { warehouseId: 'WH-A', allocatedQuantity: 40 },
        { warehouseId: 'WH-B', allocatedQuantity: 35 },
      ],
    });
  });

  test('the partial status literal has a space in it', async () => {
    fulfilmentService.submitOrder.mockResolvedValue({ result: INTERNAL_PARTIAL_RESULT, wasIdempotentReplay: false });

    const res = await auth(request(app).post('/orders')).send(VALID_ORDER_BODY);

    expect(res.body.status).toBe('Partially Released');
    expect(res.body.status).not.toBe('PartiallyReleased');
  });

  test('a PascalCase body is rejected as missing every field (the rename is a real break, not an alias)', async () => {
    const res = await auth(request(app).post('/orders')).send({
      OrderId: 'ORD-OLD-001',
      CustomerId: 'CUST001',
      CustomerType: 'Standard',
      ProductId: 'PROD001',
      Quantity: 5,
      PromisedDeliveryDate: '2026-09-25',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual([
      'customerId',
      'customerType',
      'orderId',
      'productId',
      'promisedDeliveryDate',
      'quantity',
    ]);
    expect(fulfilmentService.submitOrder).not.toHaveBeenCalled();
  });

  test('a validation failure reports { errors: [{ field, reason }] } in lowerCamelCase', async () => {
    const res = await auth(request(app).post('/orders')).send({ ...VALID_ORDER_BODY, customerType: 'Gold' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ field: 'customerType', reason: 'must be one of: Standard, Priority' }],
    });
  });

  test('an idempotent replay still returns 200 with the same camelCase shape', async () => {
    fulfilmentService.submitOrder.mockResolvedValue({ result: INTERNAL_PARTIAL_RESULT, wasIdempotentReplay: true });

    const res = await auth(request(app).post('/orders')).send(VALID_ORDER_BODY);

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe('ORD-CAMEL-001');
    expect(res.body.status).toBe('Partially Released');
  });

  test('a Blocked order still serializes reason and an empty allocations array', async () => {
    fulfilmentService.submitOrder.mockResolvedValue({
      result: {
        OrderId: 'ORD-CAMEL-002',
        Status: BLOCKED,
        Reason: 'blocked-credit',
        ReleasedQuantity: 0,
        BackorderedQuantity: 0,
        Allocations: [],
      },
      wasIdempotentReplay: false,
    });

    const res = await auth(request(app).post('/orders')).send(VALID_ORDER_BODY);

    expect(res.body).toEqual({
      orderId: 'ORD-CAMEL-002',
      status: 'Blocked',
      reason: 'blocked-credit',
      releasedQuantity: 0,
      backorderedQuantity: 0,
      allocations: [],
    });
  });
});

describe('GET /orders/{orderId}', () => {
  test('returns the camelCase shape', async () => {
    fulfilmentService.getOrderResult.mockResolvedValue({
      OrderId: 'ORD-CAMEL-003',
      Status: RELEASED,
      Reason: null,
      ReleasedQuantity: 5,
      BackorderedQuantity: 0,
      Allocations: [{ WarehouseId: 'WH-A', AllocatedQuantity: 5 }],
    });

    const res = await auth(request(app).get('/orders/ORD-CAMEL-003'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orderId: 'ORD-CAMEL-003',
      status: 'Released',
      reason: null,
      releasedQuantity: 5,
      backorderedQuantity: 0,
      allocations: [{ warehouseId: 'WH-A', allocatedQuantity: 5 }],
    });
  });

  test('an unknown order -> 404 { orderId, error }', async () => {
    fulfilmentService.getOrderResult.mockRejectedValue(new OrderNotFoundError('ORD9999'));

    const res = await auth(request(app).get('/orders/ORD9999'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ orderId: 'ORD9999', error: 'No order found' });
  });
});

describe('Customer endpoints — Stage 1 routes, renamed fields', () => {
  test('POST /customers accepts and returns lowerCamelCase', async () => {
    customerRepository.create.mockResolvedValue({ CustomerId: 'CUST-X', EligibilityStatus: 'Eligible' });

    const res = await auth(request(app).post('/customers')).send({ customerId: 'CUST-X', eligibilityStatus: 'Eligible' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ customerId: 'CUST-X', eligibilityStatus: 'Eligible' });
    expect(customerRepository.create).toHaveBeenCalledWith({ CustomerId: 'CUST-X', EligibilityStatus: 'Eligible' });
  });

  test('GET /customers returns a list of lowerCamelCase objects', async () => {
    customerRepository.list.mockResolvedValue([
      { CustomerId: 'CUST001', EligibilityStatus: 'Eligible' },
      { CustomerId: 'CUST003', EligibilityStatus: 'CreditHold' },
    ]);

    const res = await auth(request(app).get('/customers'));

    expect(res.body).toEqual([
      { customerId: 'CUST001', eligibilityStatus: 'Eligible' },
      { customerId: 'CUST003', eligibilityStatus: 'CreditHold' },
    ]);
  });

  test('PUT /customers/{customerId} takes eligibilityStatus and echoes it back', async () => {
    customerRepository.findById.mockResolvedValue({ CustomerId: 'CUST001', EligibilityStatus: 'Eligible' });
    customerRepository.update.mockResolvedValue(true);

    const res = await auth(request(app).put('/customers/CUST001')).send({ eligibilityStatus: 'CreditHold' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ customerId: 'CUST001', eligibilityStatus: 'CreditHold' });
    expect(customerRepository.update).toHaveBeenCalledWith('CUST001', { EligibilityStatus: 'CreditHold' });
  });

  test('an invalid eligibilityStatus reports the camelCase field name', async () => {
    const res = await auth(request(app).post('/customers')).send({ customerId: 'CUST-X', eligibilityStatus: 'Active' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('eligibilityStatus');
  });

  test('an unknown customer -> 404 { customerId, error }', async () => {
    customerRepository.findById.mockResolvedValue(null);

    const res = await auth(request(app).get('/customers/NOPE'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ customerId: 'NOPE', error: 'Customer not found' });
    expect(new CustomerNotFoundError('NOPE').customerId).toBe('NOPE');
  });
});

describe('Inventory endpoints — Stage 1 routes, renamed fields', () => {
  const INTERNAL_ROW = {
    ProductId: 'PROD001',
    WarehouseId: 'WH-A',
    AvailableQuantity: 15,
    EarliestDispatchDate: '2026-09-20',
  };

  test('POST /inventory accepts and returns lowerCamelCase', async () => {
    inventoryRepository.create.mockResolvedValue(INTERNAL_ROW);

    const res = await auth(request(app).post('/inventory')).send({
      productId: 'PROD001',
      warehouseId: 'WH-A',
      availableQuantity: 15,
      earliestDispatchDate: '2026-09-20',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      productId: 'PROD001',
      warehouseId: 'WH-A',
      availableQuantity: 15,
      earliestDispatchDate: '2026-09-20',
    });
  });

  test('GET /inventory maps every row to lowerCamelCase', async () => {
    inventoryRepository.listAll.mockResolvedValue([INTERNAL_ROW]);

    const res = await auth(request(app).get('/inventory'));

    expect(res.body).toEqual([
      { productId: 'PROD001', warehouseId: 'WH-A', availableQuantity: 15, earliestDispatchDate: '2026-09-20' },
    ]);
  });

  test('PUT /inventory/{productId}/{warehouseId} takes camelCase and writes PascalCase', async () => {
    inventoryRepository.findByProductAndWarehouse.mockResolvedValue(INTERNAL_ROW);
    inventoryRepository.update.mockResolvedValue(true);

    const res = await auth(request(app).put('/inventory/PROD001/WH-A')).send({
      availableQuantity: 30,
      earliestDispatchDate: '2026-10-01',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      productId: 'PROD001',
      warehouseId: 'WH-A',
      availableQuantity: 30,
      earliestDispatchDate: '2026-10-01',
    });
    expect(inventoryRepository.update).toHaveBeenCalledWith('PROD001', 'WH-A', {
      AvailableQuantity: 30,
      EarliestDispatchDate: '2026-10-01',
    });
  });

  test('an invalid warehouseId reports the camelCase field name', async () => {
    const res = await auth(request(app).post('/inventory')).send({
      productId: 'PROD001',
      warehouseId: 'WH-D',
      availableQuantity: 5,
      earliestDispatchDate: '2026-09-20',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('warehouseId');
  });

  test('an unknown inventory row -> 404 { productId, warehouseId, error }', async () => {
    inventoryRepository.findByProductAndWarehouse.mockResolvedValue(null);

    const res = await auth(request(app).get('/inventory/PROD001/WH-B'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ productId: 'PROD001', warehouseId: 'WH-B', error: 'Inventory not found' });
    expect(new InventoryNotFoundError('PROD001', 'WH-B').warehouseId).toBe('WH-B');
  });
});

describe('Auth failures use the same lowerCamelCase error field', () => {
  test('no token -> 401 { error }', async () => {
    const res = await request(app).get('/orders/ORD-CAMEL-001');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid authorization header' });
  });

  test('a bad token -> 401 { error }', async () => {
    const res = await request(app).get('/orders/ORD-CAMEL-001').set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });
});
