import { z } from "zod";

import {
  directionSchema,
  exitReasonSchema,
  tradeStatusSchema,
} from "../enums";
import {
  decimalStringSchema,
  isoDateTimeSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";
import { tradeSourceSchema } from "./trade";

/**
 * Trading Core contract (Phase 4) - the canonical journal trade.
 *
 * Architectural distinctions (Phase 4 mandate §1/§6):
 *   External Broker State  ≠  Broker Execution / Deal  ≠  Cosmoz Journal Trade
 *
 * A Cosmoz Trade is a JOURNAL-level business object; a broker position is
 * live external state (owned by the Accounts context) and a deal is an
 * external execution event. 1 Trade = N executions (partial fills, scaling
 * in/out, partial closes) - never assumed to be 1 deal.
 *
 * Boundaries (§59–§63): no review scoring, no analytics, no backtesting,
 * no session-live duplication, no execution capability (READ-ONLY external
 * connectivity; journal writes describe, they never place orders).
 *
 * Wire conventions (unchanged): money/prices/quantities travel as
 * decimal-as-string; timestamps are UTC ISO-8601 with Z suffix.
 */

// ── Lifecycle enums ──────────────────────────────────────────────────────────

// `tradeSourceSchema` (MANUAL | IMPORT | EXTERNAL_SYNC) is imported from
// ./trade - same three values; re-declaring it here would make the two
// `export *` barrel surfaces ambiguous.

/**
 * One leg of a trade: an entry (position building) or an exit (position
 * reducing) execution. Exit executions carry the optional manual close
 * reason/note; provider-derived executions carry their external deal id.
 */
export const tradeExecutionRoleSchema = z.enum(["ENTRY", "EXIT"]);
export type TradeExecutionRole = z.infer<typeof tradeExecutionRoleSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

/** One execution of a trade (journal projection - no raw provider payloads). */
export const tradeExecutionViewSchema = z.object({
  id: uuidSchema,
  tradeId: uuidSchema,
  role: tradeExecutionRoleSchema,
  side: directionSchema,
  volume: decimalStringSchema,
  price: decimalStringSchema.nullable(),
  /** Realized profit attributed to this execution (account currency). */
  profit: decimalStringSchema.nullable(),
  /** Provider-signed commission (negative = cost), preserved verbatim. */
  commission: decimalStringSchema.nullable(),
  /** Provider-signed financing cost, preserved verbatim. */
  swap: decimalStringSchema.nullable(),
  executedAt: isoDateTimeSchema,
  /** Manual exits only - why the leg closed (shared exit vocabulary). */
  reason: exitReasonSchema.nullable(),
  note: z.string().nullable(),
  /** External identity when the execution came from a synchronized deal. */
  externalDealId: z.string().nullable(),
});
export type TradeExecutionView = z.infer<typeof tradeExecutionViewSchema>;

/**
 * Journal trade row for lists. Financial aggregates are computed by the ONE
 * authoritative Trading Core implementation - clients never recompute P&L.
 */
export const journalTradeSummarySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  accountId: uuidSchema,
  status: tradeStatusSchema,
  direction: directionSchema,
  source: tradeSourceSchema,
  /** Instrument symbol EXACTLY as reported/entered - never silently normalized. */
  symbol: z.string().min(1).max(50),
  /** Currency of every financial value on this trade (account currency). */
  currency: z.string().min(3).max(3),
  /** Total entered volume (Σ entry executions). */
  quantity: decimalStringSchema,
  /** Volume closed so far (Σ exit executions). */
  closedQuantity: decimalStringSchema,
  /** Volume-weighted average entry price. */
  entryPrice: decimalStringSchema,
  /** Volume-weighted average exit price (null while open). */
  exitPrice: decimalStringSchema.nullable(),
  /** First entry execution time (UTC) - "openedAt". */
  entryAt: isoDateTimeSchema,
  /** Last exit execution time (UTC) - "closedAt"; null while open. */
  exitAt: isoDateTimeSchema.nullable(),
  /** Fees as a positive cost (−Σ commissions). */
  fees: decimalStringSchema,
  /** Signed financing/swap total. */
  swap: decimalStringSchema,
  pnlGross: decimalStringSchema.nullable(),
  pnlNet: decimalStringSchema.nullable(),
  /** User's local trading day (server-computed from entryAt + user timezone). */
  tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type JournalTradeSummary = z.infer<typeof journalTradeSummarySchema>;

/** Full trade detail - summary + lifecycle extras + execution history (§37/§38). */
export const journalTradeDetailSchema = journalTradeSummarySchema.extend({
  /** Latest exit reason (manual closes; null when the provider did not supply one). */
  exitReason: exitReasonSchema.nullable(),
  initialStop: decimalStringSchema.nullable(),
  initialTP: decimalStringSchema.nullable(),
  /** Money risked at entry, in account currency (manual journals may supply it). */
  riskAmount: decimalStringSchema.nullable(),
  /** pnlNet / riskAmount when both exist - null otherwise. */
  rMultiple: decimalStringSchema.nullable(),
  /**
   * External position identity for synchronized trades (provider semantics).
   * Null for manual/import trades - no external identity is ever fabricated.
   */
  externalPositionId: z.string().nullable(),
  /** Soft delete (§57) - journal history is never hard-deleted by the API. */
  deletedAt: isoDateTimeSchema.nullable(),
  /** Execution history, chronological. Preserves scale-in/partial-close legs. */
  executions: z.array(tradeExecutionViewSchema),
});
export type JournalTradeDetail = z.infer<typeof journalTradeDetailSchema>;

// ── List: query + response ───────────────────────────────────────────────────

/**
 * Composable V1 filters (§34) + pagination (§35). The response keeps the
 * established `{ trades, total }` envelope and adds `page`/`limit` echo -
 * one pagination convention, evolved, not duplicated.
 */
export const journalTradesQuerySchema = z.object({
  accountId: uuidSchema.optional(),
  status: tradeStatusSchema.optional(),
  symbol: z.string().trim().min(1).max(50).optional(),
  direction: directionSchema.optional(),
  source: tradeSourceSchema.optional(),
  /** Inclusive UTC lower bound on entryAt. */
  openedFrom: isoDateTimeSchema.optional(),
  /** Inclusive UTC upper bound on entryAt. */
  openedTo: isoDateTimeSchema.optional(),
  /** Inclusive UTC lower bound on exitAt. */
  closedFrom: isoDateTimeSchema.optional(),
  /** Inclusive UTC upper bound on exitAt. */
  closedTo: isoDateTimeSchema.optional(),
  /** 1-based page index. */
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /** Page size, bounded (§53 - never unbounded history). */
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["entryAt", "exitAt", "pnlNet"]).default("entryAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type JournalTradesQuery = z.infer<typeof journalTradesQuerySchema>;

export const journalTradesResponseSchema = z.object({
  trades: z.array(journalTradeSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type JournalTradesResponse = z.infer<typeof journalTradesResponseSchema>;

// ── Manual trade creation (§29 - honest provenance) ──────────────────────────

const manualTradeBaseFields = {
  accountId: uuidSchema,
  symbol: z.string().trim().min(1).max(50),
  direction: directionSchema,
  entryPrice: positiveDecimalStringSchema,
  /** UTC. Absent = server stamps "now". */
  entryAt: isoDateTimeSchema.optional(),
  quantity: positiveDecimalStringSchema,
  initialStop: positiveDecimalStringSchema.nullable().optional(),
  initialTP: positiveDecimalStringSchema.nullable().optional(),
  /** Money risked at entry (account currency) - enables rMultiple computation. */
  riskAmount: nonNegativeDecimalStringSchema.nullable().optional(),
  notes: z.string().max(2000).optional(),
} as const;

/**
 * Create a MANUAL journal trade. P&L is NEVER accepted - results are always
 * computed server-side by the authoritative implementation (§46). No provider
 * identity may be supplied: fabricating external ids is forbidden (§29).
 * Discriminated on `variant`:
 * - "open": the trade is live in the journal (no exit data allowed);
 * - "closed": journaled already closed (requires the exit triplet).
 */
export const createManualTradeInputSchema = z
  .discriminatedUnion("variant", [
    z.object({ variant: z.literal("open"), ...manualTradeBaseFields }),
    z.object({
      variant: z.literal("closed"),
      ...manualTradeBaseFields,
      exitPrice: positiveDecimalStringSchema,
      exitAt: isoDateTimeSchema,
      exitReason: exitReasonSchema,
      fees: nonNegativeDecimalStringSchema.optional(),
      swap: decimalStringSchema.optional(),
    }),
  ])
  .superRefine((value, ctx) => {
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
export type CreateManualTradeInput = z.infer<typeof createManualTradeInputSchema>;

// ── Manual close (§10/§18 - lifecycle, single or partial exits) ──────────────

/** One manual exit leg. */
export const manualExitLegInputSchema = z.object({
  price: positiveDecimalStringSchema,
  quantity: positiveDecimalStringSchema,
  exitedAt: isoDateTimeSchema,
  reason: exitReasonSchema,
  note: z.string().max(500).optional(),
});
export type ManualExitLegInput = z.infer<typeof manualExitLegInputSchema>;

/**
 * Close a MANUAL OPEN trade: "single" writes one exit directly on the trade;
 * "partial" records several exit legs (chronologically ordered). Exit legs
 * may not exceed the remaining open volume. Synchronized trades are closed
 * by RECONCILIATION only - never by user request (§10/§30).
 */
export const closeManualTradeInputSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("single"),
      exitPrice: positiveDecimalStringSchema,
      exitAt: isoDateTimeSchema,
      exitReason: exitReasonSchema,
      /** Optional closing costs (positive fees / signed swap). */
      fees: nonNegativeDecimalStringSchema.optional(),
      swap: decimalStringSchema.optional(),
      note: z.string().max(500).optional(),
    }),
    z.object({
      mode: z.literal("partial"),
      exits: z.array(manualExitLegInputSchema).min(1).max(20),
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
export type CloseManualTradeInput = z.infer<typeof closeManualTradeInputSchema>;

// ── Journal metadata update (§30 - source-aware editability) ─────────────────

/**
 * PATCH /trades/:id. Journal metadata (notes, stops, risk) is editable for
 * every trade. Execution facts (direction, prices, times, quantity) are
 * editable ONLY for MANUAL trades - broker-derived data is authoritative and
 * may never be overwritten (§30). The server recomputes results after any
 * execution-fact edit; client-supplied P&L is never accepted.
 */
export const updateJournalTradeInputSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    initialStop: positiveDecimalStringSchema.nullable().optional(),
    initialTP: positiveDecimalStringSchema.nullable().optional(),
    riskAmount: nonNegativeDecimalStringSchema.nullable().optional(),
    // ── MANUAL-source-only execution facts ──
    direction: directionSchema.optional(),
    entryPrice: positiveDecimalStringSchema.optional(),
    entryAt: isoDateTimeSchema.optional(),
    quantity: positiveDecimalStringSchema.optional(),
    exitPrice: positiveDecimalStringSchema.optional(),
    exitAt: isoDateTimeSchema.optional(),
    exitReason: exitReasonSchema.optional(),
    fees: nonNegativeDecimalStringSchema.optional(),
    swap: decimalStringSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateJournalTradeInput = z.infer<typeof updateJournalTradeInputSchema>;

// ── Soft delete (§57) ────────────────────────────────────────────────────────

export const journalDeleteTradeResponseSchema = z.object({
  id: uuidSchema,
  deletedAt: isoDateTimeSchema,
});
export type JournalDeleteTradeResponse = z.infer<typeof journalDeleteTradeResponseSchema>;

// ── External synchronization consumer (§26/§27/§28) ──────────────────────────

/**
 * Reconcile one account's synchronized external activity (deals + positions,
 * already persisted by the Accounts context) into canonical journal trades.
 * Idempotent: repeated calls never duplicate trades (§27).
 */
export const journalTradeSyncInputSchema = z.object({
  accountId: uuidSchema,
});
export type JournalTradeSyncInput = z.infer<typeof journalTradeSyncInputSchema>;

export const journalTradeSyncResponseSchema = z.object({
  accountId: uuidSchema,
  /** Deals considered during this reconciliation (balance ops excluded). */
  dealsConsidered: z.number().int().min(0),
  executionsCreated: z.number().int().min(0),
  executionsUpdated: z.number().int().min(0),
  tradesCreated: z.number().int().min(0),
  tradesUpdated: z.number().int().min(0),
  tradesClosed: z.number().int().min(0),
  reconciledAt: isoDateTimeSchema,
});
export type JournalTradeSyncResponse = z.infer<typeof journalTradeSyncResponseSchema>;

// ── Bulk import (client-mapped rows; honest idempotence) ─────────────────────

/**
 * One normalized row AFTER client-side column mapping - the server never
 * parses raw CSV. (The pre-existing `importedTradeRowSchema` in api.ts is
 * the MSW-era shape; this journal contract is the backend-importable one.)
 */
export const journalImportedTradeRowSchema = z.object({
  symbol: z.string().trim().min(1).max(50),
  side: directionSchema,
  entryAt: isoDateTimeSchema,
  entryPrice: positiveDecimalStringSchema,
  exitAt: isoDateTimeSchema.optional(),
  exitPrice: positiveDecimalStringSchema.optional(),
  quantity: positiveDecimalStringSchema.optional(),
  fees: nonNegativeDecimalStringSchema.optional(),
  /** Reference P&L from the broker file - informational; results are recomputed. */
  pnl: decimalStringSchema.optional(),
  notes: z.string().max(2000).optional(),
});
export type JournalImportedTradeRow = z.infer<typeof journalImportedTradeRowSchema>;

/**
 * Import normalized rows as source=IMPORT trades. Idempotence is CONTENT
 * based: a row re-imported with identical content maps to the same stable
 * external reference and is skipped, not duplicated (§27). Requires an
 * existing owned trading account (journal-only accounts are a later phase).
 */
export const journalImportTradesInputSchema = z.object({
  accountId: uuidSchema,
  /** Broker label (idempotence salt + audit): "MT5", "TradingView", … */
  broker: z.string().trim().min(1).max(40),
  rows: z.array(journalImportedTradeRowSchema).min(1).max(500),
});
export type JournalImportTradesInput = z.infer<typeof journalImportTradesInputSchema>;

export const journalImportTradesResponseSchema = z.object({
  imported: z.number().int().min(0),
  /** Rows whose stable content reference already exists - duplicates are normal, not errors. */
  skippedDuplicates: z.number().int().min(0),
  tradeIds: z.array(uuidSchema),
});
export type JournalImportTradesResponse = z.infer<typeof journalImportTradesResponseSchema>;

// ── Stable error codes (§64) ─────────────────────────────────────────────────

/**
 * Stable machine codes for the Trading Core domain. Values surface in the
 * error envelope `code` field; database errors never do.
 */
export const TRADING_CORE_ERROR_CODES = {
  /** Trade does not exist - or exists but is not yours (IDOR → honest 404). */
  TRADE_NOT_FOUND: "TRADE_NOT_FOUND",
  /** Account does not exist - or is not yours (IDOR → honest 404). */
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  /** The operation is invalid for the trade's current lifecycle state (→ 422). */
  INVALID_TRADE_STATE: "INVALID_TRADE_STATE",
  /** The supplied execution data violates a journal invariant (→ 422). */
  INVALID_EXECUTION: "INVALID_EXECUTION",
  /** Broker-derived fields are authoritative and may not be edited (→ 422). */
  EXTERNAL_TRADE_IMMUTABLE: "EXTERNAL_TRADE_IMMUTABLE",
  /** Concurrent reconciliation raced on the same external activity (→ 409). */
  DUPLICATE_EXTERNAL_ACTIVITY: "DUPLICATE_EXTERNAL_ACTIVITY",
} as const;
export type TradingCoreErrorCode =
  (typeof TRADING_CORE_ERROR_CODES)[keyof typeof TRADING_CORE_ERROR_CODES];
