-- CreateTable
CREATE TABLE "IntegrationRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationRow_userId_kind_idx" ON "IntegrationRow"("userId", "kind");

-- AddForeignKey
ALTER TABLE "IntegrationRow" ADD CONSTRAINT "IntegrationRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
