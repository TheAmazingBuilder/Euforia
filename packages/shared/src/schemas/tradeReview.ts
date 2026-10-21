import { z } from "zod";
import { currencySchema, directionSchema, gradeSchema } from "../enums";
import { dateKeySchema, isoDateTimeSchema, uuidSchema } from "./primitives";

// ── Trade Review module (fusion with Goal) ──────────────────────────────────
//
// Two coupled workspaces, one module:
//  1. GOALS — targets the trader sets; progress is COMPUTED server-side from
//     real trading behavior (closed trades + daily stats) over a calendar
//     period, never self-entered.
//  2. REVIEWS — the post-trade workflow: grade execution against the playbook,
//     score entry/exit/risk quality, capture the lesson. One review per trade
//     (upsert). Distinct from the pre-reveal decisionGrade on Trade.

// ── Goal entity ──────────────────────────────────────────────────────────────

/**
 * The metrics the engine can compute from REAL data. The direction
 * (higher/lower is better) and the display unit are DERIVED server-side —
 * the client never guesses them.
 */
export const goalMetricSchema = z.enum([
  "WIN_RATE",
  "R_EARNED",
  "AVG_R",
  "PROFIT_TARGET",
  "DISCIPLINE_SCORE",
  "FOLLOWED_PLAN_PCT",
  "MAX_TRADES_PER_DAY",
  "MAX_DAILY_LOSS_R",
]);
export type GoalMetric = z.infer<typeof goalMetricSchema>;

export const goalPeriodSchema = z.enum(["WEEK", "MONTH", "QUARTER"]);
export type GoalPeriod = z.infer<typeof goalPeriodSchema>;

export const goalStatusSchema = z.enum([
  "PENDING",
  "ON_TRACK",
  "AT_RISK",
  "BEHIND",
  "ACHIEVED",
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalUnitSchema = z.enum(["PERCENT", "R", "MONEY", "COUNT", "SCORE"]);
export type GoalUnit = z.infer<typeof goalUnitSchema>;

/** Vivid card palette — keys resolved to gradients client-side. */
export const goalColorSchema = z.enum([
  "VIOLET",
  "CYAN",
  "EMERALD",
  "AMBER",
  "ROSE",
  "SKY",
  "FUCHSIA",
  "LIME",
]);
export type GoalColor = z.infer<typeof goalColorSchema>;

export const goalSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string().min(1).max(120),
  metric: goalMetricSchema,
  /** Number in the metric's natural unit (% , R, currency, count, score 0-100). */
  target: z.number().refine((v) => Number.isFinite(v) && v !== 0, {
    message: "Target must be a non-zero finite number",
  }),
  period: goalPeriodSchema,
  color: goalColorSchema,
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Goal = z.infer<typeof goalSchema>;

// ── Goal progress (computed, never stored) ───────────────────────────────────

export const goalDirectionSchema = z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]);
export type GoalDirection = z.infer<typeof goalDirectionSchema>;

export const goalProgressSchema = z.object({
  goalId: uuidSchema,
  metric: goalMetricSchema,
  direction: goalDirectionSchema,
  /** Display unit derived server-side from the metric. */
  unit: goalUnitSchema,
  currency: currencySchema.nullable(),
  /** Actual behavior in the CURRENT period (null = no data yet). */
  actual: z.number().nullable(),
  /** Same metric over the PREVIOUS equivalent period (trend anchor). */
  previous: z.number().nullable(),
  /** 0–100 — direction-aware (LOWER goals: 100 while actual ≤ target). */
  progressPct: z.number().min(0).max(100).nullable(),
  status: goalStatusSchema,
  /** Period pacing context, so "behind" is honest, not vibes. */
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  daysElapsed: z.number().int().min(0),
  daysTotal: z.number().int().min(1),
  /** Sample size behind `actual` (closed trades / stat days in period). */
  sampleSize: z.number().int().min(0),
  /** One-line human summary, e.g. "42.9% vs 50% target". */
  detail: z.string().max(200),
});
export type GoalProgress = z.infer<typeof goalProgressSchema>;

export const goalWithProgressSchema = z.object({ goal: goalSchema, progress: goalProgressSchema });
export type GoalWithProgress = z.infer<typeof goalWithProgressSchema>;

export const goalsResponseSchema = z.object({ goals: z.array(goalWithProgressSchema) });
export type GoalsResponse = z.infer<typeof goalsResponseSchema>;

// ── Goal inputs ──────────────────────────────────────────────────────────────

export const createGoalInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  metric: goalMetricSchema,
  target: z.number().refine((v) => Number.isFinite(v) && v !== 0, {
    message: "Target must be a non-zero finite number",
  }),
  period: goalPeriodSchema,
  color: goalColorSchema,
  active: z.boolean().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalInputSchema>;

export const updateGoalInputSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    metric: goalMetricSchema.optional(),
    target: z.number().refine((v) => Number.isFinite(v) && v !== 0).optional(),
    period: goalPeriodSchema.optional(),
    color: goalColorSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one goal field" });
export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;

// ── Trade Review entity ──────────────────────────────────────────────────────

export const playbookMatchSchema = z.enum(["MATCHED", "PARTIAL", "OFF_PLAYBOOK"]);
export type PlaybookMatch = z.infer<typeof playbookMatchSchema>;

export const checklistResultSchema = z.object({
  label: z.string().min(1).max(200),
  passed: z.boolean(),
});
export type ChecklistResult = z.infer<typeof checklistResultSchema>;

/**
 * TradeReview — the post-trade workflow artifact. One per trade (upsert).
 * executionGrade is the POST-trade verdict and stays distinct from the
 * pre-reveal decisionGrade frozen on the trade.
 */
export const tradeReviewSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  tradeId: uuidSchema,
  executionGrade: gradeSchema,
  followedPlan: z.boolean(),
  playbookMatch: playbookMatchSchema,
  /** Pass/fail per checklist item — initialized from the trade's checklistSnap. */
  checklistResults: z.array(checklistResultSchema).max(24).nullable(),
  /** 1–5 quality scores. */
  entryQuality: z.number().int().min(1).max(5).nullable(),
  exitQuality: z.number().int().min(1).max(5).nullable(),
  riskManagement: z.number().int().min(1).max(5).nullable(),
  /** THE takeaway — required, the module's whole point. */
  lessons: z.string().min(3).max(4000),
  /** "Next time I will…" — the forward commitment. */
  improvementNote: z.string().max(1000).nullable(),
  reviewedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TradeReview = z.infer<typeof tradeReviewSchema>;

export const upsertReviewInputSchema = z.object({
  tradeId: uuidSchema,
  executionGrade: gradeSchema,
  followedPlan: z.boolean(),
  playbookMatch: playbookMatchSchema,
  checklistResults: z.array(checklistResultSchema).max(24).nullable().optional(),
  entryQuality: z.number().int().min(1).max(5).nullable().optional(),
  exitQuality: z.number().int().min(1).max(5).nullable().optional(),
  riskManagement: z.number().int().min(1).max(5).nullable().optional(),
  lessons: z.string().min(3, "Capture at least a short lesson").max(4000),
  improvementNote: z.string().max(1000).nullable().optional(),
  /** Origin TradePlan (Phase 5) — ownership validated server-side, values frozen into planSnapshot. */
  originTradePlanId: uuidSchema.nullable().optional(),
});
export type UpsertReviewInput = z.infer<typeof upsertReviewInputSchema>;

/** PATCH /reviews/:tradeId — partial update (every field optional, tradeId in path). */
export const patchReviewInputSchema = upsertReviewInputSchema
  .omit({ tradeId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to patch.",
  });
export type PatchReviewInput = z.infer<typeof patchReviewInputSchema>;

// ── Review rows (read model joined with trade context) ──────────────────────

export const reviewRowSchema = z.object({
  tradeId: uuidSchema,
  symbol: z.string(),
  direction: directionSchema,
  tradingDate: dateKeySchema,
  /** PENDING = closed trade awaiting review; REVIEWED = workflow done. */
  reviewStatus: z.enum(["PENDING", "REVIEWED"]),
  /** Pre-reveal decision grade frozen on the trade (may be null). */
  decisionGrade: gradeSchema.nullable(),
  /** Post-trade execution grade from the review (null while pending). */
  executionGrade: gradeSchema.nullable(),
  playbookMatch: playbookMatchSchema.nullable(),
  followedPlan: z.boolean().nullable(),
  entryQuality: z.number().int().min(1).max(5).nullable(),
  exitQuality: z.number().int().min(1).max(5).nullable(),
  riskManagement: z.number().int().min(1).max(5).nullable(),
  rMultiple: z.number().nullable(),
  pnlNet: z.number().nullable(),
  currency: currencySchema,
  strategyName: z.string().nullable(),
  setupName: z.string().nullable(),
  lesson: z.string().nullable(),
  improvementNote: z.string().nullable(),
  checklistResults: z.array(checklistResultSchema).nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
});
export type ReviewRow = z.infer<typeof reviewRowSchema>;

export const reviewsResponseSchema = z.object({
  reviews: z.array(reviewRowSchema),
  meta: z.object({
    generatedAt: isoDateTimeSchema,
    /** Phase 6 pagination (server merges reviewed+pending, tradingDate DESC). */
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    hasMore: z.boolean(),
  }),
});
export type ReviewsResponse = z.infer<typeof reviewsResponseSchema>;

// ── Lessons library (union of all captured lessons) ──────────────────────────

export const lessonSourceSchema = z.enum(["REVIEW", "TRADE_NOTE", "JOURNAL"]);
export type LessonSource = z.infer<typeof lessonSourceSchema>;

export const lessonEntrySchema = z.object({
  id: uuidSchema,
  source: lessonSourceSchema,
  tradeId: uuidSchema.nullable(),
  date: dateKeySchema,
  text: z.string().min(1),
  symbol: z.string().nullable(),
  executionGrade: gradeSchema.nullable(),
  rMultiple: z.number().nullable(),
  strategyName: z.string().nullable(),
});
export type LessonEntry = z.infer<typeof lessonEntrySchema>;

export const lessonsResponseSchema = z.object({ lessons: z.array(lessonEntrySchema) });
export type LessonsResponse = z.infer<typeof lessonsResponseSchema>;

// ── Overview aggregate (one endpoint = one dataset) ──────────────────────────

export const gradeDistributionSchema = z.object({
  A: z.number().int().min(0),
  B: z.number().int().min(0),
  C: z.number().int().min(0),
  D: z.number().int().min(0),
  F: z.number().int().min(0),
});
export type GradeDistribution = z.infer<typeof gradeDistributionSchema>;

/**
 * Review streak with an HONEST freeze: one grace day per calendar week
 * (Mon–Sun). A missed day is forgiven — counted as frozen, never as reviewed
 * — only if the chain stays continuous around it, and only once per week.
 * The numbers are reported separately so the gamification never lies.
 */
export const reviewStreakSchema = z.object({
  /** Days with at least one review in the current chain. */
  currentDays: z.number().int().min(0),
  /** Grace days consumed by the current chain. */
  frozenDays: z.number().int().min(0),
  /** What the badge shows: currentDays + frozenDays. */
  effectiveDays: z.number().int().min(0),
  /** Grace days used inside the current calendar week (0 or 1). */
  freezesUsedThisWeek: z.number().int().min(0).max(1),
  gracePerWeek: z.literal(1),
  /** Best pure run (no freeze) across the whole history. */
  longestStreak: z.number().int().min(0),
});
export type ReviewStreak = z.infer<typeof reviewStreakSchema>;

export const tradeReviewOverviewResponseSchema = z.object({
  stats: z.object({
    closedTrades: z.number().int().min(0),
    reviewedTrades: z.number().int().min(0),
    pendingReviews: z.number().int().min(0),
    reviewRatePct: z.number().min(0).max(100),
    gradeDistribution: gradeDistributionSchema,
    avgEntryQuality: z.number().min(1).max(5).nullable(),
    avgExitQuality: z.number().min(1).max(5).nullable(),
    avgRiskManagement: z.number().min(1).max(5).nullable(),
    lessonsCaptured: z.number().int().min(0),
    /** Effective streak (frozen grace days included) — badge value. */
    reviewStreakDays: z.number().int().min(0),
    followedPlanPct: z.number().min(0).max(100).nullable(),
    offPlaybookCount: z.number().int().min(0),
  }),
  goalsSummary: z.object({
    total: z.number().int().min(0),
    achieved: z.number().int().min(0),
    onTrack: z.number().int().min(0),
    atRisk: z.number().int().min(0),
    behind: z.number().int().min(0),
    avgProgressPct: z.number().min(0).max(100).nullable(),
  }),
  /** Weekly average execution grade (A=5 … F=1), oldest → newest, max 8. */
  weeklyGradeTrend: z.array(
    z.object({
      weekStart: dateKeySchema,
      avgPoints: z.number().min(1).max(5),
      reviews: z.number().int().min(1),
    }),
  ),
  recentLessons: z.array(lessonEntrySchema).max(6),
  pendingQueuePreview: z.array(reviewRowSchema).max(5),
  /** Freeze-aware streak breakdown — the honest gamification ledger. */
  streak: reviewStreakSchema,
  /** Latest "next time I will…" note — the recurring-lesson template source. */
  lastImprovementNote: z.string().nullable(),
  meta: z.object({ generatedAt: isoDateTimeSchema }),
});
export type TradeReviewOverviewResponse = z.infer<typeof tradeReviewOverviewResponseSchema>;

/** DELETE /reviews/:tradeId — undo a review (trade returns to pending). */
export const deleteReviewResponseSchema = z.object({ ok: z.boolean() });
export type DeleteReviewResponse = z.infer<typeof deleteReviewResponseSchema>;

// ── Phase 6 — plan-linked reviews: pagination, patch, detail, comparison ─────

/** Stable error-code registry (Phase 6). Rides the AppError envelope. */
export const TRADE_REVIEW_ERROR_CODES = {
  /** Trade id does not exist for this user (ownership-safe 404). */
  TRADE_REVIEW_TRADE_NOT_FOUND: "TRADE_REVIEW_TRADE_NOT_FOUND",
  /** Trade exists but is not CLOSED (only closed trades are reviewable). */
  TRADE_REVIEW_TRADE_NOT_REVIEWABLE: "TRADE_REVIEW_TRADE_NOT_REVIEWABLE",
  /** Optimistic concurrency: reviewedAt moved since the caller loaded it. */
  TRADE_REVIEW_CONCURRENT_MODIFICATION: "TRADE_REVIEW_CONCURRENT_MODIFICATION",
  /** No review row for that trade (archive/undo paths). */
  TRADE_REVIEW_NOT_FOUND: "TRADE_REVIEW_NOT_FOUND",
  /** originTradePlanId points at a plan that does not exist for this user. */
  TRADE_REVIEW_PLAN_NOT_FOUND: "TRADE_REVIEW_PLAN_NOT_FOUND",
  /** Linked plan's instrument differs from the trade's (explicit confirm required). */
  TRADE_REVIEW_PLAN_MISMATCH: "TRADE_REVIEW_PLAN_MISMATCH",
} as const;

/** GET /reviews — list query (pagination only; ordering is tradingDate DESC). */
export const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;

/** Frozen comparison-relevant plan values (JSONB `planSnapshot` on TradeReview). */
export const reviewPlanSnapshotSchema = z.object({
  planId: uuidSchema,
  /** Plan lifecycle status at snapshot time (Phase 5 string vocabulary). */
  planStatus: z.string().min(1).max(32),
  direction: directionSchema,
  symbol: z.string().min(1).max(32),
  currency: z.string().min(1).max(16),
  entryPrice: z.string().min(1),
  stopLoss: z.string().nullable(),
  takeProfit: z.string().nullable(),
  sizeMode: z.string().min(1).max(32),
  sizeValue: z.string().min(1),
  riskAmount: z.string().nullable(),
  riskPercent: z.string().nullable(),
  positionSize: z.string().nullable(),
  /** Planned reward:risk ratio (Phase 5 canonical rrRatio). */
  rrRatio: z.string().nullable(),
  /** When the freeze happened (ISO, server clock at save). */
  snapshottedAt: isoDateTimeSchema,
});
export type ReviewPlanSnapshot = z.infer<typeof reviewPlanSnapshotSchema>;

/** One objective leg of the planned-vs-actual comparison (facts, no judgment). */
export const comparisonLegSchema = z.object({
  planned: z.string().nullable(),
  actual: z.string().nullable(),
  deviation: z.string().nullable(),
  deviationPips: z.number().nullable(),
  /** false = the value was unavailable on either side — never fabricated. */
  available: z.boolean(),
});
export type ComparisonLeg = z.infer<typeof comparisonLegSchema>;

/** Phase 6 §12 — planned vs actual. Computed facts, never quality labels. */
export const planVsActualComparisonSchema = z.object({
  /** SNAPSHOT = frozen plan values, LIVE = defensive legacy row, NONE = no plan. */
  basedOn: z.enum(["SNAPSHOT", "LIVE", "NONE"]),
  hasPlan: z.boolean(),
  direction: z.object({
    planned: directionSchema.nullable(),
    actual: directionSchema.nullable(),
    match: z.boolean().nullable(),
  }),
  entry: comparisonLegSchema,
  stop: comparisonLegSchema,
  target: comparisonLegSchema,
  risk: comparisonLegSchema,
  size: comparisonLegSchema,
  /** Planned reward:risk (Phase 5) vs realized R (Trading Core canonical). */
  rMultiple: comparisonLegSchema,
});
export type PlanVsActualComparison = z.infer<typeof planVsActualComparisonSchema>;

/** The linked plan as of review time: reference + current lifecycle + frozen values. */
export const reviewPlanSummarySchema = z.object({
  planId: uuidSchema,
  /** Plan status NOW (may differ from the snapshot's frozen planStatus). */
  currentStatus: z.string().nullable(),
  snapshot: reviewPlanSnapshotSchema,
});
export type ReviewPlanSummary = z.infer<typeof reviewPlanSummarySchema>;

/** Authoritative trade facts at detail time (read-only, Trading Core owns them). */
export const reviewTradeSummarySchema = z.object({
  tradeId: uuidSchema,
  status: z.string().min(1).max(32),
  direction: directionSchema,
  symbol: z.string().min(1).max(32),
  currency: z.string().min(1).max(16),
  quantity: z.string(),
  closedQuantity: z.string(),
  entryPrice: z.string().nullable(),
  exitPrice: z.string().nullable(),
  entryAt: isoDateTimeSchema.nullable(),
  exitAt: isoDateTimeSchema.nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  pnlGross: z.string().nullable(),
  pnlNet: z.string().nullable(),
  fees: z.string().nullable(),
  swap: z.string().nullable(),
  riskAmount: z.string().nullable(),
  rMultiple: z.string().nullable(),
  initialStop: z.string().nullable(),
  initialTP: z.string().nullable(),
});
export type ReviewTradeSummary = z.infer<typeof reviewTradeSummarySchema>;

/** GET /reviews/:tradeId — review payload + trade summary + plan + comparison. */
export const reviewDetailResponseSchema = z.object({
  review: tradeReviewSchema,
  tradeSummary: reviewTradeSummarySchema,
  planSummary: reviewPlanSummarySchema.nullable(),
  comparison: planVsActualComparisonSchema,
});
export type ReviewDetailResponse = z.infer<typeof reviewDetailResponseSchema>;
