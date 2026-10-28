-- Bind verification challenges to the address they were issued for.
-- This prevents a stale link sent to an old address from verifying a changed address.
ALTER TABLE "AuthChallenge"
  ADD COLUMN "targetEmail" TEXT;

-- Legacy links were not bound to an address. Invalidate them so they cannot
-- verify an email changed before this migration; pending users can request resend.
DELETE FROM "AuthChallenge"
WHERE "purpose" = 'EMAIL_VERIFICATION'
  AND "targetEmail" IS NULL;
