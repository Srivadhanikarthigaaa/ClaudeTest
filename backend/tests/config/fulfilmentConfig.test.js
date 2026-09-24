// CHANGE1 requirement 2 — the threshold is read from configuration, has a
// documented default, and refuses nonsense rather than silently falling back.
const {
  getPartialReleaseThresholdPercent,
  DEFAULT_PARTIAL_RELEASE_THRESHOLD_PERCENT,
} = require('../../src/config/fulfilmentConfig');

const VARIABLE = 'PARTIAL_RELEASE_THRESHOLD_PERCENT';
let original;

beforeEach(() => {
  original = process.env[VARIABLE];
});

afterEach(() => {
  if (original === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = original;
});

describe('getPartialReleaseThresholdPercent', () => {
  test('defaults to 70 when the variable is unset', () => {
    delete process.env[VARIABLE];
    expect(getPartialReleaseThresholdPercent()).toBe(70);
    expect(DEFAULT_PARTIAL_RELEASE_THRESHOLD_PERCENT).toBe(70);
  });

  test('defaults to 70 when the variable is set but empty or blank', () => {
    process.env[VARIABLE] = '';
    expect(getPartialReleaseThresholdPercent()).toBe(70);
    process.env[VARIABLE] = '   ';
    expect(getPartialReleaseThresholdPercent()).toBe(70);
  });

  test('reads a configured whole-number percentage', () => {
    process.env[VARIABLE] = '85';
    expect(getPartialReleaseThresholdPercent()).toBe(85);
  });

  test('reads a configured fractional percentage', () => {
    process.env[VARIABLE] = '66.5';
    expect(getPartialReleaseThresholdPercent()).toBe(66.5);
  });

  test('accepts the 0 and 100 endpoints', () => {
    process.env[VARIABLE] = '0';
    expect(getPartialReleaseThresholdPercent()).toBe(0);
    process.env[VARIABLE] = '100';
    expect(getPartialReleaseThresholdPercent()).toBe(100);
  });

  test('is re-read on every call, so a change takes effect without a reload', () => {
    process.env[VARIABLE] = '40';
    expect(getPartialReleaseThresholdPercent()).toBe(40);
    process.env[VARIABLE] = '90';
    expect(getPartialReleaseThresholdPercent()).toBe(90);
  });

  test.each(['abc', '-1', '101', 'NaN'])('rejects %p rather than silently defaulting', (value) => {
    process.env[VARIABLE] = value;
    expect(() => getPartialReleaseThresholdPercent()).toThrow(/PARTIAL_RELEASE_THRESHOLD_PERCENT/);
  });
});
