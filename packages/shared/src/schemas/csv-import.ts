import { z } from "zod";
import { brokerSchema, directionSchema, exitReasonSchema } from "../enums";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";

/**
 * Broker CSV import - Phase 10. Two-step contract mirroring a real API:
 *  1. POST /import/csv/preview - raw CSV + broker hint → parsed rows with
 *     per-row status, deduped against existing externalRefs, preview id.
 *  2. POST /import/csv - commit the previewed batch (idempotent by
 *     externalRef). Unresolved symbols become new instruments.
 */

/** Brokers the parser understands out of the box; GENERIC sniffs columns. */
export const csvBrokerSchema = z.enum(["MT4", "MT5", "DERIV", "GENERIC"]);
export type CsvBroker = z.infer<typeof csvBrokerSchema>;

// ── Preview ──────────────────────────────────────────────────────────────────

export const csvImportPreviewRequestSchema = z.object({
  /** Raw CSV text - max 2 MB, ~90 days of daily statements is far below this. */
  csv: z.string().min(1).max(2_000_000),
  broker: csvBrokerSchema,
  /** First line is a header row (MT4/MT5/Deriv exports always have one). */
  hasHeader: z.boolean(),
});

export type CsvImportPreviewRequest = z.infer<typeof csvImportPreviewRequestSchema>;

/** Per-row outcome of the server-side parse - the preview table's data. */
export const csvParsedRowSchema = z.object({
  /** 0-based index within the CSV data rows (stable for React keys). */
  index: z.number().int().min(0),
  /** Broker-side ticket/position id - idempotence key (may be null on GENERIC). */
  externalRef: z.string().nullable(),
  symbol: z.string().min(1),
  /** Instrument id when the symbol matched the catalog, else null → new instrument at commit. */
  instrumentId: uuidSchema.nullable(),
  direction: directionSchema.nullable(),
  quantity: decimalStringSchema.nullable(),
  entryPrice: decimalStringSchema.nullable(),
  entryAt: isoDateTimeSchema.nullable(),
  exitPrice: decimalStringSchema.nullable(),
  exitAt: isoDateTimeSchema.nullable(),
  fees: decimalStringSchema.nullable(),
  /** Overnight swap as reported by the broker (may be negative). */
  swap: decimalStringSchema.nullable(),
  /** Broker net P&L as signed decimal string (informational, recomputed API-side at commit). */
  pnlNet: decimalStringSchema.nullable(),
  status: z.enum(["OK", "WARNING", "ERROR"]),
  /** Human-readable, one per problem - e.g. "Unknown symbol XYZ - new instrument will be created". */
  issues: z.array(z.string()),
  /** Already in the journal (same externalRef) - skipped at commit. */
  duplicate: z.boolean(),
});

export type CsvParsedRow = z.infer<typeof csvParsedRowSchema>;

export const csvImportPreviewResponseSchema = z.object({
  /** Opaque id of the staged batch - present it at commit. */
  batchId: uuidSchema,
  detected: z.object({
    broker: csvBrokerSchema,
    delimiter: z.string().length(1),
    rowCount: z.number().int().min(0),
    columns: z.array(z.string()),
    dateRange: z.object({
      from: dateKeySchema.nullable(),
      to: dateKeySchema.nullable(),
    }),
  }),
  rows: z.array(csvParsedRowSchema),
  importable: z.number().int().min(0),
  /** ERROR rows - unusable without fixing the source file. */
  skipped: z.number().int().min(0),
  /** Duplicate externalRefs - harmless, skipped at commit. */
  duplicates: z.number().int().min(0),
});

export type CsvImportPreviewResponse = z.infer<typeof csvImportPreviewResponseSchema>;

// ── Commit ───────────────────────────────────────────────────────────────────

export const csvImportCommitRequestSchema = z.object({
  batchId: uuidSchema,
  /** Target account for the imported trades. */
  accountId: uuidSchema,
  /** Optional playbook link applied to every imported row (else null = out of playbook). */
  strategyId: uuidSchema.nullable(),
});

export type CsvImportCommitRequest = z.infer<typeof csvImportCommitRequestSchema>;

export const csvImportCommitResponseSchema = z.object({
  batchId: uuidSchema,
  imported: z.number().int().min(0),
  /** Rows dropped because a required field was missing (ERROR rows). */
  skipped: z.number().int().min(0),
  /** Rows skipped as already-imported duplicates. */
  duplicatesSkipped: z.number().int().min(0),
  /** Instruments created on the fly for unknown symbols. */
  instrumentsCreated: z.number().int().min(0),
});

export type CsvImportCommitResponse = z.infer<typeof csvImportCommitResponseSchema>;

// ── One-shot import flow (POST /trades/import - trades module dialog) ────────

/** A mapped row produced client-side and shipped to the import endpoint. */
export const importTradeRowSchema = z.object({
  /** Ticket number, or a stable content-hash fallback ("csv-<hash>"). */
  externalRef: z.string().min(1),
  instrumentId: uuidSchema,
  direction: directionSchema,
  entryPrice: positiveDecimalStringSchema,
  entryAt: isoDateTimeSchema,
  exitPrice: positiveDecimalStringSchema,
  exitAt: isoDateTimeSchema,
  quantity: positiveDecimalStringSchema,
  initialStop: positiveDecimalStringSchema.nullable(),
  initialTP: positiveDecimalStringSchema.nullable(),
  /** Optional: empty column = undefined (server defaults 0). */
  fees: nonNegativeDecimalStringSchema.optional(),
  swap: decimalStringSchema.optional(),
  exitReason: exitReasonSchema.nullable(),
  /** Informational broker-reported P&L - the journal recomputes its own. */
  brokerPnl: decimalStringSchema.nullable(),
  notes: z.string().nullable(),
});
export type ImportTradeRow = z.infer<typeof importTradeRowSchema>;

export const importTradesInputSchema = z.object({
  accountId: uuidSchema,
  broker: brokerSchema,
  rows: z.array(importTradeRowSchema).min(1),
});
export type ImportTradesInput = z.infer<typeof importTradesInputSchema>;

export const importTradesResponseSchema = z.object({
  created: z.number().int().min(0),
  /** Rows skipped as already-imported duplicates (externalRef idempotence). */
  duplicates: z.number().int().min(0),
});
export type ImportTradesResponse = z.infer<typeof importTradesResponseSchema>;
