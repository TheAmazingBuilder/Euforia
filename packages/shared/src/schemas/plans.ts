import { z } from "zod";
import { directionSchema } from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Phase 11 - the Trade Plan contract: documented market reasoning (thesis,
 * invalidation criteria, alternative scenarios, post-trade review).
 *
 * Distinctions the whole module enforces:
 *   - A plan is NOT an order and NOT a broker position - nothing here ever
 *     transmits levels to a broker or creates/modifies a trade.
 *   - Hypothetical levels (plannedEntry/plannedStop/plannedTargets) travel as
 *     decimal strings and stay structurally SEPARATE from canonical trade
 *     facts (the canonical Trade row is never written by this domain).
 *   - Invalidation is MANUAL (user action + reason) - no automatic rule
 *     engine exists in this build, so none is claimed.
 *   - A winning trade never proves the thesis, a losing trade never
 *     disproves it - the review is process-focused by design.
 */

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const planStatusSchema = z.enum(["DRAFT", "ACTIVE", "INVALIDATED", "COMPLETED", "ARCHIVED"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

/** Explicit transition table - the API rejects anything not listed (§11.3). */
export const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["INVALIDATED", "COMPLETED", "ARCHIVED"],
  INVALIDATED: ["ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function planTransitionAllowed(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_TRANSITIONS[from].includes(to);
}

/** Statuses a plan may be edited in (draft + active keep full editability). */
export function planIsEditable(status: PlanStatus): boolean {
  return status === "DRAFT" || status === "ACTIVE";
}

/** Stable, extensible process tags - neutral language, no judgment (§9.3). */
export const PLAN_PROCESS_TAGS = [
  "followed_plan",
  "deviated_from_plan",
  "thesis_invalidated",
  "setup_not_executed",
  "insufficient_evidence",
] as const;
export const planProcessTagSchema = z.enum(PLAN_PROCESS_TAGS);
export type PlanProcessTag = z.infer<typeof planProcessTagSchema>;

// ── Scenarios (nested schema - stable ids, conditional reasoning) ────────────

export const planScenarioSchema = z.object({
  /** Stable client-generated id (reorder-friendly). */
  id: z.string().min(8).max(64),
  /** PRIMARY | ALTERNATIVE | INVALIDATION - organizational labels, not predictions. */
  role: z.enum(["PRIMARY", "ALTERNATIVE", "INVALIDATION"]),
  title: z.string().min(1).max(120),
  /** Conditional description - "if X then Y", never a bare direction. */
  description: z.string().min(1).max(2000),
  /** What supports the scenario (free text, optional). */
  supports: z.string().max(1000).nullable().optional(),
  /** What falsifies the scenario (free text, optional). */
  falsifiedBy: z.string().max(1000).nullable().optional(),
  /** Optional reference levels (decimal strings, hypothetical). */
  referenceLevels: z.array(decimalStringSchema).max(6).optional(),
  /** User-entered subjective estimate ONLY - never engine-derived. */
  probabilityPct: z.number().int().min(0).max(100).nullable().optional(),
  /** Post-review outcome notes (optional, filled at review time). */
  outcomeNotes: z.string().max(1000).nullable().optional(),
});
export type PlanScenario = z.infer<typeof planScenarioSchema>;

// ── The plan aggregate ───────────────────────────────────────────────────────

export const analysisPlanSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  status: planStatusSchema,
  symbol: z.string().min(1).max(32),
  timeframe: z.string().max(16).nullable(),
  title: z.string().min(1).max(120),
  thesis: z.string().min(1).max(4000),
  /** Canonical journal trade link (nullable - a plan may exist unlinked). */
  tradeId: uuidSchema.nullable(),
  /** Oryon chart-analysis reference (Phase 10 integration, nullable). */
  analysisId: uuidSchema.nullable(),
  invalidationCriteria: z.string().max(2000).nullable(),
  invalidatedAt: isoDateTimeSchema.nullable(),
  invalidationReason: z.string().max(1000).nullable(),
  reviewNotes: z.string().max(4000).nullable(),
  processTags: z.array(planProcessTagSchema).max(5).nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  /** Hypothetical levels - explicitly NOT execution facts (decimal strings). */
  plannedEntry: decimalStringSchema.nullable(),
  plannedStop: decimalStringSchema.nullable(),
  plannedTargets: z.array(decimalStringSchema).max(6).nullable(),
  /** Chart reference time (unix SECONDS) when the plan was written. */
  referenceTimeSec: z.number().int().nonnegative().nullable(),
  scenarios: z.array(planScenarioSchema).max(6),
  schemaVersion: z.literal(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;

// ── Inputs ───────────────────────────────────────────────────────────────────

export const createAnalysisPlanInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(32),
  timeframe: z.string().trim().max(16).nullable().optional(),
  thesis: z.string().trim().min(1).max(4000),
  /** Drafts may carry every optional field; activation validates the rest. */
  invalidationCriteria: z.string().max(2000).nullable().optional(),
  plannedEntry: decimalStringSchema.nullable().optional(),
  plannedStop: decimalStringSchema.nullable().optional(),
  plannedTargets: z.array(decimalStringSchema).max(6).nullable().optional(),
  referenceTimeSec: z.number().int().nonnegative().nullable().optional(),
  scenarios: z.array(planScenarioSchema).max(6).optional(),
  analysisId: uuidSchema.nullable().optional(),
  /** Optimistic client idempotency (uuid) - the unique key collapses retries. */
  clientRequestId: uuidSchema.optional(),
  /** Create-and-activate in one call (draft save stays the default). */
  activate: z.boolean().optional(),
});
export type CreateAnalysisPlanInput = z.infer<typeof createAnalysisPlanInputSchema>;

export const updateAnalysisPlanInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    timeframe: z.string().trim().max(16).nullable().optional(),
    thesis: z.string().trim().min(1).max(4000).optional(),
    symbol: z.string().trim().min(1).max(32).optional(),
    invalidationCriteria: z.string().max(2000).nullable().optional(),
    plannedEntry: decimalStringSchema.nullable().optional(),
    plannedStop: decimalStringSchema.nullable().optional(),
    plannedTargets: z.array(decimalStringSchema).max(6).nullable().optional(),
    referenceTimeSec: z.number().int().nonnegative().nullable().optional(),
    scenarios: z.array(planScenarioSchema).max(6).optional(),
    analysisId: uuidSchema.nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateAnalysisPlanInput = z.infer<typeof updateAnalysisPlanInputSchema>;

/** POST /plans/:id/link-trade - canonical-trade linkage (§4.2). */
export const linkPlanTradeInputSchema = z.object({
  tradeId: uuidSchema,
  /** The client CONFIRMED a symbol mismatch in the UI - without this flag a
   * mismatching link is a 422, never a silent normalization. */
  confirmSymbolMismatch: z.boolean().optional(),
});
export type LinkPlanTradeInput = z.infer<typeof linkPlanTradeInputSchema>;

/** POST /plans/:id/invalidate - manual invalidation with a reason (§8.1). */
export const invalidatePlanInputSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type InvalidatePlanInput = z.infer<typeof invalidatePlanInputSchema>;

/** POST /plans/:id/complete - the post-trade review (§9). */
export const completePlanInputSchema = z.object({
  reviewNotes: z.string().max(4000).nullable().optional(),
  processTags: z.array(planProcessTagSchema).max(5).nullable().optional(),
});
export type CompletePlanInput = z.infer<typeof completePlanInputSchema>;

// ── Planned vs actual (facts only - missing values stay null, §9.2) ─────────

export const planComparisonLegSchema = z.object({
  planned: decimalStringSchema.nullable(),
  actual: decimalStringSchema.nullable(),
  available: z.boolean(),
});
export type PlanComparisonLeg = z.infer<typeof planComparisonLegSchema>;

/** Canonical trade facts at comparison time - read-only, never overwritten. */
export const planTradeFactsSchema = z.object({
  tradeId: uuidSchema,
  status: z.string().min(1).max(32),
  direction: directionSchema.nullable(),
  entryPrice: decimalStringSchema.nullable(),
  exitPrice: decimalStringSchema.nullable(),
  initialStop: decimalStringSchema.nullable(),
  initialTP: decimalStringSchema.nullable(),
  pnlNet: decimalStringSchema.nullable(),
  rMultiple: decimalStringSchema.nullable(),
  entryAt: isoDateTimeSchema.nullable(),
  exitAt: isoDateTimeSchema.nullable(),
});
export type PlanTradeFacts = z.infer<typeof planTradeFactsSchema>;

export const planComparisonSchema = z.object({
  /** null when the plan has no linked trade - no fabricated comparisons. */
  trade: planTradeFactsSchema.nullable(),
  direction: z.object({
    planned: directionSchema.nullable(),
    actual: directionSchema.nullable(),
    match: z.boolean().nullable(),
  }),
  entry: planComparisonLegSchema,
  stop: planComparisonLegSchema,
  target: planComparisonLegSchema,
  /** Planned activation time vs the trade's real entry time. */
  timing: z.object({
    planCreatedAt: isoDateTimeSchema,
    tradeEntryAt: isoDateTimeSchema.nullable(),
  }),
});
export type PlanComparison = z.infer<typeof planComparisonSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const analysisPlanDetailResponseSchema = z.object({
  plan: analysisPlanSchema,
  comparison: planComparisonSchema,
});
export type AnalysisPlanDetailResponse = z.infer<typeof analysisPlanDetailResponseSchema>;

export const analysisPlansResponseSchema = z.object({
  plans: z.array(analysisPlanSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    hasMore: z.boolean(),
  }),
});
export type AnalysisPlansResponse = z.infer<typeof analysisPlansResponseSchema>;

export const analysisPlanMutatedResponseSchema = z.object({
  plan: analysisPlanSchema,
});
export type AnalysisPlanMutatedResponse = z.infer<typeof analysisPlanMutatedResponseSchema>;

// ── Error codes ──────────────────────────────────────────────────────────────

export const PLAN_ERROR_CODES = {
  /** Plan id does not exist for this user (ownership-safe 404). */
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  /** The requested lifecycle transition is not in the transition table. */
  PLAN_TRANSITION_INVALID: "PLAN_TRANSITION_INVALID",
  /** Linked trade does not exist for this user (IDOR-safe 404). */
  PLAN_TRADE_NOT_FOUND: "PLAN_TRADE_NOT_FOUND",
  /** Plan instrument differs from the trade instrument without confirmation. */
  PLAN_TRADE_SYMBOL_MISMATCH: "PLAN_TRADE_SYMBOL_MISMATCH",
  /** Referenced Oryon analysis does not exist for this user. */
  PLAN_ANALYSIS_NOT_FOUND: "PLAN_ANALYSIS_NOT_FOUND",
  /** Trade already linked and the caller asked to REPLACE without detaching. */
  PLAN_TRADE_ALREADY_LINKED: "PLAN_TRADE_ALREADY_LINKED",
  /** Activation requires the minimum documentation (title/thesis/symbol). */
  PLAN_ACTIVATION_INCOMPLETE: "PLAN_ACTIVATION_INCOMPLETE",
} as const;

// ── List query ───────────────────────────────────────────────────────────────

export const listPlansQuerySchema = z.object({
  status: planStatusSchema.optional(),
  symbol: z.string().max(32).optional(),
  tradeId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
