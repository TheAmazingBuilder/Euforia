import { z } from "zod";
import {
  alertTypeSchema,
  directionSchema,
  detectorSchema,
  emotionSchema,
  eventSourceSchema,
  exitReasonSchema,
  gradeSchema,
  mistakeCategorySchema,
  severitySchema,
  shotKindSchema,
  tradeEventTypeSchema,
  tradeStatusSchema,
} from "../enums";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  jsonValueSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";

// ── Related entities ─────────────────────────────────────────────────────────

/** TradeExit — partial exit row. A simple trade uses Trade.exitPrice directly. */
export const tradeExitSchema = z.object({
  id: uuidSchema,
  tradeId: uuidSchema,
  price: decimalStringSchema,
  quantity: decimalStringSchema,
  exitedAt: isoDateTimeSchema,
  reason: exitReasonSchema,
  note: z.string().nullable(),
});

export type TradeExit = z.infer<typeof tradeExitSchema>;

/**
 * TradeEvent — lightweight event sourcing. The ONLY way to detect
 * "stop widened" (final state doesn't tell the story).
 * payload example: { "from": "1.0850", "to": "1.0800" }
 */
export const tradeEventSchema = z.object({
  id: uuidSchema,
  tradeId: uuidSchema,
  type: tradeEventTypeSchema,
  payload: jsonValueSchema,
  source: eventSourceSchema,
  createdAt: isoDateTimeSchema,
});

export type TradeEvent = z.infer<typeof tradeEventSchema>;

/** TradeScreenshot — chart evidence stored in object storage. */
export const tradeScreenshotSchema = z.object({
  id: uuidSchema,
  tradeId: uuidSchema,
  kind: shotKindSchema,
  storageKey: z.string().min(1),
  caption: z.string().nullable(),
  /** User-drawn arrows/zones. */
  annotations: jsonValueSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type TradeScreenshot = z.infer<typeof tradeScreenshotSchema>;

// ── Trade entity (data-model.md "Domaine 3") ─────────────────────────────────

/**
 * Phase 4 (Trading Core §8/§30/§58): explicit provenance. MANUAL = user
 * capture; IMPORT = file/CSV batch; EXTERNAL_SYNC = reconstructed from
 * synchronized provider activity (broker-derived fields are authoritative
 * for those — journal metadata stays editable).
 */
export const tradeSourceSchema = z.enum(["MANUAL", "IMPORT", "EXTERNAL_SYNC"]);
export type TradeSource = z.infer<typeof tradeSourceSchema>;

/**
 * Stable trade error-code registry (Phase 4 §64). Values ride the existing
 * AppError envelope (`{ error, code, message, issues?, requestId? }`) — the
 * HTTP category comes from the thrown error class, the code from this
 * registry. Ownership access is reported as TRADE_NOT_FOUND (404) per the
 * repository-wide "foreign = not found" IDOR convention.
 */
export const TRADE_ERROR_CODES = {
  TRADE_NOT_FOUND: "TRADE_NOT_FOUND",
  UNAUTHORIZED_TRADE_ACCESS: "UNAUTHORIZED_TRADE_ACCESS",
  INVALID_TRADE_STATE: "INVALID_TRADE_STATE",
  INVALID_EXECUTION: "INVALID_EXECUTION",
  DUPLICATE_EXTERNAL_TRADE: "DUPLICATE_EXTERNAL_TRADE",
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  ACCOUNT_ACCESS_DENIED: "ACCOUNT_ACCESS_DENIED",
  INVALID_TRADE_DATA: "INVALID_TRADE_DATA",
  UNKNOWN_INSTRUMENT: "UNKNOWN_INSTRUMENT",
  UNKNOWN_STRATEGY: "UNKNOWN_STRATEGY",
  DECISION_ALREADY_SUBMITTED: "DECISION_ALREADY_SUBMITTED",
  SAVING_VIEW_CONFLICT: "SAVING_VIEW_CONFLICT",
  INVALID_SCREENSHOT: "INVALID_SCREENSHOT",
} as const;

export type TradeErrorCode = (typeof TRADE_ERROR_CODES)[keyof typeof TRADE_ERROR_CODES];

/**
 * Trade — the heart of the model. The PLAN (decided before) is kept separate
 * from REALITY (what happened) and RESULTS (computed server-side at close,
 * never trusted from the client — data-model.md §15).
 */
export const tradeSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  accountId: uuidSchema,
  instrumentId: uuidSchema,
  /** null = trade outside the playbook (valuable to track!). */
  strategyId: uuidSchema.nullable(),
  /** Optional setup refinement within the strategy (Playbook §9/§21). */
  setupId: uuidSchema.nullable().optional(),
  /** Strategy definition version frozen at entry (Playbook §17/§21). */
  strategyVersion: z.number().int().min(1).nullable().optional(),

  status: tradeStatusSchema,
  direction: directionSchema,
  /**
   * Provenance (Phase 4 §8) — optional for backward compatibility with the
   * pre-Phase-4 wire consumers; the backend always stores it (default MANUAL
   * for user captures, IMPORT for batches, EXTERNAL_SYNC for reconstructions).
   */
  source: tradeSourceSchema.optional(),

  // ── THE PLAN (decided BEFORE) ──
  entryPrice: decimalStringSchema,
  entryAt: isoDateTimeSchema,
  quantity: decimalStringSchema,
  initialStop: decimalStringSchema.nullable(),
  initialTP: decimalStringSchema.nullable(),
  plannedRR: decimalStringSchema.nullable(),
  /** Money risked at entry, in account currency. */
  riskAmount: decimalStringSchema.nullable(),

  // ── REALITY (what happened) ──
  /** Stop at exit time; ≠ initialStop → stop was moved. */
  finalStop: decimalStringSchema.nullable(),
  exitPrice: decimalStringSchema.nullable(),
  exitAt: isoDateTimeSchema.nullable(),
  exitReason: exitReasonSchema.nullable(),
  fees: decimalStringSchema,
  swap: decimalStringSchema,

  // ── RESULTS (computed server-side at close) ──
  pnlGross: decimalStringSchema.nullable(),
  pnlNet: decimalStringSchema.nullable(),
  /** THE trader metric. */
  rMultiple: decimalStringSchema.nullable(),
  mfePrice: decimalStringSchema.nullable(),
  maePrice: decimalStringSchema.nullable(),
  mfeR: decimalStringSchema.nullable(),
  maeR: decimalStringSchema.nullable(),

  // ── PSYCHOLOGY (friction minimal: 1 tap) ──
  emotionBefore: emotionSchema.nullable(),
  emotionAfter: emotionSchema.nullable(),
  /** 1–5. */
  confidence: z.number().int().min(1).max(5).nullable(),

  // ── TIER 1: DECISION SCORE ──
  /** Submitted BEFORE seeing the result (API-enforced). */
  decisionGrade: gradeSchema.nullable(),

  // ── DISCIPLINE ──
  /** Self-report (the feeling). */
  followedPlan: z.boolean().nullable(),
  /** Checklist answers frozen at trade time (template changes never rewrite history). */
  checklistSnap: jsonValueSchema.nullable(),

  // ── CONTEXT ──
  notes: z.string().nullable(),
  lessons: z.string().nullable(),
  /** User's local trading day (computed via user timezone API-side). */
  tradingDate: dateKeySchema,
  /** Broker-side trade id → CSV/API import idempotence. */
  externalRef: z.string().nullable(),

  importBatchId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Soft delete (undo possible). */
  deletedAt: isoDateTimeSchema.nullable(),
});

export type Trade = z.infer<typeof tradeSchema>;

// ── CreateTradeInput (capture) ───────────────────────────────────────────────

/**
 * How the position size is provided:
 * - "quantity": size known directly (e.g. 0.5 lots, 2 contracts);
 * - "risk_percent": % of current balance → server computes quantity;
 * - "risk_amount": fixed money risk → server computes quantity.
 */
export const tradeSizeModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("quantity"), quantity: positiveDecimalStringSchema }),
  z.object({ mode: z.literal("risk_percent"), riskPercent: positiveDecimalStringSchema }),
  z.object({ mode: z.literal("risk_amount"), riskAmount: positiveDecimalStringSchema }),
]);

export type TradeSizeMode = z.infer<typeof tradeSizeModeSchema>;

const captureBaseFields = {
  accountId: uuidSchema,
  instrumentId: uuidSchema,
  direction: directionSchema,
  entryPrice: positiveDecimalStringSchema,
  /** UTC. Absent = server stamps "now". */
  entryAt: isoDateTimeSchema.optional(),
  size: tradeSizeModeSchema,
  // ── optional plan ──
  initialStop: positiveDecimalStringSchema.optional(),
  initialTP: positiveDecimalStringSchema.optional(),
  plannedRR: positiveDecimalStringSchema.optional(),
  /** Trade rationale → stored as Trade.notes. */
  reason: z.string().max(2000).optional(),
  fees: nonNegativeDecimalStringSchema.optional(),
  swap: decimalStringSchema.optional(),
  // ── psychology (1 tap) ──
  emotionBefore: emotionSchema.optional(),
  /** 1–5. */
  confidence: z.number().int().min(1).max(5).optional(),
  // ── playbook link: exactly ONE of the two (refined below) ──
  strategyId: uuidSchema.optional(),
  /** Optional setup within the linked strategy. */
  setupId: uuidSchema.optional(),
  /** Explicit "this is NOT a playbook trade" flag → strategyId stored null. */
  outOfPlaybook: z.boolean().optional(),
  /** Broker-side id → import idempotence. */
  externalRef: z.string().min(1).optional(),
  /**
   * Provenance of the captured values (§82). MANUAL (default) = hand-entered
   * capture; IMPORT = programmatic ingestion (OCR confirmation bridge) — the
   * server recomputes P&L either way, this label only records WHERE the
   * declaration came from.
   */
  source: z.enum(["MANUAL", "IMPORT"]).optional(),
};

/**
 * CreateTradeInput — capture payload.
 * Discriminated on `variant`:
 * - "open": trade enters the journal as OPEN (no exit data allowed);
 * - "closed": trade is journaled already closed (requires exit triplet).
 *
 * P&L / R / MFE are NEVER accepted here — the server recomputes everything
 * (data-model.md §15: never trust a client-sent pnl/rMultiple).
 */
export const createTradeInputSchema = z
  .discriminatedUnion("variant", [
    z.object({ variant: z.literal("open"), ...captureBaseFields }),
    z.object({
      variant: z.literal("closed"),
      ...captureBaseFields,
      exitPrice: positiveDecimalStringSchema,
      exitAt: isoDateTimeSchema,
      exitReason: exitReasonSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    const hasStrategy = value.strategyId !== undefined;
    const flagOffPlaybook = value.outOfPlaybook === true;
    if (hasStrategy && flagOffPlaybook) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outOfPlaybook"],
        message: "Provide either strategyId or outOfPlaybook, not both",
      });
    }
    if (!hasStrategy && !flagOffPlaybook) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["strategyId"],
        message: "Provide strategyId or set outOfPlaybook: true",
      });
    }
    if (
      value.variant === "closed" &&
      value.entryAt !== undefined &&
      value.exitAt < value.entryAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exitAt"],
        message: "exitAt must be after entryAt",
      });
    }
  });

export type CreateTradeInput = z.infer<typeof createTradeInputSchema>;

// ── CloseTradeInput ──────────────────────────────────────────────────────────

/** One partial exit leg. */
export const partialExitInputSchema = z.object({
  price: positiveDecimalStringSchema,
  quantity: positiveDecimalStringSchema,
  exitedAt: isoDateTimeSchema,
  reason: exitReasonSchema,
  note: z.string().max(500).optional(),
});

export type PartialExitInput = z.infer<typeof partialExitInputSchema>;

/**
 * CloseTradeInput — close an OPEN trade.
 * - "single": one exit directly on the trade (simple path);
 * - "partial": multiple exit legs (TradeExit rows created server-side).
 * Optional MFE/MAE price observations; results are computed server-side.
 */
export const closeTradeInputSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("single"),
      exitPrice: positiveDecimalStringSchema,
      exitAt: isoDateTimeSchema,
      exitReason: exitReasonSchema,
      fees: nonNegativeDecimalStringSchema.optional(),
      swap: decimalStringSchema.optional(),
      mfePrice: positiveDecimalStringSchema.optional(),
      maePrice: positiveDecimalStringSchema.optional(),
    }),
    z.object({
      mode: z.literal("partial"),
      exits: z.array(partialExitInputSchema).min(1),
      fees: nonNegativeDecimalStringSchema.optional(),
      swap: decimalStringSchema.optional(),
      mfePrice: positiveDecimalStringSchema.optional(),
      maePrice: positiveDecimalStringSchema.optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.mode === "partial") {
      for (const [index, exit] of value.exits.entries()) {
        const previous = index > 0 ? value.exits[index - 1] : undefined;
        if (previous !== undefined && exit.exitedAt < previous.exitedAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["exits", index, "exitedAt"],
            message: "Partial exits must be in chronological order",
          });
        }
      }
    }
  });

export type CloseTradeInput = z.infer<typeof closeTradeInputSchema>;

// ── TradeDecisionInput (Judgment Gate) ───────────────────────────────────────

/**
 * TradeDecisionInput — submitted BEFORE the P&L is revealed (API-enforced).
 * The answer unlocks the reveal screen.
 */
export const tradeDecisionInputSchema = z.object({
  grade: gradeSchema,
  followedPlan: z.boolean(),
});

export type TradeDecisionInput = z.infer<typeof tradeDecisionInputSchema>;

// ── RevealPayload (post-decision screen) ─────────────────────────────────────

/** Projection of TradeMistake × Mistake shown on the reveal screen. */
export const detectedMistakeSummarySchema = z.object({
  mistakeId: uuidSchema,
  key: z.string(),
  label: z.string(),
  category: mistakeCategorySchema,
  detectedBy: detectorSchema,
  /** null = auto-detection awaiting confirmation. */
  userConfirmed: z.boolean().nullable(),
});

export type DetectedMistakeSummary = z.infer<typeof detectedMistakeSummarySchema>;

/** Projection of Alert shown on the reveal screen. */
export const triggeredAlertSummarySchema = z.object({
  id: uuidSchema,
  type: alertTypeSchema,
  severity: severitySchema,
  title: z.string(),
  message: z.string(),
});

export type TriggeredAlertSummary = z.infer<typeof triggeredAlertSummarySchema>;

/**
 * RevealPayload — everything the reveal screen needs, in one response:
 * the verdict (pnlNet, rMultiple), the trade duration, the coaching message
 * key (client maps the key to localized copy), auto-detected mistakes,
 * triggered alerts and today's Discipline Saved so far.
 */
export const revealPayloadSchema = z.object({
  tradeId: uuidSchema,
  pnlNet: decimalStringSchema,
  rMultiple: decimalStringSchema,
  /** Trade duration in seconds (exitAt − entryAt), computed API-side. */
  durationSeconds: z.number().int().nonnegative(),
  /** Key into the coaching-message catalog. */
  coachingKey: z.string().min(1),
  detectedMistakes: z.array(detectedMistakeSummarySchema),
  triggeredAlerts: z.array(triggeredAlertSummarySchema),
  /** Ghost setups avoided and settled as "would have lost" today (server-counted). */
  savedSetupsToday: z.number().int().nonnegative(),
  /** Discipline Saved accumulated today (null when stats are not yet computed). */
  savedRToday: decimalStringSchema.nullable(),
});

export type RevealPayload = z.infer<typeof revealPayloadSchema>;
