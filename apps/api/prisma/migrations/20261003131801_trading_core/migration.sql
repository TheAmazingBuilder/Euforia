-- Trading Core — CANONICAL ENUMS ONLY (reconciled 2026-10-13).
--
-- This migration originally ALSO created the `Trade` and `TradeExecution`
-- tables. That Trade generation was superseded one day later by
-- 20261004120000_trade_journal_core, which re-creates `Trade` with the
-- instrument relation + journal lifecycle (the schema.prisma shape). A fresh
-- `prisma migrate deploy` therefore failed on the duplicate table.
--
-- Reconciliation (see worklog.md): this file now creates ONLY the four
-- Postgres enums every later generation consumes. `TradeExecution` moved to
-- 20261004120000_trade_journal_core (it FKs the FINAL Trade); the
-- denormalized `symbol/currency/closedQuantity` columns were added there too.
CREATE TYPE "TradeSource" AS ENUM ('EXTERNAL_SYNC', 'MANUAL', 'IMPORT');

CREATE TYPE "TradeStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');

CREATE TYPE "Direction" AS ENUM ('BUY', 'SELL');

CREATE TYPE "ExecutionRole" AS ENUM ('ENTRY', 'EXIT');

-- AddColumn — the journal deal carries the broker position ref (kept from the
-- original migration; the index below depends on it).
ALTER TABLE "TradingDeal" ADD COLUMN     "externalPositionId" TEXT;

-- CreateIndex
CREATE INDEX "TradingDeal_accountId_externalPositionId_idx" ON "TradingDeal"("accountId", "externalPositionId");
