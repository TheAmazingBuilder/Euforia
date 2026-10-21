-- Phase 21 — OCR confirmation → canonical Trade bridge (§72/§77/§141).
--
-- OcrRecognition gains a nullable link to the Trade created from the
-- CONFIRMED values through Trading Core's canonical creation path. The link
-- is one-way provenance metadata:
--   - the trade never depends on the recognition;
--   - deleting the recognition must keep the trade (ON DELETE SET NULL);
--   - a trade hard-delete (never in the product — soft delete only, §57)
--     must not orphan-break recognitions (SET NULL again).

-- AlterTable
ALTER TABLE "OcrRecognition" ADD COLUMN "tradeId" UUID;

-- CreateTable column comment
COMMENT ON COLUMN "OcrRecognition"."tradeId" IS 'Canonical Trade created from the confirmed values through Trading Core (Phase 21). NULL while unconfirmed or when the import was skipped.';

-- CreateIndex
CREATE INDEX "OcrRecognition_tradeId_idx" ON "OcrRecognition"("tradeId");

-- AddForeignKey
ALTER TABLE "OcrRecognition" ADD CONSTRAINT "OcrRecognition_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
