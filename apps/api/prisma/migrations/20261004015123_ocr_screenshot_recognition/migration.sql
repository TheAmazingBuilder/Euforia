-- CreateTable
CREATE TABLE "OcrAsset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrRecognition" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "extractionProfile" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "result" JSONB,
    "failureCategory" TEXT,
    "failureMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingFinishedAt" TIMESTAMP(3),
    "corrections" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OcrAsset_storageKey_key" ON "OcrAsset"("storageKey");

-- CreateIndex
CREATE INDEX "OcrAsset_userId_createdAt_idx" ON "OcrAsset"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OcrAsset_userId_checksumSha256_key" ON "OcrAsset"("userId", "checksumSha256");

-- CreateIndex
CREATE INDEX "OcrRecognition_userId_createdAt_idx" ON "OcrRecognition"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OcrRecognition_userId_status_idx" ON "OcrRecognition"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OcrRecognition_userId_idempotencyKey_key" ON "OcrRecognition"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OcrAsset" ADD CONSTRAINT "OcrAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrRecognition" ADD CONSTRAINT "OcrRecognition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrRecognition" ADD CONSTRAINT "OcrRecognition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "OcrAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
