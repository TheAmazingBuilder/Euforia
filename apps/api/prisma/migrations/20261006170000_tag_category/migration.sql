-- DropIndex
DROP INDEX "Tag_userId_name_key";

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "parentId" UUID;

-- CreateIndex
CREATE INDEX "Tag_userId_idx" ON "Tag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_category_key" ON "Tag"("userId", "name", "category");

