// FRD Section 28 (Error Handling), Section 58, FR-SEC-05 — the one place
// that maps every error this API can throw to its HTTP status and body, so
// no controller builds its own error response and no internal detail (SQL
// errors, stack traces, connection strings, credentials) ever reaches a client.
// Must be registered with app.use(...) AFTER all routes.
// CHANGE1 requirement 1: every field name in every error body below is
// lowerCamelCase, matching the success responses.
function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      errors: err.errors.map(({ field, reason }) => ({ field, reason })),
    });
  }

  // FRD Section 9.5/34 — exact shape for an unknown orderId.
  if (err.name === 'OrderNotFoundError') {
    return res.status(404).json({ orderId: err.orderId, error: 'No order found' });
  }

  // FRD Section 30 item 1 (open question): proposed 404 default for a
  // customerId that doesn't exist at all. Shape is inferred, not FRD-dictated.
  if (err.name === 'CustomerNotFoundError') {
    return res.status(404).json({ customerId: err.customerId, error: 'Customer not found' });
  }

  // FRD Section 22.3 (inferred contract, Section 30 item 10).
  if (err.name === 'InventoryNotFoundError') {
    return res.status(404).json({ productId: err.productId, warehouseId: err.warehouseId, error: 'Inventory not found' });
  }

  // FRD Section 28: "Duplicate-key or concurrent processing conflict -> 409".
  // 2627/2601 are SQL Server's own error numbers for a PK/unique-constraint
  // violation — detected here, not in each controller, so the mapping from
  // "raw DB error" to "safe client response" lives in exactly one place.
  const DUPLICATE_KEY_SQL_ERROR_NUMBERS = [2627, 2601];
  if (DUPLICATE_KEY_SQL_ERROR_NUMBERS.includes(err.number)) {
    return res.status(409).json({ error: 'A record with that key already exists' });
  }

  // Any other error the service tagged with a client-facing status (e.g. a
  // Phase 7 allocation-race conflict) — message is always one of ours,
  // never a raw DB error.
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // FRD 28's key principle: a technical failure is never persisted as
  // Blocked and never leaks detail — it surfaces as a bare 500.
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
