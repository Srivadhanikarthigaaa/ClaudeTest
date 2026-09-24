-- Phase 1: Database Schema, Constraints, and Seed Data
--
-- NOT APPLICABLE for database creation in this environment.
-- MOBDB_DEV is an existing SQL Server database provided by the implementation
-- environment; this script must never create or switch to a database named
-- M08935_OrderFulfilment (that name only appears in the FRD's own narrative).
-- It verifies the target database is present and sets context for the scripts
-- that follow — it does not create, drop, or alter any database.

IF DB_ID(N'MOBDB_DEV') IS NULL
BEGIN
    RAISERROR(N'Target database MOBDB_DEV does not exist on this server. This script will not create it — confirm the connection/database name with the DBA before proceeding.', 16, 1);
    RETURN;
END
GO

USE MOBDB_DEV;
GO
