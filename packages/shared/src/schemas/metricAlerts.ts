import { z } from "zod";
import { alertSchema } from "./alert";
import { dateKeySchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Metric alert rules (Dashboard Customization Phase 07) - user-defined
 * threshold monitoring over metrics Euforia can calculate RELIABLY.
 *
 * Domain separation (spec §3 - never merged into one fuzzy object):
 *   A. Alert Rule      - this contract; a persisted user-defined condition.
 *   B. Alert Event     - a recorded trigger, stored as a shared `alert`
 *                        (type METRIC_THRESHOLD) in the EXISTING inbox -
 *                        no second notification system (spec §2).
 *   C. Delivery state  - the alert's `readAt` / `dismissedAt` fields.
 *   D. Observation     - the trusted metric value + evaluation context,
 *                        computed by the API from the authoritative
 *                        analytics-suite engine / goal service. Never sent
 *                        by the client.
 *
 * Evaluation semantics (spec §6, documented policy):
 *   - Transition-based triggering: an event fires when the condition
 *     transitions false→true (a rule whose condition is already true on
 *     its first evaluation fires once, then stays quiet while it remains
 *     true).
 *   - Optional cooldownMinutes suppresses retrigger EVENTS within the
 *     window (flapping control). After the cooldown a still-true condition
 *     does NOT re-fire - a new false→true transition is required.
 *   - Missing data (empty sample, multi-currency money figures) and failed
 *     calculations NEVER trigger and never flip the stored transition
 *     state.
 *
 * Supported metrics are ONLY fields of the analytics-suite summary (the
 * same numbers the Analytics page renders) plus the goal service's
 * progress rows - the alert engine computes nothing financial itself.
 */

// ── Periods ──────────────────────────────────────────────────────────────────
// Server-resolved presets only (resolvePeriodRange in the analytics engine).
// CUSTOM is deliberately absent: a standing rule with fixed calendar dates
// silently expires - rolling windows are the honest product here.

export const metricAlertPeriodSchema = z.enum([
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "LAST_30",
  "LAST_90",
  "YTD",
  "ALL",
]);
export type MetricAlertPeriod = z.infer<typeof metricAlertPeriodSchema>;

// ── Conditions ───────────────────────────────────────────────────────────────

export const metricAlertConditionSchema = z.enum([
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "EQUAL",
]);
export type MetricAlertCondition = z.infer<typeof metricAlertConditionSchema>;

export const METRIC_ALERT_CONDITION_LABELS: Record<MetricAlertCondition, string> = {
  GREATER_THAN: ">",
  GREATER_THAN_OR_EQUAL: "≥",
  LESS_THAN: "<",
  LESS_THAN_OR_EQUAL: "≤",
  EQUAL: "=",
};

// ── Metric registry (the supported-metric whitelist) ────────────────────────
// Units make cross-metric comparisons safe at the type level (spec §4: a
// percentage must never be compared to a currency amount - thresholds are
// validated against the metric's unit semantics below).

export const metricAlertUnitSchema = z.enum(["MONEY", "PERCENT", "RATIO", "COUNT", "R"]);
export type MetricAlertUnit = z.infer<typeof metricAlertUnitSchema>;

export const metricAlertMetricSchema = z.enum([
  "NET_PNL",
  "WIN_RATE",
  "PROFIT_FACTOR",
  "TRADE_COUNT",
  "DRAWDOWN_PCT",
  "AVG_R",
]);
export type MetricAlertMetric = z.infer<typeof metricAlertMetricSchema>;

export interface MetricAlertMetricMeta {
  /** Human label, e.g. "Net realized P&L". */
  label: string;
  unit: MetricAlertUnit;
  /** true = higher is better, false = lower is better, null = neutral (UI hint only). */
  higherIsBetter: boolean | null;
  /** How the observation is derived from the authoritative suite summary. */
  source: string;
  /** Conditions the metric supports (EQUAL only where meaningful, spec §4). */
  conditions: MetricAlertCondition[];
  /** Inclusive threshold bounds (null = unbounded). */
  thresholdMin: number | null;
  thresholdMax: number | null;
  /** Whole-number thresholds only. */
  integerThreshold: boolean;
}

export const METRIC_ALERT_REGISTRY: Record<MetricAlertMetric, MetricAlertMetricMeta> = {
  NET_PNL: {
    label: "Net realized P&L",
    unit: "MONEY",
    higherIsBetter: true,
    source: "summary.netPnl - null (no trigger) on multi-currency scopes or empty samples",
    conditions: ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"],
    thresholdMin: null,
    thresholdMax: null,
    integerThreshold: false,
  },
  WIN_RATE: {
    label: "Win rate",
    unit: "PERCENT",
    higherIsBetter: true,
    source: "summary.winRate (0..1 ratio) × 100 - null on empty samples",
    conditions: ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"],
    thresholdMin: 0,
    thresholdMax: 100,
    integerThreshold: false,
  },
  PROFIT_FACTOR: {
    label: "Profit factor",
    unit: "RATIO",
    higherIsBetter: true,
    source: "summary.profitFactor - null (no trigger) while the sample has zero losses",
    conditions: ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"],
    thresholdMin: 0,
    thresholdMax: null,
    integerThreshold: false,
  },
  TRADE_COUNT: {
    label: "Completed trades",
    unit: "COUNT",
    higherIsBetter: null,
    source: "summary.trades - 0 is a valid observation (quiet-period monitoring)",
    conditions: [
      "GREATER_THAN",
      "GREATER_THAN_OR_EQUAL",
      "LESS_THAN",
      "LESS_THAN_OR_EQUAL",
      "EQUAL",
    ],
    thresholdMin: 0,
    thresholdMax: null,
    integerThreshold: true,
  },
  DRAWDOWN_PCT: {
    label: "Equity drawdown",
    unit: "PERCENT",
    higherIsBetter: false,
    source: "−summary.maxDrawdownPct as a ≥0 magnitude - null on multi-currency scopes or empty samples",
    conditions: ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"],
    thresholdMin: 0,
    thresholdMax: 100,
    integerThreshold: false,
  },
  AVG_R: {
    label: "Average R per trade",
    unit: "R",
    higherIsBetter: true,
    source: "summary.avgR - null on empty samples",
    conditions: ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"],
    thresholdMin: null,
    thresholdMax: null,
    integerThreshold: false,
  },
};

// ── Goal rules (spec §10 - reuse the Phase 04 goal engine, never a second) ──

export const metricAlertGoalConditionSchema = z.enum(["ACHIEVED", "PROGRESS_BELOW"]);
export type MetricAlertGoalCondition = z.infer<typeof metricAlertGoalConditionSchema>;

// ── Rule documents ───────────────────────────────────────────────────────────

export const metricAlertKindSchema = z.enum(["THRESHOLD", "GOAL"]);
export type MetricAlertKind = z.infer<typeof metricAlertKindSchema>;

/** Server-managed evaluation state - never accepted from clients. */
export const metricAlertRuleStateSchema = z.object({
  /** null = never observed. Drives the false→true transition. */
  lastConditionMet: z.boolean().nullable(),
  lastTriggeredAt: isoDateTimeSchema.nullable(),
  lastEvaluationAt: isoDateTimeSchema.nullable(),
  lastObservedValue: z.number().nullable(),
  /** OK | NO_DATA (missing/stale) | CALC_FAILED (metric computation threw). */
  lastObservation: z.enum(["OK", "NO_DATA", "CALC_FAILED"]),
  triggerCount: z.number().int().min(0),
});
export type MetricAlertRuleState = z.infer<typeof metricAlertRuleStateSchema>;

const scopeFields = {
  /** Optional account scope - must reference the owner's account. */
  accountId: uuidSchema.nullable().optional(),
  /**
   * Optional strategy scope - a strategy UUID of the owner, or "none" for
   * out-of-playbook trades, or null/absent for any strategy.
   */
  strategyId: z.union([uuidSchema, z.literal("none")]).nullable().optional(),
} as const;

const baseRuleFields = {
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  /** 0 = trigger on every false→true transition (no flapping guard). */
  cooldownMinutes: z.number().int().min(0).max(10_080),
  state: metricAlertRuleStateSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  ...scopeFields,
} as const;

const thresholdRuleSchema = z.object({
  ...baseRuleFields,
  kind: z.literal("THRESHOLD"),
  metric: metricAlertMetricSchema,
  condition: metricAlertConditionSchema,
  threshold: z.number().refine((v) => Number.isFinite(v), {
    message: "Threshold must be a finite number",
  }),
  /** Server-resolved period preset (see metricAlertPeriodSchema). */
  period: metricAlertPeriodSchema,
});

const goalRuleSchema = z.object({
  ...baseRuleFields,
  kind: z.literal("GOAL"),
  goalId: uuidSchema,
  goalCondition: metricAlertGoalConditionSchema,
  /** Required iff goalCondition = PROGRESS_BELOW (percent 0..100). */
  thresholdPct: z.number().min(0).max(100).nullable(),
});

export const metricAlertRuleSchema = z.discriminatedUnion("kind", [
  thresholdRuleSchema,
  goalRuleSchema,
]);
export type MetricAlertRule = z.infer<typeof metricAlertRuleSchema>;

/** Per-kind semantic validation shared by create, update and stored reads. */
export function validateMetricAlertRuleSemantics(rule: MetricAlertRule): string | null {
  if (rule.kind === "THRESHOLD") {
    const meta = METRIC_ALERT_REGISTRY[rule.metric];
    if (!meta.conditions.includes(rule.condition)) {
      return `Condition ${rule.condition} is not supported for metric ${rule.metric}`;
    }
    if (meta.thresholdMin !== null && rule.threshold < meta.thresholdMin) {
      return `Threshold for ${rule.metric} must be ≥ ${meta.thresholdMin} (${meta.unit})`;
    }
    if (meta.thresholdMax !== null && rule.threshold > meta.thresholdMax) {
      return `Threshold for ${rule.metric} must be ≤ ${meta.thresholdMax} (${meta.unit})`;
    }
    if (meta.integerThreshold && !Number.isInteger(rule.threshold)) {
      return `Threshold for ${rule.metric} must be a whole number (${meta.unit})`;
    }
    return null;
  }
  if (rule.goalCondition === "PROGRESS_BELOW" && rule.thresholdPct === null) {
    return "PROGRESS_BELOW rules require a progress threshold (percent)";
  }
  return null;
}

// ── Client inputs ────────────────────────────────────────────────────────────

const thresholdInputSchema = z.object({
  kind: z.literal("THRESHOLD"),
  name: z.string().min(1, "Name is required").max(80),
  metric: metricAlertMetricSchema,
  condition: metricAlertConditionSchema,
  threshold: z.number().refine((v) => Number.isFinite(v), {
    message: "Threshold must be a finite number",
  }),
  period: metricAlertPeriodSchema,
  accountId: uuidSchema.nullish(),
  strategyId: z.union([uuidSchema, z.literal("none")]).nullish(),
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
});

const goalInputSchema = z.object({
  kind: z.literal("GOAL"),
  name: z.string().min(1, "Name is required").max(80),
  goalId: uuidSchema,
  goalCondition: metricAlertGoalConditionSchema,
  thresholdPct: z.number().min(0).max(100).nullish(),
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
});

export const createMetricAlertRuleInputSchema = z.discriminatedUnion("kind", [
  thresholdInputSchema,
  goalInputSchema,
]);
export type CreateMetricAlertRuleInput = z.infer<typeof createMetricAlertRuleInputSchema>;

export const updateMetricAlertRuleInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
  // THRESHOLD-only fields (ignored for GOAL rules - server enforces kind).
  metric: metricAlertMetricSchema.optional(),
  condition: metricAlertConditionSchema.optional(),
  threshold: z
    .number()
    .refine((v) => Number.isFinite(v), { message: "Threshold must be a finite number" })
    .optional(),
  period: metricAlertPeriodSchema.optional(),
  accountId: uuidSchema.nullish(),
  strategyId: z.union([uuidSchema, z.literal("none")]).nullish(),
  // GOAL-only fields.
  goalId: uuidSchema.optional(),
  goalCondition: metricAlertGoalConditionSchema.optional(),
  thresholdPct: z.number().min(0).max(100).nullish(),
});
export type UpdateMetricAlertRuleInput = z.infer<typeof updateMetricAlertRuleInputSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const metricAlertRulesResponseSchema = z.object({
  rules: z.array(metricAlertRuleSchema),
});
export type MetricAlertRulesResponse = z.infer<typeof metricAlertRulesResponseSchema>;

export const evaluateMetricAlertsResponseSchema = z.object({
  evaluatedRules: z.number().int().min(0),
  triggeredEvents: z.number().int().min(0),
  skippedNoData: z.number().int().min(0),
  failedScopes: z.number().int().min(0),
  evaluatedAt: isoDateTimeSchema,
});
export type EvaluateMetricAlertsResponse = z.infer<typeof evaluateMetricAlertsResponseSchema>;

/**
 * A rule's recent events = the shared inbox alerts whose payload carries
 * the rule reference. Same wire shape as GET /alerts rows (spec §9: audit
 * history survives rule deletion via the frozen payload).
 */
export const metricAlertRuleEventsResponseSchema = z.object({
  events: z.array(alertSchema),
});
export type MetricAlertRuleEventsResponse = z.infer<typeof metricAlertRuleEventsResponseSchema>;

/**
 * The METRIC_THRESHOLD alert payload (API-owned, documented shape). Frozen
 * trigger context - survives rule deletion (violation-style freeze, §57).
 */
export const metricAlertEventPayloadSchema = z.object({
  ruleId: uuidSchema,
  ruleName: z.string(),
  ruleKind: metricAlertKindSchema,
  /** THRESHOLD context. */
  metric: metricAlertMetricSchema.nullable(),
  condition: metricAlertConditionSchema.nullable(),
  threshold: z.number().nullable(),
  observedValue: z.number().nullable(),
  unit: metricAlertUnitSchema.nullable(),
  period: metricAlertPeriodSchema.nullable(),
  /** GOAL context. */
  goalId: uuidSchema.nullable(),
  goalTitle: z.string().nullable(),
  goalCondition: metricAlertGoalConditionSchema.nullable(),
  /** Common evaluation context. */
  accountId: uuidSchema.nullable(),
  strategyId: z.string().nullable(),
  periodStart: dateKeySchema.nullable(),
  periodEnd: dateKeySchema.nullable(),
  evaluatedAt: isoDateTimeSchema,
  evaluationKey: z.string(),
});
export type MetricAlertEventPayload = z.infer<typeof metricAlertEventPayloadSchema>;

// ── Presentation helpers (shared by API copy + web UI - one formatter) ──────

export const METRIC_ALERT_PERIOD_LABELS: Record<MetricAlertPeriod, string> = {
  TODAY: "today",
  THIS_WEEK: "this week",
  THIS_MONTH: "this month",
  THIS_QUARTER: "this quarter",
  THIS_YEAR: "this year",
  LAST_30: "over the last 30 days",
  LAST_90: "over the last 90 days",
  YTD: "year to date",
  ALL: "across all time",
};

/** Unit-aware value formatting ("$1,250.50", "62.5%", "1.8×", "23", "0.42R"). */
export function formatMetricAlertValue(unit: MetricAlertUnit, value: number): string {
  switch (unit) {
    case "MONEY":
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "PERCENT":
      return `${Math.round(value * 10) / 10}%`;
    case "RATIO":
      return `${Math.round(value * 100) / 100}×`;
    case "COUNT":
      return `${Math.round(value)}`;
    case "R":
      return `${Math.round(value * 100) / 100}R`;
  }
}
