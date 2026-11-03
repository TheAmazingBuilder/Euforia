-- Persist the original "remember me" choice so refresh cannot upgrade
-- a short-lived session to the long-lived refresh policy.
ALTER TABLE "Session"
ADD COLUMN "remember" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the closest recoverable intent for sessions created before this
-- field existed: sessions whose original lifetime exceeded one day were
-- remembered sessions; all others remain short-lived.
UPDATE "Session"
SET "remember" = ("expiresAt" - "createdAt") > INTERVAL '1 day';
