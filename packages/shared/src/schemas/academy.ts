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
  /** Guided cross-track sequences with live progress. */
  paths: AcademyPathCard[];
};

export type AcademyPathCard = {
  id: string;
  title: string;
  description: string;
  /** Icon key resolved by the client registry. */
  icon: string;
  /** Member courses in pedagogical order. */
  courses: AcademyCourseCard[];
  completedCourses: number;
  /** Percent of member courses fully completed. */
  percent: number;
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
  /** Mid-lesson comprehension checkpoint for long lessons (answers stay server-side). */
  checkpoint: AcademyQuizQuestionPublic | null;
  /** Saved personal note for this lesson, null before the first save. */
  note: AcademyLessonNote | null;
};

// ── Lesson notes (personal, per lesson) ─────────────────────────────────────

export type AcademyLessonNote = {
  lessonId: string;
  text: string;
  updatedAt: string;
};

export type AcademyNoteInput = z.infer<typeof academyNoteInputSchema>;
export const academyNoteInputSchema = z.object({
  text: z.string().max(4000),
});

export type AcademyNoteResponse = {
  note: AcademyLessonNote;
};

// ── Inline checkpoint (mid-lesson quick check, graded server-side) ──────────

export type AcademyCheckpointInput = z.infer<typeof academyCheckpointInputSchema>;
export const academyCheckpointInputSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.number(), z.boolean(), z.null()]).optional(),
});

export type AcademyCheckpointResult = {
  questionId: string;
  correct: boolean;
  /** MC/SCENARIO: correct option index. TF: the boolean. NUMERIC: the value. */
  answer: number | boolean;
  explanation: string;
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
  /** The unfinished lesson the user last had open (null → nothing to resume).
   *  Distinct from continueLearning, which points at the curriculum's next-up. */
  resume: AcademyResume;
  progress: AcademyProgressResponse;
  /** This week's habit loop — lessons/drills/quizzes done vs. targets. */
  weeklyPlan: AcademyWeeklyPlan;
  recommendations: AcademyRecommendation[];
  /** Recent completions, newest first (max 6). */
  recent: { lessonId: string; lessonTitle: string; courseTitle: string; at: string }[];
};

export type AcademyResume = {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  categoryId: string;
  /** Course completion percent at the time of the last view. */
  coursePercent: number;
  viewedAt: string;
} | null;

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
  drill: z.enum(["PATTERN_ID", "CANDLE_LAB", "STRUCTURE", "CHECKPOINT", "SR_LEVEL", "POSITION_SIZE", "ZONE_ID", "SCENARIO", "FLASHCARD"]),
  correct: z.boolean(),
  /** Optional target ref (pattern id, card id, scenario step) for stats/weakness bank. */
  refId: z.string().optional(),
});

export type AcademyPracticeLogResponse = {
  practiceAttempts: number;
  practiceCorrect: number;
};

// ── Practice stats (per-drill accuracy + recent history) ────────────────────

export type AcademyPracticeStats = {
  perDrill: { drill: string; label: string; attempts: number; correct: number; accuracy: number | null }[];
  /** Most recent attempts, newest first (max 8). */
  recent: { drill: string; correct: boolean; at: string }[];
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
  /** Family teaching tag, e.g. "Double candle" — pattern taxonomy chip. */
  family?: string;
  /** Directional teaching tag, e.g. "Bullish reversal". */
  bias?: string;
  options: AcademyPatternOption[];
  /** Index into options. */
  answer: number;
  explanation: string;
};

// ── Support/Resistance drill (engine-generated, server-graded shapes) ──────

export type AcademySrDrill = {
  candles: AcademyCandle[];
  /** Level price in candle units — client draws the hairline. */
  level: number;
  context: string;
  prompt: string;
  options: { id: string; label: string }[];
  /** Index into options. */
  answer: number;
  explanation: string;
};

// ── Position sizing drill (numeric answer with tolerance) ─────────────────

export type AcademyPositionDrill = {
  accountBalance: number;
  riskPercent: number;
  entry: number;
  stop: number;
  /** $ risked per unit of position size per point of adverse move. */
  pointValue: number;
  prompt: string;
  unit: string;
  answer: number;
  /** Relative tolerance (0.03 = ±3%). */
  tolerance: number;
  explanation: string;
};

// ── Supply/Demand zone drill (two bands, pick the right one) ───────────────

export type AcademyZoneDrill = {
  candles: AcademyCandle[];
  /** Bands in candle price units — client shades + tags them (A/B). The
   *  supply/demand identity is NOT on the wire; it is what the learner picks. */
  zones: { top: number; bottom: number; tag: string }[];
  context: string;
  prompt: string;
  options: { id: string; label: string }[];
  /** Index into options. */
  answer: number;
  explanation: string;
};

// ── Scenario player (self-paced decision sequences) ────────────────────────

export type AcademyScenarioStep = {
  id: string;
  narrative: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  feedback: string;
};

export type AcademyScenario = {
  id: string;
  title: string;
  categoryId: string;
  context: string;
  steps: AcademyScenarioStep[];
};

export type AcademyScenariosResponse = {
  scenarios: AcademyScenario[];
};

// ── Flashcards (spaced repetition over glossary + lesson takeaways) ────────

export type AcademyFlashcard = {
  id: string;
  kind: "TERM" | "TAKEAWAY";
  front: string;
  back: string;
  source: string;
  categoryId: string | null;
  /** True when served as free practice outside the due queue. */
  extra?: boolean;
};

export type AcademyFlashcardsResponse = {
  due: AcademyFlashcard[];
  dueCount: number;
  reviewedToday: number;
  totalCards: number;
};

export type AcademyFlashcardReviewInput = z.infer<typeof academyFlashcardReviewInputSchema>;
export const academyFlashcardReviewInputSchema = z.object({
  cardId: z.string().min(1),
  grade: z.enum(["AGAIN", "GOOD", "EASY"]),
});

export type AcademyFlashcardReviewResponse = {
  reviewedToday: number;
  dueRemaining: number;
};

// ── Category certifications (exams over the category question pool) ────────

export type AcademyExamPaper = {
  categoryId: string;
  questions: AcademyQuizQuestionPublic[];
};

export type AcademyExamResultResponse = {
  categoryId: string;
  score: number;
  total: number;
  passed: boolean;
  /** BRONZE ≥50%, SILVER ≥70%, GOLD ≥90% — computed on this attempt. */
  tier: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  /** Best percent across attempts INCLUDING this one. */
  bestPercent: number;
  previousBestPercent: number | null;
  results: AcademyQuizQuestionResult[];
};

export type AcademyCertification = {
  categoryId: string;
  name: string;
  bestPercent: number | null;
  attempts: number;
  tier: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  questionPool: number;
};

export type AcademyCertificationsResponse = {
  certifications: AcademyCertification[];
};

// ── Milestones (sober achievements, computed from real state) ─────────────

export type AcademyMilestone = {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
  achievedAt: string | null;
  /** Progress toward the milestone while it is still locked. */
  progress: { current: number; target: number } | null;
};

export type AcademyMilestonesResponse = {
  milestones: AcademyMilestone[];
};

// ── Weekly study plan (adaptive habit loop) ──────────────────────────────────

export type AcademyWeeklyPlan = {
  /** UTC date (YYYY-MM-DD) of the Monday that starts the current week. */
  weekStart: string;
  lessonsTarget: number;
  lessonsDone: number;
  drillsTarget: number;
  drillsDone: number;
  quizzesTarget: number;
  quizzesDone: number;
};

// ── Journal → Academy suggestions (evidence-based lesson links) ────────────

export type AcademySuggestion = {
  courseId: string;
  courseTitle: string;
  categoryId: string;
  /** First lesson of the suggested course — the deep link target. */
  lessonId: string;
  lessonTitle: string;
  reason: string;
};

export type AcademySuggestionsResponse = {
  suggestions: AcademySuggestion[];
};

// ── Events (Academy live sessions — workshops, webinars, Q&A, exams) ────────

export type AcademyEventType = "WORKSHOP" | "WEBINAR" | "LIVE_QA" | "EXAM";

export type AcademyEvent = {
  id: string;
  title: string;
  description: string;
  type: AcademyEventType;
  host: string;
  hostRole: string;
  /** ISO instant — the mock generates dates relative to "now". */
  startsAt: string;
  durationMin: number;
  categoryId: string | null;
  seatsTotal: number;
  seatsTaken: number;
  registered: boolean;
  /** Rendered as a "replay available" chip on past events. */
  hasReplay: boolean;
};

export type AcademyEventsResponse = {
  upcoming: AcademyEvent[];
  past: AcademyEvent[];
};

export const academyEventRegisterInputSchema = z.object({
  eventId: z.string().min(1),
});
export type AcademyEventRegisterInput = z.infer<typeof academyEventRegisterInputSchema>;

export type AcademyEventRegisterResponse = {
  eventId: string;
  registered: boolean;
  seatsTaken: number;
};

// ── Tasky (Academy study task manager) ──────────────────────────────────────

export const academyTaskKindSchema = z.enum(["LESSON", "DRILL", "REVIEW", "CUSTOM"]);
export type AcademyTaskKind = z.infer<typeof academyTaskKindSchema>;
export const academyTaskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type AcademyTaskPriority = z.infer<typeof academyTaskPrioritySchema>;

export type AcademyTask = {
  id: string;
  title: string;
  description: string | null;
  kind: AcademyTaskKind;
  priority: AcademyTaskPriority;
  /** ISO instant deadline — null means "no deadline". */
  dueAt: string | null;
  /** Deep link when the task ties back to a lesson or drill. */
  href: string | null;
  categoryId: string | null;
  done: boolean;
  completedAt: string | null;
  xp: number;
};

export type AcademyTasksResponse = {
  tasks: AcademyTask[];
  /** Derived streak of consecutive days with at least one completion. */
  streakDays: number;
  /** Total XP earned across completed tasks (custom engine currency). */
  totalXp: number;
};

export const academyTaskCreateInputSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(280).nullable().optional(),
  kind: academyTaskKindSchema,
  priority: academyTaskPrioritySchema,
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  href: z.string().min(1).max(200).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  xp: z.number().int().min(0).max(500).optional(),
});
export type AcademyTaskCreateInput = z.infer<typeof academyTaskCreateInputSchema>;

export const academyTaskToggleInputSchema = z.object({
  taskId: z.string().min(1),
  done: z.boolean(),
});
export type AcademyTaskToggleInput = z.infer<typeof academyTaskToggleInputSchema>;

export const academyTaskDeleteInputSchema = z.object({
  taskId: z.string().min(1),
});
export type AcademyTaskDeleteInput = z.infer<typeof academyTaskDeleteInputSchema>;
