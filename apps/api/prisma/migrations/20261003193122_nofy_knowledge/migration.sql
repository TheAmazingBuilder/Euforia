-- CreateTable
CREATE TABLE "NofyFolder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyTag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyTemplate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '📄',
    "blocks" JSONB NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "folderId" UUID,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT,
    "lessonRef" JSONB,
    "blocks" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "lastViewedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NofyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyNoteTag" (
    "noteId" UUID NOT NULL,
    "tagId" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "NofyVersion" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NofyFolder_userId_createdAt_idx" ON "NofyFolder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NofyFolder_userId_nameKey_key" ON "NofyFolder"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "NofyTag_userId_createdAt_idx" ON "NofyTag"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NofyTag_userId_nameKey_key" ON "NofyTag"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "NofyTemplate_userId_createdAt_idx" ON "NofyTemplate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NofyNote_userId_updatedAt_idx" ON "NofyNote"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "NofyNote_userId_createdAt_idx" ON "NofyNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NofyNote_userId_favorite_idx" ON "NofyNote"("userId", "favorite");

-- CreateIndex
CREATE INDEX "NofyNote_userId_deletedAt_idx" ON "NofyNote"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "NofyNote_folderId_idx" ON "NofyNote"("folderId");

-- CreateIndex
CREATE INDEX "NofyNoteTag_tagId_idx" ON "NofyNoteTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "NofyNoteTag_noteId_tagId_key" ON "NofyNoteTag"("noteId", "tagId");

-- CreateIndex
CREATE INDEX "NofyVersion_noteId_savedAt_idx" ON "NofyVersion"("noteId", "savedAt" DESC);

-- AddForeignKey
ALTER TABLE "NofyFolder" ADD CONSTRAINT "NofyFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyTag" ADD CONSTRAINT "NofyTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyTemplate" ADD CONSTRAINT "NofyTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "NofyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNoteTag" ADD CONSTRAINT "NofyNoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NofyNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNoteTag" ADD CONSTRAINT "NofyNoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "NofyTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyVersion" ADD CONSTRAINT "NofyVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NofyNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
