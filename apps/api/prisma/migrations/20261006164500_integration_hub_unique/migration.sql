-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRow_userId_kind_refId_key" ON "IntegrationRow"("userId", "kind", "refId");
