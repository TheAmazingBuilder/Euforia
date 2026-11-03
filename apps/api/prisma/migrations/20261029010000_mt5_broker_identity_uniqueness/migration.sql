-- Shared technical connectors (such as MT5 Bridge) can legitimately have
-- identical login numbers at different brokers. Persist a canonical broker key
-- and scope duplicate protection to that broker while retaining legacy rows.
ALTER TABLE "TradingAccount"
ADD COLUMN "brokerId" TEXT NOT NULL DEFAULT 'unknown';

-- Prefer an already confirmed broker identity. For rows whose identity is still
-- unknown/generic, preserve the explicit broker selected at bridge pairing.
UPDATE "TradingAccount" AS account
SET "brokerId" = COALESCE(
  NULLIF(NULLIF(account."brokerIdentity"->>'brokerId', 'unknown'), 'metatrader-platform'),
  connection."expectedBrokerId",
  NULLIF(account."brokerIdentity"->>'brokerId', ''),
  'unknown'
)
FROM "TradingConnection" AS connection
WHERE connection."accountId" = account."id";

-- Provider + login used to be unique without broker scope. Replace the old
-- index only after backfilling the canonical broker key.
DROP INDEX IF EXISTS "TradingAccount_userId_providerId_externalAccountId_key";
CREATE UNIQUE INDEX "TradingAccount_userId_providerId_externalAccountId_brokerId_key"
ON "TradingAccount" ("userId", "providerId", "externalAccountId", "brokerId");
