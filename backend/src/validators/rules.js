// Reusable, composable field-rule primitives (FRD Section 15).
// Each rule is a function (value) => reason:string|null. A rule that finds
// the field absent has nothing to say — `required` alone owns that case —
// so every other rule returns null for undefined/null and lets validation
// move on to the next field.

function required(value) {
  if (value === undefined || value === null || value === '') return 'is required';
  return null;
}

function isType(type) {
  return (value) => {
    if (value === undefined || value === null) return null;
    if (type === 'string') return typeof value === 'string' ? null : 'must be a string';
    if (type === 'integer') {
      return typeof value === 'number' && Number.isInteger(value) ? null : 'must be an integer';
    }
    throw new Error(`Unknown type rule: ${type}`);
  };
}

function isPositive(value) {
  if (value === undefined || value === null) return null;
  return value > 0 ? null : 'must be greater than 0';
}

function isOneOf(allowedValues) {
  return (value) => {
    if (value === undefined || value === null) return null;
    return allowedValues.includes(value)
      ? null
      : `must be one of: ${allowedValues.join(', ')}`;
  };
}

// Strict YYYY-MM-DD: rejects DD-MM-YYYY/MM-DD-YYYY (wrong pattern) and
// calendar-invalid dates (e.g. 2026-02-30) by round-tripping through Date.
function isISODate(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'must be a string in YYYY-MM-DD format';

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'must match YYYY-MM-DD exactly';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return 'must be a valid calendar date';

  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return roundTrips ? null : 'must be a valid calendar date';
}

module.exports = { required, isType, isPositive, isOneOf, isISODate };
