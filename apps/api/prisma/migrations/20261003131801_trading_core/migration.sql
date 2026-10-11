-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('EXTERNAL_SYNC', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "ExecutionRole" AS ENUM ('ENTRY', 'EXIT');

-- AlterTable
ALTER TABLE "TradingDeal" ADD COLUMN     "externalPositionId" TEXT;

-- CreateTable
CREATE TABLE "Trade" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "direction" "Direction" NOT NULL,
    "source" "TradeSource" NOT NULL,
    "symbol" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "closedQuantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "entryPrice" DECIMAL(18,8) NOT NULL,
    "exitPrice" DECIMAL(18,8),
    "entryAt" TIMESTAMP(3) NOT NULL,
    "exitAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "fees" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "pnlGross" DECIMAL(18,8),
    "pnlNet" DECIMAL(18,8),
    "riskAmount" DECIMAL(18,8),
    "rMultiple" DECIMAL(18,8),
    "initialStop" DECIMAL(18,8),
    "initialTP" DECIMAL(18,8),
    "notes" TEXT,
    "tradingDate" DATE NOT NULL,
    "externalPositionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeExecution" (
    "id" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "role" "ExecutionRole" NOT NULL,
    "side" "Direction" NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8),
    "profit" DECIMAL(18,8),
    "commission" DECIMAL(18,8),
    "swap" DECIMAL(18,8),
    "executedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "externalDealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_userId_status_idx" ON "Trade"("userId", "status");

-- CreateIndex
CREATE INDEX "Trade_userId_entryAt_idx" ON "Trade"("userId", "entryAt" DESC);

-- CreateIndex
CREATE INDEX "Trade_accountId_entryAt_idx" ON "Trade"("accountId", "entryAt" DESC);

-- CreateIndex
CREATE INDEX "Trade_accountId_symbol_idx" ON "Trade"("accountId", "symbol");

-- CreateIndex
CREATE INDEX "Trade_userId_tradingDate_idx" ON "Trade"("userId", "tradingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_accountId_externalPositionId_key" ON "Trade"("accountId", "externalPositionId");

-- CreateIndex
CREATE INDEX "TradeExecution_tradeId_executedAt_idx" ON "TradeExecution"("tradeId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeExecution_accountId_externalDealId_key" ON "TradeExecution"("accountId", "externalDealId");

-- CreateIndex
CREATE INDEX "TradingDeal_accountId_externalPositionId_idx" ON "TradingDeal"("accountId", "externalPositionId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeExecution" ADD CONSTRAINT "TradeExecution_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeExecution" ADD CONSTRAINT "TradeExecution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
