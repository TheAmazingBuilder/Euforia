-- Phase 17 (Monitoring) — per-user Monitoring configuration.
-- The ONLY persisted Monitoring entity: metrics/events/alerts stay derived
-- from bounded in-memory windows (no metrics warehouse in PostgreSQL §40/§45).

-- CreateTable
CREATE TABLE "MonitoringSetting" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateForeignKey
ALTER TABLE "MonitoringSetting" ADD CONSTRAINT "MonitoringSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
