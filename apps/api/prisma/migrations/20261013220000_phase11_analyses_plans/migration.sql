-- Phase 10 → serveur + Phase 11 — Oryon chart analyses (multi-device) and
-- the Trade Plan (documented reasoning: thesis, scenarios, review).

-- CreateEnum
CREATE TYPE "AnalysisPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INVALIDATED', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "OryonAnalysis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "chartType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "tradeId" UUID,
    "snapshot" JSONB,
    "analysis" JSONB NOT NULL,
    "drawings" JSONB NOT NULL,
    "referenceTimeSec" BIGINT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OryonAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AnalysisPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT,
    "title" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "tradeId" UUID,
    "analysisId" UUID,
    "invalidationCriteria" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "reviewNotes" TEXT,
    "processTags" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "plannedEntry" DECIMAL(18,8),
    "plannedStop" DECIMAL(18,8),
    "plannedTargets" JSONB,
    "referenceTimeSec" BIGINT,
    "scenarios" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OryonAnalysis_userId_updatedAt_idx" ON "OryonAnalysis"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "OryonAnalysis_userId_symbol_idx" ON "OryonAnalysis"("userId", "symbol");

-- CreateIndex
CREATE INDEX "AnalysisPlan_userId_status_idx" ON "AnalysisPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "AnalysisPlan_userId_symbol_idx" ON "AnalysisPlan"("userId", "symbol");

-- CreateIndex
CREATE INDEX "AnalysisPlan_tradeId_idx" ON "AnalysisPlan"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisPlan_userId_clientRequestId_key" ON "AnalysisPlan"("userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "OryonAnalysis" ADD CONSTRAINT "OryonAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OryonAnalysis" ADD CONSTRAINT "OryonAnalysis_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisPlan" ADD CONSTRAINT "AnalysisPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisPlan" ADD CONSTRAINT "AnalysisPlan_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisPlan" ADD CONSTRAINT "AnalysisPlan_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "OryonAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
