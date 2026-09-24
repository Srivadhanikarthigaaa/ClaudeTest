// Consistent 400 shape every validator in this module produces, so Phase 8's
// error-handling middleware has exactly one shape to translate into a response,
// regardless of which endpoint/validator raised it.
// `errors` is [{ field, reason }, ...] — field name plus why it failed.
class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.status = 400;
    this.errors = errors;
  }
}

module.exports = ValidationError;
