/**
 * Academy learning-state derivations — streaks, weekly habit loop, derived
 * quiz averages and milestones. Pure functions over plain inputs so every
 * counter is computed from the persisted ledger on read (Phase 11 §27/§29/§30:
 * no duplicated counters that can go stale).
 *
 * Parity source: mocks/academy-engine.ts (streak/weeklyPlan/progress/
 * milestones). All day arithmetic is UTC — the mock's contract.
 */
import type {
  AcademyMilestonesResponse,
  AcademyProgressResponse,
  AcademyStreak,
  AcademyWeeklyPlan,
} from "../../../shared/contracts";
import { CATEGORIES, COURSES } from "../content/catalog";
import { categoryProgress } from "./catalog";

// ── Clock helpers ────────────────────────────────────────────────────────────

export const utcDateKey = (at: Date): string => at.toISOString().slice(0, 10);

export const dayKeyToDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

const DAY_MS = 86_400_000;

// ── Streak (UTC day walk — parity verbatim) ─────────────────────────────────

export function streak(activityDays: readonly string[], today: Date): AcademyStreak {
  const dates = [...new Set(activityDays)].sort();
  const todayKey = utcDateKey(today);
  const yesterdayKey = utcDateKey(new Date(today.getTime() - DAY_MS));

  let currentDays = 0;
  if (dates.length > 0) {
    // Walk backwards from today (or yesterday, so yesterday's streak survives).
    let cursor =
      dates.includes(todayKey) ? todayKey : dates.includes(yesterdayKey) ? yesterdayKey : null;
    while (cursor !== null && dates.includes(cursor)) {
      currentDays += 1;
      cursor = utcDateKey(new Date(dayKeyToDate(cursor).getTime() - DAY_MS));
    }
  }

  let longestDays = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of dates) {
    if (prev !== null) {
      const diff = (dayKeyToDate(date).getTime() - dayKeyToDate(prev).getTime()) / DAY_MS;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longestDays = Math.max(longestDays, run);
    prev = date;
  }

  return {
    currentDays,
    longestDays: Math.max(longestDays, currentDays),
    lastActivityDate: dates.at(-1) ?? null,
    activeToday: dates.includes(todayKey),
  };
}

// ── Weekly habit loop (Monday-anchored UTC week — parity verbatim) ──────────

export const WEEK_TARGETS = { lessons: 3, drills: 3, quizzes: 1 } as const;

/** Monday (UTC) that starts the week containing `now`. */
export function weekStartOf(now: Date): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = (monday.getUTCDay() + 6) % 7; // Monday = 0
  monday.setUTCDate(monday.getUTCDate() - dayOfWeek);
  return utcDateKey(monday);
}

export function weeklyPlan(input: {
  now: Date;
  lessonCompletionsAt: readonly string[];
  drillAttemptsAt: readonly string[];
  quizAttemptsAt: readonly string[];
}): AcademyWeeklyPlan {
  const weekStart = weekStartOf(input.now);
  const inWeek = (iso: string) => utcDateKey(new Date(iso)) >= weekStart;

  return {
    weekStart,
    lessonsTarget: WEEK_TARGETS.lessons,
    lessonsDone: input.lessonCompletionsAt.filter(inWeek).length,
    drillsTarget: WEEK_TARGETS.drills,
    drillsDone: input.drillAttemptsAt.filter(inWeek).length,
    quizzesTarget: WEEK_TARGETS.quizzes,
    quizzesDone: input.quizAttemptsAt.filter(inWeek).length,
  };
}

// ── Progress aggregation (parity verbatim, incl. the quiz-average rule) ─────

export interface QuizAttemptSeed {
  quizId: string;
  score: number;
}

export function progress(input: {
  today: Date;
  activityDays: readonly string[];
  completedLessonIds: ReadonlySet<string>;
  quizAttempts: readonly QuizAttemptSeed[];
  practiceAttempts: number;
  practiceCorrect: number;
}): AcademyProgressResponse {
  const totalLessons = COURSES.reduce((sum, course) => sum + course.lessons.length, 0);
  const completedLessons = [...input.completedLessonIds].filter((lessonId) =>
    COURSES.some((course) => course.lessons.some((lesson) => lesson.id === lessonId)),
  ).length;

  // Mock-parity: ONE entry per attempted QUIZ (its best score) — defensive
  // deduplication so callers can pass raw attempt rows.
  const bestPerQuiz = new Map<string, number>();
  for (const attempt of input.quizAttempts) {
    bestPerQuiz.set(attempt.quizId, Math.max(bestPerQuiz.get(attempt.quizId) ?? 0, attempt.score));
  }

  const quizTaken = bestPerQuiz.size;
  let quizAverage: number | null = null;
  if (quizTaken > 0) {
    const questionPool = COURSES.filter((course) => course.quiz).reduce(
      (sum, course) => sum + (course.quiz?.questions.length ?? 0),
      0,
    );
    const bestSum = [...bestPerQuiz.values()].reduce((sum, score) => sum + score, 0);
    quizAverage = Math.min(100, Math.round((bestSum / questionPool) * 100));
  }

  return {
    overall: {
      percent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      completedLessons,
      lessonCount: totalLessons,
    },
    categories: categoryProgress({ completedLessonIds: input.completedLessonIds, quizBest: new Map() }),
    coursesCompleted: COURSES.filter(
      (course) =>
        course.lessons.length > 0 &&
        course.lessons.every((lesson) => input.completedLessonIds.has(lesson.id)),
    ).length,
    courseCount: COURSES.length,
    quizzesTaken: quizTaken,
    quizAverage,
    streak: streak(input.activityDays, input.today),
    practiceAttempts: input.practiceAttempts,
    practiceCorrect: input.practiceCorrect,
  };
}

// ── Milestones (sober, computed from real state — parity verbatim) ──────────

export interface MilestoneSeed {
  completedLessonIds: ReadonlySet<string>;
  oldestCompletionAt: string | null;
  quizAttemptCount: number;
  examBestPercents: readonly number[];
  flashcardReviewCount: number;
  scenarioStepCount: number;
  noteCount: number;
  /** Longest streak (service derives it from the activity-day ledger). */
  streakLongest: number;
}

export function milestones(seed: MilestoneSeed): AcademyMilestonesResponse {
  const completedCount = seed.completedLessonIds.size;
  const coursesDone = COURSES.filter(
    (course) =>
      course.lessons.length > 0 &&
      course.lessons.every((lesson) => seed.completedLessonIds.has(lesson.id)),
  ).length;
  const examsPassed = seed.examBestPercents.filter((percent) => percent >= 50).length;
  const bestCategory = Math.max(
    0,
    ...CATEGORIES.map((category) => {
      const lessons = COURSES.filter((course) => course.categoryId === category.id).flatMap(
        (course) => course.lessons,
      );
      const done = lessons.filter((lesson) => seed.completedLessonIds.has(lesson.id)).length;
      return lessons.length === 0 ? 0 : done / lessons.length;
    }),
  );
  const streakInfo = { longestDays: seed.streakLongest };

  const build = (
    id: string,
    label: string,
    description: string,
    current: number,
    target: number,
    achievedAt: string | null,
  ): AcademyMilestonesResponse["milestones"][number] => ({
    id,
    label,
    description,
    achieved: current >= target,
    achievedAt: current >= target ? achievedAt ?? new Date().toISOString() : null,
    progress: current >= target ? null : { current, target },
  });

  return {
    milestones: [
      build("first-lesson", "First steps", "Complete your first lesson", completedCount, 1, seed.oldestCompletionAt),
      build("first-course", "Course complete", "Finish an entire course", coursesDone, 1, null),
      build("first-quiz", "Prove it", "Take your first course quiz", seed.quizAttemptCount, 1, null),
      build("lessons-10", "Ten down", "Complete 10 lessons", completedCount, 10, null),
      build("lessons-25", "Quarter century", "Complete 25 lessons", completedCount, 25, null),
      build("lessons-50", "Curriculum hound", "Complete 50 lessons", completedCount, 50, null),
      build("streak-7", "One week loop", "Reach a 7-day learning streak", streakInfo.longestDays, 7, null),
      build("streak-30", "Month of reps", "Reach a 30-day learning streak", streakInfo.longestDays, 30, null),
      build("category-master", "Track mastered", "Bring any category to 100%", Math.round(bestCategory * 100), 100, null),
      build("first-exam", "Certified", "Pass a category certification", examsPassed, 1, null),
      build("flashcards-50", "Recall trained", "Review 50 flashcards", seed.flashcardReviewCount, 50, null),
      build("scenarios-6", "Decision trained", "Work through 6 scenario decisions", seed.scenarioStepCount, 6, null),
      build("notes-3", "Margin writer", "Save notes on 3 lessons", seed.noteCount, 3, null),
    ],
  };
}


