-- Partial unique indexes that Prisma cannot express (schema.prisma has no
-- representation) - db push does not create them; hand-written DDL re-applied
-- idempotently after a fresh push (baseline strategy, see worklog).
-- NOTE: the old "TradingSession_one_active_per_user" index is dead - the
-- TradingSession table no longer exists (renamed row-store SessionLiveRow).
CREATE UNIQUE INDEX IF NOT EXISTS "TradingSyncRun_accountId_running_key"
    ON "TradingSyncRun"("accountId")
    WHERE "status" = 'RUNNING';
