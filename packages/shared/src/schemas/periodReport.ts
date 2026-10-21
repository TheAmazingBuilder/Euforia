import { z } from "zod";

import { currencySchema } from "../enums";
import { dateKeySchema, decimalStringSchema, isoDateTimeSchema } from "./primitives";
import {
  weekInsightSchema,
  weekInstrumentRowSchema,
  weekTradeSpotSchema,
} from "./weeklyReport";

/**
 * PeriodReport — the premium multi-period report (GET /stats/report).
 * Entirely SERVER-CALCULATED from closed trades over a week / month /
 * quarter window: the client only picks the granularity and an anchor
 * date, never derives aggregates. Reuses the weekly-report row shapes
 * so the reports page renders both eras through one contract.
 */

export const reportGranularitySchema = z.enum(["week", "month", "quarter"]);
export type ReportGranularity = z.infer<typeof reportGranularitySchema>;

/**
 * One slice of the period: a trading day (week / month) or a week bucket
 * (quarter). `equity` is the cumulative net P&L INSIDE the period — the
 * fuel for the equity curve, not the account balance.
 */
export const reportPointSchema = z.object({
  date: dateKeySchema,
  label: z.string().min(1),
  pnlNet: decimalStringSchema,
  equity: decimalStringSchema,
  tradesCount: z.number().int().min(0),
});
export type ReportPoint = z.infer<typeof reportPointSchema>;

/** Same-granularity previous period — the honest comparison base. */
export const reportComparisonSchema = z.object({
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  netPnl: decimalStringSchema,
  tradesCount: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  rEarned: decimalStringSchema,
});
export type ReportComparison = z.infer<typeof reportComparisonSchema>;

/**
 * Pro metrics — the numbers professionals ask for first. Profit factor is
 * null when the period holds no losing trade (undefined math, displayed
 * honestly as "∞" by the UI); expectancy is per-trade R.
 */
export const reportProMetricsSchema = z.object({
  profitFactor: decimalStringSchema.nullable(),
  expectancyR: decimalStringSchema.nullable(),
  avgWin: decimalStringSchema.nullable(),
  avgLoss: decimalStringSchema.nullable(),
  /** Peak-to-trough on the period equity curve (positive decimal). */
  maxDrawdown: decimalStringSchema,
  longestWinStreak: z.number().int().min(0),
  longestLossStreak: z.number().int().min(0),
  biggestWin: decimalStringSchema.nullable(),
  biggestLoss: decimalStringSchema.nullable(),
});
export type ReportProMetrics = z.infer<typeof reportProMetricsSchema>;

/** R-multiple distribution histogram bucket. */
export const reportRBucketSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().min(0),
  /** Buckets on the loss side — drives the bar ink client-side. */
  negative: z.boolean(),
});
export type ReportRBucket = z.infer<typeof reportRBucketSchema>;

/** Per-strategy rollup (null strategyId = "Out of playbook"). */
export const reportStrategyRowSchema = z.object({
  strategyId: z.string().nullable(),
  name: z.string().min(1),
  tradesCount: z.number().int().min(0),
  netPnl: decimalStringSchema,
  winRate: decimalStringSchema.nullable(),
  rEarned: decimalStringSchema,
});
export type ReportStrategyRow = z.infer<typeof reportStrategyRowSchema>;

/** Long / short split row. */
export const reportSideRowSchema = z.object({
  tradesCount: z.number().int().min(0),
  netPnl: decimalStringSchema,
  winRate: decimalStringSchema.nullable(),
  rEarned: decimalStringSchema,
});
export type ReportSideRow = z.infer<typeof reportSideRowSchema>;

export const periodReportSchema = z.object({
  currency: currencySchema,
  granularity: reportGranularitySchema,
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  /** True when the window contains today's trading date (next nav disabled). */
  isCurrent: z.boolean(),
  /** Week → 7 days · month → days · quarter → week buckets. */
  points: z.array(reportPointSchema),
  totals: z.object({
    netPnl: decimalStringSchema,
    tradesCount: z.number().int().min(0),
    winRate: decimalStringSchema,
    rEarned: decimalStringSchema,
    disciplineAvg: decimalStringSchema.nullable(),
  }),
  comparison: reportComparisonSchema,
  proMetrics: reportProMetricsSchema,
  rBuckets: z.array(reportRBucketSchema),
  byInstrument: z.array(weekInstrumentRowSchema),
  byStrategy: z.array(reportStrategyRowSchema),
  long: reportSideRowSchema,
  short: reportSideRowSchema,
  best: weekTradeSpotSchema.nullable(),
  worst: weekTradeSpotSchema.nullable(),
  insights: z.array(weekInsightSchema).max(5),
  generatedAt: isoDateTimeSchema,
});

export type PeriodReport = z.infer<typeof periodReportSchema>;
export type PeriodReportResponse = PeriodReport;
