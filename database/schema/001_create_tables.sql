-- Phase 1: Database Schema, Constraints, and Seed Data
-- FRD Section 16 (Data Entities), Section 21 (Database Relationships),
-- Sections 35-39 (Database Requirements/Relationships/Constraints/Reason Validation/Seed Data)
--
-- Creates Customer, Inventory, [Order], FulfilmentResult, InventoryAllocation inside the
-- existing MOBDB_DEV database, with the exact fields/types from FRD 16 and the
-- constraints/foreign keys from FRD 21/38.
--
-- MOBDB_DEV is a shared, pre-existing database that may hold unrelated objects/data.
-- This script therefore never drops or alters anything: each table is created only
-- if it does not already exist (IF OBJECT_ID(...) IS NULL), which makes the script
-- safe to re-run and safe against a database that isn't "clean". If any of these
-- five tables already exists, this script leaves it completely untouched — compare
-- its structure against FRD 16 by hand (e.g. via database/README.md's inspection
-- query) before deciding whether an ALTER is actually required.

USE MOBDB_DEV;
GO

-- FRD 16.1 Customer
IF OBJECT_ID(N'dbo.Customer', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Customer (
        CustomerId          VARCHAR(50)  NOT NULL,
        EligibilityStatus   VARCHAR(20)  NOT NULL,
        CONSTRAINT PK_Customer PRIMARY KEY (CustomerId),
        CONSTRAINT CK_Customer_EligibilityStatus
            CHECK (EligibilityStatus IN ('Eligible', 'CreditHold', 'Unknown'))
    );
END
GO

-- FRD 16.2 Inventory — composite PK (ProductId, WarehouseId).
-- The clustered PK below is itself the index that supports
-- SELECT ... WITH (UPDLOCK, HOLDLOCK) ON Inventory (ProductId, WarehouseId)
-- used by the concurrency locking strategy (Phase 7, FRD Section 57).
IF OBJECT_ID(N'dbo.Inventory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Inventory (
        ProductId               VARCHAR(50)  NOT NULL,
        WarehouseId             VARCHAR(10)  NOT NULL,
        AvailableQuantity       INT          NOT NULL,
        EarliestDispatchDate    DATE         NOT NULL,
        CONSTRAINT PK_Inventory PRIMARY KEY CLUSTERED (ProductId, WarehouseId),
        CONSTRAINT CK_Inventory_WarehouseId
            CHECK (WarehouseId IN ('WH-A', 'WH-B', 'WH-C')),
        -- >= 0, not > 0: fulfilling an order can legitimately deplete a
        -- warehouse to exactly zero (FRD Section 29 Test 1). The stricter
        -- "> 0 when creating/maintaining inventory" rule from FRD 15.3 is
        -- enforced at the validators layer for user-supplied writes, not
        -- here — see schema/002_fix_inventory_available_quantity_constraint.sql.
        CONSTRAINT CK_Inventory_AvailableQuantity
            CHECK (AvailableQuantity >= 0)
    );
END
GO

-- FRD 16.3 Order ("Order" is a reserved word in T-SQL, hence the bracketed identifier)
IF OBJECT_ID(N'dbo.[Order]', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.[Order] (
        OrderId                 VARCHAR(50)  NOT NULL,
        CustomerId              VARCHAR(50)  NOT NULL,
        CustomerType            VARCHAR(20)  NOT NULL,
        ProductId               VARCHAR(50)  NOT NULL,
        Quantity                INT          NOT NULL,
        PromisedDeliveryDate    DATE         NOT NULL,
        CONSTRAINT PK_Order PRIMARY KEY (OrderId),
        CONSTRAINT FK_Order_Customer
            FOREIGN KEY (CustomerId) REFERENCES dbo.Customer (CustomerId),
        CONSTRAINT CK_Order_CustomerType
            CHECK (CustomerType IN ('Standard', 'Priority')),
        CONSTRAINT CK_Order_Quantity
            CHECK (Quantity > 0)
    );
END
GO

-- FRD 16.4 FulfilmentResult — Reason is null iff Status = Released/PartiallyReleased,
-- non-null iff Status = Blocked (FRD Section 38).
IF OBJECT_ID(N'dbo.FulfilmentResult', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FulfilmentResult (
        OrderId                 VARCHAR(50)  NOT NULL,
        Status                  VARCHAR(20)  NOT NULL,
        Reason                  VARCHAR(50)  NULL,
        ReleasedQuantity        INT          NOT NULL,
        BackorderedQuantity     INT          NOT NULL,
        CONSTRAINT PK_FulfilmentResult PRIMARY KEY (OrderId),
        CONSTRAINT FK_FulfilmentResult_Order
            FOREIGN KEY (OrderId) REFERENCES dbo.[Order] (OrderId),
        CONSTRAINT CK_FulfilmentResult_Status
            CHECK (Status IN ('Released', 'PartiallyReleased', 'Blocked')),
        CONSTRAINT CK_FulfilmentResult_Reason
            CHECK (
                (Status = 'Blocked' AND Reason IS NOT NULL)
                OR (Status <> 'Blocked' AND Reason IS NULL)
            )
    );
END
GO

-- FRD 16.5 InventoryAllocation — at most one allocation per order (FRD 16.3, 21).
-- AllocationId's type (UNIQUEIDENTIFIER, DB-generated via NEWID()) is an
-- IMPLEMENTATION CHOICE, not an FRD-defined value: the FRD only specifies
-- AllocationId as "System-generated" and does not dictate a literal ID format.
IF OBJECT_ID(N'dbo.InventoryAllocation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventoryAllocation (
        AllocationId        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        OrderId              VARCHAR(50)      NOT NULL,
        WarehouseId          VARCHAR(10)      NOT NULL,
        AllocatedQuantity    INT              NOT NULL,
        CONSTRAINT PK_InventoryAllocation PRIMARY KEY (AllocationId),
        CONSTRAINT FK_InventoryAllocation_Order
            FOREIGN KEY (OrderId) REFERENCES dbo.[Order] (OrderId),
        CONSTRAINT UQ_InventoryAllocation_OrderId UNIQUE (OrderId),
        CONSTRAINT CK_InventoryAllocation_WarehouseId
            CHECK (WarehouseId IN ('WH-A', 'WH-B', 'WH-C')),
        CONSTRAINT CK_InventoryAllocation_AllocatedQuantity
            CHECK (AllocatedQuantity > 0)
    );
END
GO
