// The three fulfilment status literals, in exactly the spelling the API and
// the database both use. CHANGE1 renamed the partial status from
// "PartiallyReleased" to "Partially Released" (with a space) — it is defined
// here once so the decision engine, the persistence layer, the HTTP
// serializers and the tests can never drift apart on it.
module.exports = {
  RELEASED: 'Released',
  PARTIALLY_RELEASED: 'Partially Released',
  BLOCKED: 'Blocked',
};
