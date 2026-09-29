import { z } from "zod";
import { assetClassSchema, tradingStyleSchema } from "../enums";
import { decimalStringSchema } from "./primitives";

/**
 * Playbook building blocks — enums + structured condition/risk blocks shared
 * by the Strategy entity (schemas/strategy.ts) and the Playbook entities
 * (schemas/playbook.ts). Kept in a LEAF module so strategy.ts can import
 * them without an import cycle.
 *
 * Conventions:
 * - money/amounts are decimal STRINGS (decimalStringSchema), never numbers;
 * - sub-blocks (conditions, rules, checklist items) carry client-generated
 *   string ids and are replaced wholesale on update.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** Where the strategy is meant to operate (§7). */
export const marketConditionSchema = z.enum([
  "TRENDING",
  "RANGING",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "EXPANSION",
  "COMPRESSION",
  "BULLISH_STRUCTURE",
  "BEARISH_STRUCTURE",
  "NEUTRAL_STRUCTURE",
]);
export type MarketCondition = z.infer<typeof marketConditionSchema>;

/** Structured entry-condition families (§10). All conditions are ANDed; the
 *  optional `group` id prepares (A AND B) OR C for later without a builder. */
export const entryConditionCategorySchema = z.enum([
  "MARKET_STRUCTURE",
  "PRICE_ACTION",
  "INDICATOR",
  "SESSION",
  "VOLATILITY",
  "ECONOMIC_EVENT",
  "TIME",
  "CUSTOM",
]);
export type EntryConditionCategory = z.infer<typeof entryConditionCategorySchema>;

/** Explicit confirmation requirements (§11). */
export const confirmationTypeSchema = z.enum([
  "CANDLE_CLOSE",
  "BREAK_OF_STRUCTURE",
  "RETEST",
  "VOLUME_CONFIRMATION",
  "MOMENTUM_CONFIRMATION",
  "INDICATOR_CONFIRMATION",
  "MULTI_TIMEFRAME_CONFIRMATION",
]);
export type ConfirmationType = z.infer<typeof confirmationTypeSchema>;

/** Structured exit plans — separate from entry rules (§15). */
export const exitTypeSchema = z.enum([
  "TAKE_PROFIT",
  "STOP_LOSS",
  "PARTIAL_EXIT",
  "TIME_EXIT",
  "STRUCTURE_EXIT",
  "INDICATOR_EXIT",
  "MANUAL_EXIT",
  "INVALIDATED_SETUP",
]);
export type ExitType = z.infer<typeof exitTypeSchema>;

/** Operating-rule categories (§24) — Rules Engine can evaluate some. */
export const playbookRuleCategorySchema = z.enum([
  "RISK",
  "SESSION",
  "NEWS",
  "BEHAVIOR",
  "EXECUTION",
  "CUSTOM",
]);
export type PlaybookRuleCategory = z.infer<typeof playbookRuleCategorySchema>;

/** Trading-day tags for the market profile (§7). */
export const tradingDaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export type TradingDay = z.infer<typeof tradingDaySchema>;

export const playbookSessionSchema = z.enum(["ASIA", "LONDON", "NEW_YORK", "OVERLAP_LN_NY", "OTHER"]);
export type PlaybookSession = z.infer<typeof playbookSessionSchema>;

// ── Structured blocks on a strategy ─────────────────────────────────────────

/** Market profile (§7) — never assume a strategy works everywhere. */
export const marketProfileSchema = z.object({
  assetClass: assetClassSchema.nullable(),
  symbols: z.array(z.string().max(24)),
  market: z.string().max(80).nullable(),
  accountLabel: z.string().max(80).nullable(),
  timeframe: z.string().max(16).nullable(),
  tradingStyle: tradingStyleSchema.nullable(),
  sessions: z.array(playbookSessionSchema),
  tradingDays: z.array(tradingDaySchema),
});
export type MarketProfile = z.infer<typeof marketProfileSchema>;

export const entryConditionSchema = z.object({
  id: z.string().min(1),
  category: entryConditionCategorySchema,
  text: z.string().min(1).max(400),
  /** Prepares (A AND B) OR C — all items sharing a group are ORed together. */
  group: z.string().max(40).nullable(),
});
export type EntryCondition = z.infer<typeof entryConditionSchema>;

export const confirmationSchema = z.object({
  id: z.string().min(1),
  type: confirmationTypeSchema,
  note: z.string().max(400).nullable(),
});
export type Confirmation = z.infer<typeof confirmationSchema>;

/** Trade management rule: Trigger → Action → Condition (§14). */
export const managementRuleSchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1).max(200),
  action: z.string().min(1).max(200),
  condition: z.string().max(200).nullable(),
});
export type ManagementRule = z.infer<typeof managementRuleSchema>;

export const exitRuleSchema = z.object({
  id: z.string().min(1),
  type: exitTypeSchema,
  rule: z.string().min(1).max(400),
});
export type ExitRule = z.infer<typeof exitRuleSchema>;

/** Per-strategy risk frame (§13) — percentages are plain numbers (config,
 *  not ledger money); fixed amount is a decimal string like every amount. */
export const strategyRiskSchema = z.object({
  defaultRiskPct: z.number().min(0).max(100).nullable(),
  maxRiskPct: z.number().min(0).max(100).nullable(),
  fixedRiskAmount: decimalStringSchema.nullable(),
  stopMethodology: z.string().max(400).nullable(),
  targetMethodology: z.string().max(400).nullable(),
  minRR: z.number().min(0).max(100).nullable(),
  maxConcurrentTrades: z.number().int().min(1).max(99).nullable(),
  maxCorrelatedExposure: z.number().min(0).max(100).nullable(),
  dailyRiskRestriction: z.string().max(400).nullable(),
  newsRestriction: z.string().max(400).nullable(),
});
export type StrategyRisk = z.infer<typeof strategyRiskSchema>;

