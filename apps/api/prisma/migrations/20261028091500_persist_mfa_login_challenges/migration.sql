-- Persist MFA login challenges so verification survives API restarts and works across instances.
ALTER TABLE "AuthChallenge"
  ADD COLUMN "codeHash" TEXT,
  ADD COLUMN "method" TEXT,
  ADD COLUMN "remember" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AuthChallenge_userId_purpose_usedAt_expiresAt_idx"
  ON "AuthChallenge"("userId", "purpose", "usedAt", "expiresAt");
