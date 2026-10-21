-- Profile module — contact card extras (nullable until the user sets them).
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "company" TEXT;
ALTER TABLE "User" ADD COLUMN "location" TEXT;
