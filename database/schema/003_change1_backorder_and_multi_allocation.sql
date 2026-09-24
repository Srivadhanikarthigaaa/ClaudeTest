-- CHANGE1 migration — Backorder table, multi-allocation support, and the
-- renamed partial status literal.
--
-- Covers CHANGE1 requirements 1 (status literal "Partially Released") and
-- 3 (Backorder table; an order may hold more than one allocation row).
--
-- Like every other script in this folder this is additive and idempotent:
-- each step is guarded so re-running it is safe, and nothing that Stage 1
-- created is dropped except the two constraints that CHANGE1 explicitly
-- supersedes. No data is deleted by this script.
--
-- Run AFTER 001_create_tables.sql and 002_fix_inventory_available_quantity_constraint.sql.

USE MOBDB_DEV;
GO

---------------------------------------------------------------------------
-- 1. Multi-allocation support (CHANGE1 requirement 3)
--
-- Stage 1 enforced "at most one allocation per order" with
-- UQ_InventoryAllocation_OrderId (FRD 16.3/21), because a Standard order's
-- full quantity always came from a single warehouse. A Priority order may now
-- draw from WH-A, WH-B and WH-C for the same order, so that unique constraint
-- has to go.
--
-- What replaces it is UQ_InventoryAllocation_Order_Warehouse: an order may
-- hold several allocation rows, but never two for the SAME warehouse. That
-- still makes an accidental duplicate insert (e.g. a replayed submission that
-- somehow bypassed the idempotency check) fail at the database, which is the
-- protection the old constraint was really providing.
---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.objects WHERE name = N'UQ_InventoryAllocation_OrderId' AND parent_object_id = OBJECT_ID(N'dbo.InventoryAllocation'))
BEGIN
    ALTER TABLE dbo.InventoryAllocation DROP CONSTRAINT UQ_InventoryAllocation_OrderId;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = N'UQ_InventoryAllocation_Order_Warehouse' AND parent_object_id = OBJECT_ID(N'dbo.InventoryAllocation'))
BEGIN
    ALTER TABLE dbo.InventoryAllocation
        ADD CONSTRAINT UQ_InventoryAllocation_Order_Warehouse UNIQUE (OrderId, WarehouseId);
END
GO

---------------------------------------------------------------------------
-- 2. Status literal "Partially Released" (CHANGE1 requirement 1)
--
-- Stage 1's CK_FulfilmentResult_Status allowed 'PartiallyReleased' (no
-- space). Stage 1 never actually produced that value — a Standard order is
-- only ever Released or Blocked — so no existing row can violate the new
-- constraint, and nothing needs migrating. Status is VARCHAR(20) and
-- 'Partially Released' is 19 characters, so the column width is unchanged.
--
-- CK_FulfilmentResult_Reason is left exactly as Stage 1 wrote it: it keys off
-- Status = 'Blocked' only, so a Partially Released row (Reason NULL) already
-- satisfies it.
---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FulfilmentResult_Status' AND parent_object_id = OBJECT_ID(N'dbo.FulfilmentResult'))
BEGIN
    ALTER TABLE dbo.FulfilmentResult DROP CONSTRAINT CK_FulfilmentResult_Status;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FulfilmentResult_Status' AND parent_object_id = OBJECT_ID(N'dbo.FulfilmentResult'))
BEGIN
    ALTER TABLE dbo.FulfilmentResult
        ADD CONSTRAINT CK_FulfilmentResult_Status
            CHECK (Status IN ('Released', 'Partially Released', 'Blocked'));
END
GO

---------------------------------------------------------------------------
-- 3. Backorder table (CHANGE1 requirement 3)
--
-- Fields are exactly the four the change document names — OrderId, ProductId,
-- BackorderedQuantity, Status = 'Open' — plus a system-generated
-- BackorderId primary key, following the same implementation choice already
-- made for InventoryAllocation.AllocationId (UNIQUEIDENTIFIER / NEWID(); an
-- implementation detail, not an FRD- or change-document-defined value).
--
-- Two constraints encode CHANGE1's own rules as database invariants rather
-- than leaving them to application code alone:
--   * UNIQUE (OrderId)          -> "exactly one backorder" per order, so an
--                                  idempotent replay physically cannot create
--                                  a second one (requirement 5).
--   * BackorderedQuantity > 0   -> a backorder always has something
--                                  outstanding in it, which is the flagged
--                                  ">= 100% is Released, with no
--                                  zero-quantity backorder" assumption made
--                                  unbreakable (see docs/CHANGE1.md).
--
-- Status is constrained to 'Open' because that is the only value the change
-- document defines. Widening it (e.g. 'Fulfilled', 'Cancelled') is a
-- deliberate future migration, not something to pre-empt here.
---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Backorder', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Backorder (
        BackorderId          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        OrderId              VARCHAR(50)      NOT NULL,
        ProductId            VARCHAR(50)      NOT NULL,
        BackorderedQuantity  INT              NOT NULL,
        Status               VARCHAR(20)      NOT NULL DEFAULT 'Open',
        CONSTRAINT PK_Backorder PRIMARY KEY (BackorderId),
        CONSTRAINT FK_Backorder_Order
            FOREIGN KEY (OrderId) REFERENCES dbo.[Order] (OrderId),
        CONSTRAINT UQ_Backorder_OrderId UNIQUE (OrderId),
        CONSTRAINT CK_Backorder_Status
            CHECK (Status IN ('Open')),
        CONSTRAINT CK_Backorder_BackorderedQuantity
            CHECK (BackorderedQuantity > 0)
    );
END
GO
