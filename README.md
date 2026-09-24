# Order Fulfilment Application

**Picking this up in a new session? Read [CONTINUATION.md](CONTINUATION.md) first** —
it has the current build status, environment quirks, and decisions already made.

A three-tier app (React frontend, Node.js/Express backend, SQL Server database)
that decides whether a customer's order can be released,
per the [Functional Requirements Document](docs/Functional%20Requirements%20Document.txt) (FRD)
and the CHANGE1 change document (see [docs/CHANGE1.md](docs/CHANGE1.md)).

- A **Standard** order's full quantity must come from a *single* warehouse
  (`WH-A` → `WH-B` → `WH-C`, first that qualifies).
- A **Priority** order may draw from *several* warehouses in that same
  priority order, and is partially released with a backorder when it can only
  be partly covered.

**API fields are lowerCamelCase** (`orderId`, `releasedQuantity`,
`allocations[].warehouseId`, …) and the partial status literal is
`"Partially Released"`, with a space. This changed in CHANGE1 — Stage 1's
PascalCase field names are no longer accepted.

**A note on the database name:** the FRD's own narrative refers to a database
called `M08935_OrderFulfilment`. This project's actual implementation
environment targets a different, pre-existing database, **`MOBDB_DEV`** — see
[database/README.md](database/README.md) for why, and for the schema/seed
scripts, which all target `MOBDB_DEV`. Nothing here creates or uses a database
named `M08935_OrderFulfilment`.

## Structure

- `frontend/` — React app (Vite): order submission form + fulfilment result display.
- `backend/` — Node.js/Express API: `src/{routes,controllers,services,repositories,validators,middleware,database}`, `tests/`.
- `database/` — SQL Server `schema/`, `stored-procedures/`, `seed/` for MOBDB_DEV.
- `docs/` — the FRD.

## Prerequisites

- Node.js 18+ and npm.
- Network access to a SQL Server instance with the `MOBDB_DEV` database (or an
  equivalent instance you point the same schema/seed scripts at).
- A SQL Server client for running the schema/seed scripts by hand (`sqlcmd`,
  SSMS, or Azure Data Studio) — none of these are bundled here.

## 1. Database setup

See [database/README.md](database/README.md) for full detail. Summary:

```bash
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/schema/000_create_database.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/schema/001_create_tables.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/schema/002_fix_inventory_available_quantity_constraint.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/schema/003_change1_backorder_and_multi_allocation.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/seed/001_seed_data.sql
```

Script `003` is the CHANGE1 migration: it adds the `Backorder` table, allows
an order to hold more than one allocation row, and widens the status check
constraint to `'Partially Released'`. Run it in order, after `002`.

All five scripts are additive/idempotent — safe to re-run, and safe against a
database that already has unrelated objects in it (see database/README.md for
exactly what each one does and doesn't touch).

## 2. Environment setup

Copy the placeholder template to a real, **never-committed** `.env` inside
`backend/` (not the repo root):

```bash
cp .env.example backend/.env
```

Then fill in `backend/.env`:

| Key | Meaning |
|---|---|
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MOBDB_DEV connection details |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` for this environment's self-signed/internal cert |
| `PORT` | backend listen port (`4000` in this environment) |
| `CORS_ORIGIN` | frontend origin (`http://localhost:5173` for the Vite dev server) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | see Authentication below |
| `ALLOW_OVERALLOCATION` | reserved; not currently read by any code path |
| `PARTIAL_RELEASE_THRESHOLD_PERCENT` | CHANGE1 partial-release threshold for **Priority** orders, as a whole-number percentage. Defaults to `70` when unset. Must be 0-100 — anything else makes the backend throw rather than silently default. |

**Never commit `backend/.env`.** It's already covered by the root `.gitignore`'s
`.env` pattern. Any real secret shared in plain text (chat, email, a shared
document) during requirements gathering should be treated as compromised and
rotated before use (FRD Section 27, FR-SEC-03).

## 3. Backend

```bash
cd backend
npm install
npm run dev      # nodemon, or: npm start
```

Health check: `GET http://localhost:4000/health` → `{"status":"ok"}` (no auth required).

## 4. Frontend

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Paste a valid JWT (see below) into the "API Token" field before submitting an order —
every other route requires it.

## 5. Authentication

Every route except `/health` requires `Authorization: Bearer <token>`, verified
against `JWT_SECRET` (FR-AUTH-01/02). **There is no login/token-issuance
endpoint** — this is an explicitly open item (FRD Section 30 #6; see
[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)). For local testing, mint a
token with the same secret as `backend/.env`:

```bash
node -e "require('dotenv').config({path:'backend/.env'}); console.log(require('jsonwebtoken').sign({sub:'test-user'}, process.env.JWT_SECRET, {expiresIn: process.env.JWT_EXPIRES_IN}))"
```

## 6. API

All field names are lowerCamelCase, on requests, responses and error bodies
alike. The three status literals are `"Released"`, `"Partially Released"` and
`"Blocked"`.

### `POST /orders`

Request:

```json
{
  "orderId": "ORD-LIVE-001",
  "customerId": "CUST001",
  "customerType": "Standard",
  "productId": "PROD001",
  "quantity": 5,
  "promisedDeliveryDate": "2026-09-25"
}
```

`customerType` is `"Standard"` or `"Priority"` and decides which fulfilment
rule applies (see [Fulfilment rules](#7-fulfilment-rules) below).

Response — `201 Created` on first submission:

```json
{
  "orderId": "ORD-LIVE-001",
  "status": "Released",
  "reason": null,
  "releasedQuantity": 5,
  "backorderedQuantity": 0,
  "allocations": [{ "warehouseId": "WH-A", "allocatedQuantity": 5 }]
}
```

Resubmitting the same `orderId` returns the identical body with `200 OK`
instead (idempotent replay — FRD Section 30 #9, this project's chosen
resolution). This holds for every status, including `"Partially Released"`:
the stored result is reused exactly, and no duplicate allocation or backorder
is created.

Priority partial release — a `Priority` order for 100 units with `WH-A` = 40,
`WH-B` = 35, `WH-C` = 0 available and dispatchable in time:

```json
{
  "orderId": "ORD-LIVE-003",
  "status": "Partially Released",
  "reason": null,
  "releasedQuantity": 75,
  "backorderedQuantity": 25,
  "allocations": [
    { "warehouseId": "WH-A", "allocatedQuantity": 40 },
    { "warehouseId": "WH-B", "allocatedQuantity": 35 }
  ]
}
```

A single `Open` backorder row for the 25 outstanding units is persisted with
the order. Backorders are not currently exposed on any endpoint — the change
document does not define one, and `backorderedQuantity` above is the API's
view of it.

Blocked example (`CUST003` is seeded `CreditHold`):

```json
{
  "orderId": "ORD-LIVE-002",
  "status": "Blocked",
  "reason": "blocked-credit",
  "releasedQuantity": 0,
  "backorderedQuantity": 0,
  "allocations": []
}
```

Validation failure (`400`):

```json
{ "errors": [{ "field": "customerType", "reason": "must be one of: Standard, Priority" }] }
```

### `GET /orders/{orderId}`

Same response shape as above on `200`. Unknown `orderId` → `404`:

```json
{ "orderId": "ORD9999", "error": "No order found" }
```

Missing/invalid/expired token on any route → `401 { "error": "..." }`.

### Customer and Inventory

Same rename applies: `POST/GET/PUT /customers` use `customerId` and
`eligibilityStatus`; `POST/GET/PUT /inventory` use `productId`,
`warehouseId`, `availableQuantity` and `earliestDispatchDate`. The URLs
themselves are unchanged.

## 7. Fulfilment rules

Both customer types are checked for eligibility first: a customer who is not
`Eligible` is `Blocked` with `blocked-credit` before inventory is touched at
all.

**Standard** (unchanged since Stage 1) — the *full* quantity must come from a
*single* warehouse. Warehouses are tried `WH-A` → `WH-B` → `WH-C`; the first
one that has enough stock *and* can dispatch by `promisedDeliveryDate` wins.
If none can, the order is `Blocked`. Stock is never combined across
warehouses.

**Priority** (CHANGE1) — available quantity is summed across `WH-A` → `WH-B`
→ `WH-C`, counting only warehouses that can dispatch by
`promisedDeliveryDate`. Then, with the threshold from
`PARTIAL_RELEASE_THRESHOLD_PERCENT` (default 70%):

| Combined availability | Outcome |
|---|---|
| ≥ 100% of the requested quantity | `Released` — allocated across warehouses in priority order, no backorder |
| ≥ threshold, < 100% | `Partially Released` — allocate what is available, plus exactly one `Open` backorder for the remainder |
| < threshold | `Blocked` — no allocation, no backorder |

The total allocated never exceeds the requested quantity: each warehouse
contributes at most what is still outstanding.

Two points the change document left open were resolved during implementation —
that date feasibility still gates a warehouse's contribution, and that ≥ 100%
is `Released` with no zero-quantity backorder. Both are written up in
[docs/CHANGE1.md](docs/CHANGE1.md) § 2.

## 8. Running the tests

```bash
cd backend
npm test                                                                        # everything
npx jest tests/validators tests/services tests/middleware tests/config tests/api  # unit tests only — no DB needed
npx jest tests/repositories tests/integration                                     # live-DB tests — need backend/.env pointed at a reachable MOBDB_DEV
```

The live-DB tests create and clean up their own `TESTPROD-*`/`TESTORD-*` rows;
they never touch the FRD Section 39 seed rows except to read them. They also
require `database/schema/003_change1_backorder_and_multi_allocation.sql` to
have been applied. See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) for
what's been verified with evidence, [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)
for every FRD Section 30 item and what was implemented for it, and
[docs/CHANGE1.md](docs/CHANGE1.md) for the CHANGE1 test matrix and Stage 1
regression evidence.

**Known environment issue:** connectivity from this development environment to
the `172.16.1.23` MOBDB_DEV host has been intermittent (plain TCP timeouts
interspersed with successful connections) throughout this project's
development. If live-DB tests fail with a connection timeout, retry — it is
very likely a network-reachability issue, not a code defect.
