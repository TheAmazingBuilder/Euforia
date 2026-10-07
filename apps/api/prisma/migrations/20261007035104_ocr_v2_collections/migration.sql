-- CreateTable
CREATE TABLE "OcrCollection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrCollectionItem" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "recognitionId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcrCollection_userId_createdAt_idx" ON "OcrCollection"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OcrCollection_userId_name_key" ON "OcrCollection"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OcrCollectionItem_recognitionId_key" ON "OcrCollectionItem"("recognitionId");

-- CreateIndex
CREATE INDEX "OcrCollectionItem_collectionId_addedAt_idx" ON "OcrCollectionItem"("collectionId", "addedAt" DESC);

-- AddForeignKey
ALTER TABLE "OcrCollection" ADD CONSTRAINT "OcrCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCollectionItem" ADD CONSTRAINT "OcrCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "OcrCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrCollectionItem" ADD CONSTRAINT "OcrCollectionItem_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "OcrRecognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
