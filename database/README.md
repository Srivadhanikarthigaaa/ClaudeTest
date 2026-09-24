# Database — MOBDB_DEV

Scripts for Phase 1 (FRD Sections 16, 21, 35–39, 63), targeting the existing
**MOBDB_DEV** SQL Server database for this implementation environment. This is a
shared, pre-existing database — the scripts are written to never drop, alter, or
delete anything outside the five Order Fulfilment tables below, and to be safe
to re-run.

Connect with the credentials in your local `backend/.env` (never commit real
credentials — see the root `.env.example` for the placeholder-only template).

## Layout

- `schema/000_create_database.sql` — **not applicable** for database creation here;
  only verifies MOBDB_DEV exists and sets `USE MOBDB_DEV` context. Never creates or
  switches to a database named `M08935_OrderFulfilment` — that name is only the
  FRD's own narrative example, not this environment's real database.
- `schema/001_create_tables.sql` — creates `Customer`, `Inventory`, `[Order]`,
  `FulfilmentResult`, `InventoryAllocation` inside MOBDB_DEV, each guarded by
  `IF OBJECT_ID(...) IS NULL`, so an existing table (Order Fulfilment or otherwise)
  is never dropped or altered by this script.
- `schema/002_fix_inventory_available_quantity_constraint.sql` — one-time `ALTER`
  fixing `CK_Inventory_AvailableQuantity`, which was originally created as
  `> 0` and incorrectly rejected legitimate decrements to exactly zero (found by
  running Phase 2's repository tests against live MOBDB_DEV). Only touches that
  one constraint; guarded so it's a no-op once already applied.
- `schema/003_change1_backorder_and_multi_allocation.sql` — the CHANGE1 migration.
  Creates the `Backorder` table; replaces `UQ_InventoryAllocation_OrderId`
  ("one allocation per order") with `UQ_InventoryAllocation_Order_Warehouse`
  ("one allocation per order per warehouse"), so a Priority order can draw from
  several warehouses; and widens `CK_FulfilmentResult_Status` from
  `'PartiallyReleased'` to `'Partially Released'`. No data migration is needed —
  Stage 1 never produced the old value. Deletes nothing; guarded so re-running
  it is a no-op. See [../docs/CHANGE1.md](../docs/CHANGE1.md) § 3.
- `seed/001_seed_data.sql` — loads the exact FRD Section 39 seed rows, each guarded
  by `IF NOT EXISTS`, so no existing row (seed or unrelated) is ever deleted.
- `stored-procedures/` — reserved for Phase 7+ (`EvaluateAndPersistOrderFulfilment`,
  `GetOrderFulfilmentResult`, `GetInventoryByProduct`, per FRD Section 23).

## Running

```bash
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i schema/000_create_database.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i schema/001_create_tables.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i schema/002_fix_inventory_available_quantity_constraint.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i schema/003_change1_backorder_and_multi_allocation.sql
sqlcmd -S <DB_SERVER>,<DB_PORT> -U <DB_USER> -P <DB_PASSWORD> -C -i seed/001_seed_data.sql
```

(`-C` trusts the server certificate, matching `DB_TRUST_SERVER_CERTIFICATE=true` for
this environment. Or open/execute the same files in SSMS / Azure Data Studio.)

All of these are safe to run again later — they only create what's missing and
insert rows that aren't already there. The one exception to "only creates" is
`003`, which drops and replaces two constraints on purpose (and no data).

## If the Order Fulfilment tables already exist in MOBDB_DEV

`001_create_tables.sql` deliberately does nothing to a table that already exists.
Before assuming it's compatible, compare its actual structure against FRD Section 16:

```sql
SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME IN ('Customer', 'Inventory', 'Order', 'FulfilmentResult', 'InventoryAllocation')
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_NAME IN ('Customer', 'Inventory', 'Order', 'FulfilmentResult', 'InventoryAllocation');
```

Only write an `ALTER TABLE` for a genuine mismatch against FRD 16/21/38 — don't
recreate or drop the table to "fix" it.

## Indexing plan

`Inventory`'s primary key is a clustered index on `(ProductId, WarehouseId)` — the same
key the Phase 7 concurrency strategy locks on with
`SELECT ... WITH (UPDLOCK, HOLDLOCK) ON Inventory (ProductId, WarehouseId)`. No
additional index is needed for that lookup; the clustered PK already covers it.

## Implementation choices vs. FRD-defined values

- `InventoryAllocation.AllocationId` is `UNIQUEIDENTIFIER DEFAULT NEWID()`. This is
  an implementation choice, not an FRD-defined value — the FRD only says
  AllocationId is "System-generated" and does not specify a literal ID format.

## Verifying constraints manually

```sql
-- Should fail (CK_Customer_EligibilityStatus)
INSERT INTO dbo.Customer (CustomerId, EligibilityStatus) VALUES ('CUSTX', 'Active');

-- Should fail (CK_Inventory_WarehouseId)
INSERT INTO dbo.Inventory (ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate)
VALUES ('PROD001', 'WH-D', 10, '2026-09-20');

-- Should fail (CK_FulfilmentResult_Reason — Reason required when Blocked)
INSERT INTO dbo.[Order] (OrderId, CustomerId, CustomerType, ProductId, Quantity, PromisedDeliveryDate)
VALUES ('ORD9001', 'CUST001', 'Standard', 'PROD001', 5, '2026-09-25');
INSERT INTO dbo.FulfilmentResult (OrderId, Status, Reason, ReleasedQuantity, BackorderedQuantity)
VALUES ('ORD9001', 'Blocked', NULL, 0, 0);
```
