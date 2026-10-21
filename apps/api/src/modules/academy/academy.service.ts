/**
 * Academy service (B12) — the learning domain's server-side brain.
 *
 * Owns per-user learning state (lesson completion, quiz attempts,
 * bookmarks, practice log, flashcard SRS boxes, exam attempts) persisted
 * as one STATE blob row + per-entity TASK/EVENT_REG rows. Serves the
 * catalog authored in `packages/shared/src/content/academy` (the same
 * registry the browser mock re-exports). Quiz answers and drill answers
 * NEVER leave the engine ungraded — the client receives public questions
 * only (spec §43 — progress never leaks between accounts; §34 scoping).
 */
import { Injectable } from "@nestjs/common";
import type {
  AcademyBlock,
  AcademyBookmark,
  AcademyBookmarkToggleInput,
  AcademyCandle,
  AcademyCheckpointInput,
  AcademyContinueLearning,
  AcademyEvent,
  AcademyFlashcard,
  AcademyFlashcardsResponse,
  AcademyFlashcardReviewInput,
  AcademyFlashcardReviewResponse,
  AcademyGlossaryResponse,
  AcademyLessonNote,
  AcademyMilestonesResponse,
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
  AcademySrDrill,
  AcademyStreak,
  AcademyTask,
  AcademyZoneDrill,
  AcademyCertificationsResponse,
  AcademyExamPaper,
  AcademyExamResultResponse,
  AcademyBookmarksResponse,
  AcademySearchResponse,
  AcademyCatalogResponse,
  AcademyCourseDetailResponse,
  AcademyLessonResponse,
  AcademyNoteResponse,
  AcademyLessonCompleteResponse,
  AcademyScenariosResponse,
} from "../../shared/contracts";
import {
  CATEGORIES,
  COURSES,
  GLOSSARY_TERMS,
  LEVEL_ORDER,
  PATTERN_EXEMPLARS,
  PATHS,
  SCENARIOS,
  TRADE_ERROR_CODES as TRADING_ERROR,
} from "../../shared/contracts";
import { NotFoundError } from "../../shared/errors/app-error";
import type { AuthoredCourse } from "../../shared/contracts";
import { TradesService } from "../trades/trades.service";
import { AcademyRepository } from "./academy.repository";

// ── State shape (persisted as one JSON blob per user) ───────────────────────

type QuizAttempt = { scores: number[]; best: number; lastAt: string; attemptsAt: string[] };

type ExamAttempt = { bestPercent: number; attempts: number; bestAt: string | null };

type AcademyState = {
  /** lessonId → completion timestamp (ISO). */
  completedLessons: Record<string, string>;
  /** quizId → attempts. */
  quizAttempts: Record<string, QuizAttempt>;
  bookmarks: AcademyBookmark[];
  practiceAttempts: number;
  practiceCorrect: number;
  /** UTC dates (YYYY-MM-DD) with any learning activity. */
  activityDates: string[];
  /** lessonId of the most recent completion — drives Continue Learning. */
  lastActivityLessonId: string | null;
  /** lessonId → last time the user opened the lesson (Resume Reading). */
  viewedLessons: Record<string, string>;
  /** lessonId → personal note. */
  notes: Record<string, AcademyLessonNote>;
  /** Practice ledger — per-attempt rows (drill, outcome, time), capped 300. */
  drillLog: { drill: string; correct: boolean; at: string }[];
  /** Patterns the learner missed — resurface with priority until cleared. */
  wrongPatternIds: string[];
  /** Flashcard SRS state (Leitner boxes). */
  flashcardStates: Record<string, { box: number; due: string; reviews: number }>;
  flashcardDay: string;
  flashcardReviewedToday: number;
  /** Category exam attempts — the certification ladder. */
  examAttempts: Record<string, ExamAttempt>;
};

const emptyState = (): AcademyState => ({
  completedLessons: {},
  quizAttempts: {},
  bookmarks: [],
  practiceAttempts: 0,
  practiceCorrect: 0,
  activityDates: [],
  lastActivityLessonId: null,
  viewedLessons: {},
  notes: {},
  drillLog: [],
  wrongPatternIds: [],
  flashcardStates: {},
  flashcardDay: "",
  flashcardReviewedToday: 0,
  examAttempts: {},
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const utcDate = (at: Date): string => at.toISOString().slice(0, 10);
const nowIso = (): string => new Date().toISOString();
const HOUR = 3_600_000;
const inHours = (hours: number): string => new Date(Date.now() + hours * HOUR).toISOString();

/** Stable string hash — deterministic checkpoint picks per lesson + day. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Shuffle helper — Fisher–Yates over a copy; drills only, no crypto needs. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i]!;
    const b = copy[j]!;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function stripQuestion(question: AcademyQuizQuestion): AcademyQuizQuestionPublic {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    unit: question.unit,
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

const WEEK_TARGETS = { lessons: 3, drills: 3, quizzes: 1 };
const FLASH_INTERVALS = [1, 2, 4, 8, 15]; // days per Leitner box
const FLASHCARD_DAILY_CAP = 10;
const EXAM_SIZE = 20;

@Injectable()
export class AcademyService {
  constructor(
    private readonly repository: AcademyRepository,
    private readonly trades: TradesService,
  ) {}

  // ── State load/save ─────────────────────────────────────────────────────────

  private async loadState(userId: string): Promise<{ rowId: string | null; state: AcademyState }> {
    const row = await this.repository.findOneByKind(userId, "STATE");
    if (!row) return { rowId: null, state: emptyState() };
    return {
      rowId: row.id,
      state: { ...emptyState(), ...(row.data as unknown as AcademyState) },
    };
  }

  private async saveState(userId: string, rowId: string | null, state: AcademyState): Promise<void> {
    if (rowId === null) {
      await this.repository.insert(userId, "STATE", crypto.randomUUID(), state as unknown as never);
    } else {
      await this.repository.updateData(rowId, state as unknown as never);
    }
  }

  private touchActivity(state: AcademyState): void {
    const today = utcDate(new Date());
    if (!state.activityDates.includes(today)) state.activityDates.push(today);
  }

  // ── Catalog & course detail ────────────────────────────────────────────────

  private courseById(courseId: string): AuthoredCourse | undefined {
    return COURSES.find((crs) => crs.id === courseId);
  }

  private sortedCourses(): AuthoredCourse[] {
    const categoryRank = new Map(CATEGORIES.map((cat, index) => [cat.id, index]));
    return [...COURSES].sort(
      (a, b) =>
        (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99) ||
        (categoryRank.get(a.categoryId) ?? 99) - (categoryRank.get(b.categoryId) ?? 99) ||
        a.title.localeCompare(b.title),
    );
  }

  private courseCard(state: AcademyState, course: AuthoredCourse) {
    const completedLessons = course.lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
    const lessonCount = course.lessons.length;
    const quiz = course.quiz ? state.quizAttempts[course.quiz.id] : undefined;
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

  academyCatalog(state: AcademyState): AcademyCatalogResponse {
    return {
      categories: CATEGORIES.map((cat, index) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        level: cat.level,
        icon: cat.icon,
        order: index,
      })),
      courses: this.sortedCourses().map((course) => this.courseCard(state, course)),
      paths: PATHS.map((path) => {
        const courses = path.courseIds
          .map((courseId) => this.courseById(courseId))
          .filter((crs): crs is AuthoredCourse => Boolean(crs))
          .map((course) => this.courseCard(state, course));
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

  async getCatalog(userId: string): Promise<AcademyCatalogResponse> {
    const { state } = await this.loadState(userId);
    return this.academyCatalog(state);
  }

  academyCourseDetail(state: AcademyState, courseId: string): AcademyCourseDetailResponse {
    const course = this.courseById(courseId);
    if (!course) throw new NotFoundError("Course not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const category = CATEGORIES.find((cat) => cat.id === course.categoryId);
    if (!category) throw new NotFoundError("Category not found", TRADING_ERROR.TRADE_NOT_FOUND);
    return {
      course: this.courseCard(state, course),
      category: { ...category, order: CATEGORIES.findIndex((cat) => cat.id === category.id) },
      objectives: course.objectives,
      lessons: course.lessons.map((lsn, index) => ({
        id: lsn.id,
        courseId: course.id,
        title: lsn.title,
        summary: lsn.summary,
        minutes: lsn.minutes,
        order: index,
        completed: state.completedLessons[lsn.id] !== undefined,
      })),
    };
  }

  async getCourseDetail(userId: string, courseId: string): Promise<AcademyCourseDetailResponse> {
    const { state } = await this.loadState(userId);
    return this.academyCourseDetail(state, courseId);
  }

  // ── Lesson ──────────────────────────────────────────────────────────────────

  /** Mid-lesson checkpoint — long lessons (≥ 6 blocks) in quiz-bearing
   *  courses get ONE question from the course bank, picked deterministically
   *  from lessonId + UTC day (rotates daily; same pick for serving and
   *  grading). Answers never leave the engine. */
  private checkpointFor(course: AuthoredCourse, lesson: AuthoredCourse["lessons"][number]): AcademyQuizQuestionPublic | null {
    if (!course.quiz || lesson.blocks.length < 6) return null;
    const day = utcDate(new Date());
    const index = hashString(`${lesson.id}:${day}`) % course.quiz.questions.length;
    const question = course.quiz.questions[index];
    return question === undefined ? null : stripQuestion(question);
  }

  async getLesson(userId: string, lessonId: string): Promise<AcademyLessonResponse> {
    const { rowId, state } = await this.loadState(userId);
    for (const course of COURSES) {
      const index = course.lessons.findIndex((lsn) => lsn.id === lessonId);
      if (index === -1) continue;
      const lesson = course.lessons[index];
      if (lesson === undefined) continue;
      // Opening a lesson counts as learning activity and drives Resume Reading.
      state.viewedLessons[lesson.id] = nowIso();
      this.touchActivity(state);
      await this.saveState(userId, rowId, state);
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
        completed: state.completedLessons[lesson.id] !== undefined,
        blocks: lesson.blocks,
        quizId: course.quiz?.id ?? null,
        prevLessonId: course.lessons[index - 1]?.id ?? null,
        nextLessonId: course.lessons[index + 1]?.id ?? null,
        checkpoint: this.checkpointFor(course, lesson),
        note: state.notes[lesson.id] ?? null,
      };
    }
    throw new NotFoundError("Lesson not found", TRADING_ERROR.TRADE_NOT_FOUND);
  }

  gradeCheckpoint(state: AcademyState, lessonId: string, input: AcademyCheckpointInput) {
    for (const course of COURSES) {
      const lesson = course.lessons.find((lsn) => lsn.id === lessonId);
      if (!lesson) continue;
      if (!course.quiz || lesson.blocks.length < 6) return null;
      const day = utcDate(new Date());
      const question = course.quiz.questions[
        hashString(`${lesson.id}:${day}`) % course.quiz.questions.length
      ];
      if (question === undefined) return null;
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
      this.recordAttempt(state, "CHECKPOINT", correct);
      this.touchActivity(state);
      return { questionId: question.id, correct, answer, explanation: question.explanation };
    }
    return null;
  }

  async submitCheckpoint(userId: string, lessonId: string, input: AcademyCheckpointInput) {
    const { rowId, state } = await this.loadState(userId);
    const result = this.gradeCheckpoint(state, lessonId, input);
    if (result === null) throw new NotFoundError("Checkpoint not found", TRADING_ERROR.TRADE_NOT_FOUND);
    await this.saveState(userId, rowId, state);
    return result;
  }

  // ── Lesson notes ────────────────────────────────────────────────────────────

  async saveLessonNote(userId: string, lessonId: string, input: { text: string }): Promise<AcademyNoteResponse> {
    const { rowId, state } = await this.loadState(userId);
    const lesson = COURSES.flatMap((crs) => crs.lessons).find((lsn) => lsn.id === lessonId);
    if (!lesson) throw new NotFoundError("Lesson not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const trimmed = input.text.trim();
    if (trimmed === "") {
      delete state.notes[lessonId];
    } else {
      state.notes[lessonId] = { lessonId, text: trimmed, updatedAt: nowIso() };
      this.touchActivity(state);
    }
    await this.saveState(userId, rowId, state);
    return { note: state.notes[lessonId] ?? { lessonId, text: "", updatedAt: nowIso() } };
  }

  async completeLesson(userId: string, lessonId: string): Promise<AcademyLessonCompleteResponse> {
    const { rowId, state } = await this.loadState(userId);
    for (const course of COURSES) {
      const lesson = course.lessons.find((lsn) => lsn.id === lessonId);
      if (!lesson) continue;
      if (state.completedLessons[lessonId] === undefined) {
        state.completedLessons[lessonId] = nowIso();
        state.lastActivityLessonId = lessonId;
        this.touchActivity(state);
      }
      const completedLessons = course.lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
      await this.saveState(userId, rowId, state);
      return {
        lessonId,
        courseId: course.id,
        completedLessons,
        lessonCount: course.lessons.length,
        courseCompleted: completedLessons === course.lessons.length,
      };
    }
    throw new NotFoundError("Lesson not found", TRADING_ERROR.TRADE_NOT_FOUND);
  }

  // ── Quizzes ────────────────────────────────────────────────────────────────

  async getQuiz(userId: string, quizId: string) {
    void userId; // quiz content is static — no per-user state on the read path
    const course = COURSES.find((crs) => crs.quiz?.id === quizId);
    if (!course?.quiz) throw new NotFoundError("Quiz not found", TRADING_ERROR.TRADE_NOT_FOUND);
    return {
      id: course.quiz.id,
      courseId: course.id,
      courseTitle: course.title,
      questions: course.quiz.questions.map(stripQuestion),
    };
  }

  submitQuiz(state: AcademyState, quizId: string, input: AcademyQuizSubmitInput): AcademyQuizResultResponse {
    const course = COURSES.find((crs) => crs.quiz?.id === quizId);
    if (!course?.quiz) throw new NotFoundError("Quiz not found", TRADING_ERROR.TRADE_NOT_FOUND);

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
    const previousBest = state.quizAttempts[quizId]?.best ?? null;
    const attempt = state.quizAttempts[quizId] ?? { scores: [], best: 0, lastAt: "", attemptsAt: [] };
    attempt.scores.push(score);
    attempt.best = Math.max(attempt.best, score);
    attempt.lastAt = nowIso();
    attempt.attemptsAt.push(attempt.lastAt);
    state.quizAttempts[quizId] = attempt;
    this.touchActivity(state);

    return {
      quizId,
      score,
      total: course.quiz.questions.length,
      passed: score === course.quiz.questions.length,
      results,
      previousBest,
    };
  }

  async submitQuizAttempt(userId: string, quizId: string, input: AcademyQuizSubmitInput): Promise<AcademyQuizResultResponse> {
    const { rowId, state } = await this.loadState(userId);
    const result = this.submitQuiz(state, quizId, input);
    await this.saveState(userId, rowId, state);
    return result;
  }

  // ── Progress & overview ────────────────────────────────────────────────────

  academyProgress(state: AcademyState): AcademyProgressResponse {
    const totalLessons = COURSES.reduce((sum, crs) => sum + crs.lessons.length, 0);
    const completedLessons = Object.keys(state.completedLessons).filter((lessonId) =>
      COURSES.some((crs) => crs.lessons.some((lsn) => lsn.id === lessonId)),
    ).length;

    const categories = CATEGORIES.map((cat) => {
      const lessons = COURSES.filter((crs) => crs.categoryId === cat.id).flatMap((crs) => crs.lessons);
      const done = lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
      return {
        categoryId: cat.id,
        name: cat.name,
        lessonCount: lessons.length,
        completedLessons: done,
        percent: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
      };
    });

    const attempts = Object.values(state.quizAttempts);
    const quizTaken = attempts.length;
    const quizRawAverage =
      quizTaken === 0
        ? null
        : Math.round(
            (attempts.reduce((sum, att) => sum + att.best, 0) /
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
      coursesCompleted: COURSES.filter(
        (crs) => crs.lessons.length > 0 && crs.lessons.every((lsn) => state.completedLessons[lsn.id] !== undefined),
      ).length,
      courseCount: COURSES.length,
      quizzesTaken: quizTaken,
      quizAverage: quizTaken === 0 ? null : Math.min(100, quizRawAverage ?? 0),
      streak: this.streak(state),
      practiceAttempts: state.practiceAttempts,
      practiceCorrect: state.practiceCorrect,
    };
  }

  private streak(state: AcademyState): AcademyStreak {
    const dates = [...new Set(state.activityDates)].sort();
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
      activeToday: dates.includes(today),
    };
  }

  private continueLearning(state: AcademyState): AcademyContinueLearning {
    // Prefer the course with the most recent activity that still has lessons left.
    const inProgress = this.sortedCourses()
      .filter((crs) => {
        const done = crs.lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
        return done > 0 && done < crs.lessons.length;
      })
      .sort((a, b) => {
        const lastA = Math.max(0, ...a.lessons.map((lsn) => { const at = state.completedLessons[lsn.id]; return at ? new Date(at).getTime() : 0; }));
        const lastB = Math.max(0, ...b.lessons.map((lsn) => { const at = state.completedLessons[lsn.id]; return at ? new Date(at).getTime() : 0; }));
        return lastB - lastA;
      });

    const target =
      inProgress[0] ?? this.sortedCourses().find((crs) => !crs.lessons.every((lsn) => state.completedLessons[lsn.id] !== undefined));
    if (!target) return null;

    const done = target.lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
    const nextLesson = target.lessons.find((lsn) => state.completedLessons[lsn.id] === undefined);
    const lastCompleted = [...target.lessons].reverse().find((lsn) => state.completedLessons[lsn.id] !== undefined);

    return {
      // Continue points at the NEXT unfinished lesson (fallback: the last one,
      // for the fully-completed edge case).
      lessonId: (nextLesson ?? lastCompleted)?.id ?? target.lessons[0]!.id,
      lessonTitle: (nextLesson ?? lastCompleted)?.title ?? target.lessons[0]!.title,
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

  /** Rule-based recommendations — deliberately simple (spec §35). */
  private recommendations(state: AcademyState): AcademyRecommendation[] {
    const cards = this.sortedCourses().map((crs) => ({ course: crs, card: this.courseCard(state, crs) }));
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
  private resumeLearning(state: AcademyState): AcademyResume {
    const viewed = Object.entries(state.viewedLessons)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .find(([lessonId]) => state.completedLessons[lessonId] === undefined);
    if (!viewed) return null;
    const [lessonId, viewedAt] = viewed;
    const course = COURSES.find((crs) => crs.lessons.some((lsn) => lsn.id === lessonId));
    const lesson = course?.lessons.find((lsn) => lsn.id === lessonId);
    if (!course || !lesson) return null;
    const done = course.lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
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

  academyOverview(state: AcademyState): AcademyOverviewResponse {
    const recent = Object.entries(state.completedLessons)
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
      continueLearning: this.continueLearning(state),
      resume: this.resumeLearning(state),
      progress: this.academyProgress(state),
      weeklyPlan: this.weeklyPlan(state),
      recommendations: this.recommendations(state),
      recent,
    };
  }

  async getOverview(userId: string): Promise<AcademyOverviewResponse> {
    const { state } = await this.loadState(userId);
    return this.academyOverview(state);
  }

  async getProgress(userId: string): Promise<AcademyProgressResponse> {
    const { state } = await this.loadState(userId);
    return this.academyProgress(state);
  }

  // ── Weekly study plan ──────────────────────────────────────────────────────

  private weeklyPlan(state: AcademyState) {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayOfWeek = (monday.getUTCDay() + 6) % 7; // Monday = 0
    monday.setUTCDate(monday.getUTCDate() - dayOfWeek);
    const weekStart = utcDate(monday);
    const inWeek = (iso: string) => utcDate(new Date(iso)) >= weekStart;

    const lessonsDone = Object.values(state.completedLessons).filter(inWeek).length;
    const drillsDone = state.drillLog.filter((row) => inWeek(row.at)).length;
    const quizzesDone = Object.values(state.quizAttempts).flatMap((attempt) => attempt.attemptsAt).filter(inWeek).length;

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

  async getGlossary(userId: string, query?: string): Promise<AcademyGlossaryResponse> {
    void userId;
    const q = query?.trim().toLowerCase() ?? "";
    const terms = q === "" ? GLOSSARY_TERMS : GLOSSARY_TERMS.filter((term) =>
      `${term.term} ${term.simple} ${term.professional} ${term.related.join(" ")}`.toLowerCase().includes(q),
    );
    return { terms: [...terms].sort((a, b) => a.term.localeCompare(b.term)), total: terms.length };
  }

  async search(userId: string, query: string): Promise<AcademySearchResponse> {
    void userId;
    const q = query.trim().toLowerCase();
    if (q === "") return { query, courses: [], lessons: [], glossary: [] };
    const { state } = await this.loadState(userId);

    const courses = this.sortedCourses()
      .filter((crs) => `${crs.title} ${crs.description} ${crs.objectives.join(" ")}`.toLowerCase().includes(q))
      .map((course) => this.courseCard(state, course))
      .slice(0, 6);

    const textOf = (block: AcademyBlock): string => {
      if (block.kind === "text" || block.kind === "callout") return block.body;
      if (block.kind === "list") return block.items.join(" ");
      if (block.kind === "example") return block.steps.join(" ");
      if (block.kind === "table") return block.rows.flat().join(" ");
      return "";
    };

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

    const glossary = (await this.getGlossary(userId, q)).terms.slice(0, 8);
    return { query, courses, lessons, glossary };
  }

  // ── Bookmarks ────────────────────────────────────────────────────────────────

  academyBookmarks(state: AcademyState): AcademyBookmarksResponse {
    return { bookmarks: [...state.bookmarks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }

  async getBookmarks(userId: string): Promise<AcademyBookmarksResponse> {
    const { state } = await this.loadState(userId);
    return this.academyBookmarks(state);
  }

  async toggleBookmark(userId: string, input: AcademyBookmarkToggleInput): Promise<{ bookmarked: boolean }> {
    const { rowId, state } = await this.loadState(userId);
    const existing = state.bookmarks.find((mark) => mark.kind === input.kind && mark.refId === input.refId);
    if (existing) {
      state.bookmarks = state.bookmarks.filter((mark) => mark !== existing);
      await this.saveState(userId, rowId, state);
      return { bookmarked: false };
    }

    let bookmark: AcademyBookmark | null = null;
    if (input.kind === "LESSON") {
      const found = COURSES.flatMap((crs) => crs.lessons.map((lsn) => ({ lsn, crs }))).find(({ lsn }) => lsn.id === input.refId);
      if (!found) throw new NotFoundError("Lesson not found", TRADING_ERROR.TRADE_NOT_FOUND);
      bookmark = {
        id: `bm-${crypto.randomUUID().slice(0, 12)}`,
        kind: "LESSON",
        refId: input.refId,
        title: found.lsn.title,
        subtitle: found.crs.title,
        href: `/academy?tab=courses&course=${found.crs.id}&lesson=${found.lsn.id}`,
        createdAt: nowIso(),
      };
    } else {
      const term = GLOSSARY_TERMS.find((entry) => entry.id === input.refId);
      if (!term) throw new NotFoundError("Glossary term not found", TRADING_ERROR.TRADE_NOT_FOUND);
      bookmark = {
        id: `bm-${crypto.randomUUID().slice(0, 12)}`,
        kind: "GLOSSARY",
        refId: input.refId,
        title: term.term,
        subtitle: "Glossary",
        href: `/academy?tab=glossary&term=${term.id}`,
        createdAt: nowIso(),
      };
    }
    state.bookmarks.push(bookmark);
    this.touchActivity(state);
    await this.saveState(userId, rowId, state);
    return { bookmarked: true };
  }

  // ── Practice ────────────────────────────────────────────────────────────────

  /** One honest row in the practice ledger — shared by drills and checkpoints. */
  private recordAttempt(state: AcademyState, drill: string, correct: boolean, refId?: string): void {
    state.practiceAttempts += 1;
    if (correct) state.practiceCorrect += 1;
    state.drillLog.push({ drill, correct, at: nowIso() });
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

  async logPractice(userId: string, input: AcademyPracticeLogInput): Promise<AcademyPracticeLogResponse> {
    const { rowId, state } = await this.loadState(userId);
    this.recordAttempt(state, input.drill, input.correct, input.refId);
    this.touchActivity(state);
    await this.saveState(userId, rowId, state);
    return { practiceAttempts: state.practiceAttempts, practiceCorrect: state.practiceCorrect };
  }

  async practiceStats(userId: string): Promise<AcademyPracticeStats> {
    const { state } = await this.loadState(userId);
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

  /** Pattern ID drill — the weakness bank resurfaces ~50% of rounds. */
  async patternDrill(userId: string): Promise<AcademyPatternDrill> {
    const { state } = await this.loadState(userId);
    if (PATTERN_EXEMPLARS.length === 0) throw new NotFoundError("No pattern exemplars", TRADING_ERROR.TRADE_NOT_FOUND);
    const bank = state.wrongPatternIds
      .map((id) => PATTERN_EXEMPLARS.find((entry) => entry.id === id))
      .filter((entry): entry is (typeof PATTERN_EXEMPLARS)[number] => Boolean(entry));
    const exemplar =
      bank.length > 0 && Math.random() < 0.5
        ? bank[Math.floor(Math.random() * bank.length)] ?? PATTERN_EXEMPLARS[0]!
        : PATTERN_EXEMPLARS[Math.floor(Math.random() * PATTERN_EXEMPLARS.length)] ?? PATTERN_EXEMPLARS[0]!;
    const optionIds = shuffle([exemplar.answer, ...exemplar.distractors].slice(0, 4));
    while (optionIds.length < 4) optionIds.push(PATTERN_EXEMPLARS[optionIds.length % PATTERN_EXEMPLARS.length]!.id);
    return {
      patternId: exemplar.id,
      candles: exemplar.candles,
      context: exemplar.context,
      family: exemplar.family,
      bias: exemplar.bias,
      options: optionIds.map((id) => ({
        id,
        label: PATTERN_EXEMPLARS.find((entry) => entry.id === id)?.label ?? id,
      })),
      answer: optionIds.indexOf(exemplar.answer),
      explanation: exemplar.explanation,
    };
  }

  /** Support/Resistance — a shaped random walk: approach, prior touch, retest,
   *  reaction. The learner reads which side the level is serving. */
  srDrill(): AcademySrDrill {
    const support = Math.random() < 0.5;
    const level = 100;
    const vol = 1.1;
    const candles: AcademyCandle[] = [];
    let price = support ? level + 9 : level - 9;

    const pushCandle = (o: number, c: number, wickHigh: number, wickLow: number) => {
      candles.push({ o: round2(o), h: round2(Math.max(o, c) + wickHigh), l: round2(Math.min(o, c) - wickLow), c: round2(c) });
      price = c;
    };

    for (let i = 0; i < 4; i += 1) {
      const drift = support ? -2.1 : 2.1;
      const c = price + drift + (Math.random() - 0.5) * vol;
      pushCandle(price, c, Math.random() * vol * 0.5, Math.random() * vol * 0.5);
    }
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
    for (let i = 0; i < 3; i += 1) {
      const drift = support ? 1.8 : -1.8;
      const c = price + drift + (Math.random() - 0.5) * vol;
      pushCandle(price, c, Math.random() * vol * 0.5, Math.random() * vol * 0.5);
    }
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
  positionDrill(): AcademyPositionDrill {
    const balances = [5000, 10000, 25000, 50000];
    const percents = [0.5, 1, 1.5, 2];
    const accountBalance = balances[Math.floor(Math.random() * balances.length)]!;
    const riskPercent = percents[Math.floor(Math.random() * percents.length)]!;
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
  zoneDrill(): AcademyZoneDrill {
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
    const ordered = Math.random() < 0.5 ? bands : [bands[1]!, bands[0]!];
    const zones = ordered.map((band, index) => ({ top: band.top, bottom: band.bottom, tag: index === 0 ? "A" : "B" }));
    const demandTag = ordered[0]!.identity === "demand" ? "A" : "B";

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

  async getScenarios(userId: string): Promise<AcademyScenariosResponse> {
    void userId;
    return { scenarios: SCENARIOS satisfies AcademyScenario[] };
  }

  // ── Flashcards — Leitner boxes over glossary + lesson takeaways ────────────

  private buildFlashcardDeck(): AcademyFlashcard[] {
    const deck: AcademyFlashcard[] = [];
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
    return deck;
  }

  flashcards(state: AcademyState): AcademyFlashcardsResponse {
    const deck = this.buildFlashcardDeck();
    const today = utcDate(new Date());
    const reviewedToday = state.flashcardDay === today ? state.flashcardReviewedToday : 0;
    const dueCards = deck.filter((card) => {
      const st = state.flashcardStates[card.id];
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

  async getFlashcards(userId: string): Promise<AcademyFlashcardsResponse> {
    const { state } = await this.loadState(userId);
    return this.flashcards(state);
  }

  async reviewFlashcard(userId: string, input: AcademyFlashcardReviewInput): Promise<AcademyFlashcardReviewResponse> {
    const { rowId, state } = await this.loadState(userId);
    const deck = this.buildFlashcardDeck();
    if (!deck.some((card) => card.id === input.cardId)) {
      throw new NotFoundError("Flashcard not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }

    const today = utcDate(new Date());
    if (state.flashcardDay !== today) {
      state.flashcardDay = today;
      state.flashcardReviewedToday = 0;
    }

    const st = state.flashcardStates[input.cardId] ?? { box: 0, due: today, reviews: 0 };
    if (input.grade === "AGAIN") {
      st.box = 0;
      st.due = today; // resurfaces this session / next one
    } else {
      const steps = input.grade === "EASY" ? 2 : 1;
      st.box = Math.min(st.box + steps, FLASH_INTERVALS.length - 1);
      st.due = utcDate(new Date(Date.now() + (FLASH_INTERVALS[st.box] ?? 1) * 86_400_000));
    }
    st.reviews += 1;
    state.flashcardStates[input.cardId] = st;
    state.flashcardReviewedToday += 1;

    this.recordAttempt(state, "FLASHCARD", input.grade !== "AGAIN", input.cardId);
    this.touchActivity(state);
    await this.saveState(userId, rowId, state);

    const dueRemaining = deck.filter((card) => {
      const cardState = state.flashcardStates[card.id];
      return !cardState || cardState.due <= today;
    }).length;
    return { reviewedToday: state.flashcardReviewedToday, dueRemaining };
  }

  // ── Category certifications — exams over the category's question pool ─────

  private examPool(categoryId: string): AcademyQuizQuestion[] {
    return COURSES.filter((crs) => crs.categoryId === categoryId).flatMap((crs) => crs.quiz?.questions ?? []);
  }

  private tierOf(percent: number): AcademyExamResultResponse["tier"] {
    if (percent >= 90) return "GOLD";
    if (percent >= 70) return "SILVER";
    if (percent >= 50) return "BRONZE";
    return "NONE";
  }

  async getExamPaper(userId: string, categoryId: string): Promise<AcademyExamPaper> {
    void userId;
    const category = CATEGORIES.find((cat) => cat.id === categoryId);
    if (!category) throw new NotFoundError("Category not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const pool = this.examPool(categoryId);
    if (pool.length === 0) throw new NotFoundError("No exam questions for this category", TRADING_ERROR.TRADE_NOT_FOUND);
    const picked = shuffle(pool).slice(0, Math.min(EXAM_SIZE, pool.length));
    return { categoryId, questions: picked.map(stripQuestion) };
  }

  submitExam(state: AcademyState, categoryId: string, input: AcademyQuizSubmitInput): AcademyExamResultResponse {
    const pool = this.examPool(categoryId);
    if (pool.length === 0) throw new NotFoundError("No exam questions for this category", TRADING_ERROR.TRADE_NOT_FOUND);

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
    const previous = state.examAttempts[categoryId];
    const previousBestPercent = previous?.bestPercent ?? null;
    const bestPercent = Math.max(previousBestPercent ?? 0, percent);
    state.examAttempts[categoryId] = {
      bestPercent,
      attempts: (previous?.attempts ?? 0) + 1,
      bestAt: percent >= (previous?.bestPercent ?? 0) ? nowIso() : previous?.bestAt ?? null,
    };
    this.touchActivity(state);

    return {
      categoryId,
      score,
      total,
      passed: percent >= 50,
      tier: this.tierOf(percent),
      bestPercent,
      previousBestPercent,
      results: graded,
    };
  }

  async submitExamAttempt(userId: string, categoryId: string, input: AcademyQuizSubmitInput): Promise<AcademyExamResultResponse> {
    const { rowId, state } = await this.loadState(userId);
    const result = this.submitExam(state, categoryId, input);
    await this.saveState(userId, rowId, state);
    return result;
  }

  async getCertifications(userId: string): Promise<AcademyCertificationsResponse> {
    const { state } = await this.loadState(userId);
    return {
      certifications: CATEGORIES.map((cat) => {
        const attempt = state.examAttempts[cat.id];
        return {
          categoryId: cat.id,
          name: cat.name,
          bestPercent: attempt?.bestPercent ?? null,
          attempts: attempt?.attempts ?? 0,
          tier: attempt ? this.tierOf(attempt.bestPercent) : "NONE",
          questionPool: this.examPool(cat.id).length,
        };
      }),
    };
  }

  // ── Milestones — sober, computed from real state ──────────────────────────

  async getMilestones(userId: string): Promise<AcademyMilestonesResponse> {
    const { state } = await this.loadState(userId);
    const completedCount = Object.keys(state.completedLessons).length;
    const coursesDone = COURSES.filter(
      (crs) => crs.lessons.length > 0 && crs.lessons.every((lsn) => state.completedLessons[lsn.id] !== undefined),
    ).length;
    const quizCount = Object.keys(state.quizAttempts).length;
    const examsPassed = Object.values(state.examAttempts).filter((attempt) => attempt.bestPercent >= 50).length;
    const categoryPercents = CATEGORIES.map((cat) => {
      const lessons = COURSES.filter((crs) => crs.categoryId === cat.id).flatMap((crs) => crs.lessons);
      const done = lessons.filter((lsn) => state.completedLessons[lsn.id] !== undefined).length;
      return lessons.length === 0 ? 0 : done / lessons.length;
    });
    const bestCategory = Math.max(0, ...categoryPercents);
    const flashcardReviews = Object.values(state.flashcardStates).reduce((sum, st) => sum + st.reviews, 0);
    const scenarioSteps = state.drillLog.filter((row) => row.drill === "SCENARIO").length;
    const notesCount = Object.keys(state.notes).length;

    const streakInfo = this.streak(state);

    const build = (
      id: string,
      label: string,
      description: string,
      current: number,
      target: number,
      achievedAt: string | null,
    ) => ({
      id,
      label,
      description,
      achieved: current >= target,
      achievedAt: current >= target ? achievedAt ?? nowIso() : null,
      progress: current >= target ? null : { current, target },
    });

    return {
      milestones: [
        build("first-lesson", "First steps", "Complete your first lesson", completedCount, 1, Object.values(state.completedLessons).sort()[0] ?? null),
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

  // ── Journal → Academy — evidence-based lesson suggestions ────────────────

  /** Reads the journal's closed trades and maps observed weakness patterns to
   *  the course that addresses them. Rules are deliberately readable — the
   *  Analytics-driven engine can replace them later at the same seam. */
  async getSuggestions(userId: string) {
    const { trades: closed } = await this.trades.listTrades(userId, { status: "CLOSED" }).catch(() => ({ trades: [] as Array<Record<string, unknown>> }));
    if (closed.length === 0) return { suggestions: [] };

    const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
    const r = (trade: Record<string, unknown>) => num(trade.rMultiple);
    const mfe = (trade: Record<string, unknown>) => num(trade.mfeR);
    const planned = (trade: Record<string, unknown>) => num(trade.plannedRR);

    const rules: { courseId: string; weight: number; reason: string }[] = [];

    // Winners given back: price traveled ≥ +2R but the trade closed below +1R.
    const givenBack = closed.filter((trade) => mfe(trade) >= 2 && r(trade) < 1).length;
    if (givenBack >= 2) {
      rules.push({
        courseId: "crs-trademgmt",
        weight: givenBack,
        reason: `${givenBack} of your closed trades traveled +2R but finished below +1R — managing winners is the gap the Trade Management track closes.`,
      });
    }

    // Full-stop losses: closed at or beyond −1R.
    const fullLosses = closed.filter((trade) => r(trade) <= -1).length;
    if (fullLosses >= 2) {
      rules.push({
        courseId: "crs-risk-fundamentals",
        weight: fullLosses,
        reason: `${fullLosses} closed trades hit −1R or worse — worth revisiting stop placement and position sizing in Risk Management.`,
      });
    }

    // Emotional exits: the journal tagged the aftermath FOMO/revenge/frustration/euphoria.
    const emotional = closed.filter((trade) =>
      ["FOMO", "REVENGE", "FRUSTRATED", "EUPHORIC"].includes(String(trade.emotionAfter ?? "")),
    ).length;
    if (emotional >= 2) {
      rules.push({
        courseId: "crs-psychology",
        weight: emotional,
        reason: `${emotional} trades carry an emotional exit tag — Trading Psychology covers the routine that makes discipline cheap.`,
      });
    }

    // Outside the playbook.
    const noStrategy = closed.filter((trade) => trade.strategyId === null || trade.strategyId === undefined).length;
    if (noStrategy >= 2) {
      rules.push({
        courseId: "crs-strategies-core",
        weight: noStrategy,
        reason: `${noStrategy} trades sat outside your playbook — the 13-field strategy template turns loose setups into testable systems.`,
      });
    }

    // Plan/outcome drift: planned ≥ 2R but closed negative.
    const planDrift = closed.filter((trade) => planned(trade) >= 2 && r(trade) < 0).length;
    if (planDrift >= 2) {
      rules.push({
        courseId: "crs-advanced-execution",
        weight: planDrift,
        reason: `${planDrift} trades planned ≥2R but closed red — Advanced Execution covers the entry-to-exit gap.`,
      });
    }

    const picks = rules
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((rule) => {
        const course = COURSES.find((crs) => crs.id === rule.courseId);
        const lesson = course?.lessons[0];
        if (!course || !lesson) return null;
        return {
          courseId: course.id,
          courseTitle: course.title,
          categoryId: course.categoryId,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          reason: rule.reason,
        };
      })
      .filter((pick): pick is NonNullable<typeof pick> => pick !== null);

    return { suggestions: picks };
  }

  // ── Events (Academy live sessions) — seeds relative to "now" ──────────────

  private eventSeeds(): Array<Omit<AcademyEvent, "registered" | "startsAt"> & { offsetHours: number }> {
    return [
      {
        id: "evt-workshop-risk-sizing",
        title: "Workshop — Position sizing under pressure",
        description:
          "Live lab: compute size for five messy real charts, then defend the number against a forced redraw of your stop. Bring a calculator and your last 10 losers.",
        type: "WORKSHOP",
        host: "Mara Quinn",
        hostRole: "Risk coach · ex-proprietary desk",
        offsetHours: 26,
        durationMin: 90,
        categoryId: "cat-risk",
        seatsTotal: 40,
        seatsTaken: 31,
        hasReplay: false,
      },
      {
        id: "evt-webinar-liquidity",
        title: "Webinar — Where liquidity actually sits",
        description:
          "Equal highs, session opens and the myth of the stop hunt: a sober map of resting liquidity on FX and crypto, with repeatable marking rules.",
        type: "WEBINAR",
        host: "Deniz Aksoy",
        hostRole: "Price action instructor",
        offsetHours: 74,
        durationMin: 60,
        categoryId: "cat-price-action",
        seatsTotal: 200,
        seatsTaken: 87,
        hasReplay: false,
      },
      {
        id: "evt-qa-psychology",
        title: "Live Q&A — Tilt, revenge and the reset routine",
        description:
          "Open mic with the psychology team. Bring your worst session of the month; we rebuild the recovery checklist together, step by step.",
        type: "LIVE_QA",
        host: "Dr. Elena Voss",
        hostRole: "Performance psychologist",
        offsetHours: 122,
        durationMin: 45,
        categoryId: "cat-psychology",
        seatsTotal: 60,
        seatsTaken: 22,
        hasReplay: false,
      },
      {
        id: "evt-exam-fundamentals",
        title: "Certification window — Trading Fundamentals",
        description:
          "Supervised 40-question exam on the Fundamentals track. A GOLD tier score unlocks the advanced risk syllabus. One attempt per window.",
        type: "EXAM",
        host: "Academy proctoring",
        hostRole: "Automated supervision",
        offsetHours: 190,
        durationMin: 50,
        categoryId: "cat-fundamentals",
        seatsTotal: 120,
        seatsTaken: 64,
        hasReplay: false,
      },
      {
        id: "evt-workshop-patterns",
        title: "Workshop — Grading breakouts by context",
        description:
          "We grade twenty breakouts live — location, compression, volume and invalidation — and you score each one before the reveal. Brutal and useful.",
        type: "WORKSHOP",
        host: "Jonas Feld",
        hostRole: "Chart patterns instructor",
        offsetHours: 286,
        durationMin: 75,
        categoryId: "cat-chart-patterns",
        seatsTotal: 40,
        seatsTaken: 12,
        hasReplay: false,
      },
      {
        id: "evt-webinar-structure",
        title: "Webinar — Market structure without the mysticism",
        description:
          "Swings, BOS and CHoCH defined precisely enough to code — and the three setups where structure says nothing at all.",
        type: "WEBINAR",
        host: "Deniz Aksoy",
        hostRole: "Price action instructor",
        offsetHours: -52,
        durationMin: 60,
        categoryId: "cat-structure",
        seatsTotal: 200,
        seatsTaken: 143,
        hasReplay: true,
      },
      {
        id: "evt-qa-journaling",
        title: "Live Q&A — From journal to edge",
        description:
          "How to read your own journal like a dataset: sample size traps, regime splits, and the two metrics worth tracking weekly.",
        type: "LIVE_QA",
        host: "Mara Quinn",
        hostRole: "Risk coach · ex-proprietary desk",
        offsetHours: -96,
        durationMin: 45,
        categoryId: "cat-advanced",
        seatsTotal: 60,
        seatsTaken: 51,
        hasReplay: true,
      },
    ];
  }

  private async registeredEventIds(userId: string): Promise<Set<string>> {
    const rows = await this.repository.listByKind(userId, "EVENT_REG");
    return new Set(rows.map((row) => (row.data as { eventId: string }).eventId));
  }

  private async toEvent(userId: string, seed: { id: string; title: string; description: string; type: AcademyEvent["type"]; host: string; hostRole: string; offsetHours: number; durationMin: number; categoryId: string | null; seatsTotal: number; seatsTaken: number; hasReplay: boolean }): Promise<AcademyEvent> {
    const registered = await this.registeredEventIds(userId);
    return {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      type: seed.type,
      host: seed.host,
      hostRole: seed.hostRole,
      startsAt: inHours(seed.offsetHours),
      durationMin: seed.durationMin,
      categoryId: seed.categoryId,
      seatsTotal: seed.seatsTotal,
      seatsTaken: registered.has(seed.id) ? seed.seatsTaken + 1 : seed.seatsTaken,
      registered: registered.has(seed.id),
      hasReplay: seed.hasReplay,
    };
  }

  async getEvents(userId: string) {
    const seeds = this.eventSeeds();
    const upcoming = (await Promise.all(seeds.filter((seed) => seed.offsetHours >= 0).map((seed) => this.toEvent(userId, seed))))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = (await Promise.all(seeds.filter((seed) => seed.offsetHours < 0).map((seed) => this.toEvent(userId, seed))))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return { upcoming, past };
  }

  async registerEvent(userId: string, input: { eventId: string }) {
    const seed = this.eventSeeds().find((candidate) => candidate.id === input.eventId);
    if (!seed || seed.offsetHours < 0) {
      throw new NotFoundError("Event not found or already past", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const registered = await this.registeredEventIds(userId);
    if (registered.has(seed.id)) {
      // Toggle off — deregistration is allowed until the event starts.
      const row = await this.repository.listByKind(userId, "EVENT_REG");
      const target = row.find((r) => (r.data as { eventId: string }).eventId === seed.id);
      if (target) await this.repository.deleteRow(target.id);
      return { eventId: seed.id, registered: false, seatsTaken: seed.seatsTaken };
    }
    if (seed.seatsTaken >= seed.seatsTotal) {
      return { eventId: seed.id, registered: false, seatsTaken: seed.seatsTaken };
    }
    await this.repository.insert(userId, "EVENT_REG", crypto.randomUUID(), { eventId: seed.id });
    return { eventId: seed.id, registered: true, seatsTaken: seed.seatsTaken + 1 };
  }

  // ── Tasky (Academy study task manager) ────────────────────────────────────

  private taskSeeds() {
    return [
      {
        id: "tsk-fund-orders",
        title: "Finish “Order types & execution”",
        description: "Three lessons left — then run the checkpoint quiz until 80%+.",
        kind: "LESSON" as const,
        priority: "HIGH" as const,
        dueOffsetHours: 20,
        href: "/academy?tab=courses&course=crs-fund-markets",
        categoryId: "cat-fundamentals",
        xp: 40,
        done: false,
        completedAt: null,
      },
      {
        id: "tsk-drill-sr",
        title: "10 structure drill reps",
        description: "Support/resistance drill — stay above 70% accuracy before logging off.",
        kind: "DRILL" as const,
        priority: "MEDIUM" as const,
        dueOffsetHours: 8,
        href: "/academy?tab=practice",
        categoryId: "cat-structure",
        xp: 25,
        done: false,
        completedAt: null,
      },
      {
        id: "tsk-review-week",
        title: "Review last week's losing trades",
        description: "Tag each loss with a mistake from the ledger; flag any repeat offenders.",
        kind: "REVIEW" as const,
        priority: "HIGH" as const,
        dueOffsetHours: 32,
        href: "/journal?tab=reviews",
        categoryId: "cat-psychology",
        xp: 30,
        done: false,
        completedAt: null,
      },
      {
        id: "tsk-risk-refresher",
        title: "Re-read “Risk of ruin” and redo its quiz",
        description: "Refresh the survival math before increasing size again.",
        kind: "LESSON" as const,
        priority: "LOW" as const,
        dueOffsetHours: 76,
        href: "/academy?tab=courses&course=crs-risk-fundamentals",
        categoryId: "cat-risk",
        xp: 20,
        done: false,
        completedAt: null,
      },
      {
        id: "tsk-flashcards",
        title: "Clear the flashcard backlog",
        description: "The review queue is at 14 cards — zero it out today.",
        kind: "DRILL" as const,
        priority: "MEDIUM" as const,
        dueOffsetHours: null,
        href: "/academy?tab=courses",
        categoryId: null,
        xp: 15,
        done: false,
        completedAt: null,
      },
      {
        id: "tsk-quiz-fundamentals",
        title: "Fundamentals checkpoint — passed",
        description: "Scored 85% on the first attempt.",
        kind: "LESSON" as const,
        priority: "HIGH" as const,
        dueOffsetHours: -28,
        href: null,
        categoryId: "cat-fundamentals",
        xp: 40,
        done: true,
        completedAt: inHours(-30),
      },
    ];
  }

  /** Lazy task seed — the demo board appears on first read. */
  private async ensureTaskSeed(userId: string): Promise<void> {
    const existing = await this.repository.listByKind(userId, "TASK");
    if (existing.length > 0) return;
    for (const seed of this.taskSeeds()) {
      const task: AcademyTask = {
        id: seed.id,
        title: seed.title,
        description: seed.description,
        kind: seed.kind,
        priority: seed.priority,
        dueAt: seed.dueOffsetHours === null ? null : inHours(seed.dueOffsetHours),
        href: seed.href,
        categoryId: seed.categoryId,
        xp: seed.xp,
        done: seed.done,
        completedAt: seed.completedAt,
      };
      // Task seed ids are slugs (tsk-…) — the uuid row id is derived while
      // the slug stays in the payload.
      await this.repository.insert(userId, "TASK", crypto.randomUUID(), task as unknown as never);
    }
  }

  private streakFrom(completed: AcademyTask[]): number {
    const days = new Set(
      completed
        .filter((task) => task.completedAt !== null)
        .map((task) => task.completedAt!.slice(0, 10)),
    );
    let streak = 0;
    const cursor = new Date();
    for (let offset = 0; offset < 60; offset += 1) {
      const day = utcDate(new Date(cursor.getTime() - offset * 86_400_000));
      if (days.has(day)) streak += 1;
      else if (offset > 0 || !days.has(utcDate(cursor))) break;
    }
    return streak;
  }

  async getTasks(userId: string) {
    await this.ensureTaskSeed(userId);
    const tasks = (await this.repository.listByKind(userId, "TASK")).map(
      (row) => row.data as unknown as AcademyTask,
    );
    const completed = tasks.filter((task) => task.done);
    return {
      tasks,
      streakDays: this.streakFrom(completed),
      totalXp: completed.reduce((sum, task) => sum + task.xp, 0),
    };
  }

  async createTask(userId: string, input: { title: string; description?: string | null; kind: AcademyTask["kind"]; priority: AcademyTask["priority"]; dueAt?: string | null; href?: string | null; categoryId?: string | null; xp?: number }): Promise<AcademyTask> {
    await this.ensureTaskSeed(userId);
    const task: AcademyTask = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      priority: input.priority,
      dueAt: input.dueAt ?? null,
      href: input.href ?? null,
      categoryId: input.categoryId ?? null,
      xp: input.xp ?? 10,
      done: false,
      completedAt: null,
    };
    await this.repository.insert(userId, "TASK", task.id, task as unknown as never);
    return task;
  }

  async toggleTask(userId: string, input: { taskId: string; done: boolean }): Promise<AcademyTask> {
    // Tasks are addressed by row id (custom tasks) OR payload slug id (seed
    // tasks — the row id is a derived uuid). A single list covers both.
    const rows = await this.repository.listByKind(userId, "TASK");
    const target = rows.find(
      (r) => r.id === input.taskId || (r.data as { id?: string }).id === input.taskId,
    );
    if (target === undefined) throw new NotFoundError("Task not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const task = target.data as unknown as AcademyTask;
    task.done = input.done;
    task.completedAt = input.done ? nowIso() : null;
    await this.repository.updateData(target.id, task as unknown as never);
    return task;
  }

  async deleteTask(userId: string, input: { taskId: string }): Promise<{ ok: boolean }> {
    const rows = await this.repository.listByKind(userId, "TASK");
    // Row id first, then payload slug id (seed tasks are addressed by slug).
    const target = rows.find((r) => r.id === input.taskId)
      ?? rows.find((r) => (r.data as { id?: string }).id === input.taskId);
    if (!target) throw new NotFoundError("Task not found", TRADING_ERROR.TRADE_NOT_FOUND);
    await this.repository.deleteRow(target.id);
    return { ok: true };
  }
}
