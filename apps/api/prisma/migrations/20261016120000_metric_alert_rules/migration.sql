-- Dashboard Customization Phase 07 — metric alert rules.
-- Rules persist per user; triggered events are ALERT rows in the existing
-- disciplineRow inbox (type METRIC_THRESHOLD) — no second event store.

-- CreateTable
CREATE TABLE "MetricAlertRuleRow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricAlertRuleRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricAlertRuleRow_userId_idx" ON "MetricAlertRuleRow"("userId");

-- AddForeignKey
ALTER TABLE "MetricAlertRuleRow" ADD CONSTRAINT "MetricAlertRuleRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
