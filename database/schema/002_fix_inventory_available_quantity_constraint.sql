-- Phase 1 bug fix, found while running Phase 2's repository tests against
-- the live MOBDB_DEV database.
--
-- CK_Inventory_AvailableQuantity was originally created as
-- `AvailableQuantity > 0`, copying FRD Section 15.3's form-validation rule
-- ("AvailableQuantity — required, integer > 0 when creating/maintaining
-- inventory data") directly into an ALWAYS-ON database invariant. That's too
-- strict: fulfilling an order legitimately drives AvailableQuantity down to
-- exactly 0 (e.g. FRD Section 29 Test 1 — WH-A has 20, an order for 20 is
-- Released, leaving 0). The "> 0" rule is correctly enforced already at the
-- validators layer (backend/src/validators/inventoryValidator.js) for
-- user-supplied create/update requests; the DB constraint must allow the
-- system's own decrement to reach zero, so it only needs to reject negative
-- values: `AvailableQuantity >= 0`.
--
-- This is an ALTER, not a drop/recreate, because MOBDB_DEV already has this
-- table provisioned with real (if currently empty) data — see database/README.md.

USE MOBDB_DEV;
GO

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'CK_Inventory_AvailableQuantity' AND CHECK_CLAUSE = '([AvailableQuantity]>(0))'
)
BEGIN
    ALTER TABLE dbo.Inventory DROP CONSTRAINT CK_Inventory_AvailableQuantity;
    ALTER TABLE dbo.Inventory WITH CHECK ADD CONSTRAINT CK_Inventory_AvailableQuantity CHECK (AvailableQuantity >= 0);
END
GO
