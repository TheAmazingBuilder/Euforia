CREATE TABLE "PersonalEventsBoard" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalEventsBoard_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "PersonalEventsBoard"
ADD CONSTRAINT "PersonalEventsBoard_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
