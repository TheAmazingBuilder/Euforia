-- Replay module — the first-class historical replay context (REPLAY MASTER
-- PROMPT). Same Row-store pattern as SessionLiveRow/PlaybookRow: kind +
-- shared-contract JSON per user, row id = entity id. NO candle storage —
-- historical market data stays provider-owned (§41).

CREATE TABLE "ReplayRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReplayRow_userId_kind_idx" ON "ReplayRow"("userId", "kind");

ALTER TABLE "ReplayRow" ADD CONSTRAINT "ReplayRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
