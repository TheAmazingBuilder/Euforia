-- CreateEnum
CREATE TYPE "TradeReviewStatus" AS ENUM ('COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExecutionGrade" AS ENUM ('A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "PlaybookMatch" AS ENUM ('MATCHED', 'PARTIAL', 'OFF_PLAYBOOK');

-- CreateTable
CREATE TABLE "TradeReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "status" "TradeReviewStatus" NOT NULL DEFAULT 'COMPLETED',
    "executionGrade" "ExecutionGrade" NOT NULL,
    "followedPlan" BOOLEAN NOT NULL,
    "playbookMatch" "PlaybookMatch" NOT NULL,
    "checklistResults" JSONB,
    "entryQuality" INTEGER,
    "exitQuality" INTEGER,
    "riskManagement" INTEGER,
    "lessons" TEXT NOT NULL,
    "improvementNote" TEXT,
    "originTradePlanId" UUID,
    "planSnapshot" JSONB,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeReview_tradeId_key" ON "TradeReview"("tradeId");

-- CreateIndex
CREATE INDEX "TradeReview_userId_status_idx" ON "TradeReview"("userId", "status");

-- CreateIndex
CREATE INDEX "TradeReview_userId_reviewedAt_idx" ON "TradeReview"("userId", "reviewedAt" DESC);

-- AddForeignKey
ALTER TABLE "TradeReview" ADD CONSTRAINT "TradeReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeReview" ADD CONSTRAINT "TradeReview_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
