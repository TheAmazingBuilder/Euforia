-- Phase 07 — broker identification snapshot (universal broker layer).
-- Additive, non-destructive: one nullable JSON column on TradingAccount.
-- Rollback: DROP COLUMN "brokerIdentity" — no data loss beyond the snapshot.
ALTER TABLE "TradingAccount" ADD COLUMN "brokerIdentity" JSONB;
