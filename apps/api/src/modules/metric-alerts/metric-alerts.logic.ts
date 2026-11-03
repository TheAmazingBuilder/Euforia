/**
 * Metric alert rules - PURE evaluation logic (Dashboard Customization
 * Phase 07). Deterministic, side-effect-free, unit-testable without Nest -
 * the `monitoring.logic.ts` house pattern (§46).
 *
 * The engine NEVER computes a financial metric itself: observations are
 * extracted from the authoritative analytics-suite summary (the exact
 * object GET /stats/analytics-suite renders) or from the goal service's
 * progress rows. Triggering is TRANSITION-based (false→true) with an
 * optional cooldown that suppresses flapping events; missing data and
 * failed calculations never trigger and never flip the stored transition
 * state (so a data gap cannot manufacture or swallow a transition).
 */
import {
  METRIC_ALERT_CONDITION_LABELS,
  METRIC_ALERT_PERIOD_LABELS,
  METRIC_ALERT_REGISTRY,
  formatMetricAlertValue as formatMetricValue,
  validateMetricAlertRuleSemantics,
  type MetricAlertCondition,
  type MetricAlertEventPayload,
  type MetricAlertPeriod,
  type MetricAlertRule,
  type MetricAlertRuleState,
} from "../../shared/contracts";
import type { AnalyticsSuiteResponse } from "../../shared/contracts";
import { uuidV5 } from "../../shared/ids/uuid-v5";

type SuiteSummary = AnalyticsSuiteResponse["summary"];

/** Stable namespace for derived metric-alert event ids (idempotency §63). */
export const METRIC_ALERTS_UUID_NAMESPACE = "7c1d2a4e-5b8f-4c3a-9d6e-2f1a4b7c8e50";

// ── Observations ─────────────────────────────────────────────────────────────

export type MetricObservation =
  | { ok: true; value: number }
  | { ok: false; reason: "NO_DATA" | "CALC_FAILED" };

function parseDecimal(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Extract a metric observation from the authoritative suite summary.
 * Registry transforms (documented in the shared registry):
 *   WIN_RATE     - summary.winRate is a 0..1 ratio → reported 0..100 %.
 *   DRAWDOWN_PCT - summary.maxDrawdownPct is ≤ 0 → reported ≥ 0 magnitude.
 * Null summary fields (empty sample, multi-currency money) are honest
 * NO_DATA observations - never treated as "condition false".
 */
export function extractSummaryObservation(
  metric: keyof typeof METRIC_ALERT_REGISTRY,
  summary: SuiteSummary,
): MetricObservation {
  switch (metric) {
    case "NET_PNL": {
      const value = parseDecimal(summary.netPnl);
      return value === null ? { ok: false, reason: "NO_DATA" } : { ok: true, value };
    }
    case "WIN_RATE": {
      const ratio = parseDecimal(summary.winRate);
      return ratio === null
        ? { ok: false, reason: "NO_DATA" }
        : { ok: true, value: Math.round(ratio * 10_000) / 100 };
    }
    case "PROFIT_FACTOR": {
      const value = parseDecimal(summary.profitFactor);
      return value === null ? { ok: false, reason: "NO_DATA" } : { ok: true, value };
    }
    case "TRADE_COUNT":
      return { ok: true, value: summary.trades };
    case "DRAWDOWN_PCT": {
      const value = parseDecimal(summary.maxDrawdownPct);
      return value === null
        ? { ok: false, reason: "NO_DATA" }
        : { ok: true, value: Math.round(-value * 100) / 100 };
    }
    case "AVG_R": {
      const value = parseDecimal(summary.avgR);
      return value === null ? { ok: false, reason: "NO_DATA" } : { ok: true, value };
    }
  }
}

// ── Condition comparison ─────────────────────────────────────────────────────

export function compareCondition(
  value: number,
  condition: MetricAlertCondition,
  threshold: number,
): boolean {
  switch (condition) {
    case "GREATER_THAN":
      return value > threshold;
    case "GREATER_THAN_OR_EQUAL":
      return value >= threshold;
    case "LESS_THAN":
      return value < threshold;
    case "LESS_THAN_OR_EQUAL":
      return value <= threshold;
    case "EQUAL":
      return value === threshold;
  }
}

// ── Cooldown ─────────────────────────────────────────────────────────────────

/**
 * True when the rule may fire an event NOW. Policy (documented, spec §6):
 * transition-based triggering; cooldownMinutes only suppresses EVENTS
 * within the window - it never fakes a transition, and after the cooldown
 * a still-true condition does NOT re-fire (a new false→true is required).
 */
function cooldownElapsed(
  lastTriggeredAt: string | null,
  cooldownMinutes: number,
  now: Date,
): boolean {
  if (lastTriggeredAt === null || cooldownMinutes <= 0) return true;
  const elapsedMs = now.getTime() - new Date(lastTriggeredAt).getTime();
  return elapsedMs >= cooldownMinutes * 60_000;
}

// ── The tick - one rule × one observation ────────────────────────────────────

export type RuleTickOutcome =
  | {
      outcome: "TRIGGER";
      nextState: MetricAlertRuleState;
      observedValue: number;
      triggerCount: number;
    }
  | {
      outcome: "QUIET";
      nextState: MetricAlertRuleState;
      /** Why no event fired this tick (diagnostics + evaluate response). */
      reason:
        | "DISABLED"
        | "CONDITION_FALSE"
        | "NO_TRANSITION"
        | "COOLDOWN"
        | "NO_DATA"
        | "CALC_FAILED";
    };

/**
 * One evaluation tick for one rule. `state` is re-read by the caller
 * INSIDE the persistence transaction, so concurrent evaluations of the
 * same rule serialize on the row update - the transition decision cannot
 * double-fire (spec §12 race requirement).
 */
export function evaluateRuleTick(
  rule: MetricAlertRule,
  observation: MetricObservation,
  state: MetricAlertRuleState,
  now: Date,
): RuleTickOutcome {
  if (!rule.enabled) {
    // A disabled rule is NOT observed: its transition state stays frozen
    // (enabling it later resumes from the last observed condition, spec §5).
    return { outcome: "QUIET", reason: "DISABLED", nextState: state };
  }
  if (!observation.ok) {
    // Missing/failed data: keep lastConditionMet UNCHANGED (a gap is not a
    // transition), record the observation honestly, never trigger.
    return {
      outcome: "QUIET",
      reason: observation.reason,
      nextState: {
        ...state,
        lastEvaluationAt: now.toISOString(),
        lastObservation: observation.reason,
      },
    };
  }

  const conditionMet =
    rule.kind === "THRESHOLD"
      ? compareCondition(observation.value, rule.condition, rule.threshold)
      : rule.goalCondition === "ACHIEVED"
        ? // ACHIEVED - the goal engine's authoritative status folded to a
          // boolean: progressPct reaches 100 exactly when status = ACHIEVED.
          observation.value >= 100
        : // PROGRESS_BELOW - progress slipped under the user's percent line.
          observation.value < (rule.thresholdPct ?? 0);

  const transitionEligible = state.lastConditionMet === null || state.lastConditionMet === false;
  const canFire = rule.enabled && conditionMet && transitionEligible;

  if (canFire && !cooldownElapsed(state.lastTriggeredAt, rule.cooldownMinutes, now)) {
    return {
      outcome: "QUIET",
      reason: "COOLDOWN",
      // A cooldown-suppressed trigger still commits the transition - after
      // the cooldown a NEW false→true is required (documented policy).
      nextState: {
        ...state,
        lastConditionMet: true,
        lastEvaluationAt: now.toISOString(),
        lastObservedValue: observation.value,
        lastObservation: "OK",
      },
    };
  }

  if (!canFire) {
    return {
      outcome: "QUIET",
      reason: conditionMet ? "NO_TRANSITION" : "CONDITION_FALSE",
      nextState: {
        ...state,
        lastConditionMet: conditionMet,
        lastEvaluationAt: now.toISOString(),
        lastObservedValue: observation.value,
        lastObservation: "OK",
      },
    };
  }

  const triggerCount = state.triggerCount + 1;
  return {
    outcome: "TRIGGER",
    triggerCount,
    observedValue: observation.value,
    nextState: {
      lastConditionMet: true,
      lastTriggeredAt: now.toISOString(),
      lastEvaluationAt: now.toISOString(),
      lastObservedValue: observation.value,
      lastObservation: "OK",
      triggerCount,
    },
  };
}

/**
 * GOAL observations arrive as the goal engine's progressPct (0..100).
 * The per-condition comparison lives inline in evaluateRuleTick - the goal
 * engine itself stays the only status authority (spec §10: no second goal
 * calculation engine).
 */

// ── Event identity + presentation ────────────────────────────────────────────

/** Deterministic event id - replays of the same trigger are no-ops. */
export function metricAlertEventId(ruleId: string, triggerCount: number): string {
  return uuidV5(`metric-alert:${ruleId}:t${triggerCount}`, METRIC_ALERTS_UUID_NAMESPACE);
}

// Unit/period formatting comes from the SHARED package (one formatter for
// API copy + web UI); re-exported here for the service + unit spec.
export { formatMetricValue, METRIC_ALERT_PERIOD_LABELS };

/** Human title + message for the inbox row (neutral wording, spec §8). */
export function metricAlertCopy(
  rule: MetricAlertRule,
  observedValue: number,
  period: MetricAlertPeriod | null,
): { title: string; message: string } {
  if (rule.kind === "GOAL") {
    const pct = Math.round(observedValue * 10) / 10;
    const title = rule.goalCondition === "ACHIEVED"
      ? `Goal achieved: ${rule.name}`
      : `Goal off pace: ${rule.name}`;
    const message = rule.goalCondition === "ACHIEVED"
      ? `Progress is ${pct}% of the target.`
      : `Progress is ${pct}%, below your ${rule.thresholdPct ?? 0}% alert threshold.`;
    return { title, message };
  }
  const meta = METRIC_ALERT_REGISTRY[rule.metric];
  const condition = METRIC_ALERT_CONDITION_LABELS[rule.condition];
  const title = rule.name;
  const message = `${meta.label} is ${formatMetricValue(meta.unit, observedValue)} ${METRIC_ALERT_PERIOD_LABELS[period ?? "ALL"]} - condition ${condition} ${formatMetricValue(meta.unit, rule.threshold)} met.`;
  return { title, message };
}

/** Frozen trigger context persisted inside the inbox alert payload (§9). */
export function metricAlertPayload(
  rule: MetricAlertRule,
  observedValue: number,
  evaluationKey: string,
  evaluatedAt: string,
  context: {
    /** Suite window for THRESHOLD rules; null for GOAL rules (the goal
     * engine owns its own window - never re-derived here). */
    period: MetricAlertPeriod | null;
    periodStart: string | null;
    periodEnd: string | null;
  },
): MetricAlertEventPayload {
  const isThreshold = rule.kind === "THRESHOLD";
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleKind: rule.kind,
    metric: isThreshold ? rule.metric : null,
    condition: isThreshold ? rule.condition : null,
    threshold: isThreshold ? rule.threshold : (rule.thresholdPct ?? null),
    observedValue,
    unit: isThreshold ? METRIC_ALERT_REGISTRY[rule.metric].unit : "PERCENT",
    period: isThreshold ? context.period : null,
    goalId: !isThreshold ? rule.goalId : null,
    goalTitle: !isThreshold ? rule.name : null,
    goalCondition: !isThreshold ? rule.goalCondition : null,
    accountId: rule.accountId ?? null,
    strategyId: rule.strategyId ?? null,
    periodStart: context.periodStart,
    periodEnd: context.periodEnd,
    evaluatedAt,
    evaluationKey,
  };
}

// ── Duplicate-rule semantic key (spec §5) ────────────────────────────────────

/**
 * Two rules with the same semantic identity would always fire together -
 * the API rejects exact duplicates with 409 (documented behavior: near
 * duplicates with different thresholds remain allowed - they are a
 * deliberate escalation ladder, e.g. warn at 5% drawdown, alert at 10%).
 */
export function metricAlertSemanticKey(rule: {
  kind: string;
  metric?: string;
  condition?: string;
  threshold?: number;
  period?: MetricAlertPeriod;
  accountId?: string | null;
  strategyId?: string | null;
  goalId?: string;
  goalCondition?: string;
  thresholdPct?: number | null;
}): string {
  const scope = `${rule.accountId ?? "*"}|${rule.strategyId ?? "*"}`;
  if (rule.kind === "GOAL") {
    return `GOAL|${rule.goalId}|${rule.goalCondition}|${rule.thresholdPct ?? "*"}|${scope}`;
  }
  return `THRESHOLD|${rule.metric}|${rule.condition}|${rule.threshold}|${rule.period}|${scope}`;
}

// Re-export for the service layer (single validation entry point).
export { validateMetricAlertRuleSemantics };
