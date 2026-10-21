-- AlterTable
ALTER TABLE "Mistake" DROP COLUMN "name",
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "severity" INTEGER NOT NULL DEFAULT 3,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Mistake_isSystem_idx" ON "Mistake"("isSystem");

