-- Tasky Phase 5: per-user automation rules and durable execution history.
CREATE TABLE "TaskyAutomationRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "trigger" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskyAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskyAutomationRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "automationId" UUID,
    "automationName" VARCHAR(80) NOT NULL,
    "trigger" VARCHAR(40) NOT NULL,
    "cardId" TEXT,
    "cardTitle" VARCHAR(140),
    "status" VARCHAR(16) NOT NULL,
    "message" VARCHAR(240) NOT NULL,
    "error" VARCHAR(500),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskyAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskyAutomationRule_userId_enabled_trigger_idx"
  ON "TaskyAutomationRule"("userId", "enabled", "trigger");
CREATE UNIQUE INDEX "TaskyAutomationRun_dedupeKey_key"
  ON "TaskyAutomationRun"("dedupeKey");
CREATE INDEX "TaskyAutomationRun_userId_createdAt_idx"
  ON "TaskyAutomationRun"("userId", "createdAt" DESC);
CREATE INDEX "TaskyAutomationRun_userId_status_idx"
  ON "TaskyAutomationRun"("userId", "status");

ALTER TABLE "TaskyAutomationRule"
  ADD CONSTRAINT "TaskyAutomationRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskyAutomationRun"
  ADD CONSTRAINT "TaskyAutomationRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskyAutomationRun"
  ADD CONSTRAINT "TaskyAutomationRun_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "TaskyAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
