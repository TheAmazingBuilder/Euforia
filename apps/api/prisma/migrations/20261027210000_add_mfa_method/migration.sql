-- Persist the selected second-factor method without changing existing TOTP enrollments.
ALTER TABLE "User" ADD COLUMN "mfaMethod" TEXT;

UPDATE "User"
SET "mfaMethod" = 'AUTHENTICATOR_APP'
WHERE "mfaEnabledAt" IS NOT NULL
  AND "mfaSecretEnc" IS NOT NULL;
