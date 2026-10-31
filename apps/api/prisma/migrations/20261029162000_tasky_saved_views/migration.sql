-- Tasky saved views: per-user search/filter/sort presets.
CREATE TABLE "TaskySavedView" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskySavedView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskySavedView_userId_name_key"
    ON "TaskySavedView"("userId", "name");
CREATE INDEX "TaskySavedView_userId_updatedAt_idx"
    ON "TaskySavedView"("userId", "updatedAt" DESC);
ALTER TABLE "TaskySavedView"
    ADD CONSTRAINT "TaskySavedView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
