import { z } from "zod";

/**
 * COSMOZ enums - source of truth: docs/specs/data-model.md §2.
 * One zod enum + one inferred TS type per spec enum.
 * Values are SCREAMING_SNAKE_CASE exactly as stored by the API (Prisma).
 */

// ── App & preferences ────────────────────────────────────────────────────────

export const themeSchema = z.enum(["DARK_BLUE", "DARK", "LIGHT"]);
export type Theme = z.infer<typeof themeSchema>;

export const currencySchema = z.enum([
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
  "NZD",
  "SGD",
]);
export type Currency = z.infer<typeof currencySchema>;

// ── Accounts & markets ───────────────────────────────────────────────────────

export const accountTypeSchema = z.enum(["DEMO", "LIVE", "PROP_FIRM"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const brokerSchema = z.enum([
  "MANUAL",
  "MT4",
  "MT5",
  "DERIV",
  "BINANCE",
  "CTRADER",
  "OANDA",
  "OTHER",
]);
export type Broker = z.infer<typeof brokerSchema>;

export const assetClassSchema = z.enum([
  "FOREX",
  "CRYPTO",
  "SYNTHETIC",
  "INDEX",
  "METAL",
  "ENERGY",
]);
export type AssetClass = z.infer<typeof assetClassSchema>;

export const connectionStatusSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
  "SYNCING",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const importStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);
export type ImportStatus = z.infer<typeof importStatusSchema>;

// ── Trades ───────────────────────────────────────────────────────────────────

export const tradeStatusSchema = z.enum([
  "PLANNED",
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);
export type TradeStatus = z.infer<typeof tradeStatusSchema>;

export const directionSchema = z.enum(["BUY", "SELL"]);
export type Direction = z.infer<typeof directionSchema>;

export const exitReasonSchema = z.enum([
  "TP",
  "SL",
  "MANUAL",
  "TRAILING",
  "PARTIAL",
  "MARGIN",
]);
export type ExitReason = z.infer<typeof exitReasonSchema>;

export const emotionSchema = z.enum([
  "CALM",
  "CONFIDENT",
  "ANXIOUS",
  "FOMO",
  "TIRED",
  "FRUSTRATED",
  "REVENGE",
  "EUPHORIC",
  "RELIEVED",
  "BORED",
]);
export type Emotion = z.infer<typeof emotionSchema>;

export const gradeSchema = z.enum(["A", "B", "C", "D", "F"]);
export type Grade = z.infer<typeof gradeSchema>;

export const tradeEventTypeSchema = z.enum([
  "SL_MODIFIED",
  "TP_MODIFIED",
  "SIZE_MODIFIED",
  "REOPENED",
  "NOTE",
]);
export type TradeEventType = z.infer<typeof tradeEventTypeSchema>;

export const eventSourceSchema = z.enum(["USER", "AUTO", "IMPORT"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const shotKindSchema = z.enum(["BEFORE", "AFTER", "CHART", "OTHER"]);
export type ShotKind = z.infer<typeof shotKindSchema>;

// ── Playbook, tags & mistakes ────────────────────────────────────────────────

export const strategyGradeSchema = z.enum(["A_PLUS", "A", "B", "C"]);
export type StrategyGrade = z.infer<typeof strategyGradeSchema>;

export const strategyStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "RETIRED",
]);
export type StrategyStatus = z.infer<typeof strategyStatusSchema>;

/** How the strategy is executed (Playbook market profile §7). */
export const tradingStyleSchema = z.enum(["SCALPING", "INTRADAY", "SWING", "POSITION"]);
export type TradingStyle = z.infer<typeof tradingStyleSchema>;

export const tagCategorySchema = z.enum([
  "SETUP",
  "CONTEXT",
  "MISTAKE",
  "EMOTION",
  "CUSTOM",
]);
export type TagCategory = z.infer<typeof tagCategorySchema>;

export const mistakeCategorySchema = z.enum([
  "ENTRY",
  "EXIT",
  "MANAGEMENT",
  "BEHAVIOR",
]);
export type MistakeCategory = z.infer<typeof mistakeCategorySchema>;

export const detectorSchema = z.enum(["AUTO", "MANUAL"]);
export type Detector = z.infer<typeof detectorSchema>;

// ── Ghost trades ─────────────────────────────────────────────────────────────

export const skipReasonSchema = z.enum([
  "DISCIPLINE",
  "FEAR",
  "OUT_OF_PLAYBOOK",
  "NO_SETUP",
  "MISSED_EXECUTION",
]);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const outcomeSchema = z.enum([
  "WOULD_HAVE_WON",
  "WOULD_HAVE_LOST",
  "UNKNOWN",
]);
export type Outcome = z.infer<typeof outcomeSchema>;

// ── Discipline engine ────────────────────────────────────────────────────────

export const ruleTypeSchema = z.enum([
  "MAX_TRADES_PER_DAY",
  "MAX_LOSSES_PER_DAY",
  "MAX_RISK_PCT_PER_TRADE",
  "MAX_DAILY_LOSS_PCT",
  "MAX_DAILY_RISK_R",
  "MIN_RR",
  "COOLDOWN_AFTER_LOSSES",
  "TRADING_WINDOW",
  "MAX_OPEN_POSITIONS",
  "NO_NEWS_WINDOW",
]);
export type RuleType = z.infer<typeof ruleTypeSchema>;

export const severitySchema = z.enum(["NOTIFY", "WARN", "ALERT", "LOCK"]);
export type Severity = z.infer<typeof severitySchema>;

export const alertTypeSchema = z.enum([
  "RULE_VIOLATION",
  "TILT_WARNING",
  "RISK_BUDGET",
  "STRATEGY_DECAY",
  "STREAK",
  "DISCIPLINE_WIN",
  "GOAL_STATUS",
  "METRIC_THRESHOLD",
  "SYSTEM",
]);
export type AlertType = z.infer<typeof alertTypeSchema>;

// ── Goals, stats & AI insights ───────────────────────────────────────────────

export const periodSchema = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);
export type Period = z.infer<typeof periodSchema>;

// NOTE: the Goal enums live in schemas/tradeReview.ts (computed progress,
// server-derived direction/unit) - the placeholder versions that used to sit
// here were dead code and are superseded by that contract.

export const insightKindSchema = z.enum([
  "WEEKLY_SUMMARY",
  "PRE_MORTEM",
  "ERROR_ANALYSIS",
  "SUGGESTION",
]);
export type InsightKind = z.infer<typeof insightKindSchema>;

export const feedbackSchema = z.enum(["HELPFUL", "NOT_HELPFUL"]);
export type Feedback = z.infer<typeof feedbackSchema>;

// ── Economic calendar ────────────────────────────────────────────────────────

/** Market-moving impact tiers (ForexFactory-style 3-bar scale). */
export const impactSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type Impact = z.infer<typeof impactSchema>;
