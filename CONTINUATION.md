# Continuation Notes — read this first in a new session

This file exists so a fresh Claude Code session (new context window, same
project) can pick up exactly where the last one left off, without re-deriving
everything from scratch. Read this, then README.md, then the docs/ files it
points to.

## Current status (as of this note)

**Phases 0-11 of the build plan, plus CHANGE1, are complete and committed** to
`https://github.com/Srivadhanikarthigaaa/ClaudeTest` on branch `main`. The
working tree was clean at last check — if it isn't when you read this, the
person may have made further uncommitted changes; check `git status` and
`git log` before assuming anything.

**CHANGE1 (git tag `CHANGE1`)** layered a change document on top of Stage 1:
lowerCamelCase API fields everywhere, the `"Partially Released"` status
literal, a configurable partial-release threshold
(`PARTIAL_RELEASE_THRESHOLD_PERCENT`, default 70), a `Backorder` table,
multiple allocation rows per order, and multi-warehouse fulfilment for
`Priority` customers. Standard-customer behaviour is unchanged.
**Read [docs/CHANGE1.md](docs/CHANGE1.md) before touching the fulfilment
logic, the API field names or the schema** — it records two assumptions that
were resolved by the implementer rather than specified, and where to reverse
each one. The DB migration is
`database/schema/003_change1_backorder_and_multi_allocation.sql`; it has been
applied to MOBDB_DEV.

What's built:
- **Database**: MOBDB_DEV schema + seed scripts (`database/`), including a
  real constraint bug found and fixed via live testing (see
  `database/schema/002_fix_inventory_available_quantity_constraint.sql`).
- **Backend**: full Customer/Inventory/Order CRUD + fulfilment APIs, JWT
  auth middleware, centralized error handling, a row-locked concurrency-safe
  decision engine, and a test suite (unit + mocked + live-DB integration).
- **Frontend**: three screens (Order Processing, Customer Management,
  Inventory Management) behind the authenticated API, with a shared
  stylesheet (`frontend/src/App.css`).
- **Docs**: `docs/OPEN_QUESTIONS.md` (all 10 FRD Section 30 open items and
  what was implemented for each — read this before making any judgment call
  that might already be decided), `docs/SECURITY_REVIEW.md`,
  `docs/FINAL_VERIFICATION.md`.

**Explicitly excluded, on the user's own decision**: a dashboard. FRD
Section 12 states no dashboard is required; the user confirmed staying
within that scope rather than adding one (see chat history / this file's
"decisions" section below). If a future request asks for a dashboard again,
flag the conflict again rather than silently building one.

## Environment quirks worth knowing before you touch git or the DB

1. **Two git repos existed in this session.** One was rooted at `Desktop/`
   (no remote, has its own 4-commit history, now orphaned/unused). A second,
   separate repo was initialized at `Desktop/ClaudeTest/.git` with `origin`
   already pointing at the GitHub URL above — **this is the one that matters
   now**. Always run `git rev-parse --show-toplevel` if anything about paths
   looks wrong; don't assume which repo governs a given command.
2. **Something silently reverted uncommitted tracked-file changes back to
   HEAD mid-session once** (cause unconfirmed — possibly an editor action,
   possibly tooling). New *untracked* files survived; only modifications to
   already-committed files were lost, and had to be redone from memory.
   **Lesson: commit early and often** rather than letting a large batch of
   edits sit uncommitted.
3. **MOBDB_DEV connectivity (`172.16.1.23:1433`) has been intermittent all
   session** — genuine TCP timeouts interspersed with successful
   connections, sometimes for many minutes at a stretch. If a live-DB test
   or the running backend throws `ConnectionError`/`ETIMEOUT`, that is very
   likely the network, not a code defect — retry before debugging code.
4. **`backend/.env` is never committed** (by design, `.gitignore`'d). If it's
   missing on whatever machine you're now running on, recreate it from
   `.env.example` with: the real MOBDB_DEV `DB_SERVER`/`DB_USER`/`DB_PASSWORD`
   (given directly by the user earlier in chat — ask them again if you don't
   have it, never invent one), `DB_NAME=MOBDB_DEV`, `DB_TRUST_SERVER_CERTIFICATE=true`,
   `PORT=4000`, `CORS_ORIGIN=http://localhost:5173`, and a freshly generated
   `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   if one doesn't already exist — don't reuse a secret from an old chat
   transcript once it's out of scope.
5. **There is no login endpoint** (FRD Section 30 #6, escalated, not built).
   To exercise any authenticated route, mint a token manually — see README
   "Authentication" section for the exact command. Tokens expire per
   `JWT_EXPIRES_IN` (8h) — regenerate if you get "Invalid or expired token".

## Decisions made that a new session should not silently re-litigate

- Database name: the FRD narrative says `M08935_OrderFulfilment`; the real
  target is `MOBDB_DEV` (a pre-existing environment database). Never create
  or reference `M08935_OrderFulfilment`.
- **API fields are lowerCamelCase; the domain model and repositories stay
  PascalCase** (matching the SQL column names). The two meet at exactly one
  seam, `backend/src/api/serializers.js`. Don't "fix" the internals to
  camelCase — the mapping has to exist somewhere, and it is deliberately
  concentrated in that one file. See docs/CHANGE1.md § 1.1.
- The two CHANGE1 assumptions (date feasibility gates a Priority warehouse's
  contribution; ≥ 100% available is `Released` with no backorder) are
  documented decisions, not oversights — docs/CHANGE1.md § 2.
- HTTP status split: `201` on first submission, `200` on idempotent replay
  (FRD Section 30 #9 — this project's own resolution, not FRD-dictated).
- Reason-code literals `blocked-insufficient-inventory` / `blocked-delivery-date`
  are placeholders (Section 30 #2) — centralized in
  `backend/src/services/reasonCodes.js`, change there only if the business
  confirms real values.
- No dashboard (see above). No delete endpoints for Customer/Inventory
  (Section 30 #4, not built). No Order listing/search endpoint (Section 30
  #7, not built).
- Several FRD section-number references that appeared in later planning
  prompts (61, 62, 64, 66, "Section 17 tracking table") do not exist in the
  actual FRD file (`docs/Functional Requirements Document.txt`, which only
  has real content through Section 31). Each was mapped to the closest real
  content at the time and flagged in the relevant doc — don't be alarmed by
  this, it's already handled, just don't assume those section numbers exist
  if referenced again.

## How to resume work

```bash
git clone https://github.com/Srivadhanikarthigaaa/ClaudeTest.git   # or pull, if already cloned
cd ClaudeTest
cp .env.example backend/.env    # then fill in real values, see above
cd backend && npm install && npm test          # unit tests need no DB; tests/repositories + tests/integration need MOBDB_DEV reachable
cd ../frontend && npm install && npm run dev   # http://localhost:5173
cd ../backend && npm run dev                   # http://localhost:4000 (separate terminal)
```

Then re-read `docs/OPEN_QUESTIONS.md` before making any new judgment call —
most of the FRD's ambiguities already have a documented, deliberate answer.
