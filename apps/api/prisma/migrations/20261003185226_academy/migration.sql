-- CreateEnum
CREATE TYPE "AcademyBookmarkKind" AS ENUM ('LESSON', 'GLOSSARY');

-- CreateEnum
CREATE TYPE "AcademyDrill" AS ENUM ('PATTERN_ID', 'CANDLE_LAB', 'STRUCTURE', 'CHECKPOINT', 'SR_LEVEL', 'POSITION_SIZE', 'ZONE_ID', 'SCENARIO', 'FLASHCARD');

-- CreateTable
CREATE TABLE "AcademyLessonCompletion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyLessonCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyQuizAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quizId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyExamAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyBookmark" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AcademyBookmarkKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyLessonNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyLessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyLessonView" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyLessonView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyActivityDay" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyActivityDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyPracticeAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "drill" "AcademyDrill" NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyFlashcardState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 0,
    "due" DATE NOT NULL,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyFlashcardState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyLessonCompletion_userId_completedAt_idx" ON "AcademyLessonCompletion"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLessonCompletion_userId_lessonId_key" ON "AcademyLessonCompletion"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AcademyQuizAttempt_userId_quizId_createdAt_idx" ON "AcademyQuizAttempt"("userId", "quizId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyExamAttempt_userId_categoryId_createdAt_idx" ON "AcademyExamAttempt"("userId", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyBookmark_userId_createdAt_idx" ON "AcademyBookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyBookmark_userId_kind_refId_key" ON "AcademyBookmark"("userId", "kind", "refId");

-- CreateIndex
CREATE INDEX "AcademyLessonNote_userId_updatedAt_idx" ON "AcademyLessonNote"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLessonNote_userId_lessonId_key" ON "AcademyLessonNote"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AcademyLessonView_userId_viewedAt_idx" ON "AcademyLessonView"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLessonView_userId_lessonId_key" ON "AcademyLessonView"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AcademyActivityDay_userId_day_idx" ON "AcademyActivityDay"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyActivityDay_userId_day_key" ON "AcademyActivityDay"("userId", "day");

-- CreateIndex
CREATE INDEX "AcademyPracticeAttempt_userId_drill_createdAt_idx" ON "AcademyPracticeAttempt"("userId", "drill", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyPracticeAttempt_userId_createdAt_idx" ON "AcademyPracticeAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyFlashcardState_userId_due_idx" ON "AcademyFlashcardState"("userId", "due");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyFlashcardState_userId_cardId_key" ON "AcademyFlashcardState"("userId", "cardId");

-- AddForeignKey
ALTER TABLE "AcademyLessonCompletion" ADD CONSTRAINT "AcademyLessonCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyQuizAttempt" ADD CONSTRAINT "AcademyQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExamAttempt" ADD CONSTRAINT "AcademyExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyBookmark" ADD CONSTRAINT "AcademyBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLessonNote" ADD CONSTRAINT "AcademyLessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLessonView" ADD CONSTRAINT "AcademyLessonView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyActivityDay" ADD CONSTRAINT "AcademyActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyPracticeAttempt" ADD CONSTRAINT "AcademyPracticeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyFlashcardState" ADD CONSTRAINT "AcademyFlashcardState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
