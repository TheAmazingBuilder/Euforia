-- AlterTable
ALTER TABLE "OcrAsset" ADD COLUMN     "phashHex" TEXT;

-- AlterTable
ALTER TABLE "OcrRecognition" ADD COLUMN     "accountId" UUID,
ADD COLUMN     "screenshotPurgedAt" TIMESTAMP(3),
ADD COLUMN     "tradeIds" JSONB;

-- CreateTable
CREATE TABLE "OcrCorrectionPattern" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "correctedValue" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrCorrectionPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcrCorrectionPattern_userId_fieldKey_rawValue_idx" ON "OcrCorrectionPattern"("userId", "fieldKey", "rawValue");

-- CreateIndex
CREATE UNIQUE INDEX "OcrCorrectionPattern_userId_fieldKey_rawValue_correctedValu_key" ON "OcrCorrectionPattern"("userId", "fieldKey", "rawValue", "correctedValue");

-- CreateIndex
CREATE INDEX "OcrRecognition_accountId_idx" ON "OcrRecognition"("accountId");

-- AddForeignKey
ALTER TABLE "OcrRecognition" ADD CONSTRAINT "OcrRecognition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCorrectionPattern" ADD CONSTRAINT "OcrCorrectionPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
