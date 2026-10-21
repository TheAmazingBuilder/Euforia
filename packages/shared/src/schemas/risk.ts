import { z } from "zod";

import { currencySchema, severitySchema } from "../enums";
import { dateKeySchema, decimalStringSchema } from "./primitives";

/**
 * Risk Command Center (GET /risk/overview) — the four guardrails (daily loss,
 * per-trade risk, losses/day, drawdown) in one server-computed posture.
 * Money and percentages travel as decimal strings; counters stay numbers.
 * Events reuse the violation id so the client can acknowledge inline.
 */

export const riskLevelSchema = z.enum(["SAFE", "CAUTION", "WARNING", "BREACH"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

/** One rung of the drawdown ladder (3 thresholds). */
export const riskDrawdownThresholdSchema = z.object({
  key: z.enum(["caution", "warning", "critical"]),
  ddPct: decimalStringSchema,
  triggered: z.boolean(),
});
export type RiskDrawdownThreshold = z.infer<typeof riskDrawdownThresholdSchema>;

export const riskOverviewResponseSchema = z.object({
  currency: currencySchema,
  balance: decimalStringSchema,
  posture: riskLevelSchema,
  /** 0..1+ spend ratio driving the posture ring. */
  postureRatio: decimalStringSchema,

  daily: z.object({
    limitPct: decimalStringSchema.nullable(),
    spentPct: decimalStringSchema,
    spentAmount: decimalStringSchema,
  }),
  perTrade: z.object({
    limitPct: decimalStringSchema.nullable(),
    worstRiskPct: decimalStringSchema,
    avgRiskPct: decimalStringSchema,
    breachesToday: z.number().int().min(0),
  }),
  losses: z.object({
    maxLossesPerDay: z.number().int().min(1).nullable(),
    lossesToday: z.number().int().min(0),
    maxTradesPerDay: z.number().int().min(1).nullable(),
    tradesToday: z.number().int().min(0),
    lossStreakCurrent: z.number().int().min(0),
    lossStreakWorst: z.number().int().min(0),
  }),
  drawdown: z.object({
    limitPct: decimalStringSchema.nullable(),
    currentPct: decimalStringSchema,
    currentAmount: decimalStringSchema,
    peakEquity: decimalStringSchema,
    maxRecordedPct: decimalStringSchema,
    thresholds: z.array(riskDrawdownThresholdSchema),
  }),

  /** Equity context for the underwater chart. */
  equityCurve: z.array(
    z.object({
      date: dateKeySchema,
      equity: decimalStringSchema,
      drawdownPct: decimalStringSchema,
    }),
  ),
  /** Daily risk committed, last 21 trading days. */
  dailyRisk: z.array(
    z.object({
      date: dateKeySchema,
      riskPct: decimalStringSchema,
      lossPct: decimalStringSchema,
      trades: z.number().int().min(0),
    }),
  ),

  /** Violations (acknowledgeable) + drawdown/risk alerts, newest first. */
  events: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["VIOLATION", "ALERT"]),
      severity: severitySchema,
      title: z.string().min(1),
      message: z.string().min(1),
      createdAt: z.string(),
      acknowledgedAt: z.string().nullable(),
    }),
  ),
});
export type RiskOverviewResponse = z.infer<typeof riskOverviewResponseSchema>;
