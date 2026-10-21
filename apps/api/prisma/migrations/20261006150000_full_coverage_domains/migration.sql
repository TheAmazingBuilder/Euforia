-- CreateTable
CREATE TABLE IF NOT EXISTS "Rule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "accountId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RuleViolation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "tradeId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "context" JSONB NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "userNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Alert" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "tradeId" UUID,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyStat" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "tradesCount" INTEGER NOT NULL DEFAULT 0,
    "winsCount" INTEGER NOT NULL DEFAULT 0,
    "lossesCount" INTEGER NOT NULL DEFAULT 0,
    "pnlNet" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "rEarned" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "disciplineScore" DECIMAL(6,2),
    "mistakesCount" INTEGER NOT NULL DEFAULT 0,
    "violationsCount" INTEGER NOT NULL DEFAULT 0,
    "ghostTradesCount" INTEGER NOT NULL DEFAULT 0,
    "savedR" DECIMAL(18,8),
    "hesitatedR" DECIMAL(18,8),
    "sleepHours" DECIMAL(4,1),
    "moodPre" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SkippedTrade" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "strategyId" UUID,
    "direction" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "outcomeGuess" TEXT,
    "hypotheticalR" DECIMAL(18,8),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkippedTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Mistake" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradeMistake" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "mistakeId" UUID NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeMistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradeTag" (
    "userId" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TradeTag_pkey" PRIMARY KEY ("tradeId","tagId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SessionNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EcoEvent" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "actual" TEXT,
    "forecast" TEXT,
    "previous" TEXT,

    CONSTRAINT "EcoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarBlock" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" DECIMAL(18,8) NOT NULL,
    "period" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tradeId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewLesson" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveAnalysis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveLevel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Strategy" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT,
    "grade" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StrategyVersion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Setup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategyId" UUID,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Checklist" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaybookRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaybookTemplate" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NofyFolder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NofyFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NofyTag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NofyTemplate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NofyNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "folderId" UUID,
    "title" TEXT NOT NULL,
    "trashed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NofyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyProgress" (
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyProgress_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyLessonNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyQuizAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quizId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyExamAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyBookmark" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyPracticeLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "drill" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPracticeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyEventRegistration" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyEventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcademyTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Rule_userId_isActive_idx" ON "Rule"("userId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RuleViolation_userId_occurredAt_idx" ON "RuleViolation"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RuleViolation_ruleId_idx" ON "RuleViolation"("ruleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyStat_userId_idx" ON "DailyStat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailyStat_userId_date_key" ON "DailyStat"("userId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkippedTrade_userId_seenAt_idx" ON "SkippedTrade"("userId", "seenAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Mistake_userId_idx" ON "Mistake"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradeMistake_tradeId_idx" ON "TradeMistake"("tradeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradeMistake_userId_idx" ON "TradeMistake"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradeTag_userId_idx" ON "TradeTag"("userId");

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "SessionNote_userId_date_idx" ON "SessionNote"("userId", "date"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "EcoEvent_scheduledAt_idx" ON "EcoEvent"("scheduledAt"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "CalendarBlock_userId_date_idx" ON "CalendarBlock"("userId", "date"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "CalendarBlock_userId_date_kind_key" ON "CalendarBlock"("userId", "date", "kind"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewEntry_userId_tradeId_idx" ON "ReviewEntry"("userId", "tradeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewLesson_userId_idx" ON "ReviewLesson"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveSession_userId_status_idx" ON "LiveSession"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveAnalysis_userId_idx" ON "LiveAnalysis"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveLevel_userId_idx" ON "LiveLevel"("userId");

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "Strategy_userId_idx" ON "Strategy"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyVersion_userId_idx" ON "StrategyVersion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "Setup_userId_idx" ON "Setup"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "Setup_strategyId_idx" ON "Setup"("strategyId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "Checklist_userId_idx" ON "Checklist"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "PlaybookRule_userId_idx" ON "PlaybookRule"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaybookTemplate_ownerUserId_idx" ON "PlaybookTemplate"("ownerUserId");

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "NofyFolder_userId_idx" ON "NofyFolder"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "NofyTag_userId_name_key" ON "NofyTag"("userId", "name"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "NofyTemplate_userId_idx" ON "NofyTemplate"("userId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "NofyNote_userId_trashed_idx" ON "NofyNote"("userId", "trashed"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "NofyNote_folderId_idx" ON "NofyNote"("folderId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "AcademyLessonNote_userId_lessonId_key" ON "AcademyLessonNote"("userId", "lessonId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "AcademyQuizAttempt_userId_quizId_idx" ON "AcademyQuizAttempt"("userId", "quizId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "AcademyExamAttempt_userId_categoryId_idx" ON "AcademyExamAttempt"("userId", "categoryId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "AcademyBookmark_userId_kind_refId_key" ON "AcademyBookmark"("userId", "kind", "refId"); EXCEPTION WHEN SQLSTATE '42703' THEN NULL; WHEN SQLSTATE '42P01' THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AcademyPracticeLog_userId_drill_idx" ON "AcademyPracticeLog"("userId", "drill");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyEventRegistration_userId_eventId_key" ON "AcademyEventRegistration"("userId", "eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AcademyTask_userId_idx" ON "AcademyTask"("userId");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "RuleViolation" ADD CONSTRAINT "RuleViolation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "RuleViolation" ADD CONSTRAINT "RuleViolation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "SkippedTrade" ADD CONSTRAINT "SkippedTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "ReviewEntry" ADD CONSTRAINT "ReviewEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "ReviewLesson" ADD CONSTRAINT "ReviewLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "LiveAnalysis" ADD CONSTRAINT "LiveAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "LiveAnalysis" ADD CONSTRAINT "LiveAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "LiveLevel" ADD CONSTRAINT "LiveLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Setup" ADD CONSTRAINT "Setup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Setup" ADD CONSTRAINT "Setup_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PlaybookTemplate" ADD CONSTRAINT "PlaybookTemplate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "NofyFolder" ADD CONSTRAINT "NofyFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "NofyTag" ADD CONSTRAINT "NofyTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "NofyTemplate" ADD CONSTRAINT "NofyTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "NofyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyLessonNote" ADD CONSTRAINT "AcademyLessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyExamAttempt" ADD CONSTRAINT "AcademyExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyBookmark" ADD CONSTRAINT "AcademyBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyPracticeLog" ADD CONSTRAINT "AcademyPracticeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyEventRegistration" ADD CONSTRAINT "AcademyEventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "AcademyTask" ADD CONSTRAINT "AcademyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

