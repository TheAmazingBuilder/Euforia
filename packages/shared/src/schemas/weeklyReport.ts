import { z } from "zod";
import { currencySchema } from "../enums";
import { dateKeySchema, decimalStringSchema, isoDateTimeSchema } from "./primitives";

/**
 * WeeklyReport — the auto-generated weekly rollup (GET /stats/weekly).
 * Entirely SERVER-CALCULATED from closed trades over a Monday→Sunday window:
 * the client only picks the week, never derives aggregates.
 */

/** One trading day of the week, zero-filled — fuels the daily P&L bars. */
export const weekDayPointSchema = z.object({
  date: dateKeySchema,
  /** Short weekday label ("Mon"…"Sun"), pre-rendered server-side. */
  label: z.string().min(1),
  pnlNet: decimalStringSchema,
  tradesCount: z.number().int().min(0),
});

export type WeekDayPoint = z.infer<typeof weekDayPointSchema>;

/** Best/worst trade of the week (null on an empty week). */
export const weekTradeSpotSchema = z.object({
  tradeId: z.string(),
  symbol: z.string(),
  pnlNet: decimalStringSchema,
  rMultiple: decimalStringSchema.nullable(),
  date: dateKeySchema,
});

export type WeekTradeSpot = z.infer<typeof weekTradeSpotSchema>;

/** Per-instrument rollup for the week table. */
export const weekInstrumentRowSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  tradesCount: z.number().int().min(0),
  netPnl: decimalStringSchema,
  /** Ratio 0–1 (render via formatPercent), null when no trades. */
  winRate: decimalStringSchema.nullable(),
});

export type WeekInstrumentRow = z.infer<typeof weekInstrumentRowSchema>;

/** Auto-insight line ≤4 — tone drives the dot color, text stays honest. */
export const weekInsightSchema = z.object({
  tone: z.enum(["positive", "negative", "neutral"]),
  text: z.string().min(1),
});

export type WeekInsight = z.infer<typeof weekInsightSchema>;

export const weeklyReportSchema = z.object({
  currency: currencySchema,
  /** Monday of the selected week (trading-date key, user timezone). */
  weekStart: dateKeySchema,
  /** Sunday of the selected week. */
  weekEnd: dateKeySchema,
  /** True when the window contains today's trading date (next nav disabled). */
  isCurrent: z.boolean(),
  days: z.array(weekDayPointSchema).length(7),
  totals: z.object({
    netPnl: decimalStringSchema,
    tradesCount: z.number().int().min(0),
    /** Ratio 0–1. */
    winRate: decimalStringSchema,
    /** Σ R over closed trades of the week. */
    rEarned: decimalStringSchema,
    /** Average Cosmoz Index over the week's scored days (null when none). */
    disciplineAvg: decimalStringSchema.nullable(),
  }),
  best: weekTradeSpotSchema.nullable(),
  worst: weekTradeSpotSchema.nullable(),
  byInstrument: z.array(weekInstrumentRowSchema),
  insights: z.array(weekInsightSchema).max(4),
  generatedAt: isoDateTimeSchema,
});

export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
export type WeeklyReportResponse = WeeklyReport;
