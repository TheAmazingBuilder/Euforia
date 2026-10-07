-- CreateTable
CREATE TABLE "OcrSet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "result" JSONB,
    "corrections" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "tradeId" UUID,
    "tradeIds" JSONB,
    "accountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrSetItem" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "recognitionId" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "OcrSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcrSet_userId_createdAt_idx" ON "OcrSet"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OcrSet_tradeId_idx" ON "OcrSet"("tradeId");

-- CreateIndex
CREATE INDEX "OcrSet_accountId_idx" ON "OcrSet"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OcrSetItem_recognitionId_key" ON "OcrSetItem"("recognitionId");

-- CreateIndex
CREATE INDEX "OcrSetItem_setId_order_idx" ON "OcrSetItem"("setId", "order");

-- AddForeignKey
ALTER TABLE "OcrSet" ADD CONSTRAINT "OcrSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrSet" ADD CONSTRAINT "OcrSet_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrSet" ADD CONSTRAINT "OcrSet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrSetItem" ADD CONSTRAINT "OcrSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "OcrSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrSetItem" ADD CONSTRAINT "OcrSetItem_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "OcrRecognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
