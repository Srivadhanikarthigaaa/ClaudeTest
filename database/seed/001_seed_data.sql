-- Phase 1: Database Schema, Constraints, and Seed Data
-- FRD Section 39 (Seed Data) — exact seed values.
--
-- MOBDB_DEV may already hold unrelated data, so this script never deletes
-- anything: each row is inserted only if a row with that exact key does not
-- already exist. That makes it idempotent (safe to run any number of times)
-- without touching unrelated rows or requiring a "clean" database.

USE MOBDB_DEV;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerId = 'CUST001')
    INSERT INTO dbo.Customer (CustomerId, EligibilityStatus) VALUES ('CUST001', 'Eligible');

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerId = 'CUST002')
    INSERT INTO dbo.Customer (CustomerId, EligibilityStatus) VALUES ('CUST002', 'Unknown');

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerId = 'CUST003')
    INSERT INTO dbo.Customer (CustomerId, EligibilityStatus) VALUES ('CUST003', 'CreditHold');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Inventory WHERE ProductId = 'PROD001' AND WarehouseId = 'WH-A')
    INSERT INTO dbo.Inventory (ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate)
    VALUES ('PROD001', 'WH-A', 20, '2026-09-20');

IF NOT EXISTS (SELECT 1 FROM dbo.Inventory WHERE ProductId = 'PROD001' AND WarehouseId = 'WH-B')
    INSERT INTO dbo.Inventory (ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate)
    VALUES ('PROD001', 'WH-B', 20, '2026-09-20');

IF NOT EXISTS (SELECT 1 FROM dbo.Inventory WHERE ProductId = 'PROD001' AND WarehouseId = 'WH-C')
    INSERT INTO dbo.Inventory (ProductId, WarehouseId, AvailableQuantity, EarliestDispatchDate)
    VALUES ('PROD001', 'WH-C', 20, '2026-09-20');
GO
