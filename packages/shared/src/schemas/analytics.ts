import { z } from "zod";

import { currencySchema, directionSchema, gradeSchema, tradeStatusSchema } from "../enums";
import { dateKeySchema, decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Dashboard band payloads (Phase 11) — the server-computed aggregates behind
 * the account band, the monthly goal strip, the month highlights card and
 * the product band. Every money/R/ratio field travels as a decimal string;
 * counts stay numbers. Honest at zero: nulls render as "—", never as fake
 * confidence.
 */

// ── Week-over-week metric (performance strip deltas) ─────────────────────────

/** One KPI's change vs the previous comparable week + its 8-week trail. */
export const weekOverWeekMetricSchema = z.object({
  /** Signed % change vs the previous week, decimal string. */
  changePct: decimalStringSchema,
  direction: z.enum(["UP", "DOWN", "FLAT"]),
  /** 8 rolling weeks, oldest first; null = week without data. */
  sparkline: z.array(decimalStringSchema.nullable()),
});
export type WeekOverWeekMetric = z.infer<typeof weekOverWeekMetricSchema>;

// ── Monthly goal strip ───────────────────────────────────────────────────────

export const monthlyGoalSchema = z.object({
  /** Stable key ("profit", "winRate", "avgR", "greenDays", "discipline"…). */
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.enum(["CURRENCY", "PERCENT", "R", "COUNT"]),
  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]),
  target: decimalStringSchema,
  current: decimalStringSchema,
  /** Ratio 0–1 (may exceed 1 when a target is overshot). */
  progress: decimalStringSchema,
  note: z.string(),
});
export type MonthlyGoal = z.infer<typeof monthlyGoalSchema>;

/** GET /stats/monthly-goals — the goal strip for the current month. */
export const monthlyGoalsResponseSchema = z.object({
  monthLabel: z.string().min(1),
  currency: currencySchema,
  goals: z.array(monthlyGoalSchema),
});
export type MonthlyGoalsResponse = z.infer<typeof monthlyGoalsResponseSchema>;

// ── Account band (GET /stats/account-band) ───────────────────────────────────

export const accountBandEquityPointSchema = z.object({
  date: dateKeySchema,
  equity: decimalStringSchema,
  /** Peak-to-trough decline at that date (≤ 0). */
  drawdownPct: decimalStringSchema,
});
export type AccountBandEquityPoint = z.infer<typeof accountBandEquityPointSchema>;

export const accountBandRecentTradeSchema = z.object({
  id: uuidSchema,
  symbol: z.string().min(1),
  direction: directionSchema,
  tradingDate: dateKeySchema,
  status: tradeStatusSchema,
  pnlNet: decimalStringSchema.nullable(),
  rMultiple: decimalStringSchema.nullable(),
});
export type AccountBandRecentTrade = z.infer<typeof accountBandRecentTradeSchema>;

export const accountBandResponseSchema = z.object({
  currency: currencySchema,
  startingBalance: decimalStringSchema,
  balance: decimalStringSchema,
  grossProfit: decimalStringSchema,
  grossLoss: decimalStringSchema,
  /** Average money won per winning trade; null when no winners. */
  avgWin: decimalStringSchema.nullable(),
  /** Average money lost per losing trade; null when no losers. */
  avgLoss: decimalStringSchema.nullable(),
  totalTrades: z.number().int().min(0),
  openTrades: z.number().int().min(0),
  closedTrades: z.number().int().min(0),
  /** Last 8 ISO weeks of trade counts (oldest first) — sparkline. */
  weeklyTradeCounts: z.array(z.number().int().min(0)),
  /** Last 8 ISO weeks of days with at least one trade. */
  weeklyActiveDays: z.array(z.number().int().min(0)),
  usageDays: z.number().int().min(0),
  activeDays: z.number().int().min(0),
  firstTradeDate: dateKeySchema.nullable(),
  /** Average of the daily win rates, 0–1 ratio. */
  avgDailyWinRate: decimalStringSchema,
  avgDailyWinRateDays: z.number().int().min(0),
  /** Average planned R on graded trades; null when none graded yet. */
  avgPlannedRR: decimalStringSchema.nullable(),
  avgPlannedRRCount: z.number().int().min(0),
  equityCurve: z.array(accountBandEquityPointSchema),
  /** Worst peak-to-trough decline in % (≤ 0). */
  maxDrawdownPct: decimalStringSchema,
  goals: z.array(monthlyGoalSchema),
  recentTrades: z.array(accountBandRecentTradeSchema),
  monthTrades: z.number().int().min(0),
  lastMonthTrades: z.number().int().min(0),
});
export type AccountBandResponse = z.infer<typeof accountBandResponseSchema>;

// ── Month highlights (GET /stats/highlights) ─────────────────────────────────

export const monthHighlightSchema = z.object({
  tradeId: uuidSchema,
  symbol: z.string().min(1),
  direction: directionSchema,
  pnlNet: decimalStringSchema,
  rMultiple: decimalStringSchema.nullable(),
  /** null = trade executed outside the playbook. */
  strategyName: z.string().nullable(),
  strategyColor: z.string().nullable(),
  durationMinutes: z.number().int().min(0),
  tradingDate: dateKeySchema,
  entryAt: isoDateTimeSchema,
  exitAt: isoDateTimeSchema,
});
export type MonthHighlight = z.infer<typeof monthHighlightSchema>;

export const monthHighlightsResponseSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/),
  best: monthHighlightSchema.nullable(),
  worst: monthHighlightSchema.nullable(),
  currency: currencySchema,
});
export type MonthHighlightsResponse = z.infer<typeof monthHighlightsResponseSchema>;

// ── Product band (GET /stats/product) ────────────────────────────────────────

export const productMetricsResponseSchema = z.object({
  activeUsers: z.number().int().min(0),
  totalTradesLogged: z.number().int().min(0),
  tradesThisMonth: z.number().int().min(0),
  /** 30-day retention, 0–1 ratio (render via formatPercent). */
  retentionPct: decimalStringSchema,
  activeDays30d: z.number().int().min(0),
});
export type ProductMetricsResponse = z.infer<typeof productMetricsResponseSchema>;

// ── Coach weekly report (GET /coach/weekly-report) ───────────────────────────

export const coachDecisionSchema = z.object({
  tradeId: uuidSchema,
  symbol: z.string().min(1),
  date: dateKeySchema,
  r: decimalStringSchema,
  grade: gradeSchema.nullable(),
  reason: z.string().min(1),
});
export type CoachDecision = z.infer<typeof coachDecisionSchema>;

/** One all-time process streak tracked by the coach (4 known keys). */
export const disciplineStreakSchema = z.object({
  key: z.enum(["clean_days", "journaling", "grading", "checklist"]),
  label: z.string().min(1),
  current: z.number().int().min(0),
  best: z.number().int().min(0),
  /** Sample size: traded days considered. */
  n: z.number().int().min(0),
});
export type DisciplineStreak = z.infer<typeof disciplineStreakSchema>;

/**
 * The coach's Friday debrief: best/worst decisions, discipline trend, THE
 * one focus for the coming week and the all-time process streaks.
 */
export const coachWeeklyReportResponseSchema = z.object({
  weekStart: dateKeySchema,
  weekEnd: dateKeySchema,
  closedCount: z.number().int().min(0),
  netR: decimalStringSchema,
  netPnl: decimalStringSchema,
  currency: currencySchema,
  bestDecisions: z.array(coachDecisionSchema),
  worstDecisions: z.array(coachDecisionSchema),
  disciplineScore: decimalStringSchema.nullable(),
  disciplinePrevScore: decimalStringSchema.nullable(),
  /** Percent units 0–100 (rendered raw with a % suffix). */
  adherencePct: decimalStringSchema.nullable(),
  journalDays: z.number().int().min(0),
  violationsCount: z.number().int().min(0),
  focus: z.object({
    title: z.string().min(1),
    message: z.string().min(1),
    metricLabel: z.string().nullable(),
    metricValue: z.string().nullable(),
  }),
  streaks: z.array(disciplineStreakSchema),
});
export type CoachWeeklyReportResponse = z.infer<typeof coachWeeklyReportResponseSchema>;

// ── Process streaks (analytics streak band) ──────────────────────────────────

/** Aggregate grading/clean-day streaks for the analytics streak band. */
export const disciplineStreaksSchema = z.object({
  gradedCurrent: z.number().int().min(0),
  gradedLongest: z.number().int().min(0),
  cleanDaysCurrent: z.number().int().min(0),
  cleanDaysLongest: z.number().int().min(0),
  tradingDays: z.number().int().min(0),
});
export type DisciplineStreaks = z.infer<typeof disciplineStreaksSchema>;
