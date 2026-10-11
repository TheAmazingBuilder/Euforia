-- OCR V2 — multi-trade drafts, perceptual duplicates, corrections memory,
-- quality analytics events. Every addition is nullable or carries a default;
-- no existing column is modified or removed.

ALTER TABLE "OcrAsset" ADD COLUMN "perceptualHash" TEXT;
ALTER TABLE "OcrAsset" ADD COLUMN "documentPageCount" INTEGER;
ALTER TABLE "OcrAsset" ALTER COLUMN "width" DROP NOT NULL;
ALTER TABLE "OcrAsset" ALTER COLUMN "height" DROP NOT NULL;

ALTER TABLE "OcrRecognition" ADD COLUMN "drafts" JSONB;
ALTER TABLE "OcrRecognition" ADD COLUMN "importedTradeIds" JSONB;

CREATE INDEX "OcrAsset_userId_perceptualHash_idx" ON "OcrAsset"("userId", "perceptualHash");

-- Corrections memory — one row per distinct (user, field, raw, corrected)
-- tuple with a usage counter incremented on every repeat correction.
CREATE TABLE "OcrCorrection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "rawValue" TEXT,
    "correctedValue" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastRecognitionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OcrCorrection_userId_field_raw_corrected_key" ON "OcrCorrection"("userId", "field", "rawValue", "correctedValue");
CREATE INDEX "OcrCorrection_userId_updatedAt_idx" ON "OcrCorrection"("userId", "updatedAt" DESC);

-- Quality analytics events (§53 names + V2 additions) — the funnel and the
-- OCR-quality card aggregate over this append-only ledger.
CREATE TABLE "OcrEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "recognitionId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OcrEvent_userId_type_createdAt_idx" ON "OcrEvent"("userId", "type", "createdAt" DESC);
CREATE INDEX "OcrEvent_userId_createdAt_idx" ON "OcrEvent"("userId", "createdAt" DESC);

ALTER TABLE "OcrCorrection" ADD CONSTRAINT "OcrCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OcrEvent" ADD CONSTRAINT "OcrEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
