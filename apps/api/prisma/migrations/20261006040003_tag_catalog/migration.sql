-- CreateTable
CREATE TABLE "TagRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagRow_userId_idx" ON "TagRow"("userId");

-- AddForeignKey
ALTER TABLE "TagRow" ADD CONSTRAINT "TagRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
