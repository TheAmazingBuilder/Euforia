import type {
  AcademyBlock,
  AcademyBookmark,
  AcademyBookmarkToggleInput,
  AcademyBookmarksResponse,
  AcademyCandle,
  AcademyCatalogResponse,
  AcademyCategoryProgress,
  AcademyCertificationsResponse,
  AcademyCheckpointInput,
  AcademyCheckpointResult,
  AcademyCourseDetailResponse,
  AcademyExamPaper,
  AcademyExamResultResponse,
  AcademyFlashcard,
  AcademyFlashcardReviewInput,
  AcademyFlashcardReviewResponse,
  AcademyFlashcardsResponse,
  AcademyGlossaryResponse,
  AcademyLessonCompleteResponse,
  AcademyLessonNote,
  AcademyLessonResponse,
  AcademyMilestonesResponse,
  AcademyNoteInput,
  AcademyNoteResponse,
  AcademyOverviewResponse,
  AcademyPatternDrill,
  AcademyPositionDrill,
  AcademyPracticeLogInput,
  AcademyPracticeLogResponse,
  AcademyPracticeStats,
  AcademyProgressResponse,
  AcademyQuizQuestion,
  AcademyQuizQuestionPublic,
  AcademyQuizResultResponse,
  AcademyQuizSubmitInput,
  AcademyRecommendation,
  AcademyResume,
  AcademyScenario,
  AcademyScenariosResponse,
  AcademySearchResponse,
  AcademySrDrill,
  AcademyStreak,
  AcademyWeeklyPlan,
  AcademyZoneDrill,
} from "@cosmoz/shared";

import { CATEGORIES, COURSES, LEVEL_ORDER, PATHS } from "./academy/catalog";
import { GLOSSARY_TERMS } from "./academy/glossary";
import { PATTERN_EXEMPLARS } from "./academy/patterns";
import { SCENARIOS } from "./academy/scenarios";

/**
 * Academy engine — the learning domain's server-side brain.
 *
 * Owns per-user learning state (lesson completion, quiz attempts, bookmarks,
 * practice log, daily activity) and serves the catalog authored in
 * mocks/academy/*. Quiz answers and pattern-drill answers NEVER leave the
 * engine ungraded — the client receives public questions only.
 *
 * The mock is single-user, but state is shaped behind a `userKey` so a
 * multi-user backend can drop in real scoping without contract changes
 * (spec §43 — progress must never leak between accounts).
 */

// ── State ────────────────────────────────────────────────────────────────────

type QuizAttempt = { scores: number[]; best: number; lastAt: string; attemptsAt: string[] };

type ExamAttempt = { bestPercent: number; attempts: number; bestAt: string | null };

type AcademyState = {
  userKey: string;
  /** lessonId → completion timestamp (ISO). */
  completedLessons: Map<string, string>;
  /** quizId → attempts. */
  quizAttempts: Map<string, QuizAttempt>;
  bookmarks: AcademyBookmark[];
  practiceAttempts: number;
  practiceCorrect: number;
  /** UTC dates (YYYY-MM-DD) with any learning activity. */
  activityDates: Set<string>;
  /** lessonId of the most recent completion — drives Continue Learning. */
  lastActivityLessonId: string | null;
  /** lessonId → last time the user opened the lesson (Resume Reading). */
  viewedLessons: Map<string, string>;
  /** lessonId → personal note. */
  notes: Map<string, AcademyLessonNote>;
  /** Practice ledger — per-attempt rows (drill, outcome, time). */
  drillLog: { drill: string; correct: boolean; at: string }[];
  /** Patterns the learner missed — resurface with priority until cleared. */
  wrongPatternIds: string[];
  /** Flashcard SRS state (Leitner boxes). */
  flashcardStates: Map<string, { box: number; due: string; reviews: number }>;
  flashcardDay: string;
  flashcardReviewedToday: number;
  /** Category exam attempts — the certification ladder. */
  examAttempts: Map<string, ExamAttempt>;
};

const state: AcademyState = {
  userKey: "demo-user",
  completedLessons: new Map(),
  quizAttempts: new Map(),
  bookmarks: [],
  practiceAttempts: 0,
  practiceCorrect: 0,
  activityDates: new Set(),
  lastActivityLessonId: null,
  viewedLessons: new Map(),
  notes: new Map(),
  drillLog: [],
  wrongPatternIds: [],
  flashcardStates: new Map(),
  flashcardDay: "",
  flashcardReviewedToday: 0,
  examAttempts: new Map(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const utcDate = (at: Date): string => at.toISOString().slice(0, 10);

const courseById = (courseId: string) => COURSES.find((crs) => crs.id === courseId);
const categoryById = (categoryId: string) => CATEGORIES.find((cat) => cat.id === categoryId);

const sortedCourses = (): AuthoredCourseLike[] => {
  const categoryRank = new Map(CATEGORIES.map((cat, index) => [cat.id, index]));
  return [...COURSES].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      (categoryRank.get(a.categoryId) ?? 99) - (categoryRank.get(b.categoryId) ?? 99) ||
      a.title.localeCompare(b.title),
  );
};

type AuthoredCourseLike = (typeof COURSES)[number];

function touchActivity(): void {
  const today = utcDate(new Date());
  state.activityDates.add(today);
}

function streak(): AcademyStreak {
  const dates = [...state.activityDates].sort();
  const today = utcDate(new Date());
  const yesterday = utcDate(new Date(Date.now() - 86_400_000));

  let currentDays = 0;
  if (dates.length > 0) {
    // Walk backwards from today (or yesterday, so yesterday's streak survives).
    let cursor = dates.includes(today) ? today : dates.includes(yesterday) ? yesterday : null;
    while (cursor !== null && dates.includes(cursor)) {
      currentDays += 1;
      cursor = utcDate(new Date(new Date(`${cursor}T00:00:00Z`).getTime() - 86_400_000));
    }
  }

  let longestDays = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of dates) {
    if (prev !== null) {
      const diff = (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime()) / 86_400_000;
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
    activeToday: state.activityDates.has(today),
  };
}

function courseCard(course: AuthoredCourseLike) {
  const completedLessons = course.lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
  const lessonCount = course.lessons.length;
  const quiz = course.quiz ? state.quizAttempts.get(course.quiz.id) : undefined;
  return {
    id: course.id,
    categoryId: course.categoryId,
    title: course.title,
    description: course.description,
    level: course.level,
    lessonCount,
    completedLessons,
    progress: lessonCount === 0 ? 0 : Math.round((completedLessons / lessonCount) * 100),
    estimatedMinutes: course.lessons.reduce((sum, lsn) => sum + lsn.minutes, 0),
    quizId: course.quiz?.id ?? null,
    quizBestScore: quiz?.best ?? null,
    completed: lessonCount > 0 && completedLessons === lessonCount,
  };
}

function lessonSnippet(blocks: AcademyBlock[], query: string): string {
  for (const block of blocks) {
    const bodies: string[] = [];
    if (block.kind === "text" || block.kind === "callout") bodies.push(block.body);
    if (block.kind === "list") bodies.push(...block.items);
    if (block.kind === "example") bodies.push(...block.steps);
    for (const body of bodies) {
      const index = body.toLowerCase().indexOf(query);
      if (index >= 0) {
        const start = Math.max(0, index - 40);
        return (start > 0 ? "…" : "") + body.slice(start, start + 140).trim() + (body.length > start + 140 ? "…" : "");
      }
    }
  }
  return "";
}

// ── Catalog & course detail ──────────────────────────────────────────────────

export function academyCatalog(): AcademyCatalogResponse {
  return {
    categories: CATEGORIES.map((cat, index) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      level: cat.level,
      icon: cat.icon,
      order: index,
    })),
    courses: sortedCourses().map(courseCard),
    paths: PATHS.map((path) => {
      const courses = path.courseIds
        .map((courseId) => COURSES.find((crs) => crs.id === courseId))
        .filter((crs): crs is AuthoredCourseLike => Boolean(crs))
        .map(courseCard);
      const completedCourses = courses.filter((card) => card.completed).length;
      return {
        id: path.id,
        title: path.title,
        description: path.description,
        icon: path.icon,
        courses,
        completedCourses,
        percent: courses.length === 0 ? 0 : Math.round((completedCourses / courses.length) * 100),
      };
    }),
  };
}

export function academyCourseDetail(courseId: string): AcademyCourseDetailResponse | null {
  const course = courseById(courseId);
  if (!course) return null;
  const category = categoryById(course.categoryId);
  if (!category) return null;

  return {
    course: courseCard(course),
    category: { ...category, order: CATEGORIES.findIndex((cat) => cat.id === category.id) },
    objectives: course.objectives,
    lessons: course.lessons.map((lsn, index) => ({
      id: lsn.id,
      courseId: course.id,
      title: lsn.title,
      summary: lsn.summary,
      minutes: lsn.minutes,
      order: index,
      completed: state.completedLessons.has(lsn.id),
    })),
  };
}

// ── Lesson ───────────────────────────────────────────────────────────────────

export function academyLesson(lessonId: string): AcademyLessonResponse | null {
  for (const course of COURSES) {
    const index = course.lessons.findIndex((lsn) => lsn.id === lessonId);
    if (index === -1) continue;
    const lesson = course.lessons[index];
    // Opening a lesson counts as learning activity and drives Resume Reading.
    state.viewedLessons.set(lesson.id, new Date().toISOString());
    touchActivity();
    return {
      id: lesson.id,
      courseId: course.id,
      courseTitle: course.title,
      categoryId: course.categoryId,
      title: lesson.title,
      summary: lesson.summary,
      minutes: lesson.minutes,
      order: index,
      position: index + 1,
      lessonCount: course.lessons.length,
      completed: state.completedLessons.has(lesson.id),
      blocks: lesson.blocks,
      quizId: course.quiz?.id ?? null,
      prevLessonId: course.lessons[index - 1]?.id ?? null,
      nextLessonId: course.lessons[index + 1]?.id ?? null,
      checkpoint: checkpointFor(course, lesson),
      note: state.notes.get(lesson.id) ?? null,
    };
  }
  return null;
}

/** Stable string hash — deterministic checkpoint picks per lesson + day. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Mid-lesson checkpoint — long lessons (≥ 6 blocks) in quiz-bearing courses
 * get ONE question from the course bank, picked deterministically from
 * lessonId + UTC day (rotates daily; same pick for serving and grading).
 * Answers never leave the engine.
 */
function checkpointFor(course: AuthoredCourseLike, lesson: AuthoredCourseLike["lessons"][number]): AcademyQuizQuestionPublic | null {
  if (!course.quiz || lesson.blocks.length < 6) return null;
  const day = utcDate(new Date());
  const index = hashString(`${lesson.id}:${day}`) % course.quiz.questions.length;
  return stripQuestion(course.quiz.questions[index]);
}

export function gradeCheckpoint(lessonId: string, input: AcademyCheckpointInput): AcademyCheckpointResult | null {
  for (const course of COURSES) {
    const lesson = course.lessons.find((lsn) => lsn.id === lessonId);
    if (!lesson) continue;
    if (!course.quiz || lesson.blocks.length < 6) return null;
    const day = utcDate(new Date());
    const question = course.quiz.questions[hashString(`${lesson.id}:${day}`) % course.quiz.questions.length];
    if (question.id !== input.questionId) return null;

    let correct = false;
    let answer: number | boolean = 0;
    if (question.kind === "NUMERIC") {
      const value = typeof input.value === "number" ? input.value : Number.NaN;
      const tolerance = (question.tolerance ?? 0.02) * Math.abs(question.value ?? 0);
      correct = Number.isFinite(value) && Math.abs(value - (question.value ?? 0)) <= Math.max(tolerance, 1e-9);
      answer = question.value ?? 0;
    } else if (question.kind === "TF") {
      correct = typeof input.value === "boolean" && input.value === question.answer;
      answer = question.answer === true;
    } else {
      correct = typeof input.value === "number" && input.value === question.answer;
      answer = typeof question.answer === "number" ? question.answer : 0;
    }

    // Checkpoints feed the same practice ledger as drills (honest aggregate).
    recordAttempt("CHECKPOINT", correct);
    touchActivity();

    return { questionId: question.id, correct, answer, explanation: question.explanation };
  }
  return null;
}

// ── Lesson notes ────────────────────────────────────────────────────────────

export function saveLessonNote(lessonId: string, input: AcademyNoteInput): AcademyNoteResponse | null {
  const lesson = COURSES.flatMap((crs) => crs.lessons).find((lsn) => lsn.id === lessonId);
  if (!lesson) return null;
  const trimmed = input.text.trim();
  let note: AcademyLessonNote;
  if (trimmed === "") {
    state.notes.delete(lessonId);
    note = { lessonId, text: "", updatedAt: new Date().toISOString() };
  } else {
    note = { lessonId, text: trimmed, updatedAt: new Date().toISOString() };
    state.notes.set(lessonId, note);
    touchActivity();
  }
  return { note };
}

export function completeLesson(lessonId: string): AcademyLessonCompleteResponse | null {
  for (const course of COURSES) {
    const lesson = course.lessons.find((lsn) => lsn.id === lessonId);
    if (!lesson) continue;
    if (!state.completedLessons.has(lessonId)) {
      state.completedLessons.set(lessonId, new Date().toISOString());
      state.lastActivityLessonId = lessonId;
      touchActivity();
    }
    const completedLessons = course.lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
    return {
      lessonId,
      courseId: course.id,
      completedLessons,
      lessonCount: course.lessons.length,
      courseCompleted: completedLessons === course.lessons.length,
    };
  }
  return null;
}

// ── Quizzes ──────────────────────────────────────────────────────────────────

function stripQuestion(question: AcademyQuizQuestion): AcademyQuizQuestionPublic {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    unit: question.unit,
  };
}

export function academyQuiz(quizId: string): { id: string; courseId: string; courseTitle: string; questions: AcademyQuizQuestionPublic[] } | null {
  const course = COURSES.find((crs) => crs.quiz?.id === quizId);
  if (!course?.quiz) return null;
  return {
    id: course.quiz.id,
    courseId: course.id,
    courseTitle: course.title,
    questions: course.quiz.questions.map(stripQuestion),
  };
}

export function submitQuiz(quizId: string, input: AcademyQuizSubmitInput): AcademyQuizResultResponse | null {
  const course = COURSES.find((crs) => crs.quiz?.id === quizId);
  if (!course?.quiz) return null;

  const answerMap = new Map(input.answers.map((entry) => [entry.questionId, entry.value ?? null]));
  const results = course.quiz.questions.map((question) => {
    const given = answerMap.get(question.id);
    let correct = false;
    let answer: number | boolean = 0;

    if (question.kind === "NUMERIC") {
      const value = typeof given === "number" ? given : Number.NaN;
      const tolerance = (question.tolerance ?? 0.02) * Math.abs(question.value ?? 0);
      correct = Number.isFinite(value) && Math.abs(value - (question.value ?? 0)) <= Math.max(tolerance, 1e-9);
      answer = question.value ?? 0;
    } else if (question.kind === "TF") {
      correct = typeof given === "boolean" && given === question.answer;
      answer = question.answer === true;
    } else {
      correct = typeof given === "number" && given === question.answer;
      answer = typeof question.answer === "number" ? question.answer : 0;
    }

    return { questionId: question.id, correct, answer, explanation: question.explanation };
  });

  const score = results.filter((res) => res.correct).length;
  const previousBest = state.quizAttempts.get(quizId)?.best ?? null;
  const attempt = state.quizAttempts.get(quizId) ?? { scores: [], best: 0, lastAt: "", attemptsAt: [] };
  attempt.scores.push(score);
  attempt.best = Math.max(attempt.best, score);
  attempt.lastAt = new Date().toISOString();
  attempt.attemptsAt.push(attempt.lastAt);
  state.quizAttempts.set(quizId, attempt);
  touchActivity();

  return {
    quizId,
    score,
    total: course.quiz.questions.length,
    passed: score === course.quiz.questions.length,
    results,
    previousBest,
  };
}

// ── Progress & overview ──────────────────────────────────────────────────────

export function academyProgress(): AcademyProgressResponse {
  const totalLessons = COURSES.reduce((sum, crs) => sum + crs.lessons.length, 0);
  const completedLessons = [...state.completedLessons.keys()].filter((lessonId) =>
    COURSES.some((crs) => crs.lessons.some((lsn) => lsn.id === lessonId)),
  ).length;

  const categories: AcademyCategoryProgress[] = CATEGORIES.map((cat) => {
    const lessons = COURSES.filter((crs) => crs.categoryId === cat.id).flatMap((crs) => crs.lessons);
    const done = lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
    return {
      categoryId: cat.id,
      name: cat.name,
      lessonCount: lessons.length,
      completedLessons: done,
      percent: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
    };
  });

  const quizAttempts = [...state.quizAttempts.values()];
  const quizTaken = quizAttempts.length;
  const quizAverage =
    quizTaken === 0
      ? null
      : Math.round(
          (quizAttempts.reduce((sum, att) => sum + att.best, 0) /
            COURSES.filter((crs) => crs.quiz).reduce((sum, crs) => sum + (crs.quiz?.questions.length ?? 0), 0)) *
            100,
        );

  return {
    overall: {
      percent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      completedLessons,
      lessonCount: totalLessons,
    },
    categories,
    coursesCompleted: COURSES.filter((crs) => crs.lessons.length > 0 && crs.lessons.every((lsn) => state.completedLessons.has(lsn.id))).length,
    courseCount: COURSES.length,
    quizzesTaken: quizTaken,
    quizAverage: quizTaken === 0 ? null : Math.min(100, quizAverage ?? 0),
    streak: streak(),
    practiceAttempts: state.practiceAttempts,
    practiceCorrect: state.practiceCorrect,
  };
}

function continueLearning(): AcademyOverviewResponse["continueLearning"] {
  // Prefer the course with the most recent activity that still has lessons left.
  const inProgress = sortedCourses()
    .filter((crs) => {
      const done = crs.lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
      return done > 0 && done < crs.lessons.length;
    })
    .sort((a, b) => {
      const lastA = Math.max(0, ...a.lessons.map((lsn) => { const at = state.completedLessons.get(lsn.id); return at ? new Date(at).getTime() : 0; }));
      const lastB = Math.max(0, ...b.lessons.map((lsn) => { const at = state.completedLessons.get(lsn.id); return at ? new Date(at).getTime() : 0; }));
      return lastB - lastA;
    });

  const target = inProgress[0] ?? sortedCourses().find((crs) => !crs.lessons.every((lsn) => state.completedLessons.has(lsn.id)));
  if (!target) return null;

  const done = target.lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
  const nextLesson = target.lessons.find((lsn) => !state.completedLessons.has(lsn.id));
  const lastCompleted = [...target.lessons].reverse().find((lsn) => state.completedLessons.has(lsn.id));

  return {
    // Continue points at the NEXT unfinished lesson (fallback: the last one,
    // for the fully-completed edge case).
    lessonId: (nextLesson ?? lastCompleted)?.id ?? target.lessons[0].id,
    lessonTitle: (nextLesson ?? lastCompleted)?.title ?? target.lessons[0].title,
    // 1-based position of the NEXT lesson to open.
    lessonOrder: Math.min(done + 1, target.lessons.length),
    lessonCount: target.lessons.length,
    courseId: target.id,
    courseTitle: target.title,
    categoryId: target.categoryId,
    percent: Math.round((done / target.lessons.length) * 100),
    nextLessonId: nextLesson?.id ?? null,
  };
}

/**
 * Rule-based recommendations — deliberately simple (spec §35). The mapping
 * point for a future engine is HERE: feed weakness signals from Analytics
 * (mistake ledger, discipline scores) into course suggestions without
 * touching contracts or the UI.
 */
function recommendations(): AcademyRecommendation[] {
  const cards = sortedCourses().map((crs) => ({ course: crs, card: courseCard(crs) }));
  const picks: AcademyRecommendation[] = [];

  const unfinished = cards.filter(({ card }) => !card.completed);
  const inProgress = unfinished.filter(({ card }) => card.progress > 0);
  for (const { course, card } of inProgress.slice(0, 2)) {
    picks.push({
      courseId: course.id,
      title: course.title,
      reason: `In progress — ${card.completedLessons}/${card.lessonCount} lessons done.`,
      categoryId: course.categoryId,
    });
  }

  const priorityCategories = ["cat-risk", "cat-fundamentals", "cat-structure"];
  for (const categoryId of priorityCategories) {
    const next = unfinished.find(({ course }) => course.categoryId === categoryId && !picks.some((pick) => pick.courseId === course.id));
    if (next) {
      picks.push({
        courseId: next.course.id,
        title: next.course.title,
        reason: "Foundation track — recommended next for your level.",
        categoryId,
      });
    }
  }

  const advanced = unfinished.find(({ course }) => course.level === "ADVANCED" && !picks.some((pick) => pick.courseId === course.id));
  if (advanced && picks.length < 3) {
    picks.push({
      courseId: advanced.course.id,
      title: advanced.course.title,
      reason: "Advanced track — when the foundations hold.",
      categoryId: advanced.course.categoryId,
    });
  }

  return picks.slice(0, 3);
}

/** The unfinished lesson the user last had open — distinct from the
 *  curriculum's next-up pointer (continueLearning). null → nothing to resume. */
function resumeLearning(): AcademyResume {
  const viewed = [...state.viewedLessons.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .find(([lessonId]) => !state.completedLessons.has(lessonId));
  if (!viewed) return null;
  const [lessonId, viewedAt] = viewed;
  const course = COURSES.find((crs) => crs.lessons.some((lsn) => lsn.id === lessonId));
  const lesson = course?.lessons.find((lsn) => lsn.id === lessonId);
  if (!course || !lesson) return null;
  const done = course.lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
  return {
    lessonId,
    lessonTitle: lesson.title,
    courseId: course.id,
    courseTitle: course.title,
    categoryId: course.categoryId,
    coursePercent: course.lessons.length === 0 ? 0 : Math.round((done / course.lessons.length) * 100),
    viewedAt,
  };
}

export function academyOverview(): AcademyOverviewResponse {
  const recent = [...state.completedLessons.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 6)
    .map(([lessonId, at]) => {
      const course = COURSES.find((crs) => crs.lessons.some((lsn) => lsn.id === lessonId));
      const lesson = course?.lessons.find((lsn) => lsn.id === lessonId);
      return {
        lessonId,
        lessonTitle: lesson?.title ?? lessonId,
        courseTitle: course?.title ?? "",
        at,
      };
    });

  return {
    continueLearning: continueLearning(),
    resume: resumeLearning(),
    progress: academyProgress(),
    weeklyPlan: weeklyPlan(),
    recommendations: recommendations(),
    recent,
  };
}

// ── Weekly study plan ───────────────────────────────────────────────────────

const WEEK_TARGETS = { lessons: 3, drills: 3, quizzes: 1 };

function weeklyPlan(): AcademyWeeklyPlan {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = (monday.getUTCDay() + 6) % 7; // Monday = 0
  monday.setUTCDate(monday.getUTCDate() - dayOfWeek);
  const weekStart = utcDate(monday);
  const inWeek = (iso: string) => utcDate(new Date(iso)) >= weekStart;

  const lessonsDone = [...state.completedLessons.values()].filter(inWeek).length;
  const drillsDone = state.drillLog.filter((row) => inWeek(row.at)).length;
  const quizzesDone = [...state.quizAttempts.values()].flatMap((attempt) => attempt.attemptsAt).filter(inWeek).length;

  return {
    weekStart,
    lessonsTarget: WEEK_TARGETS.lessons,
    lessonsDone,
    drillsTarget: WEEK_TARGETS.drills,
    drillsDone,
    quizzesTarget: WEEK_TARGETS.quizzes,
    quizzesDone,
  };
}

// ── Glossary & search ────────────────────────────────────────────────────────

export function academyGlossary(query?: string): AcademyGlossaryResponse {
  const q = query?.trim().toLowerCase() ?? "";
  const terms = q === "" ? GLOSSARY_TERMS : GLOSSARY_TERMS.filter((term) =>
    `${term.term} ${term.simple} ${term.professional} ${term.related.join(" ")}`.toLowerCase().includes(q),
  );
  return { terms: [...terms].sort((a, b) => a.term.localeCompare(b.term)), total: terms.length };
}

export function academySearch(query: string): AcademySearchResponse {
  const q = query.trim().toLowerCase();
  if (q === "") return { query, courses: [], lessons: [], glossary: [] };

  const courses = sortedCourses()
    .filter((crs) => `${crs.title} ${crs.description} ${crs.objectives.join(" ")}`.toLowerCase().includes(q))
    .map(courseCard)
    .slice(0, 6);

  const lessons = COURSES.flatMap((crs) =>
    crs.lessons
      .filter((lsn) => `${lsn.title} ${lsn.summary} ${lsn.blocks.map(textOf).join(" ")}`.toLowerCase().includes(q))
      .map((lsn) => ({
        id: lsn.id,
        title: lsn.title,
        courseId: crs.id,
        courseTitle: crs.title,
        snippet: lessonSnippet(lsn.blocks, q),
      })),
  ).slice(0, 10);

  const glossary = academyGlossary(q).terms.slice(0, 8);
  return { query, courses, lessons, glossary };

  function textOf(block: AcademyBlock): string {
    if (block.kind === "text" || block.kind === "callout") return block.body;
    if (block.kind === "list") return block.items.join(" ");
    if (block.kind === "example") return block.steps.join(" ");
    if (block.kind === "table") return block.rows.flat().join(" ");
    return "";
  }
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function academyBookmarks(): AcademyBookmarksResponse {
  return { bookmarks: [...state.bookmarks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export function toggleBookmark(input: AcademyBookmarkToggleInput): { bookmarked: boolean } | null {
  const existing = state.bookmarks.find((mark) => mark.kind === input.kind && mark.refId === input.refId);
  if (existing) {
    state.bookmarks = state.bookmarks.filter((mark) => mark !== existing);
    return { bookmarked: false };
  }

  if (input.kind === "LESSON") {
    const lesson = COURSES.flatMap((crs) => crs.lessons.map((lsn) => ({ lsn, crs }))).find(({ lsn }) => lsn.id === input.refId);
    if (!lesson) return null;
    state.bookmarks.push({
      id: `bm-${Date.now()}-${state.bookmarks.length}`,
      kind: "LESSON",
      refId: input.refId,
      title: lesson.lsn.title,
      subtitle: lesson.crs.title,
      href: `/academy?tab=courses&course=${lesson.crs.id}&lesson=${lesson.lsn.id}`,
      createdAt: new Date().toISOString(),
    });
    touchActivity();
    return { bookmarked: true };
  }

  const term = GLOSSARY_TERMS.find((entry) => entry.id === input.refId);
  if (!term) return null;
  state.bookmarks.push({
    id: `bm-${Date.now()}-${state.bookmarks.length}`,
    kind: "GLOSSARY",
    refId: input.refId,
    title: term.term,
    subtitle: "Glossary",
    href: `/academy?tab=glossary&term=${term.id}`,
    createdAt: new Date().toISOString(),
  });
  touchActivity();
  return { bookmarked: true };
}

// ── Practice ─────────────────────────────────────────────────────────────────

export function logPractice(input: AcademyPracticeLogInput): AcademyPracticeLogResponse {
  recordAttempt(input.drill, input.correct, input.refId);
  touchActivity();
  return { practiceAttempts: state.practiceAttempts, practiceCorrect: state.practiceCorrect };
}

/** One honest row in the practice ledger — shared by drills and checkpoints. */
function recordAttempt(drill: string, correct: boolean, refId?: string): void {
  state.practiceAttempts += 1;
  if (correct) state.practiceCorrect += 1;
  state.drillLog.push({ drill, correct, at: new Date().toISOString() });
  if (state.drillLog.length > 300) state.drillLog.splice(0, state.drillLog.length - 300);

  // Weakness bank: missed patterns resurface with priority until answered right.
  if (drill === "PATTERN_ID" && refId) {
    if (correct) {
      state.wrongPatternIds = state.wrongPatternIds.filter((id) => id !== refId);
    } else if (!state.wrongPatternIds.includes(refId)) {
      state.wrongPatternIds.push(refId);
      if (state.wrongPatternIds.length > 12) state.wrongPatternIds.shift();
    }
  }
}

export function practiceStats(): AcademyPracticeStats {
  const DRILL_LABELS: Record<string, string> = {
    PATTERN_ID: "Pattern ID",
    CANDLE_LAB: "Candle Lab",
    STRUCTURE: "Structure",
    CHECKPOINT: "Checkpoints",
    SR_LEVEL: "Support/Resistance",
    POSITION_SIZE: "Position Sizing",
    ZONE_ID: "Supply/Demand",
    SCENARIO: "Scenarios",
    FLASHCARD: "Flashcards",
  };
  const perDrill = Object.entries(DRILL_LABELS).map(([drill, label]) => {
    const rows = state.drillLog.filter((row) => row.drill === drill);
    const attempts = rows.length;
    const correct = rows.filter((row) => row.correct).length;
    return { drill, label, attempts, correct, accuracy: attempts === 0 ? null : Math.round((correct / attempts) * 100) };
  });
  return {
    perDrill,
    recent: [...state.drillLog].reverse().slice(0, 8).map(({ drill, correct, at }) => ({ drill, correct, at })),
  };
}

/** Shuffle helper — deterministic-enough for drills; no crypto needs here. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function patternDrill(): AcademyPatternDrill | null {
  if (PATTERN_EXEMPLARS.length === 0) return null;
  // Weakness bank first: ~50% of rounds resurface a missed pattern.
  const bank = state.wrongPatternIds
    .map((id) => PATTERN_EXEMPLARS.find((entry) => entry.id === id))
    .filter((entry): entry is (typeof PATTERN_EXEMPLARS)[number] => Boolean(entry));
  const exemplar =
    bank.length > 0 && Math.random() < 0.5
      ? bank[Math.floor(Math.random() * bank.length)]
      : PATTERN_EXEMPLARS[Math.floor(Math.random() * PATTERN_EXEMPLARS.length)];
  const optionIds = shuffle([exemplar.answer, ...exemplar.distractors].slice(0, 4));
  while (optionIds.length < 4) optionIds.push(PATTERN_EXEMPLARS[optionIds.length % PATTERN_EXEMPLARS.length].id);
  return {
    patternId: exemplar.id,
    candles: exemplar.candles,
    context: exemplar.context,
    options: optionIds.map((id) => ({
      id,
      label: PATTERN_EXEMPLARS.find((entry) => entry.id === id)?.label ?? id,
    })),
    answer: optionIds.indexOf(exemplar.answer),
    explanation: exemplar.explanation,
  };
}

// ── Engine-generated drills: support/resistance, position sizing, zones ────

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Support/Resistance — a shaped random walk: approach, prior touch, retest,
 *  reaction. The learner reads which side the level is serving. */
export function srDrill(): AcademySrDrill {
  const support = Math.random() < 0.5;
  const level = 100;
  const vol = 1.1;
  const candles: AcademyCandle[] = [];
  let price = support ? level + 9 : level - 9;

  const pushCandle = (o: number, c: number, wickHigh: number, wickLow: number) => {
    candles.push({ o: round2(o), h: round2(Math.max(o, c) + wickHigh), l: round2(Math.min(o, c) - wickLow), c: round2(c) });
    price = c;
  };

  // First approach toward the level.
  for (let i = 0; i < 4; i += 1) {
    const drift = support ? -2.1 : 2.1;
    const c = price + drift + (Math.random() - 0.5) * vol;
    pushCandle(price, c, Math.random() * vol * 0.5, Math.random() * vol * 0.5);
  }
  // Prior touch + reversal away (this is what makes the level honest).
  for (let i = 0; i < 2; i += 1) {
    if (support) {
      const l = level - Math.random() * 1.1;
      const c = price + 1.6 + Math.random() * 0.8;
      pushCandle(price, c, Math.random() * vol * 0.5, price - l);
    } else {
      const h = level + Math.random() * 1.1;
      const c = price - 1.6 - Math.random() * 0.8;
      pushCandle(price, c, h - price, Math.random() * vol * 0.5);
    }
  }
  // Travel back toward the level.
  for (let i = 0; i < 3; i += 1) {
    const drift = support ? 1.8 : -1.8;
    const c = price + drift + (Math.random() - 0.5) * vol;
    pushCandle(price, c, Math.random() * vol * 0.5, Math.random() * vol * 0.5);
  }
  // The retest under examination — wicks probe the level.
  for (let i = 0; i < 2; i += 1) {
    if (support) {
      const l = level - Math.random() * 1.2;
      const c = price + 1.3 + Math.random() * 0.7;
      pushCandle(price, c, Math.random() * vol * 0.4, price - l);
    } else {
      const h = level + Math.random() * 1.2;
      const c = price - 1.3 - Math.random() * 0.7;
      pushCandle(price, c, h - price, Math.random() * vol * 0.4);
    }
  }
  // Resolution away from the level.
  const c = support ? price + 2.1 : price - 2.1;
  pushCandle(price, c, Math.random() * 0.4, Math.random() * 0.4);

  const options = shuffle([
    { id: "support", label: "Support — buyers defended the level, price bounced" },
    { id: "resistance", label: "Resistance — sellers capped the level, price turned down" },
  ]);
  const answerId = support ? "support" : "resistance";
  return {
    candles,
    level,
    context: "Intraday chart, no scheduled news. The dashed line is a horizontal level with a prior touch.",
    prompt: "Price is retesting the dashed level. What is the level doing in this sequence?",
    options,
    answer: options.findIndex((option) => option.id === answerId),
    explanation: support
      ? "Price descended into the level, probed below with wicks, and closed back above before bouncing — the footprint of buyers defending support. A level is a zone of interest, never a guarantee: the reaction is the evidence, and invalidation sits below the retest low."
      : "Price rallied into the level, probed above with wicks, and closed back below before turning down — the footprint of sellers capping resistance. A level is a zone of interest, never a guarantee: the reaction is the evidence, and invalidation sits above the retest high.",
  };
}

/** Position sizing — the arithmetic that keeps traders solvent, randomized. */
export function positionDrill(): AcademyPositionDrill {
  const balances = [5000, 10000, 25000, 50000];
  const percents = [0.5, 1, 1.5, 2];
  const accountBalance = balances[Math.floor(Math.random() * balances.length)];
  const riskPercent = percents[Math.floor(Math.random() * percents.length)];
  const riskBudget = (accountBalance * riskPercent) / 100;
  const entry = round2(80 + Math.random() * 40);
  const stopDistance = round2(0.4 + Math.random() * 1.6);
  const stop = round2(entry - stopDistance);
  const answer = Math.round((riskBudget / stopDistance) * 10) / 10;

  return {
    accountBalance,
    riskPercent,
    entry,
    stop,
    pointValue: 1,
    prompt: `Account $${accountBalance.toLocaleString("en-US")}, risk rule ${riskPercent}% ($${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })}). Long entry ${entry}, stop ${stop}. Each unit loses $1 per point of adverse movement. What position size (units) keeps the loss at the stop exactly within the risk budget?`,
    unit: "units",
    answer,
    tolerance: 0.03,
    explanation: `Risk budget = $${accountBalance.toLocaleString("en-US")} × ${riskPercent}% = $${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Stop distance = ${entry} − ${stop} = ${stopDistance}. Size = budget ÷ distance = ${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })} ÷ ${stopDistance} = ${answer} units. Confidence never sizes a position — the stop distance and the account rule do.`,
  };
}

/** Supply/Demand — two bands, one displacement origin. The learner reads
 *  which band buyers (or sellers) built. Identity is never on the wire. */
export function zoneDrill(): AcademyZoneDrill {
  const vol = 1.2;
  const candles: AcademyCandle[] = [];
  let price = 100;

  const pushCandle = (o: number, c: number, wickHigh: number, wickLow: number) => {
    candles.push({ o: round2(o), h: round2(Math.max(o, c) + wickHigh), l: round2(Math.min(o, c) - wickLow), c: round2(c) });
    price = c;
  };

  // Drop into the demand band (91-94), base, then rally away with displacement.
  for (let i = 0; i < 3; i += 1) {
    const c = price - 2.4 - Math.random();
    pushCandle(price, c, Math.random() * vol * 0.4, Math.random() * vol * 0.5);
  }
  for (let i = 0; i < 2; i += 1) {
    const c = price + (Math.random() - 0.5) * 1.2;
    pushCandle(price, c, Math.random() * 0.8, Math.random() * 0.8);
  }
  for (let i = 0; i < 3; i += 1) {
    const c = price + 3.4 + Math.random();
    pushCandle(price, c, Math.random() * vol * 0.5, Math.random() * 0.4);
  }
  // Stall at the supply band (103-106): wicks above, closes back below.
  for (let i = 0; i < 2; i += 1) {
    const h = 105.2 + Math.random() * 1.2;
    const c = price - 1.8 - Math.random() * 0.8;
    pushCandle(price, c, h - price, Math.random() * vol * 0.4);
  }
  // Fall back to mid-range and drift sideways.
  for (let i = 0; i < 3; i += 1) {
    const c = price - 1.9 - Math.random() * 0.6;
    pushCandle(price, c, Math.random() * vol * 0.4, Math.random() * vol * 0.4);
  }
  for (let i = 0; i < 2; i += 1) {
    const c = price + (Math.random() - 0.5) * 1.4;
    pushCandle(price, c, Math.random() * 0.9, Math.random() * 0.9);
  }

  // Bands: demand where the rally was born, supply where it stalled.
  const bands = [
    { top: 106, bottom: 103, identity: "supply" },
    { top: 94, bottom: 91, identity: "demand" },
  ];
  const ordered = Math.random() < 0.5 ? bands : [bands[1], bands[0]];
  const zones = ordered.map((band, index) => ({ top: band.top, bottom: band.bottom, tag: "AB"[index] }));
  const demandTag = ordered[0].identity === "demand" ? "A" : "B";

  const options = [
    { id: "a", label: `Band A (${demandTag === "A" ? "the lower band" : "the upper band"}) is the demand zone` },
    { id: "b", label: `Band B (${demandTag === "B" ? "the lower band" : "the upper band"}) is the demand zone` },
  ];
  return {
    candles,
    zones,
    context: "Daily chart, trending leg followed by a pullback. Bands mark prior reaction areas.",
    prompt: "Which band is the demand zone — the area where buyers previously stepped in with displacement?",
    options,
    answer: demandTag === "A" ? 0 : 1,
    explanation:
      "Demand is where aggressive buying originated: the strong rally away from the lower band is displacement — the footprint of unfilled interest. Supply sits where the rally stalled and rolled over. Price returning toward a demand zone is where buyers may defend again — potential, never a promise.",
  };
}

// ── Scenarios (self-paced decision sequences) ──────────────────────────────

export function academyScenarios(): AcademyScenariosResponse {
  return { scenarios: SCENARIOS satisfies AcademyScenario[] };
}

// ── Flashcards — Leitner boxes over glossary + lesson takeaways ────────────

const FLASH_INTERVALS = [1, 2, 4, 8, 15]; // days per box
const FLASHCARD_DAILY_CAP = 10;

type DeckCard = AcademyFlashcard;
let deckCache: DeckCard[] | null = null;

function buildFlashcardDeck(): DeckCard[] {
  if (deckCache) return deckCache;
  const deck: DeckCard[] = [];

  for (const term of GLOSSARY_TERMS) {
    deck.push({
      id: `fc-term-${term.id}`,
      kind: "TERM",
      front: term.term,
      back: term.simple,
      source: "Glossary",
      categoryId: term.categoryId,
    });
  }

  for (const course of COURSES) {
    for (const lesson of course.lessons) {
      const takeaways = lesson.blocks.find((block) => block.kind === "takeaways");
      if (takeaways?.kind !== "takeaways") continue;
      takeaways.items.forEach((item, index) => {
        deck.push({
          id: `fc-take-${lesson.id}-${index}`,
          kind: "TAKEAWAY",
          front: `${lesson.title} — key takeaway`,
          back: item,
          source: lesson.title,
          categoryId: course.categoryId,
        });
      });
    }
  }

  deckCache = deck;
  return deck;
}

export function flashcards(): AcademyFlashcardsResponse {
  const deck = buildFlashcardDeck();
  const today = utcDate(new Date());
  const reviewedToday = state.flashcardDay === today ? state.flashcardReviewedToday : 0;
  const dueCards = deck.filter((card) => {
    const st = state.flashcardStates.get(card.id);
    return !st || st.due <= today;
  });
  const remaining = Math.max(0, FLASHCARD_DAILY_CAP - reviewedToday);
  const queue = dueCards.slice(0, remaining).map((card) => ({ ...card, extra: false }));
  if (queue.length === 0) {
    // Nothing due — free practice keeps the deck warm without touching caps.
    const free = shuffle(deck).slice(0, 5).map((card) => ({ ...card, extra: true }));
    return { due: free, dueCount: dueCards.length, reviewedToday, totalCards: deck.length };
  }
  return { due: queue, dueCount: dueCards.length, reviewedToday, totalCards: deck.length };
}

export function reviewFlashcard(input: AcademyFlashcardReviewInput): AcademyFlashcardReviewResponse | null {
  const deck = buildFlashcardDeck();
  if (!deck.some((card) => card.id === input.cardId)) return null;

  const today = utcDate(new Date());
  if (state.flashcardDay !== today) {
    state.flashcardDay = today;
    state.flashcardReviewedToday = 0;
  }

  const st = state.flashcardStates.get(input.cardId) ?? { box: 0, due: today, reviews: 0 };
  if (input.grade === "AGAIN") {
    st.box = 0;
    st.due = today; // resurfaces this session / next one
  } else {
    const steps = input.grade === "EASY" ? 2 : 1;
    st.box = Math.min(st.box + steps, FLASH_INTERVALS.length - 1);
    st.due = utcDate(new Date(Date.now() + FLASH_INTERVALS[st.box] * 86_400_000));
  }
  st.reviews += 1;
  state.flashcardStates.set(input.cardId, st);

  recordAttempt("FLASHCARD", input.grade !== "AGAIN", input.cardId);
  touchActivity();

  const dueRemaining = deck.filter((card) => {
    const cardState = state.flashcardStates.get(card.id);
    return !cardState || cardState.due <= today;
  }).length;
  return { reviewedToday: state.flashcardReviewedToday, dueRemaining };
}

// ── Category certifications — exams over the category's question pool ─────

const EXAM_SIZE = 20;

function examPool(categoryId: string): AcademyQuizQuestion[] {
  return COURSES.filter((crs) => crs.categoryId === categoryId).flatMap((crs) => crs.quiz?.questions ?? []);
}

function tierOf(percent: number): AcademyExamResultResponse["tier"] {
  if (percent >= 90) return "GOLD";
  if (percent >= 70) return "SILVER";
  if (percent >= 50) return "BRONZE";
  return "NONE";
}

export function examPaper(categoryId: string): AcademyExamPaper | null {
  if (!categoryById(categoryId)) return null;
  const pool = examPool(categoryId);
  if (pool.length === 0) return null;
  const picked = shuffle(pool).slice(0, Math.min(EXAM_SIZE, pool.length));
  return { categoryId, questions: picked.map(stripQuestion) };
}

export function submitExam(categoryId: string, input: AcademyQuizSubmitInput): AcademyExamResultResponse | null {
  const pool = examPool(categoryId);
  if (pool.length === 0) return null;

  const answerMap = new Map(input.answers.map((entry) => [entry.questionId, entry.value ?? null]));
  // Grade only questions that belong to this category's pool (defensive).
  const graded = pool
    .filter((question) => answerMap.has(question.id))
    .map((question) => {
      const given = answerMap.get(question.id);
      let correct = false;
      let answer: number | boolean = 0;
      if (question.kind === "NUMERIC") {
        const value = typeof given === "number" ? given : Number.NaN;
        const tolerance = (question.tolerance ?? 0.02) * Math.abs(question.value ?? 0);
        correct = Number.isFinite(value) && Math.abs(value - (question.value ?? 0)) <= Math.max(tolerance, 1e-9);
        answer = question.value ?? 0;
      } else if (question.kind === "TF") {
        correct = typeof given === "boolean" && given === question.answer;
        answer = question.answer === true;
      } else {
        correct = typeof given === "number" && given === question.answer;
        answer = typeof question.answer === "number" ? question.answer : 0;
      }
      return { questionId: question.id, correct, answer, explanation: question.explanation };
    });

  const score = graded.filter((res) => res.correct).length;
  const total = graded.length;
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);
  const previous = state.examAttempts.get(categoryId);
  const previousBestPercent = previous?.bestPercent ?? null;
  const bestPercent = Math.max(previousBestPercent ?? 0, percent);
  state.examAttempts.set(categoryId, {
    bestPercent,
    attempts: (previous?.attempts ?? 0) + 1,
    bestAt: percent >= (previous?.bestPercent ?? 0) ? new Date().toISOString() : previous?.bestAt ?? null,
  });
  touchActivity();

  return {
    categoryId,
    score,
    total,
    passed: percent >= 50,
    tier: tierOf(percent),
    bestPercent,
    previousBestPercent,
    results: graded,
  };
}

export function certifications(): AcademyCertificationsResponse {
  return {
    certifications: CATEGORIES.map((cat) => {
      const attempt = state.examAttempts.get(cat.id);
      return {
        categoryId: cat.id,
        name: cat.name,
        bestPercent: attempt?.bestPercent ?? null,
        attempts: attempt?.attempts ?? 0,
        tier: attempt ? tierOf(attempt.bestPercent) : "NONE",
        questionPool: examPool(cat.id).length,
      };
    }),
  };
}

// ── Milestones — sober, computed from real state ─────────────────────────

export function milestones(): AcademyMilestonesResponse {
  const completedCount = state.completedLessons.size;
  const coursesDone = COURSES.filter((crs) => crs.lessons.length > 0 && crs.lessons.every((lsn) => state.completedLessons.has(lsn.id))).length;
  const quizCount = state.quizAttempts.size;
  const examsPassed = [...state.examAttempts.values()].filter((attempt) => attempt.bestPercent >= 50).length;
  const categoryPercents = CATEGORIES.map((cat) => {
    const lessons = COURSES.filter((crs) => crs.categoryId === cat.id).flatMap((crs) => crs.lessons);
    const done = lessons.filter((lsn) => state.completedLessons.has(lsn.id)).length;
    return lessons.length === 0 ? 0 : done / lessons.length;
  });
  const bestCategory = Math.max(0, ...categoryPercents);
  const flashcardReviews = [...state.flashcardStates.values()].reduce((sum, st) => sum + st.reviews, 0);
  const scenarioSteps = state.drillLog.filter((row) => row.drill === "SCENARIO").length;
  const notesCount = state.notes.size;

  const streakInfo = streak();

  const build = (
    id: string,
    label: string,
    description: string,
    current: number,
    target: number,
    achievedAt: string | null,
  ): AcademyMilestoneResponse => ({
    id,
    label,
    description,
    achieved: current >= target,
    achievedAt: current >= target ? achievedAt ?? new Date().toISOString() : null,
    progress: current >= target ? null : { current, target },
  });

  return {
    milestones: [
      build("first-lesson", "First steps", "Complete your first lesson", completedCount, 1, [...state.completedLessons.values()].sort()[0] ?? null),
      build("first-course", "Course complete", "Finish an entire course", coursesDone, 1, null),
      build("first-quiz", "Prove it", "Take your first course quiz", quizCount, 1, null),
      build("lessons-10", "Ten down", "Complete 10 lessons", completedCount, 10, null),
      build("lessons-25", "Quarter century", "Complete 25 lessons", completedCount, 25, null),
      build("lessons-50", "Curriculum hound", "Complete 50 lessons", completedCount, 50, null),
      build("streak-7", "One week loop", "Reach a 7-day learning streak", streakInfo.longestDays, 7, null),
      build("streak-30", "Month of reps", "Reach a 30-day learning streak", streakInfo.longestDays, 30, null),
      build("category-master", "Track mastered", "Bring any category to 100%", Math.round(bestCategory * 100), 100, null),
      build("first-exam", "Certified", "Pass a category certification", examsPassed, 1, null),
      build("flashcards-50", "Recall trained", "Review 50 flashcards", flashcardReviews, 50, null),
      build("scenarios-6", "Decision trained", "Work through 6 scenario decisions", scenarioSteps, 6, null),
      build("notes-3", "Margin writer", "Save notes on 3 lessons", notesCount, 3, null),
    ],
  };
}

type AcademyMilestoneResponse = AcademyMilestonesResponse["milestones"][number];
