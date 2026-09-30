import { z } from "zod";

/**
 * Academy contracts — the learning platform embedded in the trading journal.
 *
 * Content (catalog/lessons/glossary) is authored in the mock server layer and
 * served through the API; per-user state (progress, quiz attempts, bookmarks,
 * practice log) lives in the store so it stays user-scoped and reset-safe.
 * The recommendation surface is intentionally simple (rule-based) so a future
 * analytics-driven engine can replace the source without touching contracts.
 */

// ── Levels ───────────────────────────────────────────────────────────────────

export const academyLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export type AcademyLevel = z.infer<typeof academyLevelSchema>;

// ── Lesson content blocks (visual-first lesson bodies) ──────────────────────
// Blocks are discriminated by `kind`. Visual blocks (candles/structure/zones/
// risk) reference deterministic SVG diagram variants rendered by the client.

export type AcademyCandle = {
  /** Simple integer price units — the renderer normalizes to viewbox space. */
  o: number;
  h: number;
  l: number;
  c: number;
};

export type AcademyBlock =
  | { kind: "text"; body: string }
  | { kind: "callout"; tone: "info" | "tip" | "warn" | "risk"; title?: string; body: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "objectives"; items: string[] }
  | { kind: "takeaways"; items: string[] }
  | { kind: "formula"; label: string; expr: string; note?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "example"; title: string; steps: string[] }
  | { kind: "candles"; variant: string; caption?: string }
  | { kind: "structure"; variant: string; caption?: string }
  | { kind: "zones"; variant: string; caption?: string }
  | { kind: "risk"; variant: string; caption?: string };

// ── Quiz model ───────────────────────────────────────────────────────────────

export type AcademyQuizQuestionKind = "MC" | "TF" | "SCENARIO" | "NUMERIC";

/** Server-side question (with answers). Never leaves the engine ungraded. */
export type AcademyQuizQuestion = {
  id: string;
  kind: AcademyQuizQuestionKind;
  prompt: string;
  /** MC/SCENARIO options; ignored for TF/NUMERIC. */
  options?: string[];
  /** Correct option index (MC/SCENARIO) or boolean (TF). */
  answer?: number | boolean;
  /** NUMERIC: accepted value + relative tolerance. */
  value?: number;
  tolerance?: number;
  unit?: string;
  explanation: string;
};

/** Public question — answers stripped, order kept. */
export type AcademyQuizQuestionPublic = {
  id: string;
  kind: AcademyQuizQuestionKind;
  prompt: string;
  options?: string[];
  unit?: string;
};

export type AcademyQuizSubmitInput = z.infer<typeof academyQuizSubmitInputSchema>;
export const academyQuizSubmitInputSchema = z.object({
  /** One answer per question, keyed by question id. */
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      /** option index / boolean / numeric value — null = skipped. */
      value: z.union([z.number(), z.boolean(), z.null()]).optional(),
    }),
  ).min(1),
});

export type AcademyQuizQuestionResult = {
  questionId: string;
  correct: boolean;
  /** For MC/SCENARIO: the correct option index. TF: the boolean. NUMERIC: the value. */
  answer: number | boolean;
  explanation: string;
};

export type AcademyQuizResultResponse = {
  quizId: string;
  score: number;
  total: number;
  passed: boolean;
  results: AcademyQuizQuestionResult[];
  /** Best previous score for this quiz (before this attempt). */
  previousBest: number | null;
};

// ── Catalog shapes ───────────────────────────────────────────────────────────

export type AcademyCategorySummary = {
  id: string;
  name: string;
  description: string;
  level: AcademyLevel;
  icon: string;
  /** Stable sort key. */
  order: number;
};

export type AcademyCourseCard = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  level: AcademyLevel;
  /** Total lessons. */
  lessonCount: number;
  completedLessons: number;
  /** Percent 0-100. */
  progress: number;
  estimatedMinutes: number;
  quizId: string | null;
  quizBestScore: number | null;
  completed: boolean;
};

export type AcademyCatalogResponse = {
  categories: AcademyCategorySummary[];
  courses: AcademyCourseCard[];
};

export type AcademyLessonCard = {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  minutes: number;
  order: number;
  completed: boolean;
};

export type AcademyCourseDetailResponse = {
  course: AcademyCourseCard;
  category: AcademyCategorySummary;
  /** One-line "what you will be able to do" list. */
  objectives: string[];
  lessons: AcademyLessonCard[];
};

// ── Lesson response ──────────────────────────────────────────────────────────

export type AcademyLessonResponse = {
  id: string;
  courseId: string;
  courseTitle: string;
  categoryId: string;
  title: string;
  summary: string;
  minutes: number;
  order: number;
  /** 1-based position in the course. */
  position: number;
  lessonCount: number;
  completed: boolean;
  blocks: AcademyBlock[];
  quizId: string | null;
  prevLessonId: string | null;
  nextLessonId: string | null;
};

export type AcademyLessonCompleteInput = z.infer<typeof academyLessonCompleteInputSchema>;
export const academyLessonCompleteInputSchema = z.object({});

export type AcademyLessonCompleteResponse = {
  lessonId: string;
  courseId: string;
  completedLessons: number;
  lessonCount: number;
  /** True when this completion finished the whole course. */
  courseCompleted: boolean;
};

// ── Progress ─────────────────────────────────────────────────────────────────

export type AcademyCategoryProgress = {
  categoryId: string;
  name: string;
  lessonCount: number;
  completedLessons: number;
  percent: number;
};

export type AcademyStreak = {
  currentDays: number;
  longestDays: number;
  /** ISO date (UTC) of the last learning activity, null before the first. */
  lastActivityDate: string | null;
  activeToday: boolean;
};

export type AcademyProgressResponse = {
  overall: { percent: number; completedLessons: number; lessonCount: number };
  categories: AcademyCategoryProgress[];
  coursesCompleted: number;
  courseCount: number;
  quizzesTaken: number;
  quizAverage: number | null;
  streak: AcademyStreak;
  /** Practice drills answered (all time). */
  practiceAttempts: number;
  practiceCorrect: number;
};

// ── Overview (learning dashboard) ────────────────────────────────────────────

export type AcademyContinueLearning = {
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  lessonCount: number;
  courseId: string;
  courseTitle: string;
  categoryId: string;
  percent: number;
  /** null → start the next course instead. */
  nextLessonId: string | null;
} | null;

export type AcademyRecommendation = {
  courseId: string;
  title: string;
  reason: string;
  categoryId: string;
};

export type AcademyOverviewResponse = {
  continueLearning: AcademyContinueLearning;
  progress: AcademyProgressResponse;
  recommendations: AcademyRecommendation[];
  /** Recent completions, newest first (max 6). */
  recent: { lessonId: string; lessonTitle: string; courseTitle: string; at: string }[];
};

// ── Glossary ─────────────────────────────────────────────────────────────────

export type AcademyGlossaryTerm = {
  id: string;
  term: string;
  simple: string;
  professional: string;
  example?: string;
  related: string[];
  categoryId: string | null;
};

export type AcademyGlossaryResponse = {
  terms: AcademyGlossaryTerm[];
  total: number;
};

// ── Bookmarks ────────────────────────────────────────────────────────────────

export type AcademyBookmarkKind = "LESSON" | "GLOSSARY";

export type AcademyBookmark = {
  id: string;
  kind: AcademyBookmarkKind;
  /** lesson id or glossary term id. */
  refId: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
};

export type AcademyBookmarksResponse = {
  bookmarks: AcademyBookmark[];
};

export type AcademyBookmarkToggleInput = z.infer<typeof academyBookmarkToggleInputSchema>;
export const academyBookmarkToggleInputSchema = z.object({
  kind: z.enum(["LESSON", "GLOSSARY"]),
  refId: z.string().min(1),
});

export type AcademyBookmarkToggleResponse = {
  bookmarked: boolean;
};

// ── Search ───────────────────────────────────────────────────────────────────

export type AcademySearchResponse = {
  query: string;
  courses: AcademyCourseCard[];
  lessons: { id: string; title: string; courseId: string; courseTitle: string; snippet: string }[];
  glossary: AcademyGlossaryTerm[];
};

// ── Practice ─────────────────────────────────────────────────────────────────

export type AcademyPracticeLogInput = z.infer<typeof academyPracticeLogInputSchema>;
export const academyPracticeLogInputSchema = z.object({
  drill: z.enum(["PATTERN_ID", "CANDLE_LAB", "STRUCTURE"]),
  correct: z.boolean(),
});

export type AcademyPracticeLogResponse = {
  practiceAttempts: number;
  practiceCorrect: number;
};

// ── Pattern identification drill (served by the engine, seeded client-side) ──

export type AcademyPatternOption = {
  /** pattern key — matches a visual variant in the client renderer. */
  id: string;
  label: string;
};

export type AcademyPatternDrill = {
  /** Which pattern is drawn (never sent to the client before answering). */
  patternId: string;
  /** Candles to render — deterministic exemplar series. */
  candles: AcademyCandle[];
  context: string;
  options: AcademyPatternOption[];
  /** Index into options. */
  answer: number;
  explanation: string;
};
