-- CreateEnum
CREATE TYPE "EcoImpact" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EcoEventStatus" AS ENUM ('SCHEDULED', 'RELEASED', 'UPDATED');

-- CreateEnum
CREATE TYPE "CalendarBlockKind" AS ENUM ('OFF', 'NEWS');

-- CreateTable
CREATE TABLE "EconomicEvent" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "impact" "EcoImpact" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "actual" TEXT,
    "forecast" TEXT,
    "previous" TEXT,
    "status" "EcoEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomicEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncRun" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "eventsSeen" INTEGER NOT NULL DEFAULT 0,
    "eventsCreated" INTEGER NOT NULL DEFAULT 0,
    "eventsUpdated" INTEGER NOT NULL DEFAULT 0,
    "eventsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "eventsRejected" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarBlockKind" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EconomicEvent_scheduledAt_idx" ON "EconomicEvent"("scheduledAt");

-- CreateIndex
CREATE INDEX "EconomicEvent_status_idx" ON "EconomicEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EconomicEvent_provider_providerEventId_key" ON "EconomicEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "CalendarSyncRun_provider_startedAt_idx" ON "CalendarSyncRun"("provider", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBlock_userId_date_key" ON "CalendarBlock"("userId", "date");

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
