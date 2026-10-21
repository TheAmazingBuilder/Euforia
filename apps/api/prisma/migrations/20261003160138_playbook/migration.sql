-- CreateTable
CREATE TABLE "Strategy" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entryRules" TEXT,
    "exitRules" TEXT,
    "riskRules" TEXT,
    "grade" TEXT,
    "color" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" JSONB,
    "detailedDescription" TEXT,
    "marketProfile" JSONB,
    "marketConditions" JSONB,
    "entryConditions" JSONB,
    "confirmations" JSONB,
    "invalidations" JSONB,
    "risk" JSONB,
    "tradeManagement" JSONB,
    "exitPlan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersionSnapshot" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "context" TEXT,
    "marketCondition" TEXT,
    "trigger" TEXT,
    "confirmation" TEXT,
    "entryModel" TEXT,
    "stopModel" TEXT,
    "targetModel" TEXT,
    "invalidation" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategyId" UUID,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "strategyId" UUID,
    "evaluatable" BOOLEAN NOT NULL DEFAULT false,
    "evaluationHint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Strategy_userId_status_idx" ON "Strategy"("userId", "status");

-- CreateIndex
CREATE INDEX "Strategy_userId_updatedAt_idx" ON "Strategy"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "StrategyVersionSnapshot_strategyId_version_idx" ON "StrategyVersionSnapshot"("strategyId", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersionSnapshot_strategyId_version_key" ON "StrategyVersionSnapshot"("strategyId", "version");

-- CreateIndex
CREATE INDEX "Setup_userId_strategyId_idx" ON "Setup"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "Setup_strategyId_idx" ON "Setup"("strategyId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_userId_idx" ON "ChecklistTemplate"("userId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_strategyId_idx" ON "ChecklistTemplate"("strategyId");

-- CreateIndex
CREATE INDEX "PlaybookRule_userId_scope_idx" ON "PlaybookRule"("userId", "scope");

-- CreateIndex
CREATE INDEX "PlaybookRule_strategyId_idx" ON "PlaybookRule"("strategyId");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersionSnapshot" ADD CONSTRAINT "StrategyVersionSnapshot_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
