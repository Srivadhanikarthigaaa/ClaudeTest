# Order Fulfilment Application

A three-tier app (React frontend, Node.js/Express backend, SQL Server database)
that decides whether a customer's order can be released from a single warehouse,
per the [Functional Requirements Document](docs/Functional%20Requirements%20Document.txt) (FRD).

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
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i database/seed/001_seed_data.sql
```

All four scripts are additive/idempotent — safe to re-run, and safe against a
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

### `POST /orders`

Request:

```json
{
  "OrderId": "ORD-LIVE-001",
  "CustomerId": "CUST001",
  "CustomerType": "Standard",
  "ProductId": "PROD001",
  "Quantity": 5,
  "PromisedDeliveryDate": "2026-09-25"
}
```

Response — `201 Created` on first submission (real response, captured from a
live run against MOBDB_DEV's seeded data):

```json
{
  "OrderId": "ORD-LIVE-001",
  "Status": "Released",
  "Reason": null,
  "ReleasedQuantity": 5,
  "BackorderedQuantity": 0,
  "Allocations": [{ "WarehouseId": "WH-A", "AllocatedQuantity": 5 }]
}
```

Resubmitting the same `OrderId` returns the identical body with `200 OK`
instead (idempotent replay — FRD Section 30 #9, this project's chosen
resolution).

Blocked example (real response, `CUST003` is seeded `CreditHold`):

```json
{
  "OrderId": "ORD-LIVE-002",
  "Status": "Blocked",
  "Reason": "blocked-credit",
  "ReleasedQuantity": 0,
  "BackorderedQuantity": 0,
  "Allocations": []
}
```

Validation failure (`400`):

```json
{ "Errors": [{ "Field": "CustomerType", "Reason": "must be one of: Standard, Priority" }] }
```

### `GET /orders/{OrderId}`

Same response shape as above on `200`. Unknown `OrderId` → `404`:

```json
{ "OrderId": "ORD9999", "Error": "No order found" }
```

Missing/invalid/expired token on any route → `401`.

## 7. Running the tests

```bash
cd backend
npm test               # everything
npx jest tests/validators tests/services tests/middleware   # unit tests only — no DB needed
npx jest tests/repositories tests/integration                # live-DB tests — need backend/.env pointed at a reachable MOBDB_DEV
```

The live-DB tests create and clean up their own `TESTPROD-*`/`TESTORD-*` rows;
they never touch the FRD Section 39 seed rows except to read them. See
[docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) for what's been verified
with evidence and [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) for every
FRD Section 30 item and what was implemented for it.

**Known environment issue:** connectivity from this development environment to
the `172.16.1.23` MOBDB_DEV host has been intermittent (plain TCP timeouts
interspersed with successful connections) throughout this project's
development. If live-DB tests fail with a connection timeout, retry — it is
very likely a network-reachability issue, not a code defect.
