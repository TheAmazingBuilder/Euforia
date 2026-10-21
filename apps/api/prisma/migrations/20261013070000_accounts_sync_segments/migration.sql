-- Phase 03 — Accounts & Trading Connectivity (doc B §8.2: PARTIAL runs)
-- Per-segment observation timestamps on sync runs. Hand-written ADDITIVE
-- migration (the `migrate dev` drift engine is unusable on this repo's
-- history: pre-existing OcrCollectionAsset type drift — see phase report).
-- A non-null timestamp = the segment ran and persisted; null = failed or
-- capability-skipped. Safe to replay (IF NOT EXISTS).
ALTER TABLE "TradingSyncRun" ADD COLUMN IF NOT EXISTS "snapshotAt" TIMESTAMP(3);
ALTER TABLE "TradingSyncRun" ADD COLUMN IF NOT EXISTS "positionsAt" TIMESTAMP(3);
ALTER TABLE "TradingSyncRun" ADD COLUMN IF NOT EXISTS "ordersAt" TIMESTAMP(3);
ALTER TABLE "TradingSyncRun" ADD COLUMN IF NOT EXISTS "dealsAt" TIMESTAMP(3);
