# CHANGE1 — Priority fulfilment, configurable threshold, lowerCamelCase API

This document is the submission record for CHANGE1, applied on top of the
Stage 1 solution (phases 0-11, see [CONTINUATION.md](../CONTINUATION.md)).
It covers what changed, the two assumptions that were resolved here rather
than in the change document, the migration and test evidence, and the working
artifacts.

Read this alongside [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), which records the
Stage 1 open items — none of them were reopened by this change.

---

## 1. Summary of changes

| # | Requirement | Where it landed |
|---|---|---|
| 1 | lowerCamelCase API fields; `"Partially Released"` status literal | `backend/src/api/serializers.js` (new), all validators, controllers, routes, `middleware/errorHandler.js`, `middleware/auth.js`, `backend/src/services/statuses.js` (new), the whole frontend |
| 2 | Threshold moved to configuration | `backend/src/config/fulfilmentConfig.js` (new), `PARTIAL_RELEASE_THRESHOLD_PERCENT` in `.env.example` |
| 3 | `Backorder` table; multiple allocations per order | `database/schema/003_change1_backorder_and_multi_allocation.sql` (new), `backend/src/repositories/backorderRepository.js` (new) |
| 4 | Priority fulfilment logic | `backend/src/services/fulfilmentDecisionEngine.js`, `backend/src/services/fulfilmentService.js` |
| 5 | Idempotency across all three statuses | `fulfilmentService.submitOrder` (unchanged mechanism), plus `UQ_Backorder_OrderId` / `UQ_InventoryAllocation_Order_Warehouse` as database-level backstops |
| 6 | Tests | `backend/tests/` — see section 5 |
| 7 | Documentation & submission | this file, `README.md`, `database/README.md`, the `CHANGE1` git tag |

### 1.1 Field naming

Every request field, response field, path parameter and error-body field on
every endpoint — the pre-existing Stage 1 Customer/Inventory/Order endpoints
included, not just the new Priority path — is now lowerCamelCase.

The rename is a clean break, not an aliasing layer: a Stage 1 PascalCase body
is now rejected with a 400 naming all six missing fields. That is asserted
directly in `tests/api/fieldNaming.test.js`, so the break is deliberate and
visible rather than something a caller discovers in production.

**The internal domain model and the repositories keep PascalCase**, because
PascalCase is what the SQL Server columns are actually called
(`Customer.CustomerId`, `Inventory.AvailableQuantity`, ...). The two
conventions meet at exactly one seam, `backend/src/api/serializers.js`. The
alternative — renaming internals too — would still need a mapping at the
database edge, just spread across every repository instead of concentrated in
one file.

The mappings there are written out field by field rather than produced by a
generic case-converting helper, so no *value* (`WH-A`, `Partially Released`,
`blocked-credit`) can ever be rewritten by accident, and the file reads as the
API contract itself.

### 1.2 Threshold configuration

`PARTIAL_RELEASE_THRESHOLD_PERCENT` (default `70`) is read through
`getPartialReleaseThresholdPercent()` on every decision, not captured at
module load, so changing it needs no code change and no restart-time snapshot.

It is a whole-number percentage rather than a fraction because the comparison
is done in integer arithmetic:

```js
available * 100 >= requested * thresholdPercent
```

That keeps the exact-boundary case exact. `70 * 100 >= 100 * 70` is
`7000 >= 7000`, true, with no floating-point rounding anywhere near it — which
is what makes the "exactly 70% is Partially Released" test a real test rather
than a test of `Number` behaviour.

A value outside 0-100, or a non-number, throws rather than silently falling
back to the default: a misconfigured threshold changes the outcome of every
Priority order, so it should fail loudly.

### 1.3 Priority fulfilment

For a `Priority` order, after the eligibility check that Stage 1 already
applied:

1. Walk `WH-A -> WH-B -> WH-C` in that fixed order.
2. Skip any warehouse whose `earliestDispatchDate` is later than the order's
   `promisedDeliveryDate` (see assumption A1 below).
3. Take from each remaining warehouse the smaller of its available quantity
   and the quantity still outstanding.

Then:

| Combined date-feasible availability | Outcome |
|---|---|
| ≥ 100% of requested | `Released`, allocated across warehouses in priority order, **no backorder** (assumption A2) |
| ≥ threshold and < 100% | `Partially Released`, allocate what is available, **exactly one** `Open` backorder for the remainder |
| < threshold | `Blocked`, no allocation, no backorder |

**Never more than requested.** The planner carries a `remaining` counter that
caps every warehouse's contribution and stops the walk at zero, so the sum of
allocations is structurally incapable of exceeding the requested quantity,
regardless of how much stock exists. `tests/services/priorityFulfilment.test.js`
asserts this across stock levels from 0 to 10,000.

**Standard customers are untouched.** A Standard order's full quantity must
still come from a single warehouse, `WH-A -> WH-B -> WH-C`, exactly as Stage 1
built it — `decideStandard()` is the Stage 1 function, moved but not modified.
A regression test submits the *same* inventory as both customer types and
asserts the Priority order partially releases while the Standard one blocks.

### 1.4 Concurrency

The Standard path locks warehouses one at a time and stops at the first that
qualifies. The Priority path cannot: the combined total has to be known before
any outcome is known, so it locks all three rows first — still in
`WH-A -> WH-B -> WH-C` order, the same order the Standard path takes them in,
so the two paths cannot deadlock against each other — and only then computes
and applies the plan.

Because every row the plan draws from is already held under `UPDLOCK,
HOLDLOCK` when the plan is computed, a failed decrement there is not a lost
race but a broken invariant. It aborts the transaction rather than silently
releasing less than the plan said.

---

## 2. Flagged assumptions

Both of these were resolved here, by the implementer. **Neither is stated in
the change document.** They are called out in the code at the point they take
effect as well as here.

### A1 — Date feasibility still gates a warehouse's contribution

*The change document restates the quantity rules for Priority orders but says
nothing about `earliestDispatchDate`.*

**Resolved as:** a warehouse that cannot dispatch by the order's
`promisedDeliveryDate` contributes zero to the Priority total — it is skipped
exactly as it would have been skipped for a Standard order.

**Why:** Stage 1 (FRD Section 20) established date feasibility as a hard gate,
and nothing in the change document withdraws it. Dropping it would mean a
Priority order could be "Released" against stock that demonstrably cannot
arrive on time, which is a larger behavioural change than the document asks
for. Silence is read as "unchanged", not as "removed".

**If this is wrong,** the fix is one function: `dateFeasible()` in
`fulfilmentDecisionEngine.js`. Nothing else keys off the date.

### A2 — ≥ 100% available is `Released`, with no backorder row

*The change document specifies the ≥ 70%-and-< 100% and < 70% cases
explicitly, and describes the ≥ 100% case only as "full allocation".*

**Resolved as:** `Released`, with no `Backorder` row written at all.

**Why:** the alternatives are to report `Partially Released` for an order that
is fully covered, or to write an `Open` backorder for zero units. The first
misreports the outcome; the second leaves a permanently open backorder with
nothing outstanding in it, which any downstream backorder process would have
to special-case. This reading is also consistent with Stage 1, where a fully
covered order is `Released`.

**This assumption is enforced at the database, not just in code:**
`CK_Backorder_BackorderedQuantity CHECK (BackorderedQuantity > 0)` makes a
zero-quantity backorder impossible to write.

---

## 3. Database migration

`database/schema/003_change1_backorder_and_multi_allocation.sql`, run after
`001` and `002`. Additive and idempotent like the rest of the folder; it
deletes no data.

1. **Multi-allocation.** Drops `UQ_InventoryAllocation_OrderId` ("at most one
   allocation per order") and replaces it with
   `UQ_InventoryAllocation_Order_Warehouse` ("at most one allocation per order
   *per warehouse*"). An order can now span warehouses, but a duplicate
   insert for the same warehouse still fails at the database — which is the
   protection the old constraint was really providing.
2. **Status literal.** Replaces `CK_FulfilmentResult_Status` so it accepts
   `'Partially Released'` instead of `'PartiallyReleased'`. No data migration
   is needed: Stage 1 never produced that value, since a Standard order is
   only ever `Released` or `Blocked`. `Status` is `VARCHAR(20)` and
   `'Partially Released'` is 19 characters, so the column is unchanged.
   `CK_FulfilmentResult_Reason` already keys off `Status = 'Blocked'` only, so
   a `Partially Released` row with a null reason satisfies it untouched.
3. **`dbo.Backorder`.** `BackorderId` (system-generated `UNIQUEIDENTIFIER`,
   the same implementation choice already made for
   `InventoryAllocation.AllocationId`), `OrderId`, `ProductId`,
   `BackorderedQuantity`, `Status` defaulting to `'Open'`. Plus two
   constraints that turn CHANGE1's own rules into database invariants:
   `UQ_Backorder_OrderId` (exactly one backorder per order — so an idempotent
   replay physically cannot create a second) and
   `CK_Backorder_BackorderedQuantity CHECK (> 0)` (assumption A2, enforced).

`Status` is constrained to `'Open'` alone, because that is the only value the
change document defines. Widening it later is a deliberate migration, not
something to pre-empt.

---

## 4. Idempotency

The mechanism is Stage 1's and is unchanged: `submitOrder` looks for a
persisted `FulfilmentResult` for the `orderId` first and, if one exists,
returns it without ever entering the decision engine. Because the engine is
never re-entered, no allocation row, backorder row or stock decrement can
happen a second time, whatever the stored status is.

What CHANGE1 added:

- `inventoryAllocationRepository.findByOrderId` now has an explicit
  `ORDER BY WarehouseId`. With multiple allocation rows per order, an
  unordered `SELECT` could return them in a different order on a replay, so
  "reuse the persisted result **exactly**" would not have held. `WarehouseId`
  sorts `WH-A, WH-B, WH-C`, i.e. the order the allocations were planned in.
- `UQ_Backorder_OrderId` and `UQ_InventoryAllocation_Order_Warehouse` as
  database-level backstops, so a duplicate write fails loudly even if it ever
  reached the database by some path other than `submitOrder`.

Replay is tested for all three statuses twice over: with mocks
(`tests/services/fulfilmentServicePriority.test.js`) and against the live
database (`tests/integration/priorityFulfilment.e2e.test.js`).

---

## 5. Test evidence

### New suites

| File | Covers | DB needed |
|---|---|---|
| `tests/services/priorityFulfilment.test.js` | worked example; exact-70% boundary; just-under; ≥100% combined; never-exceed-requested; date gating (A1); threshold-is-configurable; Standard unaffected | no |
| `tests/config/fulfilmentConfig.test.js` | default, override, re-read-per-call, invalid-value rejection | no |
| `tests/services/fulfilmentServicePriority.test.js` | multi-warehouse decrements; one `Open` backorder; no backorder when Released or Blocked; lock ordering; abort on failed decrement; idempotent replay per status | no |
| `tests/api/fieldNaming.test.js` | lowerCamelCase request/response/error fields on every endpoint; `"Partially Released"` literal; PascalCase body now rejected | no |
| `tests/repositories/backorderRepository.test.js` | `Backorder` persistence, `Open` default, one-per-order constraint | yes |
| `tests/integration/priorityFulfilment.e2e.test.js` | every Priority scenario and every idempotent replay, against MOBDB_DEV | yes |

### Stage 1 regression

Every Stage 1 suite was kept and re-run under the renamed fields:

- `tests/services/fulfilmentDecisionEngine.test.js` (FRD Section 29 Tests
  1-10) — **unchanged, passes as written.** These call the pure engine with
  the internal model, which the rename did not touch, so they are a genuine
  untouched regression check on the Standard rules.
- `tests/services/fulfilmentService.test.js` — unchanged, passes.
- `tests/validators/*`, `tests/middleware/errorHandler.test.js` — field names
  updated to lowerCamelCase; assertions otherwise identical.
- `tests/middleware/auth.test.js`, `tests/validators/rules.test.js` —
  unchanged.
- `tests/integration/customerApi`, `inventoryApi` — bodies and assertions
  updated to lowerCamelCase; scenarios identical.
- `tests/integration/orderFulfilment.e2e.test.js` (FRD Section 29 Tests 1-12),
  `concurrency`, `transactionalConsistency` — unchanged.
- `tests/repositories/inventoryAllocationRepository.test.js` — one test
  changed on purpose: the case that asserted "a second allocation for the same
  order is rejected" now asserts the CHANGE1 rule instead (a second allocation
  for a *different* warehouse is allowed; for the *same* warehouse still
  rejected). This is the one Stage 1 assertion CHANGE1 deliberately
  invalidates, and it is called out rather than quietly deleted.

### One pre-existing Stage 1 test defect, found and fixed

`tests/repositories/inventoryRepository.test.js` has a case asserting that
seeded `PROD001` holds exactly 20 units in each of `WH-A`, `WH-B`, `WH-C`.
**This was already failing against the live database before CHANGE1** — it is
not a regression this change introduced, and the file was untouched by the
rename (`git diff 8155253 HEAD -- backend/tests/repositories/inventoryRepository.test.js`
is empty).

The cause: `PROD001` is shared, live inventory, and every released order
against it permanently decrements a row. Stage 1's own manual live
verification did exactly that — `ORD-LIVE-001` (5 units) and `ORD-UI-TEST-001`
(3 units) are both still in `dbo.[Order]`, and together they took `WH-A` from
20 to 12. The assertion was pinned to a value that Stage 1 itself had already
consumed, and would have kept drifting with every future live run.

The test now asserts what its name says — that `findAllByProduct()` returns a
row for each of the three warehouses — and leaves exact quantities to the
suites that own their own `TESTPROD-*` rows and can control them. The intent
of the test is preserved; only the brittle coupling to mutable shared state is
removed. Flagged here rather than quietly rewritten.

Run them with:

```bash
cd backend
npx jest tests/validators tests/services tests/middleware tests/config tests/api   # no DB needed
npx jest --runInBand                                                               # everything, needs MOBDB_DEV
```

### Recorded run results

**Offline (12 suites, 140 tests): all pass, repeatably, in a single run.** This
is the whole of the field-naming contract, the threshold configuration, the
Priority decision rules, the mocked Priority service behaviour, and the Stage
1 unit/validator/middleware regression.

**Live-DB (12 suites, 72 tests): every suite has passed against MOBDB_DEV, but
not all in the same run.** The host link (`172.16.1.23:1433`) drops for minutes
at a stretch in this environment — the pre-existing condition CONTINUATION.md
documents — so each attempt loses a different, arbitrary subset of suites to
`ETIMEOUT` before they can connect. Results across attempts:

| Attempt | Passed | Failed | Nature of failures |
|---|---|---|---|
| 1 (all 24 suites) | 12 offline | 12 live | every live suite `ETIMEOUT`; link was down |
| 2 (live only) | 7 | 5 | 4 `ETIMEOUT`, 1 real — the pre-existing `inventoryRepository` seed-quantity defect described above |
| 3 (`backorderRepository` + `priorityFulfilment.e2e`) | 2 (14 tests) | 0 | — |
| 4 (live only, after the fix) | 8 | 4 | `ETIMEOUT` |
| 5 (just attempt 4's 4 failures) | 0 | 4 | all 13 tests `ETIMEOUT`, **no assertion failures at all** — link was down again |

Attempt 5 is the clearest single piece of evidence that the residual failures
are environmental: all four suites had already passed in attempt 2, and when
re-run in isolation every one of their 13 tests failed on
`ConnectionError: Failed to connect to 172.16.1.23:1433 in 20000ms` with not a
single assertion reached.

Taking the union of attempts 2-4, all 12 live suites have passed — including
`orderFulfilment.e2e.test.js` (FRD Section 29 Tests 1-12, the Stage 1
regression, unmodified), `concurrency`, `transactionalConsistency`, both
renamed API integration suites, and both new CHANGE1 suites.

**No live failure other than the `inventoryRepository` one was a test or code
failure** — all the rest are connection timeouts, identifiable by
`ConnectionError: Failed to connect to 172.16.1.23:1433 in 20000ms` and by the
suite failing wholesale rather than on an assertion. Re-run on a stable link
and they pass. If you are reproducing this and a live suite fails, check for
that error text before looking at the code.

---

## 6. Working artifacts

- **Git checkpoint:** tag `CHANGE1`, on `main`.
- **Commits:** the source change, then tests and documentation, so the diff of
  behaviour is separable from the diff of evidence.
- **AI interaction:** this change was implemented in a single Claude Code
  session working from the change document and the Stage 1 repository. The
  session was given the change document verbatim and the standing instruction
  not to alter existing functionality; the two assumptions in section 2 above
  are the points where the document under-specified and a decision had to be
  made rather than looked up. Both were resolved toward "keep Stage 1's
  behaviour unless the document overrides it", and both are reversible in one
  place. The prior session's handover notes are in
  [CONTINUATION.md](../CONTINUATION.md).
- **Environment note, unchanged from Stage 1:** connectivity from this
  development environment to the MOBDB_DEV host has been intermittent. A
  live-DB test failing with a connection timeout is very likely the network,
  not a code defect — retry before debugging.
