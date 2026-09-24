# Security and Error-Handling Hardening Review

Re-audit of the built application against FRD Sections 27, 28, 58, and 60.
Every item below is backed by either a grep audit shown inline, an automated
test, or an explicit note on what could and couldn't be verified from this
environment — nothing here is marked verified without evidence.

## 1. Every SQL statement is parameterized (FRD Section 60, FR-BE-04)

**Verified.** Every repository query was re-inspected; all 16 `.query(...)`
calls across `backend/src/repositories/*.js` use static SQL text with named
`@Param` placeholders bound via `.input(name, type, value)` — none build SQL
from string concatenation or interpolated variables. Confirmed by a targeted
grep for string-concatenation/interpolation patterns immediately adjacent to
SQL keywords, which returned zero matches.

## 2. No error response leaks internal detail, under any error path (FRD Section 58, FR-SEC-05)

**Verified.** `backend/src/middleware/errorHandler.js` is the single place
any error becomes an HTTP response:

- `ValidationError` → `400` with only `{Field, Reason}` pairs it generated itself.
- `OrderNotFoundError` / `CustomerNotFoundError` → `404` with only the id and a fixed message.
- Any other error carrying `status < 500` → that status, with only `err.message` (always one of *our own* thrown messages — e.g. a Phase 7 conflict — never a raw driver error, since only application code throws errors with a `status` property).
- Everything else → bare `500` with the fixed string `"Internal server error"`; the real error is `console.error`'d server-side only, never serialized into the response.

Backed by `backend/tests/middleware/errorHandler.test.js`, which explicitly
constructs an error whose message contains a fake connection string and
password and asserts the JSON response does not contain either substring.

## 3. Original/shared credentials rotated and absent from the repo and its history (FRD Section 27, FR-SEC-03)

**Partially verified — one part rests on your confirmation, not mine.**

- The FRD's own Document Control note says the *original* requirements-gathering
  `.env` contained real-looking secrets that were deliberately never
  reproduced in the FRD text itself — so there was never a literal value for
  me to grep for from that source.
- You confirmed earlier in this session that those original credentials have
  already been rotated. I have no independent way to verify that from inside
  this repository — it's recorded here as your confirmation, not as
  something I tested.
- The *actual* MOBDB_DEV credentials you gave me later are: **not** present
  anywhere in `.env.example` (checked by reading the file — every DB/JWT
  field is blank), **not** present in git history (`git log --all -p | grep`
  for the literal password/IP/username returned nothing), and live only in
  `backend/.env`, which `git check-ignore` confirms is excluded by
  `.gitignore`.
- Re-checked after committing the full Phase 1-11 implementation (commit
  `9828c72`): `git log --all -p` for the literal password/user/IP/JWT-secret
  values still returns nothing real — the only hits are the README's own
  documentation text naming the host, and `errorHandler.test.js`'s
  deliberately fabricated fake credentials used to prove nothing leaks.
  `.env` has never been tracked at any commit.

## 4. Phase 7 concurrency guarantee holds under more than two simultaneous requests (FRD Section 57)

**Written, not yet verified live — blocked by a real connectivity outage.**
`backend/tests/integration/concurrency.integration.test.js` fires 5
simultaneous `submitOrder()` calls at a single warehouse row holding exactly
enough stock for one of them, and asserts exactly one `Released`, the rest
`Blocked`/`blocked-insufficient-inventory`, `AvailableQuantity` never
negative, and never more than one `InventoryAllocation` row. This test (and
every other live-DB test) could not run to completion: a full `npm test`
run against MOBDB_DEV (`172.16.1.23`) failed on **every single DB-dependent
suite** with `ConnectionError: Failed to connect ... in 20000ms`, sustained
across the entire ~10-minute run (`Test Suites: 8 failed, 8 passed`). This
is a network-reachability outage from this environment, not a code defect —
the same test logic proved correct at the repository level with a live
2-way race in an earlier, successful run this session (before the outage
began). **This item cannot be marked verified until it's re-run against a
reachable instance.**

## 5. Automated test suite (FRD Section 29)

**Split result: unit-level fully verified; live-DB level currently blocked.**

- All 8 pure-logic/mocked unit-test suites pass: `Test Suites: 8 passed`,
  `Tests: 77 passed` — covering every FRD Section 29 scenario 1-10 as pure
  decision-engine logic, idempotency and transactional-rollback logic with
  mocked repositories, every validation rule in FRD 15.1-15.3, and the
  error-handler/auth middleware.
- The live-DB counterparts — `tests/repositories/*`, `tests/integration/*`
  (the 12 FRD scenarios run against real data, the N=5 concurrency test, the
  forced-failure rollback test, and the new CRUD-lifecycle
  uniqueness/referential-integrity tests) — **could not complete** in the
  same run that produced the concurrency result above, for the same
  connectivity-outage reason. Before this outage, in an earlier successful
  run this session, the full repository suite (22 tests) and a live 12-scenario
  order-fulfilment smoke test via `curl` and the browser both passed against
  the same database.
- **Action required before sign-off:** re-run `cd backend && npm test` once
  MOBDB_DEV is reachable, and update this section with the result.

## Checklist summary

| # | Item | Status |
|---|---|---|
| 1 | Parameterized queries only | ✅ Verified (code audit) |
| 2 | No leaked internal detail on any error path | ✅ Verified (code audit + automated test) |
| 3 | Credentials rotated / absent from repo & history | ⚠️ Verified for what's checkable; rotation itself rests on your confirmation |
| 4 | Concurrency holds under N>2 contention | ⚠️ Test written; blocked by live connectivity outage — not yet run to completion |
| 5 | Full automated test suite passes | ⚠️ Unit tests (77) verified passing; live-DB tests blocked by the same outage |
