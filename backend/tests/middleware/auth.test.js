const jwt = require('jsonwebtoken');

const TEST_SECRET = 'unit-test-secret';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth (FR-AUTH-01/02)', () => {
  let requireAuth;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    jest.resetModules();
    requireAuth = require('../../src/middleware/auth');
  });

  test('rejects a request with no Authorization header (401)', () => {
    const res = mockRes();
    const next = jest.fn();
    requireAuth({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a malformed Authorization header (401)', () => {
    const res = mockRes();
    const next = jest.fn();
    requireAuth({ headers: { authorization: 'NotBearer abc' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an expired token (401)', () => {
    const expired = jwt.sign({ sub: 'test-user' }, TEST_SECRET, { expiresIn: -10 });
    const res = mockRes();
    const next = jest.fn();
    requireAuth({ headers: { authorization: `Bearer ${expired}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a token signed with the wrong secret (401)', () => {
    const wrongSecret = jwt.sign({ sub: 'test-user' }, 'not-the-configured-secret');
    const res = mockRes();
    const next = jest.fn();
    requireAuth({ headers: { authorization: `Bearer ${wrongSecret}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a valid token and calls next()', () => {
    const valid = jwt.sign({ sub: 'test-user' }, TEST_SECRET, { expiresIn: '8h' });
    const res = mockRes();
    const next = jest.fn();
    const req = { headers: { authorization: `Bearer ${valid}` } };
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user.sub).toBe('test-user');
  });
});
