/**
 * Discipline pure logic - rule evaluation, the Cosmoz Index score, the
 * emotion matrix. Ported 1:1 from the mock store where the frontend
 * algorithm already exists; the score formula is the documented V1 weights
 * (decoupled from P&L per the shared DailyStat contract).
 */
import { toDecimalString } from "../../shared/contracts";
import type {
  DisciplineEmotionMatrixResponse,
  DisciplineScoreResponse,
  EmotionResultRow,
  Rule,
  RuleViolation,
  RuleViolationView,
  RulesStatusResponse,
} from "../../shared/contracts";
import { computeMistakeLedger, num, round2, type StatsContext } from "../stats/stats.helpers";

// ── Row views ───────────────────────────────────────────────────────────────

export function violationToView(
  violation: RuleViolation,
  rulesById: Map<string, Pick<Rule, "id" | "type" | "severity">>,
): RuleViolationView | null {
  const rule = rulesById.get(violation.ruleId);
  if (!rule) return null;
  return {
    ...violation,
    ruleType: rule.type,
    ruleSeverity: rule.severity,
  };
}

// ── GET /rules/status - the guardrail board for one trading day ─────────────

export function computeRulesStatus(input: {
  rules: Rule[];
  today: string;
  balance: number;
  accountId: string | null;
  trades: { tradingDate: string; status: string; accountId: string; riskAmount: string | null; pnlNet: string | null }[];
  violationsToday: number;
}): RulesStatusResponse {
  const { rules, today, balance, accountId } = input;
  const dayTrades = input.trades.filter(
    (t) => t.tradingDate === today && t.status !== "CANCELLED" && (accountId === null || t.accountId === accountId),
  );
  const dayClosed = dayTrades.filter((t) => t.status === "CLOSED");
  const tradesToday = dayTrades.length;
  const lossesToday = dayClosed.filter((t) => num(t.pnlNet) < 0).length;
  const riskCommitted = dayTrades.reduce((sum, t) => sum + num(t.riskAmount), 0);
  const riskBudgetSpentPct = balance > 0 ? round2((riskCommitted / balance) * 100) : 0;

  const limits = rules
    .filter((r) => r.isActive)
    .map((r) => {
      const params = r.params as { limit?: number };
      const limit = typeof params.limit === "number" ? params.limit : 0;
      let current = 0;
      if (r.type === "MAX_TRADES_PER_DAY") current = tradesToday;
      else if (r.type === "MAX_LOSSES_PER_DAY") current = lossesToday;
      else if (r.type === "MAX_RISK_PCT_PER_TRADE") {
        current = round2(
          Math.max(0, ...dayTrades.map((t) => (num(t.riskAmount) / balance) * 100)),
        );
      }
      return {
        ruleId: r.id,
        type: r.type,
        severity: r.severity,
        limit: toDecimalString(limit),
        current: toDecimalString(round2(current)),
      };
    });

  return {
    date: today,
    accountId,
    tradesToday,
    lossesToday,
    violationsToday: input.violationsToday,
    riskBudgetSpentPct: toDecimalString(riskBudgetSpentPct),
    limits,
  };
}

// ── Rule engine (V1) - breaches for the LIMIT family are evaluated live. ────
// The other rule types (COOLDOWN, TRADING_WINDOW, NO_NEWS_WINDOW…) need
// clock/context infrastructure that lands with their own phases; they appear
// on the guardrail board but raise no violations yet (documented scope).

export interface RuleBreach {
  ruleId: string;
  type: string;
  /** Frozen context at detection time T. */
  context: Record<string, unknown>;
}

export function evaluateLimitRules(input: {
  rules: Rule[];
  balance: number;
  tradesToday: number;
  lossesToday: number;
  maxRiskPctToday: number;
  dailyLossPct: number;
}): RuleBreach[] {
  const breaches: RuleBreach[] = [];
  for (const rule of input.rules) {
    if (!rule.isActive) continue;
    const params = rule.params as { limit?: number };
    const limit = typeof params.limit === "number" ? params.limit : null;
    if (limit === null) continue;
    if (rule.type === "MAX_TRADES_PER_DAY" && input.tradesToday > limit) {
      breaches.push({ ruleId: rule.id, type: rule.type, context: { tradesToday: input.tradesToday, limit } });
    } else if (rule.type === "MAX_LOSSES_PER_DAY" && input.lossesToday > limit) {
      breaches.push({ ruleId: rule.id, type: rule.type, context: { lossesToday: input.lossesToday, limit } });
    } else if (rule.type === "MAX_RISK_PCT_PER_TRADE" && input.maxRiskPctToday > limit) {
      breaches.push({ ruleId: rule.id, type: rule.type, context: { maxRiskPct: round2(input.maxRiskPctToday), limit } });
    } else if (rule.type === "MAX_DAILY_LOSS_PCT" && input.dailyLossPct > limit) {
      breaches.push({ ruleId: rule.id, type: rule.type, context: { dailyLossPct: round2(input.dailyLossPct), limit } });
    }
  }
  return breaches;
}

// ── GET /discipline/score - the Cosmoz Index (decoupled from P&L) ────────────

export interface ScoreIngredients {
  planAdherencePct: number | null;
  checklistCompletionPct: number;
  violationsCount: number;
  journalingConsistencyPct: number;
}

/**
 * V1 Cosmoz Index weights: plan conformity dominates (0.5), checklist
 * discipline (0.3), journaling regularity (0.2); each violation in the
 * window costs 10 points. Clamped to 0..100. Deterministic so the nightly
 * job (future phase) reproduces it exactly.
 */
export function cosmozIndexOf(ingredients: ScoreIngredients): number {
  const plan = ingredients.planAdherencePct ?? 0;
  const raw =
    0.5 * plan +
    0.3 * ingredients.checklistCompletionPct +
    0.2 * ingredients.journalingConsistencyPct -
    10 * Math.min(ingredients.violationsCount, 10);
  return round2(Math.max(0, Math.min(100, raw)));
}

export function computeScoreIngredients(input: {
  today: string;
  windowStart: string;
  trades: { tradingDate: string; status: string; decisionGrade: string | null; followedPlan: boolean | null; checklistSnap: unknown; lessons: string | null; notes: string | null }[];
  violationsCount: number;
}): ScoreIngredients {
  const windowTrades = input.trades.filter(
    (t) => t.tradingDate >= input.windowStart && t.tradingDate <= input.today && t.status !== "CANCELLED",
  );
  const windowClosed = windowTrades.filter((t) => t.status === "CLOSED");
  const graded = windowClosed.filter((t) => t.decisionGrade !== null);

  const planAdherencePct = graded.length > 0
    ? (graded.filter((t) => t.followedPlan === true).length / graded.length) * 100
    : null;
  const checklistComplete = graded.filter((t) => {
    const snap = t.checklistSnap;
    return (
      snap !== null &&
      typeof snap === "object" &&
      !Array.isArray(snap) &&
      Object.values(snap as Record<string, unknown>).every((value) => value === true)
    );
  }).length;
  const checklistCompletionPct = graded.length > 0 ? (checklistComplete / graded.length) * 100 : 0;

  const tradingDays = new Set(windowClosed.map((t) => t.tradingDate));
  const journaledDays = new Set(
    windowClosed
      .filter((t) => (t.lessons !== null && t.lessons.trim() !== "") || (t.notes !== null && t.notes.trim() !== ""))
      .map((t) => t.tradingDate),
  );
  const journalingConsistencyPct = tradingDays.size > 0
    ? ([...tradingDays].filter((day) => journaledDays.has(day)).length / tradingDays.size) * 100
    : 0;

  return {
    planAdherencePct,
    checklistCompletionPct,
    violationsCount: input.violationsCount,
    journalingConsistencyPct,
  };
}

export function disciplineScoreResponseOf(
  ingredients: ScoreIngredients,
  score: number | null,
  windowStart: string,
): DisciplineScoreResponse {
  return {
    windowStart,
    score: score === null ? null : toDecimalString(score),
    planAdherencePct:
      ingredients.planAdherencePct === null ? null : toDecimalString(round2(ingredients.planAdherencePct)),
    checklistCompletionPct: toDecimalString(round2(ingredients.checklistCompletionPct)),
    violationsCount: ingredients.violationsCount,
    journalingConsistencyPct: toDecimalString(round2(ingredients.journalingConsistencyPct)),
  };
}

// ── GET /discipline/emotion-matrix ───────────────────────────────────────────

export function computeEmotionMatrix(input: {
  today: string;
  windowStart: string;
  now: string;
  trades: { tradingDate: string; status: string; emotionBefore: string | null; pnlNet: string | null; rMultiple: string | null }[];
}): DisciplineEmotionMatrixResponse {
  const windowClosed = input.trades.filter(
    (t) =>
      t.tradingDate >= input.windowStart &&
      t.tradingDate <= input.today &&
      t.status === "CLOSED",
  );
  const withEmotion = windowClosed.filter((t) => t.emotionBefore !== null);
  const rows: EmotionResultRow[] = [...new Set(withEmotion.map((t) => t.emotionBefore!))]
    .map((emotion) => {
      const group = withEmotion.filter((t) => t.emotionBefore === emotion);
      const wins = group.filter((t) => num(t.pnlNet) > 0).length;
      const losses = group.length - wins;
      const rSum = group.reduce((sum, t) => sum + num(t.rMultiple), 0);
      return {
        emotion: emotion as EmotionResultRow["emotion"],
        trades: group.length,
        wins,
        losses,
        winRatePct: group.length > 0 ? round2((wins / group.length) * 100) : null,
        avgR: group.length > 0 ? round2(rSum / group.length) : null,
        totalR: group.length > 0 ? round2(rSum) : null,
      };
    })
    .sort((a, b) => b.trades - a.trades);
  return {
    windowStart: input.windowStart,
    rows,
    excluded: windowClosed.length - withEmotion.length,
    meta: { generatedAt: input.now },
  };
}

// ── Mistake ledger passthrough (shared computation with stats) ──────────────

export function disciplineMistakeLedger(ctx: StatsContext, since: string) {
  return computeMistakeLedger(ctx, since);
}
