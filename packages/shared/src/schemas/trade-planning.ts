import { z } from "zod";

import { directionSchema } from "../enums";
import { tradeSizeModeSchema } from "./trade";
import {
  decimalStringSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";

/**
 * Trade Planning contract (Phase 5) - the planned trade, BEFORE execution.
 *
 * Architectural distinctions (Phase 5 mandate §1/§6):
 *
 *   Trade Plan  ≠  Executed Trade
 *
 * A TradePlan is the trader's INTENTION (entry/stop/target/risk/checklist
 * decided before execution). A Trade (Phase 4) is the journalized ACTUAL
 * execution. A plan may be drafted, committed, validated, cancelled,
 * abandoned - or executed differently from what was planned. Cosmoz never
 * assumes a plan becomes a trade, never overwrites the plan with actual
 * execution data, and never places orders (§30 - execution stays external).
 *
 * Boundaries (§65–§69): no post-trade review, no behavioral analytics, no
 * backtesting, no Playbook module, no session-live duplication, no broker
 * execution of any kind.
 *
 * Wire conventions (unchanged): money/prices/quantities travel as
 * decimal-as-string; timestamps are UTC ISO-8601 with Z suffix.
 */

// ── Lifecycle enums ──────────────────────────────────────────────────────────

/**
 * TradePlan lifecycle (§7 - explicit, guarded state machine):
 *
 *   DRAFT → PLANNED → VALIDATED → (future: EXECUTED via a linked Trade)
 *     ↓        ↓             ↓
 *   ABANDONED CANCELLED   CANCELLED
 *
 * EXECUTED is RESERVED vocabulary (mirrors the Phase 4 TradeStatus.PLANNED
 * precedent): no API path produces it in this phase - a plan becomes
 * EXECUTED only when a future phase links a canonical Trade to it.
 * EXPIRED / PARTIALLY_EXECUTED are deferred until the product has a
 * scheduler / execution linkage (§63).
 */
export const tradePlanStatusSchema = z.enum([
  "DRAFT",
  "PLANNED",
  "VALIDATED",
  "CANCELLED",
  "ABANDONED",
  "EXECUTED",
]);
export type TradePlanStatus = z.infer<typeof tradePlanStatusSchema>;

/** Planned entry kind (§10). LIMIT/STOP both mean a pending trigger level. */
export const tradePlanEntryTypeSchema = z.enum(["MARKET", "LIMIT", "STOP"]);
export type TradePlanEntryType = z.infer<typeof tradePlanEntryTypeSchema>;

// ── Pre-trade validation results (§21 - machine-readable, never "invalid") ──

/** Severity of one validation finding. ERROR blocks the VALIDATED transition. */
export const tradePlanValidationSeveritySchema = z.enum(["ERROR", "WARNING"]);
export type TradePlanValidationSeverity = z.infer<typeof tradePlanValidationSeveritySchema>;

/**
 * Stable codes for the pre-trade validation battery. Values surface in the
 * persisted validation snapshot and the validate-endpoint response - never
 * raw exception text, never database internals.
 */
export const TRADE_PLAN_VALIDATION_ISSUE_CODES = {
  /** No stop loss configured - planned risk cannot be computed (§11). */
  STOP_LOSS_MISSING: "STOP_LOSS_MISSING",
  /** Stop is on the wrong side of entry for the direction (§11). */
  STOP_LOSS_INVALID_DIRECTION: "STOP_LOSS_INVALID_DIRECTION",
  /** Target is on the wrong side of entry for the direction (§12). */
  TAKE_PROFIT_INVALID_DIRECTION: "TAKE_PROFIT_INVALID_DIRECTION",
  /** Balance is required (risk-percent mode / % derivation) but unavailable. */
  BALANCE_UNAVAILABLE: "BALANCE_UNAVAILABLE",
  /** No specification row for the symbol - monetary risk unknown (§15). */
  INSTRUMENT_SPECIFICATION_MISSING: "INSTRUMENT_SPECIFICATION_MISSING",
  /** Quote currency ≠ account currency and no FX rate is available (§16). */
  CURRENCY_CONVERSION_UNAVAILABLE: "CURRENCY_CONVERSION_UNAVAILABLE",
  /** Recommended size is below the instrument minimum volume (§17). */
  POSITION_SIZE_BELOW_MINIMUM: "POSITION_SIZE_BELOW_MINIMUM",
  /** Requested/recommended size is above the instrument maximum volume (§17). */
  POSITION_SIZE_ABOVE_MAXIMUM: "POSITION_SIZE_ABOVE_MAXIMUM",
  /** Planned risk exceeds a configured account-level risk limit (§22). */
  RISK_LIMIT_EXCEEDED: "RISK_LIMIT_EXCEEDED",
  /** A required checklist item was not checked at validation time (§23). */
  CHECKLIST_INCOMPLETE: "CHECKLIST_INCOMPLETE",
  /** No take profit - planned R:R cannot be computed (informational). */
  RISK_REWARD_UNAVAILABLE: "RISK_REWARD_UNAVAILABLE",
} as const;
export type TradePlanValidationIssueCode =
  (typeof TRADE_PLAN_VALIDATION_ISSUE_CODES)[keyof typeof TRADE_PLAN_VALIDATION_ISSUE_CODES];

/** One structured validation finding: code + severity + field + message (§21). */
export const tradePlanValidationIssueSchema = z.object({
  code: z.string().min(1),
  severity: tradePlanValidationSeveritySchema,
  /** Plan field the finding refers to (e.g. "stopLoss", "size", "checklist"). */
  field: z.string().min(1).nullable(),
  message: z.string().min(1).max(300),
});
export type TradePlanValidationIssue = z.infer<typeof tradePlanValidationIssueSchema>;

// ── Checklist snapshot (§24/§25 - planning-time state, frozen) ───────────────

/**
 * One checklist item evaluation captured at planning/validation time. The
 * definition vocabulary matches the shared checklist item ({id,label,required});
 * `checked` records the trader's answer. Snapshots are FROZEN: later edits to
 * any checklist template never rewrite what a plan was validated against (§25).
 */
export const tradePlanChecklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  required: z.boolean(),
  checked: z.boolean(),
});
export type TradePlanChecklistItem = z.infer<typeof tradePlanChecklistItemSchema>;

export const tradePlanChecklistSnapshotSchema = z.object({
  /** Origin checklist template when the client references one (may be null). */
  templateId: uuidSchema.nullable(),
  templateName: z.string().min(1).max(120).nullable(),
  items: z.array(tradePlanChecklistItemSchema).min(1).max(24),
});
export type TradePlanChecklistSnapshot = z.infer<typeof tradePlanChecklistSnapshotSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

/**
 * Authoritative planned-risk block (§13). Every value is computed by the
 * backend risk engine at write time - clients may PREVIEW (§57) but the
 * server's numbers win. `null` = not computable from the given inputs
 * (the validation battery explains why via issues).
 */
export const tradePlanRiskViewSchema = z.object({
  /** Account balance the calculation was anchored to (planning-time snapshot). */
  balanceSnapshot: decimalStringSchema.nullable(),
  /** Planned risk as % of balance (derived when the amount mode is used). */
  riskPercent: decimalStringSchema.nullable(),
  /** Planned money risk, account currency (derived when the % mode is used). */
  riskAmount: decimalStringSchema.nullable(),
  /** |entry − stop| in price units. */
  stopDistance: decimalStringSchema.nullable(),
  /** Stop distance in pips (instrument pip size). */
  stopPips: decimalStringSchema.nullable(),
  /** Recommended/validated position size (broker constraints respected, §17). */
  positionSize: decimalStringSchema.nullable(),
  /** Potential profit at target, account currency. */
  potentialProfit: decimalStringSchema.nullable(),
  /** Potential loss = planned money risk, account currency. */
  potentialLoss: decimalStringSchema.nullable(),
  /** Planned reward/risk ratio (reward distance ÷ risk distance, §19/§20). */
  rrRatio: decimalStringSchema.nullable(),
});
export type TradePlanRiskView = z.infer<typeof tradePlanRiskViewSchema>;

/** Sizing input - the shared capture vocabulary (quantity | risk_percent | risk_amount). */
export const tradePlanSizeInputSchema = tradeSizeModeSchema;
export type TradePlanSizeInput = z.infer<typeof tradePlanSizeInputSchema>;

/** List row - identity, configuration and the derived risk block. */
export const tradePlanSummarySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  accountId: uuidSchema,
  status: tradePlanStatusSchema,
  direction: directionSchema,
  entryType: tradePlanEntryTypeSchema,
  /** Instrument symbol EXACTLY as entered (Phase 4 §14 convention). */
  symbol: z.string().min(1).max(50),
  /** Currency of every financial value (account currency at creation). */
  currency: z.string().min(3).max(3),
  /** Planned execution timeframe label, e.g. "M15" (optional, free-form). */
  timeframe: z.string().max(16).nullable(),
  /** Cross-context Playbook strategy REFERENCE - not an owned entity (§26). */
  strategyId: uuidSchema.nullable(),
  entryPrice: decimalStringSchema,
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  /** Sizing INPUT as provided by the trader (distinct from derived risk, §39). */
  size: tradePlanSizeInputSchema,
  /** Authoritative derived risk (§39 - never recomputed by clients). */
  risk: tradePlanRiskViewSchema,
  /** null = no checklist attached; otherwise all-required-checked state. */
  checklistComplete: z.boolean().nullable(),
  /** null = never validated; otherwise the latest battery outcome. */
  validationPassed: z.boolean().nullable(),
  /** When the plan was committed as an intention (null while DRAFT). */
  plannedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TradePlanSummary = z.infer<typeof tradePlanSummarySchema>;

/** Full plan - summary + rationale + frozen checklist + validation snapshot. */
export const tradePlanDetailSchema = tradePlanSummarySchema.extend({
  /** Trader's rationale / thesis captured at planning time. */
  rationale: z.string().max(4000).nullable(),
  checklist: tradePlanChecklistSnapshotSchema.nullable(),
  /** Latest validation battery attempt (kept even when it failed, §21). */
  lastValidation: z
    .object({
      evaluatedAt: isoDateTimeSchema,
      passed: z.boolean(),
      issues: z.array(tradePlanValidationIssueSchema),
    })
    .nullable(),
  validatedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  abandonedAt: isoDateTimeSchema.nullable(),
  /** Echoed idempotency key (§40) - null when the create carried none. */
  clientRequestId: uuidSchema.nullable(),
});
export type TradePlanDetail = z.infer<typeof tradePlanDetailSchema>;

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a Trade Plan. The plan starts as DRAFT (or PLANNED when commitNow)
 * - creation never validates by itself (§37: no automatic validation) and
 * never executes anything (§30). Directional integrity (SL/TP sides) is
 * enforced server-side (§11/§12): meaningless risk configurations are
 * rejected, never stored with silently negative/zero risk.
 *
 * `clientRequestId` (§40): retried creates with the same key per user return
 * the original plan instead of duplicating it.
 */
export const createTradePlanInputSchema = z.object({
  accountId: uuidSchema,
  symbol: z.string().trim().min(1).max(50),
  direction: directionSchema,
  entryType: tradePlanEntryTypeSchema.default("MARKET"),
  entryPrice: positiveDecimalStringSchema,
  stopLoss: positiveDecimalStringSchema.nullable().optional(),
  takeProfit: positiveDecimalStringSchema.nullable().optional(),
  size: tradePlanSizeInputSchema,
  timeframe: z.string().trim().min(1).max(16).optional(),
  strategyId: uuidSchema.optional(),
  rationale: z.string().max(4000).optional(),
  /** Target planning time; stamped at commit when absent. */
  plannedAt: isoDateTimeSchema.optional(),
  /** Planning-time checklist evaluation to freeze with the plan (§24). */
  checklist: tradePlanChecklistSnapshotSchema.optional(),
  clientRequestId: uuidSchema.optional(),
  /** Commit in the same request: DRAFT creation is the default (§7). */
  commitNow: z.boolean().optional(),
});
export type CreateTradePlanInput = z.infer<typeof createTradePlanInputSchema>;

// ── Update (draft/planned only, §38) ─────────────────────────────────────────

/**
 * Patch a plan. Only DRAFT and PLANNED plans are mutable (§38): after the
 * plan is validated (or later executed) the original planning snapshot is
 * preserved - cancel and re-plan instead. Every edit recomputes the derived
 * risk server-side (§39).
 */
export const updateTradePlanInputSchema = z
  .object({
    symbol: z.string().trim().min(1).max(50).optional(),
    direction: directionSchema.optional(),
    entryType: tradePlanEntryTypeSchema.optional(),
    entryPrice: positiveDecimalStringSchema.optional(),
    stopLoss: positiveDecimalStringSchema.nullable().optional(),
    takeProfit: positiveDecimalStringSchema.nullable().optional(),
    size: tradePlanSizeInputSchema.optional(),
    timeframe: z.string().trim().min(1).max(16).nullable().optional(),
    strategyId: uuidSchema.nullable().optional(),
    rationale: z.string().max(4000).nullable().optional(),
    plannedAt: isoDateTimeSchema.nullable().optional(),
    checklist: tradePlanChecklistSnapshotSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateTradePlanInput = z.infer<typeof updateTradePlanInputSchema>;

// ── Commit / list / validate ─────────────────────────────────────────────────

/** Commit a DRAFT plan (DRAFT → PLANNED, §7). */
export const commitTradePlanInputSchema = z.object({
  plannedAt: isoDateTimeSchema.optional(),
});
export type CommitTradePlanInput = z.infer<typeof commitTradePlanInputSchema>;

/**
 * List query - composable filters + the established pagination envelope
 * (§55: one pagination convention, evolved, not duplicated).
 */
export const listTradePlansQuerySchema = z.object({
  status: tradePlanStatusSchema.optional(),
  accountId: uuidSchema.optional(),
  symbol: z.string().trim().min(1).max(50).optional(),
  direction: directionSchema.optional(),
  strategyId: uuidSchema.optional(),
  /** Inclusive UTC lower bound on plannedAt. */
  plannedFrom: isoDateTimeSchema.optional(),
  /** Inclusive UTC upper bound on plannedAt. */
  plannedTo: isoDateTimeSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["createdAt", "plannedAt", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListTradePlansQuery = z.infer<typeof listTradePlansQuerySchema>;

export const tradePlansResponseSchema = z.object({
  tradePlans: z.array(tradePlanSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type TradePlansResponse = z.infer<typeof tradePlansResponseSchema>;

/**
 * Result of the pre-trade validation battery (§21). `passed` (no ERROR
 * findings) is required for the PLANNED → VALIDATED transition; a failing
 * battery keeps the plan PLANNED and persists the findings on it.
 */
export const validateTradePlanResponseSchema = z.object({
  planId: uuidSchema,
  status: tradePlanStatusSchema,
  passed: z.boolean(),
  issues: z.array(tradePlanValidationIssueSchema),
  evaluatedAt: isoDateTimeSchema,
});
export type ValidateTradePlanResponse = z.infer<typeof validateTradePlanResponseSchema>;

// ── Stable error codes (§46) ─────────────────────────────────────────────────

/**
 * Stable machine codes for the Trade Planning domain. Values surface in the
 * error envelope `code` field; database errors never do. Cross-user access is
 * an honest 404 (TRADE_PLAN_NOT_FOUND) per the established IDOR convention -
 * ACCESS_DENIED is never distinguished from NOT_FOUND.
 */
export const TRADE_PLANNING_ERROR_CODES = {
  /** Plan does not exist - or exists but is not yours (IDOR → honest 404). */
  TRADE_PLAN_NOT_FOUND: "TRADE_PLAN_NOT_FOUND",
  /** The operation is invalid for the plan's current lifecycle state (→ 422). */
  TRADE_PLAN_INVALID_STATE: "TRADE_PLAN_INVALID_STATE",
  /** Concurrent state transition raced (stale read → 409, §41). */
  TRADE_PLAN_CONCURRENT_MODIFICATION: "TRADE_PLAN_CONCURRENT_MODIFICATION",
  /** Directionally/structurally impossible configuration (§11/§12 → 422). */
  INVALID_TRADE_PLAN_CONFIGURATION: "INVALID_TRADE_PLAN_CONFIGURATION",
  /** Sizing mode requires instrument specs but none exist (§15 → 422). */
  INSTRUMENT_SPECIFICATION_UNAVAILABLE: "INSTRUMENT_SPECIFICATION_UNAVAILABLE",
  /** Money math needs a cross-currency rate that is not available (§16 → 422). */
  CURRENCY_CONVERSION_UNAVAILABLE: "CURRENCY_CONVERSION_UNAVAILABLE",
  /** Account does not exist - or is not yours (IDOR → honest 404). */
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
} as const;
export type TradePlanningErrorCode =
  (typeof TRADE_PLANNING_ERROR_CODES)[keyof typeof TRADE_PLANNING_ERROR_CODES];
