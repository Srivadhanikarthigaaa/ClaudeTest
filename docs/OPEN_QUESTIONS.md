# Implementation Summary — FRD Section 30 Open Questions

This is the one document the business/implementation stakeholder should read
before go-live. It lists all ten items FRD Section 30 leaves genuinely
unspecified, states what this implementation actually did for each, and
whether it's still open.

**A note on sourcing:** the Phase 11-13 instructions asked for this summary
to "cross-reference the Section 17 tracking table." The FRD file this project
was built against
([docs/Functional Requirements Document.txt](Functional%20Requirements%20Document.txt))
has no Section 17 content — Sections 17-20 are explicitly marked
"(Reserved)" in that document, consolidated into Section 16. The ten items
the instructions listed for that table match FRD Section 30's own ten items
one-for-one and in the same order, so this document is built directly from
Section 30 instead. (This is one of several FRD section-number references in
the phase instructions — e.g. Sections 61/62/64/66 — that don't correspond to
actual headed content in the FRD file; each was mapped to the closest real
content as it came up, and is flagged again here since this is the final,
stakeholder-facing document.)

| # | Question | What was implemented | Status |
|---|---|---|---|
| 1 | What happens when an order references a `CustomerId` that doesn't exist at all (vs. existing with CreditHold/Unknown)? | `404` with `{ "CustomerId": "<id>", "Error": "Customer not found" }`, nothing persisted. The response shape is inferred (analogous to the confirmed `GET /orders` 404 shape), not FRD-dictated. | **Open** — confirm status code and shape. |
| 2 | Exact literal reason codes for "insufficient inventory" and "cannot meet delivery date" (only `"blocked-credit"` is confirmed). | `"blocked-insufficient-inventory"` and `"blocked-delivery-date"`, as named constants in [backend/src/services/reasonCodes.js](../backend/src/services/reasonCodes.js) — every test and the engine itself reference the constants, never the raw strings, so a confirmed literal only needs to change in one file. | **Open** — placeholders, unconfirmed. |
| 3 | A `ProductId` with zero `Inventory` rows anywhere. | Treated as "no qualifying warehouse" → `Blocked` / `blocked-insufficient-inventory` (FRD's own documented assumption A2). | **Open** — pending confirmation, though low-risk. |
| 4 | Delete/deactivation of `Customer` or `Inventory` records. | Not built. No delete endpoint exists for either entity (Phase 4's CRUD is itself still outstanding — see the note in `docs/FINAL_VERIFICATION.md`). | **Open**, and moot until Phase 4 exists. |
| 5 | Does idempotent replay cover `Blocked` results, or only `Released`? | Implemented as applying to **both** — any `OrderId` with a persisted `FulfilmentResult` is replayed unchanged, matching FRD's own assumption A1 and verified by an automated test (Test 11 in `tests/integration/orderFulfilment.e2e.test.js`). | **Open** in spec terms, but implemented and tested per the FRD's stated default. |
| 6 | How is a JWT obtained, and is there a role model? | **Not built.** [backend/src/middleware/auth.js](../backend/src/middleware/auth.js) only *verifies* tokens signed with `JWT_SECRET`; there is no login/token-issuance endpoint and no role differentiation. Tokens for this project were minted manually (see README "Authentication"). | **Open — escalated.** This is the most significant open item: the application cannot be used by anyone without a manually-issued token until this is resolved. |
| 7 | Is an Order list/search endpoint required? | Not built. `GET /orders/{OrderId}` (single-order lookup) is the entire read surface for Orders. | **Open.** |
| 8 | Can `PromisedDeliveryDate` be in the past? | No lower-bound check. [backend/src/validators/orderValidator.js](../backend/src/validators/orderValidator.js) validates only the `YYYY-MM-DD` format, deliberately structured (one rule function in an array) so a lower-bound rule can be added later without touching anything else. | **Open**, built per the FRD's documented default. |
| 9 | Should a first-time `Released`/`Blocked` and an idempotent replay return different HTTP status codes? | Implemented as distinguished: `201 Created` for a first-time submission, `200 OK` for an idempotent replay of an already-completed `OrderId`. See [backend/src/controllers/orderController.js](../backend/src/controllers/orderController.js). | **Open** in the sense that this distinction isn't FRD-confirmed, but it *is* implemented (not left undistinguished) — revisit if the business wants both cases to return the same code. |
| 10 | Exact Customer/Inventory API contract (endpoint paths/methods/payloads). | **Not built at all.** Phase 4 (Customer/Inventory CRUD endpoints and management screens) was skipped when the work moved on to the Order pipeline (Phases 5-10) and was never circled back to. FRD Section 22.3's inferred contract was never implemented, tested, or exercised. | **Open, and further behind than the other nine** — this isn't a "confirm the contract" question yet, it's "build Phase 4." |

## Summary for go-live decision

Of the ten items: **six have a working placeholder implementation** you can
exercise today (#1, #2, #3, #5, #8, #9). **Four are simply not built**: #4
(delete endpoints), #6 (token issuance/roles — only verification exists),
#7 (order listing), and #10 (Customer/Inventory CRUD API, i.e. all of Phase 4).
Of those four, **#6 is the one explicitly escalated as blocking real usage**
beyond manually-issued test tokens; #10 is the largest single piece of
outstanding work against the full plan.
