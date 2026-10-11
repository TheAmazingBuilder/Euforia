-- OCR V3 — multi-screenshot fusion groups, screenshot collections,
-- quality score persistence, reprocess lineage, duplicate-warning facet.
-- Every addition is nullable or carries a default; no existing column is
-- modified or removed (master prompt §8/§90).

-- AlterTable
ALTER TABLE "OcrAsset" ADD COLUMN     "duplicateWarned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OcrRecognition" ADD COLUMN     "quality" JSONB,
ADD COLUMN     "reprocessedFromJobId" UUID;

-- CreateTable
CREATE TABLE "OcrRecognitionGroup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "memberJobIds" JSONB NOT NULL,
    "evidence" JSONB,
    "fusionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "fusedDraft" JSONB,
    "fieldOrigins" JSONB,
    "conflicts" JSONB,
    "timeline" JSONB,
    "quality" JSONB,
    "importedTradeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrRecognitionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrCollection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrCollectionAsset" (
    "collectionId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrCollectionAsset_pkey" PRIMARY KEY ("collectionId","assetId")
);

-- CreateIndex
CREATE INDEX "OcrRecognitionGroup_userId_createdAt_idx" ON "OcrRecognitionGroup"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OcrCollection_userId_createdAt_idx" ON "OcrCollection"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OcrCollectionAsset_assetId_idx" ON "OcrCollectionAsset"("assetId");

-- AddForeignKey
ALTER TABLE "OcrRecognitionGroup" ADD CONSTRAINT "OcrRecognitionGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCollection" ADD CONSTRAINT "OcrCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCollectionAsset" ADD CONSTRAINT "OcrCollectionAsset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "OcrCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCollectionAsset" ADD CONSTRAINT "OcrCollectionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "OcrAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OcrCorrection_userId_field_raw_corrected_key" RENAME TO "OcrCorrection_userId_field_rawValue_correctedValue_key";

