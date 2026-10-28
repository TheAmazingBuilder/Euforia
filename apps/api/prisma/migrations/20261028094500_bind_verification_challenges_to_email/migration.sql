-- Bind verification challenges to the address they were issued for.
-- This prevents a stale link sent to an old address from verifying a changed address.
ALTER TABLE "AuthChallenge"
  ADD COLUMN "targetEmail" TEXT;
