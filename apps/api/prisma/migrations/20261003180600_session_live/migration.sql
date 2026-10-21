-- CreateEnum
CREATE TYPE "TradingSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradingWindow" AS ENUM ('LONDON', 'NEW_YORK', 'ASIAN', 'SYDNEY', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketBias" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "SessionLiveEventKind" AS ENUM ('SESSION_STARTED', 'SESSION_ENDED', 'ANALYSIS_SAVED', 'NOTE_ADDED', 'TRADE_DETECTED', 'POSITION_UPDATED', 'LEVEL_ADDED', 'BIAS_CHANGED');

-- CreateEnum
CREATE TYPE "KeyLevelKind" AS ENUM ('SUPPORT', 'RESISTANCE', 'PREV_DAY_HIGH', 'PREV_DAY_LOW', 'SESSION_OPEN', 'WEEKLY_HIGH', 'WEEKLY_LOW', 'ASIAN_HIGH', 'ASIAN_LOW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IndicatorKind" AS ENUM ('EMA', 'SMA', 'VWAP', 'BB', 'RSI', 'MACD', 'ATR', 'VOLUME');

-- CreateEnum
CREATE TYPE "DrawingKind" AS ENUM ('HLINE', 'TREND', 'RAY', 'RECT', 'TEXT', 'MEASURE', 'FIB');

-- CreateTable
CREATE TABLE "TradingSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "TradingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "primarySymbol" TEXT NOT NULL,
    "primaryTimeframe" TEXT NOT NULL,
    "tradingWindow" "TradingWindow" NOT NULL DEFAULT 'OTHER',
    "strategyId" UUID,
    "setupId" UUID,
    "marketBias" "MarketBias" NOT NULL DEFAULT 'NEUTRAL',
    "sessionObjective" TEXT,
    "notes" TEXT,
    "riskPerTradePct" DECIMAL(18,8),
    "dailyRiskLimitPct" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingSessionEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "kind" "SessionLiveEventKind" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT,

    CONSTRAINT "TradingSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedAnalysis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceAtSave" DECIMAL(18,8),
    "bias" "MarketBias" NOT NULL,
    "bullishScenario" TEXT,
    "bearishScenario" TEXT,
    "strategyId" UUID,
    "setupId" UUID,
    "notes" TEXT,
    "indicators" JSONB NOT NULL,
    "drawings" JSONB NOT NULL,
    "levels" JSONB NOT NULL,

    CONSTRAINT "SavedAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyLevel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" "KeyLevelKind" NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingSession_userId_status_idx" ON "TradingSession"("userId", "status");

-- CreateIndex
CREATE INDEX "TradingSession_userId_startedAt_idx" ON "TradingSession"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TradingSessionEvent_sessionId_at_idx" ON "TradingSessionEvent"("sessionId", "at");

-- CreateIndex
CREATE INDEX "SavedAnalysis_userId_createdAt_idx" ON "SavedAnalysis"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SavedAnalysis_sessionId_idx" ON "SavedAnalysis"("sessionId");

-- CreateIndex
CREATE INDEX "KeyLevel_userId_symbol_idx" ON "KeyLevel"("userId", "symbol");

-- CreateIndex
CREATE INDEX "KeyLevel_userId_createdAt_idx" ON "KeyLevel"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionNote_userId_date_at_idx" ON "SessionNote"("userId", "date", "at");

-- AddForeignKey
ALTER TABLE "TradingSession" ADD CONSTRAINT "TradingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingSessionEvent" ADD CONSTRAINT "TradingSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TradingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAnalysis" ADD CONSTRAINT "SavedAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAnalysis" ADD CONSTRAINT "SavedAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TradingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyLevel" ADD CONSTRAINT "KeyLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Race-safe invariant (Phase 10 §62 CONCURRENCY): at most ONE ACTIVE
-- trading session per user. The application layer answers 409 with the
-- product message; this partial unique index makes the invariant hold even
-- under concurrent start attempts (two browser tabs).
CREATE UNIQUE INDEX "TradingSession_one_active_per_user" ON "TradingSession"("userId") WHERE "status" = 'ACTIVE';
