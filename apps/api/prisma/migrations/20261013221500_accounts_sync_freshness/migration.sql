-- Phase 05 — Trading Account Data Synchronization, Reconciliation, and
-- Freshness Management. Hand-written ADDITIVE migration (same discipline as
-- 20261013070000: `migrate dev` drift engine unusable on this repo's
-- history). All columns nullable or defaulted — no data is rewritten.
-- Safe to replay (IF NOT EXISTS).
--
-- 1) Position reconciliation (spec §6.4/§13.2): OPEN = present in the
--    provider's latest COMPLETE open-position response; CLOSED = absent
--    from such a response. Rows are never deleted. closedAt is the
--    OBSERVATION time (provider event time is not exposed by the listing).
-- 2) Deals incremental checkpoint (spec §8.2/§8.4): provider-issued cursor
--    on the connection (live operational state) + the value after each run
--    on the run (progress observability, §10). Advanced only after the
--    covered rows are persisted.
ALTER TABLE "TradingPosition" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "TradingPosition" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "TradingConnection" ADD COLUMN IF NOT EXISTS "dealsCheckpoint" TEXT;
ALTER TABLE "TradingSyncRun" ADD COLUMN IF NOT EXISTS "dealsCheckpoint" TEXT;
