import type {
  AcademyBlock,
  AcademyBookmark,
  AcademyBookmarkToggleInput,
  AcademyBookmarksResponse,
  AcademyCatalogResponse,
  AcademyCategoryProgress,
  AcademyCheckpointInput,
  AcademyCheckpointResult,
  AcademyCourseDetailResponse,
  AcademyGlossaryResponse,
  AcademyLessonCompleteResponse,
  AcademyLessonNote,
  AcademyLessonResponse,
  AcademyNoteInput,
  AcademyNoteResponse,
  AcademyOverviewResponse,
  AcademyPatternDrill,
  AcademyPracticeLogInput,
  AcademyPracticeLogResponse,
  AcademyProgressResponse,
  AcademyQuizQuestion,
  AcademyQuizQuestionPublic,
  AcademyQuizResultResponse,
  AcademyQuizSubmitInput,
  AcademyRecommendation,
  AcademyResume,
  AcademySearchResponse,
  AcademyStreak,
} from "@cosmoz/shared";

import { CATEGORIES, COURSES, LEVEL_ORDER } from "./academy/catalog";
import { GLOSSARY_TERMS } from "./academy/glossary";
import { PATTERN_EXEMPLARS } from "./academy/patterns";

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

type QuizAttempt = { scores: number[]; best: number; lastAt: string };

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
    state.practiceAttempts += 1;
    if (correct) state.practiceCorrect += 1;
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
  const attempt = state.quizAttempts.get(quizId) ?? { scores: [], best: 0, lastAt: "" };
  attempt.scores.push(score);
  attempt.best = Math.max(attempt.best, score);
  attempt.lastAt = new Date().toISOString();
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
    recommendations: recommendations(),
    recent,
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
  state.practiceAttempts += 1;
  if (input.correct) state.practiceCorrect += 1;
  touchActivity();
  return { practiceAttempts: state.practiceAttempts, practiceCorrect: state.practiceCorrect };
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
  const exemplar = PATTERN_EXEMPLARS[Math.floor(Math.random() * PATTERN_EXEMPLARS.length)];
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
