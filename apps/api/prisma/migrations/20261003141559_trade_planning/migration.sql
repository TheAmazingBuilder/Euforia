-- CreateEnum
CREATE TYPE "TradePlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'VALIDATED', 'CANCELLED', 'ABANDONED', 'EXECUTED');

-- CreateTable
CREATE TABLE "InstrumentSpecification" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "pipSize" DECIMAL(18,8) NOT NULL,
    "contractSize" DECIMAL(18,8) NOT NULL,
    "minVolume" DECIMAL(18,8),
    "maxVolume" DECIMAL(18,8),
    "volumeStep" DECIMAL(18,8),
    "digits" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstrumentSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "status" "TradePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "direction" "Direction" NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'MARKET',
    "symbol" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timeframe" TEXT,
    "strategyId" UUID,
    "entryPrice" DECIMAL(18,8) NOT NULL,
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "sizeMode" TEXT NOT NULL,
    "sizeValue" DECIMAL(18,8) NOT NULL,
    "balanceSnapshot" DECIMAL(18,8),
    "riskPercent" DECIMAL(18,8),
    "riskAmount" DECIMAL(18,8),
    "stopDistance" DECIMAL(18,8),
    "stopPips" DECIMAL(18,8),
    "positionSize" DECIMAL(18,8),
    "potentialProfit" DECIMAL(18,8),
    "potentialLoss" DECIMAL(18,8),
    "rrRatio" DECIMAL(18,8),
    "rationale" TEXT,
    "checklist" JSONB,
    "checklistComplete" BOOLEAN,
    "lastValidation" JSONB,
    "validatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "clientRequestId" UUID,
    "plannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentSpecification_symbol_key" ON "InstrumentSpecification"("symbol");

-- CreateIndex
CREATE INDEX "TradePlan_userId_status_idx" ON "TradePlan"("userId", "status");

-- CreateIndex
CREATE INDEX "TradePlan_userId_plannedAt_idx" ON "TradePlan"("userId", "plannedAt" DESC);

-- CreateIndex
CREATE INDEX "TradePlan_userId_accountId_idx" ON "TradePlan"("userId", "accountId");

-- CreateIndex
CREATE INDEX "TradePlan_userId_symbol_idx" ON "TradePlan"("userId", "symbol");

-- CreateIndex
CREATE INDEX "TradePlan_accountId_status_idx" ON "TradePlan"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradePlan_userId_clientRequestId_key" ON "TradePlan"("userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Reference data (Phase 5 §15) ─────────────────────────────────────────────
-- Minimal instrument-specification REFERENCE set so the risk engine has an
-- authoritative source out of the box. These values are CONFIGURATION DATA in
-- the catalog table (curated/updated by the future Instrument Catalog phase) —
-- deliberately NOT hardcoded in business logic. Idempotent by symbol.

INSERT INTO "InstrumentSpecification"
  ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "contractSize", "minVolume", "maxVolume", "volumeStep", "digits", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'EURUSD', 'Euro / US Dollar',        'FOREX',    'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GBPUSD', 'British Pound / US Dollar','FOREX',   'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'USDJPY', 'US Dollar / Japanese Yen', 'FOREX',    'JPY', 0.01,   100000, 0.01, 100, 0.01, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'XAUUSD', 'Gold / US Dollar',         'METAL',    'USD', 0.1,    100,    0.01, 50,  0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BTCUSD', 'Bitcoin / US Dollar',      'CRYPTO',   'USD', 1,      1,      0.01, 100, 0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'US30',   'Dow Jones 30',             'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NAS100', 'Nasdaq 100',               'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("symbol") DO NOTHING;
