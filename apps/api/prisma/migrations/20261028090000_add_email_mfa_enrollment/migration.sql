-- Email MFA is not enabled until the mailbox challenge is confirmed.
ALTER TABLE "User" ADD COLUMN "mfaPendingEmailCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaPendingEmailExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaPendingEmailAttempts" INTEGER NOT NULL DEFAULT 0;
