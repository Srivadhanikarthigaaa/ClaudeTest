const errorHandler = require('../../src/middleware/errorHandler');
const ValidationError = require('../../src/validators/ValidationError');
const { CustomerNotFoundError, OrderNotFoundError } = require('../../src/services/errors');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler (FRD Section 28/58, FR-SEC-05)', () => {
  // CHANGE1 requirement 1: every error body field is lowerCamelCase.
  test('ValidationError -> 400 with field/reason shape', () => {
    const res = mockRes();
    const err = new ValidationError([{ field: 'quantity', reason: 'must be greater than 0' }]);
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ errors: [{ field: 'quantity', reason: 'must be greater than 0' }] });
  });

  test('OrderNotFoundError -> exact 404 shape from FRD Section 34', () => {
    const res = mockRes();
    errorHandler(new OrderNotFoundError('ORD9999'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ orderId: 'ORD9999', error: 'No order found' });
  });

  test('CustomerNotFoundError -> 404 with customerId shape', () => {
    const res = mockRes();
    errorHandler(new CustomerNotFoundError('CUSTX'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ customerId: 'CUSTX', error: 'Customer not found' });
  });

  test('a tagged client error (e.g. 409 conflict) uses its own status and message', () => {
    const res = mockRes();
    const err = new Error('Lost the allocation race');
    err.status = 409;
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Lost the allocation race' });
  });

  test('an unhandled error -> 500 with no internal detail leaked', () => {
    const res = mockRes();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('RequestError: connection string is server=172.16.1.23;password=secret');
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    const jsonArg = res.json.mock.calls[0][0];
    expect(JSON.stringify(jsonArg)).not.toMatch(/172\.16\.1\.23|password/);
    consoleSpy.mockRestore();
  });
});
