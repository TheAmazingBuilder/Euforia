-- Performance snapshots (Dashboard Customization Phase 08) — frozen
-- point-in-time analytics-suite summary captures. Contract document in
-- `data` (performanceSnapshotSchema); captured values are never recomputed.
-- nameKey enforces the per-user case-insensitive unique-name product rule.

CREATE TABLE "PerformanceSnapshotRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "nameKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceSnapshotRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PerformanceSnapshotRow_userId_capturedAt_idx" ON "PerformanceSnapshotRow"("userId", "capturedAt");

CREATE UNIQUE INDEX "PerformanceSnapshotRow_userId_nameKey_key" ON "PerformanceSnapshotRow"("userId", "nameKey");

ALTER TABLE "PerformanceSnapshotRow" ADD CONSTRAINT "PerformanceSnapshotRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
