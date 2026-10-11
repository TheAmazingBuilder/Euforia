-- CreateTable
CREATE TABLE "Rule" (
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
CREATE TABLE "RuleViolation" (
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
CREATE TABLE "Alert" (
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
CREATE TABLE "DailyStat" (
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
CREATE TABLE "SkippedTrade" (
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
CREATE TABLE "Mistake" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeMistake" (
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
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeTag" (
    "userId" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TradeTag_pkey" PRIMARY KEY ("tradeId","tagId")
);

-- CreateTable
CREATE TABLE "SessionNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcoEvent" (
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
CREATE TABLE "CalendarBlock" (
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
CREATE TABLE "Goal" (
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
CREATE TABLE "ReviewEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tradeId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLesson" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
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
CREATE TABLE "LiveAnalysis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveLevel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
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
CREATE TABLE "StrategyVersion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setup" (
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
CREATE TABLE "Checklist" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookTemplate" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyFolder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NofyFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyTag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyTemplate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NofyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NofyNote" (
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
CREATE TABLE "AcademyProgress" (
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyProgress_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AcademyLessonNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyQuizAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quizId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyExamAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyBookmark" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyPracticeLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "drill" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPracticeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyEventRegistration" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyEventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rule_userId_isActive_idx" ON "Rule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "RuleViolation_userId_occurredAt_idx" ON "RuleViolation"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "RuleViolation_ruleId_idx" ON "RuleViolation"("ruleId");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyStat_userId_idx" ON "DailyStat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_userId_date_key" ON "DailyStat"("userId", "date");

-- CreateIndex
CREATE INDEX "SkippedTrade_userId_seenAt_idx" ON "SkippedTrade"("userId", "seenAt");

-- CreateIndex
CREATE INDEX "Mistake_userId_idx" ON "Mistake"("userId");

-- CreateIndex
CREATE INDEX "TradeMistake_tradeId_idx" ON "TradeMistake"("tradeId");

-- CreateIndex
CREATE INDEX "TradeMistake_userId_idx" ON "TradeMistake"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "TradeTag_userId_idx" ON "TradeTag"("userId");

-- CreateIndex
CREATE INDEX "SessionNote_userId_date_idx" ON "SessionNote"("userId", "date");

-- CreateIndex
CREATE INDEX "EcoEvent_scheduledAt_idx" ON "EcoEvent"("scheduledAt");

-- CreateIndex
CREATE INDEX "CalendarBlock_userId_date_idx" ON "CalendarBlock"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBlock_userId_date_kind_key" ON "CalendarBlock"("userId", "date", "kind");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "ReviewEntry_userId_tradeId_idx" ON "ReviewEntry"("userId", "tradeId");

-- CreateIndex
CREATE INDEX "ReviewLesson_userId_idx" ON "ReviewLesson"("userId");

-- CreateIndex
CREATE INDEX "LiveSession_userId_status_idx" ON "LiveSession"("userId", "status");

-- CreateIndex
CREATE INDEX "LiveAnalysis_userId_idx" ON "LiveAnalysis"("userId");

-- CreateIndex
CREATE INDEX "LiveLevel_userId_idx" ON "LiveLevel"("userId");

-- CreateIndex
CREATE INDEX "Strategy_userId_idx" ON "Strategy"("userId");

-- CreateIndex
CREATE INDEX "StrategyVersion_userId_idx" ON "StrategyVersion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
CREATE INDEX "Setup_userId_idx" ON "Setup"("userId");

-- CreateIndex
CREATE INDEX "Setup_strategyId_idx" ON "Setup"("strategyId");

-- CreateIndex
CREATE INDEX "Checklist_userId_idx" ON "Checklist"("userId");

-- CreateIndex
CREATE INDEX "PlaybookRule_userId_idx" ON "PlaybookRule"("userId");

-- CreateIndex
CREATE INDEX "PlaybookTemplate_ownerUserId_idx" ON "PlaybookTemplate"("ownerUserId");

-- CreateIndex
CREATE INDEX "NofyFolder_userId_idx" ON "NofyFolder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NofyTag_userId_name_key" ON "NofyTag"("userId", "name");

-- CreateIndex
CREATE INDEX "NofyTemplate_userId_idx" ON "NofyTemplate"("userId");

-- CreateIndex
CREATE INDEX "NofyNote_userId_trashed_idx" ON "NofyNote"("userId", "trashed");

-- CreateIndex
CREATE INDEX "NofyNote_folderId_idx" ON "NofyNote"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLessonNote_userId_lessonId_key" ON "AcademyLessonNote"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AcademyQuizAttempt_userId_quizId_idx" ON "AcademyQuizAttempt"("userId", "quizId");

-- CreateIndex
CREATE INDEX "AcademyExamAttempt_userId_categoryId_idx" ON "AcademyExamAttempt"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyBookmark_userId_kind_refId_key" ON "AcademyBookmark"("userId", "kind", "refId");

-- CreateIndex
CREATE INDEX "AcademyPracticeLog_userId_drill_idx" ON "AcademyPracticeLog"("userId", "drill");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyEventRegistration_userId_eventId_key" ON "AcademyEventRegistration"("userId", "eventId");

-- CreateIndex
CREATE INDEX "AcademyTask_userId_idx" ON "AcademyTask"("userId");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleViolation" ADD CONSTRAINT "RuleViolation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleViolation" ADD CONSTRAINT "RuleViolation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkippedTrade" ADD CONSTRAINT "SkippedTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeMistake" ADD CONSTRAINT "TradeMistake_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTag" ADD CONSTRAINT "TradeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEntry" ADD CONSTRAINT "ReviewEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLesson" ADD CONSTRAINT "ReviewLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAnalysis" ADD CONSTRAINT "LiveAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAnalysis" ADD CONSTRAINT "LiveAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLevel" ADD CONSTRAINT "LiveLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookTemplate" ADD CONSTRAINT "PlaybookTemplate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyFolder" ADD CONSTRAINT "NofyFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyTag" ADD CONSTRAINT "NofyTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyTemplate" ADD CONSTRAINT "NofyTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NofyNote" ADD CONSTRAINT "NofyNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "NofyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLessonNote" ADD CONSTRAINT "AcademyLessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExamAttempt" ADD CONSTRAINT "AcademyExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyBookmark" ADD CONSTRAINT "AcademyBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyPracticeLog" ADD CONSTRAINT "AcademyPracticeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyEventRegistration" ADD CONSTRAINT "AcademyEventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyTask" ADD CONSTRAINT "AcademyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

