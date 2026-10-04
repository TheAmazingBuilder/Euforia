-- Phase 4 — Trading Core & Trade Journal Foundation.
-- Domaine 3 (docs/specs/data-model.md): Instrument catalog seed, Trade,
-- TradeExit, TradeEvent, TradeScreenshot. Adds TradingDeal."positionId"
-- (nullable, Phase 4 §9/§17) so the deal→trade reconstruction can group
-- executions the way MT5 netting does. No existing table is altered beyond
-- that additive column.

-- ── Instrument catalog (Domaine 2) ──────────────────────────────────────────
-- Specs mirror the product catalog (synthetics ≠ forex lots — no per-asset-
-- class constants in code, data lives here). Seeded by migration tooling
-- only (conventions). Deterministic fixed UUIDs so environments converge.

CREATE TABLE "Instrument" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "pipSize" DECIMAL(18,8) NOT NULL,
    "digits" INTEGER NOT NULL,
    "contractSize" DECIMAL(18,8) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

INSERT INTO "Instrument" ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "digits", "contractSize", "isActive") VALUES
    ('3f9a1c2e-7b64-4d2a-9f1e-2c8b5a7d1001', 'EURUSD', 'Euro / US Dollar', 'FOREX', 'USD', '0.0001', 5, '100000', true),
    ('4a8b2d3f-8c75-4e3b-8a2f-3d9c6b8e1002', 'GBPUSD', 'British Pound / US Dollar', 'FOREX', 'USD', '0.0001', 5, '100000', true),
    ('5b9c3e4a-9d86-4f4c-9b3a-4e0d7c9f1003', 'XAUUSD', 'Gold / US Dollar', 'METAL', 'USD', '0.01', 2, '100', true),
    ('6c0d4f5b-0e97-4a5d-8c4b-5f1e8d0a1004', 'BTCUSDT', 'Bitcoin / US Dollar', 'CRYPTO', 'USD', '1', 2, '1', true),
    ('7d1e5a6c-1fa8-4b6e-9d5c-6a2f9e1b1005', 'BOOM500', 'Boom 500 Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true),
    ('8e2f6b7d-2ab9-4c7f-8e6d-7b3a0f2c1006', 'CRASH500', 'Crash 500 Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true),
    ('9f3a7c8e-3bca-4d8a-9f7e-8c4b1a3d1007', 'VOL75(1s)', 'Volatility 75 (1s) Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true);

-- ── TradingDeal.positionId (additive, Phase 4 §9/§17) ───────────────────────

ALTER TABLE "TradingDeal" ADD COLUMN "positionId" TEXT;
CREATE INDEX "TradingDeal_accountId_positionId_idx" ON "TradingDeal"("accountId", "positionId");

-- ── Trade (the canonical journal trade — Phase 4 §5) ─────────────────────────

CREATE TABLE "Trade" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "strategyId" UUID,
    "setupId" UUID,
    "strategyVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    -- THE PLAN (decided BEFORE)
    "entryPrice" DECIMAL(18,8) NOT NULL,
    "entryAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "initialStop" DECIMAL(18,8),
    "initialTP" DECIMAL(18,8),
    "plannedRR" DECIMAL(18,8),
    "riskAmount" DECIMAL(18,8),
    -- REALITY (what happened)
    "finalStop" DECIMAL(18,8),
    "exitPrice" DECIMAL(18,8),
    "exitAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "fees" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,8) NOT NULL DEFAULT 0,
    -- RESULTS (server-computed at close — the ONLY authority, §15/§46)
    "pnlGross" DECIMAL(18,8),
    "pnlNet" DECIMAL(18,8),
    "rMultiple" DECIMAL(18,8),
    "mfePrice" DECIMAL(18,8),
    "maePrice" DECIMAL(18,8),
    "mfeR" DECIMAL(18,8),
    "maeR" DECIMAL(18,8),
    -- PSYCHOLOGY
    "emotionBefore" TEXT,
    "emotionAfter" TEXT,
    "confidence" INTEGER,
    -- DECISION GATE / DISCIPLINE
    "decisionGrade" TEXT,
    "decisionAt" TIMESTAMP(3),
    "followedPlan" BOOLEAN,
    "checklistSnap" JSONB,
    -- CONTEXT
    "notes" TEXT,
    "lessons" TEXT,
    "tradingDate" DATE NOT NULL,
    "externalRef" TEXT,
    "importBatchId" UUID,
    "externalPositionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Trade_accountId_externalRef_key" ON "Trade"("accountId", "externalRef");
CREATE UNIQUE INDEX "Trade_accountId_externalPositionId_key" ON "Trade"("accountId", "externalPositionId");
CREATE INDEX "Trade_userId_tradingDate_idx" ON "Trade"("userId", "tradingDate");
CREATE INDEX "Trade_userId_status_idx" ON "Trade"("userId", "status");
CREATE INDEX "Trade_accountId_status_idx" ON "Trade"("accountId", "status");
CREATE INDEX "Trade_userId_deletedAt_idx" ON "Trade"("userId", "deletedAt");

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── TradeExit (partial-exit legs — Phase 4 §18) ─────────────────────────────

CREATE TABLE "TradeExit" (
    "id" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "exitedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeExit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeExit_tradeId_exitedAt_idx" ON "TradeExit"("tradeId", "exitedAt");

ALTER TABLE "TradeExit" ADD CONSTRAINT "TradeExit_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TradeEvent (lightweight event sourcing — §38/§40) ────────────────────────

CREATE TABLE "TradeEvent" (
    "id" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeEvent_tradeId_createdAt_idx" ON "TradeEvent"("tradeId", "createdAt");

ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TradeScreenshot (chart evidence — metadata + storage reference) ─────────

CREATE TABLE "TradeScreenshot" (
    "id" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "annotations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeScreenshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeScreenshot_tradeId_createdAt_idx" ON "TradeScreenshot"("tradeId", "createdAt");

ALTER TABLE "TradeScreenshot" ADD CONSTRAINT "TradeScreenshot_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SavedTradeView (unified named-preset library — TRADES + ANALYTICS) ──────

CREATE TABLE "SavedTradeView" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'TRADES',
    "filters" JSONB NOT NULL,
    "analyticsFilters" JSONB,
    "columns" TEXT[] NOT NULL,
    "sortKey" TEXT NOT NULL,
    "sortDir" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedTradeView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedTradeView_userId_name_key" ON "SavedTradeView"("userId", "name");
CREATE INDEX "SavedTradeView_userId_idx" ON "SavedTradeView"("userId");

ALTER TABLE "SavedTradeView" ADD CONSTRAINT "SavedTradeView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
