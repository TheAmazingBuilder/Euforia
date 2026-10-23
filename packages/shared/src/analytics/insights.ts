/**
 * Phase 05 — Performance insights, pattern analysis & trading behavior.
 *
 * ONE deterministic engine, consumed by BOTH the API analytics suite
 * (authoritative computation) and the MSW mirror (mock parity) so the two
 * can never drift. Pure functions, no AI/ML/LLM/predictive model (spec §1).
 *
 * Laws (spec §3/§8):
 * - Every finding is explainable, reproducible, rule-based, and ships with
 *   its observation count. Correlation is never presented as causation.
 * - Small samples are SUPPRESSED (MIN_OBSERVATIONS per compared group),
 *   never dressed up as findings.
 * - Reliability labels are transparent observation-count bands — they are
 *   NOT statistical confidence levels and no test is claimed.
 * - Money aggregates are null unless the scope is single-currency; R-based,
 *   count and rate metrics survive multi-currency scopes.
 * - Neutral language only: observed sequences are "patterns consistent
 *   with…", never diagnoses of intent or psychology.
 */
import { z } from "zod";

import { dateKeySchema, decimalStringSchema } from "../schemas/primitives";

// ── Wire contracts ──────────────────────────────────────────────────────────

/** One holding-duration bucket (spec §4 — duration dimension). */
export const analyticsDurationBucketSchema = z.object({
  label: z.string().min(1),
  minMinutes: z.number().int().min(0),
  /** null = open-ended top bucket. */
  maxMinutes: z.number().int().min(0).nullable(),
  trades: z.number().int().min(0),
  wins: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  avgR: decimalStringSchema.nullable(),
  /** null when the scope mixes currencies — never a raw cross-currency sum. */
  netPnl: decimalStringSchema.nullable(),
});
export type AnalyticsDurationBucket = z.infer<typeof analyticsDurationBucketSchema>;

export const analyticsDurationsSchema = z.object({
  buckets: z.array(analyticsDurationBucketSchema),
  /** Trades without an exit timestamp cannot be bucketed — counted, not hidden. */
  excludedMissingTimestamp: z.number().int().min(0),
});
export type AnalyticsDurations = z.infer<typeof analyticsDurationsSchema>;

/**
 * Loss-streak profile (spec §7D). The breakeven rule matches the existing
 * `advanced.streaks` engine convention verbatim: breakeven trades neither
 * extend nor break a run.
 */
export const analyticsStreakProfileSchema = z.object({
  rule: z.string().min(1),
  currentLossStreak: z.number().int().min(0),
  currentWinStreak: z.number().int().min(0),
  longestLossStreak: z.number().int().min(0),
  averageLossStreak: decimalStringSchema.nullable(),
  distribution: z.array(
    z.object({ length: z.number().int().min(1), occurrences: z.number().int().min(1) }),
  ),
  /** Performance of the trades that FOLLOW qualifying (≥ minStreak) loss
   * streaks. Overlapping follow-windows count each trade once. */
  afterStreak: z.object({
    minStreak: z.number().int().min(2),
    windowTrades: z.number().int().min(1),
    trades: z.number().int().min(0),
    winRate: decimalStringSchema.nullable(),
    avgR: decimalStringSchema.nullable(),
  }),
});
export type AnalyticsStreakProfile = z.infer<typeof analyticsStreakProfileSchema>;

/** A typed metric value — the UI formats it; the engine never pre-formats. */
export const tradingInsightMetricSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["R", "MONEY", "PERCENT", "COUNT"]),
  /** null = not computable in this scope (e.g. money under multi-currency). */
  value: z.number().nullable(),
});
export type TradingInsightMetric = z.infer<typeof tradingInsightMetricSchema>;

export const tradingInsightReliabilitySchema = z.enum([
  "EARLY_OBSERVATION",
  "REPEATED_PATTERN",
  "STRONG_EVIDENCE",
]);
export type TradingInsightReliability = z.infer<typeof tradingInsightReliabilitySchema>;

export const tradingInsightCategorySchema = z.enum([
  "DIRECTIONAL",
  "TIME_PATTERN",
  "STREAK",
  "OVERTRADING",
  "LOSS_FOLLOWING",
  "RISK_BEHAVIOR",
  "DETERIORATION",
  "DURATION",
]);
export type TradingInsightCategory = z.infer<typeof tradingInsightCategorySchema>;

export const tradingInsightSchema = z.object({
  /** Stable identifier — one insight per category, deterministic across replays. */
  id: z.string().min(1),
  category: tradingInsightCategorySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  metrics: z.array(tradingInsightMetricSchema),
  /** Observation count backing the finding (min of both groups when comparing). */
  observations: z.number().int().min(1),
  reliability: tradingInsightReliabilitySchema,
  periodFrom: dateKeySchema.nullable(),
  periodTo: dateKeySchema.nullable(),
});
export type TradingInsight = z.infer<typeof tradingInsightSchema>;

export const analyticsInsightsSchema = z.object({
  insights: z.array(tradingInsightSchema),
  /** The rules behind the labels, verbatim — the UI shows them as footnotes. */
  methodology: z.array(z.string()),
});
export type AnalyticsInsights = z.infer<typeof analyticsInsightsSchema>;

// ── Engine input ────────────────────────────────────────────────────────────

/**
 * One CLOSED trade, canonical journal values only. Callers (API suite and
 * MSW mirror) map their own row shapes onto this interface; the engine
 * never re-derives P&L or R (Phase 8 §2 law).
 * Rows MUST arrive in chronological order (trading day, then exit time) —
 * the same order the suite engine already sorts into.
 */
export interface InsightsEngineRow {
  id: string;
  instrumentSymbol: string;
  assetClass: string;
  strategyId: string | null;
  /** Journal direction — "BUY" | "SELL". Any other value is excluded from
   * directional analysis (spec §5 exclusion rule). */
  direction: string;
  /** User-timezone trading-day key (journal convention). */
  tradingDate: string;
  entryAtMs: number;
  exitAtMs: number | null;
  /** Pre-parsed pnlNet — missing = 0 (canonical rule). */
  pnlNet: number;
  /** Pre-parsed rMultiple — missing = 0 (canonical rule). */
  rMultiple: number;
  /** Parsed riskAmount > 0 in account currency, else null. */
  riskMoney: number | null;
}

// ── Documented thresholds (spec §8: transparent rules) ──────────────────────

/** Minimum observations per compared group — below this, nothing is emitted. */
export const INSIGHT_MIN_OBSERVATIONS = 5;
/** Deterioration halves need a sturdier footing than pair comparisons. */
export const INSIGHT_MIN_HALF = 10;
/** Observation-count bands behind the reliability labels. */
export const INSIGHT_REPEATED_AT = 20;
export const INSIGHT_STRONG_AT = 50;
/** Neutral window for the loss-following sequence rule (spec §7B). */
export const LOSS_FOLLOWING_WINDOW_MIN = 90;
/** Streak follow-up window and qualification threshold (spec §7D). */
export const AFTER_STREAK_MIN = 3;
export const AFTER_STREAK_WINDOW = 3;
/** A scope is risk-analyzable when this share of trades carries risk data. */
export const RISK_COVERAGE_THRESHOLD = 0.6;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function dec(value: number): string {
  return String(round2(value));
}
function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}
function durationMinutesOf(row: InsightsEngineRow): number | null {
  if (row.exitAtMs === null) return null;
  return Math.max(0, Math.round((row.exitAtMs - row.entryAtMs) / 60_000));
}
function reliabilityOf(observations: number): TradingInsightReliability {
  if (observations >= INSIGHT_STRONG_AT) return "STRONG_EVIDENCE";
  if (observations >= INSIGHT_REPEATED_AT) return "REPEATED_PATTERN";
  return "EARLY_OBSERVATION";
}

// ── Duration breakdown (§4 duration dimension) ──────────────────────────────

const DURATION_BUCKETS: readonly { label: string; min: number; max: number | null }[] = [
  { label: "≤ 15 min", min: 0, max: 15 },
  { label: "15–60 min", min: 16, max: 60 },
  { label: "1–4 h", min: 61, max: 240 },
  { label: "4–24 h", min: 241, max: 1440 },
  { label: "1–7 days", min: 1441, max: 10080 },
  { label: "> 7 days", min: 10081, max: null },
];

export function computeDurations(
  rows: readonly InsightsEngineRow[],
  singleCurrency: boolean,
): AnalyticsDurations {
  const buckets = DURATION_BUCKETS.map((bucket) => {
    const group = rows.filter((row) => {
      const minutes = durationMinutesOf(row);
      if (minutes === null) {
        return false;
      }
      return minutes >= bucket.min && (bucket.max === null || minutes <= bucket.max);
    });
    const wins = group.filter((row) => row.pnlNet > 0);
    const avgR = mean(group.map((row) => row.rMultiple));
    const netPnl = singleCurrency
      ? group.reduce((sum, row) => sum + row.pnlNet, 0)
      : null;
    return {
      label: bucket.label,
      minMinutes: bucket.min,
      maxMinutes: bucket.max,
      trades: group.length,
      wins: wins.length,
      winRate: group.length === 0 ? null : dec(wins.length / group.length),
      avgR: avgR === null ? null : dec(avgR),
      netPnl: netPnl === null ? null : dec(netPnl),
    };
  });
  return {
    buckets,
    excludedMissingTimestamp: rows.filter((row) => row.exitAtMs === null).length,
  };
}

// ── Loss-streak profile (§7D) ───────────────────────────────────────────────

export function computeStreakProfile(rows: readonly InsightsEngineRow[]): AnalyticsStreakProfile {
  let currentLoss = 0;
  let currentWin = 0;
  let longestLoss = 0;
  const completedLossStreaks: number[] = [];
  /** Index (in rows) of the trade where each completed ≥ AFTER_STREAK_MIN loss streak ended. */
  const streakEnds: number[] = [];

  rows.forEach((row, index) => {
    if (row.pnlNet < 0) {
      currentLoss += 1;
      if (currentLoss > longestLoss) longestLoss = currentLoss;
      if (currentWin > 0) {
        currentWin = 0;
      }
    } else if (row.pnlNet > 0) {
      if (currentLoss > 0) {
        completedLossStreaks.push(currentLoss);
        if (currentLoss >= AFTER_STREAK_MIN) streakEnds.push(index - 1);
      }
      currentLoss = 0;
      currentWin += 1;
    }
    // Breakeven (pnlNet === 0): transparent — neither extends nor breaks a run
    // (same documented convention as advanced.streaks).
  });
  if (currentLoss > 0) {
    completedLossStreaks.push(currentLoss);
    if (currentLoss >= AFTER_STREAK_MIN) streakEnds.push(rows.length - 1);
  }

  const distribution = new Map<number, number>();
  for (const length of completedLossStreaks) {
    distribution.set(length, (distribution.get(length) ?? 0) + 1);
  }
  const avgStreak = mean(completedLossStreaks);

  // Follow-window: the AFTER_STREAK_WINDOW trades after each qualifying streak
  // end; a trade already attributed to an earlier (overlapping) window stays
  // attributed — every trade is counted exactly once.
  const followIndices = new Set<number>();
  for (const end of streakEnds) {
    for (let offset = 1; offset <= AFTER_STREAK_WINDOW; offset += 1) {
      const index = end + offset;
      if (index < rows.length) followIndices.add(index);
    }
  }
  const followGroup = [...followIndices].sort((a, b) => a - b).map((index) => rows[index]!);
  const followWins = followGroup.filter((row) => row.pnlNet > 0);
  const followAvgR = mean(followGroup.map((row) => row.rMultiple));

  return {
    rule:
      "A loss streak is a run of consecutive closed trades with negative net P&L in chronological order. Breakeven trades (net P&L = 0) neither extend nor break a streak.",
    currentLossStreak: currentLoss,
    currentWinStreak: currentWin,
    longestLossStreak: longestLoss,
    averageLossStreak: avgStreak === null ? null : dec(avgStreak),
    distribution: [...distribution.entries()]
      .map(([length, occurrences]) => ({ length, occurrences }))
      .sort((a, b) => a.length - b.length),
    afterStreak: {
      minStreak: AFTER_STREAK_MIN,
      windowTrades: AFTER_STREAK_WINDOW,
      trades: followGroup.length,
      winRate: followGroup.length === 0 ? null : dec(followWins.length / followGroup.length),
      avgR: followAvgR === null ? null : dec(followAvgR),
    },
  };
}

// ── Insight generation (§8) ─────────────────────────────────────────────────

interface CandidateInsight extends TradingInsight {
  /** Internal ranking input (transparent, capped at 1) — not on the wire. */
  magnitude: number;
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function periodBounds(rows: readonly InsightsEngineRow[]): { from: string | null; to: string | null } {
  if (rows.length === 0) return { from: null, to: null };
  return { from: rows[0]!.tradingDate, to: rows[rows.length - 1]!.tradingDate };
}

const avgROf = (group: readonly InsightsEngineRow[]): number | null =>
  mean(group.map((row) => row.rMultiple));
const winRateOf = (group: readonly InsightsEngineRow[]): number | null =>
  group.length === 0 ? null : group.filter((row) => row.pnlNet > 0).length / group.length;

function directional(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const longs = rows.filter((row) => row.direction === "BUY");
  const shorts = rows.filter((row) => row.direction === "SELL");
  // Trades with any other direction value are excluded from the directional
  // comparison (spec §5) — the journal schema currently makes that impossible
  // (direction is BUY|SELL), the guard keeps the rule explicit and tested.
  const excluded = rows.length - longs.length - shorts.length;
  if (excluded > 0 && (longs.length < INSIGHT_MIN_OBSERVATIONS || shorts.length < INSIGHT_MIN_OBSERVATIONS)) {
    return null;
  }
  if (longs.length < INSIGHT_MIN_OBSERVATIONS || shorts.length < INSIGHT_MIN_OBSERVATIONS) return null;
  const longAvgR = avgROf(longs);
  const shortAvgR = avgROf(shorts);
  if (longAvgR === null || shortAvgR === null) return null;
  const diff = longAvgR - shortAvgR;
  if (Math.abs(diff) < 0.05) return null;
  const better = diff > 0 ? "Long" : "Short";
  const worse = diff > 0 ? "short" : "long";
  const betterAvg = Math.max(longAvgR, shortAvgR);
  const worseAvg = Math.min(longAvgR, shortAvgR);
  const betterN = diff > 0 ? longs.length : shorts.length;
  const worseN = diff > 0 ? shorts.length : longs.length;
  return {
    id: "DIRECTIONAL",
    category: "DIRECTIONAL",
    title: `${better} trades outperformed ${worse} trades in this scope`,
    description:
      "Side-by-side directional comparison over the same scope, filters and metric definitions. An observed difference in this window - not evidence it will persist.",
    metrics: [
      { label: `${better} avg R`, kind: "R", value: round2(betterAvg) },
      { label: `${worse} avg R`, kind: "R", value: round2(worseAvg) },
      { label: `${better} trades`, kind: "COUNT", value: betterN },
      { label: `${worse} trades`, kind: "COUNT", value: worseN },
    ],
    observations: Math.min(betterN, worseN),
    reliability: reliabilityOf(Math.min(betterN, worseN)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, Math.abs(diff)),
  };
}

function timePattern(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const weekdayOf = (row: InsightsEngineRow): number =>
    new Date(`${row.tradingDate}T00:00:00Z`).getUTCDay();
  const byDay = new Map<number, InsightsEngineRow[]>();
  for (const row of rows) {
    const list = byDay.get(weekdayOf(row)) ?? [];
    list.push(row);
    byDay.set(weekdayOf(row), list);
  }
  const eligible = [...byDay.entries()]
    .filter(([, group]) => group.length >= INSIGHT_MIN_OBSERVATIONS)
    .map(([day, group]) => ({ day, avgR: avgROf(group) ?? 0, n: group.length }));
  if (eligible.length < 2) return null;
  const best = eligible.reduce((a, b) => (b.avgR > a.avgR ? b : a));
  const worst = eligible.reduce((a, b) => (b.avgR < a.avgR ? b : a));
  if (best.day === worst.day) return null;
  const diff = best.avgR - worst.avgR;
  if (diff < 0.1) return null;
  const label = (day: number): string => WEEKDAY_LABELS[day] ?? String(day);
  return {
    id: "TIME_PATTERN",
    category: "TIME_PATTERN",
    title: `Weekday comparison - ${label(best.day)} vs ${label(worst.day)}`,
    description:
      "Best and worst weekdays by average R within the current scope, using the journal's user-timezone trading-day convention. Weekday buckets with fewer than 5 trades are excluded.",
    metrics: [
      { label: `${label(best.day)} avg R`, kind: "R", value: round2(best.avgR) },
      { label: `${label(worst.day)} avg R`, kind: "R", value: round2(worst.avgR) },
      { label: `${label(best.day)} trades`, kind: "COUNT", value: best.n },
      { label: `${label(worst.day)} trades`, kind: "COUNT", value: worst.n },
    ],
    observations: Math.min(best.n, worst.n),
    reliability: reliabilityOf(Math.min(best.n, worst.n)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, diff),
  };
}

function streak(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const profile = computeStreakProfile(rows);
  if (profile.currentLossStreak < AFTER_STREAK_MIN) return null;
  const metrics: TradingInsightMetric[] = [
    { label: "Current loss streak", kind: "COUNT", value: profile.currentLossStreak },
    { label: "Longest loss streak (range)", kind: "COUNT", value: profile.longestLossStreak },
  ];
  if (profile.afterStreak.trades > 0) {
    metrics.push(
      {
        label: `Win rate after ≥${AFTER_STREAK_MIN}-loss streaks`,
        kind: "PERCENT",
        value: profile.afterStreak.winRate === null ? null : Number(profile.afterStreak.winRate),
      },
      {
        label: `Avg R after ≥${AFTER_STREAK_MIN}-loss streaks`,
        kind: "R",
        value: profile.afterStreak.avgR === null ? null : Number(profile.afterStreak.avgR),
      },
    );
  }
  return {
    id: "STREAK",
    category: "STREAK",
    title: `Active loss streak of ${profile.currentLossStreak} trades`,
    description:
      "An observed run of consecutive losing trades in the current scope. Breakeven trades neither extend nor break a streak. Shown as a measured fact, not a diagnosis.",
    metrics,
    observations: profile.currentLossStreak,
    reliability: reliabilityOf(profile.currentLossStreak),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, profile.currentLossStreak / 8),
  };
}

function overtrading(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.tradingDate, (byDay.get(row.tradingDate) ?? 0) + 1);
  const counts = [...byDay.values()].sort((a, b) => a - b);
  if (counts.length < 4) return null;
  const median = counts[Math.floor((counts.length - 1) / 2)]!;
  const busyThreshold = Math.max(3, 2 * median);
  const busyDays = new Set(
    [...byDay.entries()].filter(([, count]) => count >= busyThreshold).map(([day]) => day),
  );
  if (busyDays.size < 3) return null;
  const busy = rows.filter((row) => busyDays.has(row.tradingDate));
  const normal = rows.filter((row) => !busyDays.has(row.tradingDate));
  if (busy.length < INSIGHT_MIN_OBSERVATIONS || normal.length < INSIGHT_MIN_OBSERVATIONS) return null;
  const busyAvgR = avgROf(busy);
  const normalAvgR = avgROf(normal);
  if (busyAvgR === null || normalAvgR === null) return null;
  // Spec §7A: a high count is NOT inherently bad — only reported when the
  // trader's own history shows busier days performing below their normal days.
  if (busyAvgR >= normalAvgR) return null;
  return {
    id: "OVERTRADING",
    category: "OVERTRADING",
    title: "Busier days underperformed this trader's own normal days",
    description: `Days with ${busyThreshold}+ trades (the trader's own busy-day threshold, ≥ max(3, 2× their median)) are compared with all other traded days in the same scope. Observed association, not causation.`,
    metrics: [
      { label: "Busy-day avg R", kind: "R", value: round2(busyAvgR) },
      { label: "Normal-day avg R", kind: "R", value: round2(normalAvgR) },
      { label: "Busy days", kind: "COUNT", value: busyDays.size },
      { label: "Trades on busy days", kind: "COUNT", value: busy.length },
    ],
    observations: Math.min(busy.length, normal.length),
    reliability: reliabilityOf(Math.min(busy.length, normal.length)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, normalAvgR - busyAvgR),
  };
}

function lossFollowing(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const windowMs = LOSS_FOLLOWING_WINDOW_MIN * 60_000;
  const quick = new Set<string>();
  const quickRows: InsightsEngineRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const row = rows[index]!;
    if (previous.pnlNet < 0 && previous.exitAtMs !== null && row.entryAtMs - previous.exitAtMs <= windowMs) {
      if (!quick.has(row.id)) {
        quick.add(row.id);
        quickRows.push(row);
      }
    }
  }
  if (quickRows.length < INSIGHT_MIN_OBSERVATIONS) return null;
  const quickIds = quick;
  const others = rows.filter((row) => !quickIds.has(row.id));
  if (others.length < INSIGHT_MIN_OBSERVATIONS) return null;
  const quickAvgR = avgROf(quickRows);
  const othersAvgR = avgROf(others);
  if (quickAvgR === null || othersAvgR === null) return null;
  if (quickAvgR >= othersAvgR) return null; // only report when the cluster actually fared worse
  const quickWinRate = winRateOf(quickRows);
  return {
    id: "LOSS_FOLLOWING",
    category: "LOSS_FOLLOWING",
    title: "Trades opened shortly after a realized loss fared worse than the rest",
    description: `A "loss-following trade cluster": trades entered within ${LOSS_FOLLOWING_WINDOW_MIN} minutes of a losing trade's exit, compared with all other trades in the scope. An observed sequence - not proof of revenge intent or any psychological state.`,
    metrics: [
      { label: "Loss-following avg R", kind: "R", value: round2(quickAvgR) },
      { label: "Other trades avg R", kind: "R", value: round2(othersAvgR) },
      { label: "Loss-following win rate", kind: "PERCENT", value: quickWinRate === null ? null : round2(quickWinRate) },
      { label: "Loss-following trades", kind: "COUNT", value: quickRows.length },
    ],
    observations: quickRows.length,
    reliability: reliabilityOf(quickRows.length),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, othersAvgR - quickAvgR),
  };
}

function riskBehavior(rows: readonly InsightsEngineRow[], singleCurrency: boolean): CandidateInsight | null {
  if (!singleCurrency) return null; // risk amounts are account-currency money
  const withRisk = rows.filter((row) => row.riskMoney !== null);
  if (rows.length === 0 || withRisk.length / rows.length < RISK_COVERAGE_THRESHOLD) return null;
  const afterLoss: number[] = [];
  const afterWin: number[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const risk = rows[index]!.riskMoney;
    if (risk === null) continue;
    if (previous.pnlNet < 0) afterLoss.push(risk);
    else if (previous.pnlNet > 0) afterWin.push(risk);
  }
  if (afterLoss.length < INSIGHT_MIN_OBSERVATIONS || afterWin.length < INSIGHT_MIN_OBSERVATIONS) return null;
  const lossAvg = mean(afterLoss)!;
  const winAvg = mean(afterWin)!;
  if (lossAvg <= winAvg * 1.15) return null;
  return {
    id: "RISK_BEHAVIOR",
    category: "RISK_BEHAVIOR",
    title: "Position risk after losses ran above position risk after wins",
    description:
      "Compares the risk amount entered on the trade following a loss with the trade following a win, within the same scope. Observed sizing pattern - not a rule violation unless an explicit limit exists and was breached.",
    metrics: [
      { label: "Avg risk after a loss", kind: "MONEY", value: round2(lossAvg) },
      { label: "Avg risk after a win", kind: "MONEY", value: round2(winAvg) },
      { label: "Transitions after losses", kind: "COUNT", value: afterLoss.length },
      { label: "Transitions after wins", kind: "COUNT", value: afterWin.length },
    ],
    observations: Math.min(afterLoss.length, afterWin.length),
    reliability: reliabilityOf(Math.min(afterLoss.length, afterWin.length)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, lossAvg / Math.max(winAvg, 1e-9) - 1),
  };
}

function deterioration(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  if (rows.length < INSIGHT_MIN_HALF * 2) return null;
  const split = Math.floor(rows.length / 2);
  const first = rows.slice(0, split);
  const second = rows.slice(split);
  const firstAvgR = avgROf(first);
  const secondAvgR = avgROf(second);
  const firstWinRate = winRateOf(first);
  const secondWinRate = winRateOf(second);
  if (firstAvgR === null || secondAvgR === null || firstWinRate === null || secondWinRate === null) return null;
  const rDiff = secondAvgR - firstAvgR;
  const winDiff = secondWinRate - firstWinRate;
  if (rDiff > -0.15 && winDiff > -0.1) return null;
  const notes: string[] = [];
  if (Math.abs(first.length - second.length) / Math.max(first.length, second.length) > 0.3) {
    notes.push("The two halves differ materially in sample size.");
  }
  return {
    id: "DETERIORATION",
    category: "DETERIORATION",
    title: "Second half of this window tracked below the first half",
    description: `The analyzed range is split into two equal chronological halves and compared on identical metric definitions. ${notes.join(" ")} A measured change inside this window - not a forecast.`,
    metrics: [
      { label: "First-half avg R", kind: "R", value: round2(firstAvgR) },
      { label: "Second-half avg R", kind: "R", value: round2(secondAvgR) },
      { label: "First-half win rate", kind: "PERCENT", value: round2(firstWinRate) },
      { label: "Second-half win rate", kind: "PERCENT", value: round2(secondWinRate) },
      { label: "First-half trades", kind: "COUNT", value: first.length },
      { label: "Second-half trades", kind: "COUNT", value: second.length },
    ],
    observations: Math.min(first.length, second.length),
    reliability: reliabilityOf(Math.min(first.length, second.length)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, Math.max(-rDiff, -winDiff / 0.25)),
  };
}

function duration(rows: readonly InsightsEngineRow[]): CandidateInsight | null {
  const durations = computeDurations(rows, true);
  const eligible = durations.buckets
    .filter((bucket) => bucket.trades >= INSIGHT_MIN_OBSERVATIONS && bucket.avgR !== null)
    .map((bucket) => ({ label: bucket.label, avgR: Number(bucket.avgR), n: bucket.trades }));
  if (eligible.length < 2) return null;
  const best = eligible.reduce((a, b) => (b.avgR > a.avgR ? b : a));
  const worst = eligible.reduce((a, b) => (b.avgR < a.avgR ? b : a));
  if (best.label === worst.label) return null;
  const diff = best.avgR - worst.avgR;
  if (diff < 0.1) return null;
  return {
    id: "DURATION",
    category: "DURATION",
    title: `Holding time - ${best.label} vs ${worst.label}`,
    description:
      "Best and worst holding-duration buckets by average R within the current scope (entry → exit timestamps). Trades without an exit timestamp are excluded.",
    metrics: [
      { label: `${best.label} avg R`, kind: "R", value: round2(best.avgR) },
      { label: `${worst.label} avg R`, kind: "R", value: round2(worst.avgR) },
      { label: `${best.label} trades`, kind: "COUNT", value: best.n },
      { label: `${worst.label} trades`, kind: "COUNT", value: worst.n },
    ],
    observations: Math.min(best.n, worst.n),
    reliability: reliabilityOf(Math.min(best.n, worst.n)),
    periodFrom: null,
    periodTo: null,
    magnitude: Math.min(1, diff),
  };
}

/** Transparent ranking: evidence weight first, then effect size (capped at a
 * 1R-equivalent), then observations, then the stable id. The ranking orders
 * findings for review — it does NOT predict future performance. */
function rank(a: CandidateInsight, b: CandidateInsight): number {
  const weight = (reliability: TradingInsightReliability): number =>
    reliability === "STRONG_EVIDENCE" ? 3 : reliability === "REPEATED_PATTERN" ? 2 : 1;
  const weightDiff = weight(b.reliability) - weight(a.reliability);
  if (weightDiff !== 0) return weightDiff;
  if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
  if (b.observations !== a.observations) return b.observations - a.observations;
  return a.id.localeCompare(b.id);
}

export function deriveInsights(
  rows: readonly InsightsEngineRow[],
  options: { singleCurrency: boolean },
): AnalyticsInsights {
  const bounds = periodBounds(rows);
  const generators = [
    (candidates: readonly InsightsEngineRow[]) => directional(candidates),
    (candidates: readonly InsightsEngineRow[]) => timePattern(candidates),
    (candidates: readonly InsightsEngineRow[]) => streak(candidates),
    (candidates: readonly InsightsEngineRow[]) => overtrading(candidates),
    (candidates: readonly InsightsEngineRow[]) => lossFollowing(candidates),
    (candidates: readonly InsightsEngineRow[]) => riskBehavior(candidates, options.singleCurrency),
    (candidates: readonly InsightsEngineRow[]) => deterioration(candidates),
    (candidates: readonly InsightsEngineRow[]) => duration(candidates),
  ];
  const insights: TradingInsight[] = generators
    .map((generate) => generate(rows))
    .filter((insight): insight is CandidateInsight => insight !== null)
    .sort(rank)
    .map(({ magnitude: _magnitude, ...insight }) => insight)
    .map((insight) => ({ ...insight, periodFrom: bounds.from, periodTo: bounds.to }));
  return {
    insights,
    methodology: [
      `Findings need at least ${INSIGHT_MIN_OBSERVATIONS} observations per compared group - smaller samples are suppressed, not reported.`,
      `Reliability labels count observations only: ≥ ${INSIGHT_STRONG_AT} strong evidence, ≥ ${INSIGHT_REPEATED_AT} repeated pattern, otherwise early observation. These are NOT statistical confidence levels.`,
      `Loss streaks: consecutive net-negative trades; breakeven trades neither extend nor break a run. Follow-up windows look at the ${AFTER_STREAK_WINDOW} trades after ≥ ${AFTER_STREAK_MIN}-loss streaks.`,
      `The loss-following rule looks at trades entered within ${LOSS_FOLLOWING_WINDOW_MIN} minutes of a losing trade's exit. Observed sequences are not diagnoses.`,
      "Ranking orders findings by evidence weight, then effect size, then observations. It describes this window only and does not predict future performance.",
      "Money-based findings are computed only for single-currency scopes; R-based, count and rate findings are currency-independent.",
    ],
  };
}
