const { required, isType, isPositive, isOneOf, isISODate } = require('../../src/validators/rules');

describe('required', () => {
  test.each([undefined, null, ''])('rejects %p', (value) => {
    expect(required(value)).toBe('is required');
  });

  test('accepts a non-empty value', () => {
    expect(required('x')).toBeNull();
  });
});

describe('isType', () => {
  test('string: accepts strings, rejects others', () => {
    const rule = isType('string');
    expect(rule('abc')).toBeNull();
    expect(rule(123)).toBe('must be a string');
    expect(rule(true)).toBe('must be a string');
  });

  test('integer: accepts integers, rejects non-integers', () => {
    const rule = isType('integer');
    expect(rule(5)).toBeNull();
    expect(rule(0)).toBeNull();
    expect(rule(-3)).toBeNull();
    expect(rule(5.5)).toBe('must be an integer');
    expect(rule('5')).toBe('must be an integer');
  });

  test('skips undefined/null (required owns presence)', () => {
    expect(isType('string')(undefined)).toBeNull();
    expect(isType('integer')(null)).toBeNull();
  });
});

describe('isPositive', () => {
  test('rejects zero and negative', () => {
    expect(isPositive(0)).toBe('must be greater than 0');
    expect(isPositive(-1)).toBe('must be greater than 0');
  });

  test('accepts positive numbers', () => {
    expect(isPositive(1)).toBeNull();
  });
});

describe('isOneOf', () => {
  const rule = isOneOf(['Standard', 'Priority']);

  test('is case-sensitive and rejects values outside the enum', () => {
    expect(rule('standard')).toMatch(/must be one of/);
    expect(rule('VIP')).toMatch(/must be one of/);
  });

  test('accepts an exact literal match', () => {
    expect(rule('Standard')).toBeNull();
  });
});

describe('isISODate', () => {
  test('accepts a valid YYYY-MM-DD date', () => {
    expect(isISODate('2026-09-25')).toBeNull();
  });

  test('rejects DD-MM-YYYY', () => {
    expect(isISODate('25-09-2026')).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects MM-DD-YYYY', () => {
    expect(isISODate('09-25-2026')).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects a non-zero-padded date', () => {
    expect(isISODate('2026-9-25')).toBe('must match YYYY-MM-DD exactly');
  });

  test('rejects an out-of-range month', () => {
    expect(isISODate('2026-13-01')).toBe('must be a valid calendar date');
  });

  test('rejects a calendar-invalid day (Feb 30)', () => {
    expect(isISODate('2026-02-30')).toBe('must be a valid calendar date');
  });

  test('rejects Feb 29 in a non-leap year', () => {
    expect(isISODate('2026-02-29')).toBe('must be a valid calendar date');
  });

  test('accepts Feb 29 in a leap year', () => {
    expect(isISODate('2024-02-29')).toBeNull();
  });

  test('rejects a non-string value', () => {
    expect(isISODate(20260925)).toBe('must be a string in YYYY-MM-DD format');
  });
});
