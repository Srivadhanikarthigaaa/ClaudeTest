// Runs a { field: [rule, ...] } schema against a payload and collects one
// error per invalid field (first failing rule for that field), so callers
// can report every bad field at once (FR-UX-02) rather than failing fast.
function validateFields(payload, schema) {
  const errors = [];
  const source = payload || {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = source[field];
    for (const rule of rules) {
      const reason = rule(value);
      if (reason) {
        errors.push({ field, reason });
        break;
      }
    }
  }

  return errors;
}

module.exports = validateFields;
