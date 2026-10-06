-- CreateTable
CREATE TABLE "DisciplineRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplineRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSubRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeSubRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNoteRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNoteRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkippedTradeRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkippedTradeRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBlockRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBlockRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tradeId" UUID,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLiveRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionLiveRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NofyRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyRow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisciplineRow_userId_kind_idx" ON "DisciplineRow"("userId", "kind");

-- CreateIndex
CREATE INDEX "TradeSubRow_userId_tradeId_kind_idx" ON "TradeSubRow"("userId", "tradeId", "kind");

-- CreateIndex
CREATE INDEX "SessionNoteRow_userId_idx" ON "SessionNoteRow"("userId");

-- CreateIndex
CREATE INDEX "SkippedTradeRow_userId_idx" ON "SkippedTradeRow"("userId");

-- CreateIndex
CREATE INDEX "CalendarBlockRow_userId_date_idx" ON "CalendarBlockRow"("userId", "date");

-- CreateIndex
CREATE INDEX "ReviewRow_userId_kind_idx" ON "ReviewRow"("userId", "kind");

-- CreateIndex
CREATE INDEX "SessionLiveRow_userId_kind_idx" ON "SessionLiveRow"("userId", "kind");

-- CreateIndex
CREATE INDEX "PlaybookRow_userId_kind_idx" ON "PlaybookRow"("userId", "kind");

-- CreateIndex
CREATE INDEX "NofyRow_userId_kind_idx" ON "NofyRow"("userId", "kind");

-- CreateIndex
CREATE INDEX "AcademyRow_userId_kind_idx" ON "AcademyRow"("userId", "kind");

-- AddForeignKey
ALTER TABLE "DisciplineRow" ADD CONSTRAINT "DisciplineRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSubRow" ADD CONSTRAINT "TradeSubRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteRow" ADD CONSTRAINT "SessionNoteRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkippedTradeRow" ADD CONSTRAINT "SkippedTradeRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlockRow" ADD CONSTRAINT "CalendarBlockRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRow" ADD CONSTRAINT "ReviewRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLiveRow" ADD CONSTRAINT "SessionLiveRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRow" ADD CONSTRAINT "PlaybookRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyRow" ADD CONSTRAINT "NofyRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyRow" ADD CONSTRAINT "AcademyRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
