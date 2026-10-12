-- Phase 15 — Settings bounded context.
-- The user preferences doc moves from the Identity-owned `User.preferences`
-- column (Phase 2 stub) into its OWNED table (Phase 15 §7/§27): one
-- UserSettings row per user, a singleton preference aggregate. The doc shape
-- is unchanged (shared userPreferencesSchema) — this is pure ownership
-- relocation, so the existing data is migrated verbatim.

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" UUID NOT NULL,
    "preferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- Copy existing docs into their owned table BEFORE the column drop
-- (rollback/recovery: re-adding the column from UserSettings restores the
-- Phase 2 shape — the move is reversible at the data level).
-- Note: `updatedAt` has no SQL default (Prisma supplies it client-side), so
-- the backfill provides both timestamps explicitly.
INSERT INTO "UserSettings" ("userId", "preferences", "createdAt", "updatedAt")
SELECT "id", "preferences", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" WHERE "preferences" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RECONCILED: the DropColumn below is intentionally NOT applied — the
-- schema.prisma User model keeps `preferences Json?` (the settings module
-- reads it as the pre-Phase-15 fallback) and UserSettings is the owned copy.
-- ALTER TABLE "User" DROP COLUMN "preferences";
