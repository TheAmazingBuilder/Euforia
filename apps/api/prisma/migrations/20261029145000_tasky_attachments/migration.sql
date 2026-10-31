-- Tasky attachments: metadata in PostgreSQL, bytes in private server-side storage.
CREATE TABLE "TaskyAttachment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskyAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskyAttachment_storageKey_key" ON "TaskyAttachment"("storageKey");
CREATE INDEX "TaskyAttachment_userId_cardId_createdAt_idx"
    ON "TaskyAttachment"("userId", "cardId", "createdAt" DESC);
ALTER TABLE "TaskyAttachment"
    ADD CONSTRAINT "TaskyAttachment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
