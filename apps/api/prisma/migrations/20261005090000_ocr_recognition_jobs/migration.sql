-- OCR backend V1 — recognition-jobs surface (frontend-derived wire contract).
-- Extends OcrRecognition with the job/draft/confirmation state the shipped
-- frontend consumes: platform hint, mode, persisted trade draft, the canonical
-- trade created by the user-confirmed import, and cancellation (§71).
-- No existing column is modified or removed (§109: do not touch what you do
-- not need) — every addition is nullable or carries a default.

ALTER TABLE "OcrRecognition" ADD COLUMN "requestedPlatform" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "OcrRecognition" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "OcrRecognition" ADD COLUMN "draft" JSONB;
ALTER TABLE "OcrRecognition" ADD COLUMN "draftUpdatedAt" TIMESTAMP(3);
ALTER TABLE "OcrRecognition" ADD COLUMN "importedTradeId" UUID;
ALTER TABLE "OcrRecognition" ADD COLUMN "cancelledAt" TIMESTAMP(3);
