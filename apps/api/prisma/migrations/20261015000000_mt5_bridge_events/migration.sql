-- Phase 08 — MT5 terminal bridge (additive, backward-compatible).
--
-- 1. TradingConnection.bridgeKeyId: public, non-secret routing key for
--    PLATFORM_BRIDGE connections. The terminal sends it in a header so the
--    ingest endpoint can locate the connection without a JWT; the bridge
--    SECRET stays in credentialsEnc. Unique: one bridge key per connection,
--    never shared across connections.
-- 2. TradingBridgeEvent: the push log. One row per accepted (or replayed)
--    terminal event; the pull-adapter reads the LATEST event of each kind.
--    (bridgeKeyId, eventId) unique = idempotency ledger — a replayed event
--    is acknowledged, never double-applied.

ALTER TABLE "TradingConnection" ADD COLUMN "bridgeKeyId" TEXT;

CREATE UNIQUE INDEX "TradingConnection_bridgeKeyId_key" ON "TradingConnection"("bridgeKeyId");

-- CreateTable
CREATE TABLE "TradingBridgeEvent" (
    "id" UUID NOT NULL,
    "bridgeKeyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingBridgeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradingBridgeEvent_bridgeKeyId_eventId_key" ON "TradingBridgeEvent"("bridgeKeyId", "eventId");

-- CreateIndex
CREATE INDEX "TradingBridgeEvent_bridgeKeyId_kind_receivedAt_idx" ON "TradingBridgeEvent"("bridgeKeyId", "kind", "receivedAt");
