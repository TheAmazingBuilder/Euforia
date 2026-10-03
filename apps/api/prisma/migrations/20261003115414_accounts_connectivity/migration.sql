-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "startingBalance" DECIMAL(18,8) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "propConfig" JSONB,
    "externalAccountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingConnection" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "credentialsEnc" TEXT NOT NULL DEFAULT '',
    "credentialsHint" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[],
    "lastError" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccountSnapshot" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "balance" DECIMAL(18,8),
    "equity" DECIMAL(18,8),
    "unrealizedPnl" DECIMAL(18,8),
    "margin" DECIMAL(18,8),
    "freeMargin" DECIMAL(18,8),
    "marginLevel" DECIMAL(18,8),
    "currency" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "syncRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPosition" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalPositionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "entryPrice" DECIMAL(18,8) NOT NULL,
    "currentPrice" DECIMAL(18,8),
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "profit" DECIMAL(18,8),
    "swap" DECIMAL(18,8),
    "commission" DECIMAL(18,8),
    "openedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingOrder" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "status" TEXT NOT NULL,
    "providerCreatedAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDeal" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalDealId" TEXT NOT NULL,
    "symbol" TEXT,
    "side" TEXT NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8),
    "profit" DECIMAL(18,8),
    "commission" DECIMAL(18,8),
    "swap" DECIMAL(18,8),
    "executedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingSyncRun" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "positionsUpserted" INTEGER NOT NULL DEFAULT 0,
    "ordersUpserted" INTEGER NOT NULL DEFAULT 0,
    "dealsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "requestId" TEXT,

    CONSTRAINT "TradingSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingAccount_userId_idx" ON "TradingAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccount_userId_providerId_externalAccountId_key" ON "TradingAccount"("userId", "providerId", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingConnection_accountId_key" ON "TradingConnection"("accountId");

-- CreateIndex
CREATE INDEX "TradingConnection_providerId_status_idx" ON "TradingConnection"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccountSnapshot_accountId_key" ON "TradingAccountSnapshot"("accountId");

-- CreateIndex
CREATE INDEX "TradingAccountSnapshot_accountId_syncedAt_idx" ON "TradingAccountSnapshot"("accountId", "syncedAt");

-- CreateIndex
CREATE INDEX "TradingPosition_accountId_symbol_idx" ON "TradingPosition"("accountId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "TradingPosition_accountId_externalPositionId_key" ON "TradingPosition"("accountId", "externalPositionId");

-- CreateIndex
CREATE INDEX "TradingOrder_accountId_status_idx" ON "TradingOrder"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradingOrder_accountId_externalOrderId_key" ON "TradingOrder"("accountId", "externalOrderId");

-- CreateIndex
CREATE INDEX "TradingDeal_accountId_executedAt_idx" ON "TradingDeal"("accountId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradingDeal_accountId_externalDealId_key" ON "TradingDeal"("accountId", "externalDealId");

-- CreateIndex
CREATE INDEX "TradingSyncRun_accountId_startedAt_idx" ON "TradingSyncRun"("accountId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingConnection" ADD CONSTRAINT "TradingConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccountSnapshot" ADD CONSTRAINT "TradingAccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingDeal" ADD CONSTRAINT "TradingDeal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingSyncRun" ADD CONSTRAINT "TradingSyncRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 3 §38 — synchronization concurrency guard: at most ONE RUNNING run
-- per account. The application catches the P2002 violation and maps it to
-- 409 SYNC_ALREADY_RUNNING. Prisma cannot express partial indexes, hence
-- this hand-written statement.
CREATE UNIQUE INDEX "TradingSyncRun_accountId_running_key"
    ON "TradingSyncRun"("accountId")
    WHERE "status" = 'RUNNING';
