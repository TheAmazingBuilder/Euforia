-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'SYNCING', 'DEGRADED', 'DISCONNECTED', 'AUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "IntegrationAuthState" AS ENUM ('OK', 'MISSING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IntegrationErrorCode" AS ENUM ('AUTH_FAILED', 'RATE_LIMITED', 'PROVIDER_OUTAGE', 'MALFORMED_RESPONSE', 'TIMEOUT', 'PARTIAL_SYNC', 'CREDENTIALS_EXPIRED', 'DUPLICATE_EVENT');

-- CreateEnum
CREATE TYPE "IntegrationEventType" AS ENUM ('CONNECTED', 'DISCONNECTED', 'TEST_OK', 'TEST_FAILED', 'SYNCED', 'SYNC_FAILED', 'DEGRADED', 'RECOVERED', 'CREDENTIAL_ROTATED', 'WEBHOOK_RECEIVED', 'WEBHOOK_REJECTED', 'WEBHOOK_DUPLICATE');

-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "authState" "IntegrationAuthState" NOT NULL DEFAULT 'MISSING',
    "credentialsVaultRef" TEXT,
    "credentialsHint" TEXT,
    "credentialsLastRotatedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "syncLastAttemptedAt" TIMESTAMP(3),
    "syncLastSuccessAt" TIMESTAMP(3),
    "syncLastDurationMs" INTEGER,
    "syncRecordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "syncRecordsFailed" INTEGER NOT NULL DEFAULT 0,
    "syncRetryCount" INTEGER NOT NULL DEFAULT 0,
    "syncRunCount" INTEGER NOT NULL DEFAULT 0,
    "syncCursor" TEXT,
    "syncNextRetryAt" TIMESTAMP(3),
    "pairedOnce" BOOLEAN NOT NULL DEFAULT false,
    "scenario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "type" "IntegrationEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationError" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "code" "IntegrationErrorCode" NOT NULL,
    "message" TEXT NOT NULL,
    "retryable" BOOLEAN NOT NULL,
    "actionHint" TEXT NOT NULL,
    "retryAfterMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookEndpoint" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "secretEnc" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "lastAcceptedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookDelivery" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "duplicate" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_userId_status_idx" ON "IntegrationConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_userId_providerId_key" ON "IntegrationConnection"("userId", "providerId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_userId_occurredAt_idx" ON "IntegrationEvent"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationError_userId_occurredAt_idx" ON "IntegrationError"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationError_userId_providerId_clearedAt_idx" ON "IntegrationError"("userId", "providerId", "clearedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookEndpoint_path_key" ON "IntegrationWebhookEndpoint"("path");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookEndpoint_userId_providerId_key" ON "IntegrationWebhookEndpoint"("userId", "providerId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookDelivery_endpointId_receivedAt_idx" ON "IntegrationWebhookDelivery"("endpointId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookDelivery_endpointId_eventId_key" ON "IntegrationWebhookDelivery"("endpointId", "eventId");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationError" ADD CONSTRAINT "IntegrationError_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookEndpoint" ADD CONSTRAINT "IntegrationWebhookEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "IntegrationWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
