/**
 * Recognition validation layer (spec §22) — Zod-based, centralized; the UI
 * never validates financial data with `if (!value)` style checks.
 *
 * Schemas live in the feature (NOT in @cosmoz/shared) because the OCR
 * backend contract does not exist yet (spec §69): when NestJS defines the
 * real TradeDraft contract, these schemas migrate to the shared package
 * without touching call-sites.
 *
 * Validators return STABLE ISSUE CODES, never messages — the UI maps codes
 * through `dict.recognition.validation.*` so copy stays in the dictionary.
 */

import { z } from "zod";
import {
  decimalStringSchema,
  positiveDecimalStringSchema,
} from "@cosmoz/shared";
import type { RecognitionFieldKind } from "./types";

// ── Issue codes (UI → dict.recognition.validation) ───────────────────────────

export type RecognitionValidationCode =
  | "REQUIRED"
  | "INVALID_DECIMAL"
  | "POSITIVE_REQUIRED"
  | "INVALID_SYMBOL"
  | "INVALID_DATETIME"
  | "SL_ENTRY_COHERENCE"
  | "TP_ENTRY_COHERENCE"
  | "EXIT_BEFORE_ENTRY";

export type FieldValidationResult =
  | { ok: true; value: string }
  | { ok: false; code: RecognitionValidationCode };

// ── Primitives ───────────────────────────────────────────────────────────────

/** Trading symbol: uppercase A–Z / digits, 2–20 chars (XAUUSD, NAS100…). */
const symbolText = z
  .string()
  .trim()
  .regex(/^[A-Z0-9._-]{2,20}$/);

/** Signed decimal (P&L can be negative). */
const signedDecimalText = z
  .string()
  .trim()
  .regex(/^[+-]?\d+(\.\d+)?$/);

/** datetime-local input value: "YYYY-MM-DDTHH:mm". */
const localDateTimeText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

// ── Single-field editor validation (spec §21) ────────────────────────────────

/**
 * Validates one edited value against its field kind. Returns the normalized
 * value (trimmed) or a stable issue code for the inline editor.
 */
export function validateFieldValue(
  kind: RecognitionFieldKind,
  raw: string,
): FieldValidationResult {
  const value = raw.trim();
  switch (kind) {
    case "text":
    case "identifier": {
      if (value.length === 0) return { ok: false, code: "REQUIRED" };
      return { ok: true, value };
    }
    case "direction": {
      if (value === "BUY" || value === "SELL") return { ok: true, value };
      return { ok: false, code: "REQUIRED" };
    }
    case "decimal": {
      const parsed = positiveDecimalStringSchema.safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          code: /^\d+(\.\d+)?$/.test(value) && Number(value) === 0
            ? "POSITIVE_REQUIRED"
            : "INVALID_DECIMAL",
        };
      }
      return { ok: true, value };
    }
    case "signedDecimal": {
      const parsed = signedDecimalText.safeParse(value);
      if (!parsed.success) return { ok: false, code: "INVALID_DECIMAL" };
      const parsedDecimal = decimalStringSchema.safeParse(value);
      if (!parsedDecimal.success) return { ok: false, code: "INVALID_DECIMAL" };
      return { ok: true, value };
    }
    case "datetime": {
      if (value.length === 0) return { ok: false, code: "REQUIRED" };
      if (!localDateTimeText.safeParse(value).success) {
        return { ok: false, code: "INVALID_DATETIME" };
      }
      return { ok: true, value };
    }
  }
}

// ── Trade draft schema (spec §22/§23) ────────────────────────────────────────

export type TradeDraftInput = {
  symbol: string;
  direction: "BUY" | "SELL";
  volume: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  pnl: string | null;
  /** datetime-local inputs; null when absent. */
  openTime: string | null;
  closeTime: string | null;
};

export type DraftFieldSlug =
  | "symbol"
  | "direction"
  | "volume"
  | "entryPrice"
  | "exitPrice"
  | "stopLoss"
  | "takeProfit"
  | "pnl"
  | "openTime"
  | "closeTime";

export type TradeDraftValidation =
  | { ok: true }
  | { ok: false; errors: Partial<Record<DraftFieldSlug, RecognitionValidationCode>> };

function decimal(value: string | null): z.SafeParseReturnType<string, string> {
  if (value === null) return { success: true, data: "" } as const;
  return positiveDecimalStringSchema.safeParse(value.trim());
}

function signedDecimal(value: string | null) {
  if (value === null) return { success: true as const, data: "" };
  return signedDecimalText.safeParse(value.trim());
}

function numeric(value: string | null): number | null {
  if (value === null || value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validates the complete draft: per-field formats plus cross-field
 * coherence (SL/TP vs direction, exit after entry — spec §22). Does NOT
 * duplicate backend business rules beyond what the reviewer needs to fix
 * values on the spot.
 */
export function validateTradeDraft(input: TradeDraftInput): TradeDraftValidation {
  const errors: Partial<Record<DraftFieldSlug, RecognitionValidationCode>> = {};

  // Per-field formats.
  if (!symbolText.safeParse(input.symbol).success) {
    errors.symbol = input.symbol.trim().length === 0 ? "REQUIRED" : "INVALID_SYMBOL";
  }
  if (!positiveDecimalStringSchema.safeParse(input.volume.trim()).success) {
    errors.volume = "POSITIVE_REQUIRED";
  }
  if (!positiveDecimalStringSchema.safeParse(input.entryPrice.trim()).success) {
    errors.entryPrice = "POSITIVE_REQUIRED";
  }
  if (!decimal(input.exitPrice).success) errors.exitPrice = "INVALID_DECIMAL";
  if (!decimal(input.stopLoss).success) errors.stopLoss = "INVALID_DECIMAL";
  if (!decimal(input.takeProfit).success) errors.takeProfit = "INVALID_DECIMAL";
  if (!signedDecimal(input.pnl).success) errors.pnl = "INVALID_DECIMAL";

  // Datetimes.
  if (input.openTime !== null && input.openTime.trim().length > 0
    && !localDateTimeText.safeParse(input.openTime.trim()).success) {
    errors.openTime = "INVALID_DATETIME";
  }
  if (input.closeTime !== null && input.closeTime.trim().length > 0
    && !localDateTimeText.safeParse(input.closeTime.trim()).success) {
    errors.closeTime = "INVALID_DATETIME";
  }
  if (
    errors.openTime === undefined &&
    errors.closeTime === undefined &&
    input.openTime !== null && input.closeTime !== null &&
    input.openTime.trim().length > 0 && input.closeTime.trim().length > 0 &&
    input.closeTime < input.openTime
  ) {
    errors.closeTime = "EXIT_BEFORE_ENTRY";
  }

  // SL/TP coherence vs direction (spec §22) — only when present.
  const entry = numeric(input.entryPrice);
  const sl = numeric(input.stopLoss);
  const tp = numeric(input.takeProfit);
  if (entry !== null && entry > 0) {
    if (sl !== null && sl > 0) {
      const coherent = input.direction === "BUY" ? sl < entry : sl > entry;
      if (!coherent) errors.stopLoss = "SL_ENTRY_COHERENCE";
    }
    if (tp !== null && tp > 0) {
      const coherent = input.direction === "BUY" ? tp > entry : tp < entry;
      if (!coherent) errors.takeProfit = "TP_ENTRY_COHERENCE";
    }
  }

  if (Object.keys(errors).length === 0) return { ok: true };
  return { ok: false, errors };
}

// ── Confirmation gate (spec §28) ─────────────────────────────────────────────

/**
 * The confirmation step requires a VALID draft plus explicit review of the
 * summary — modeled as a schema so the confirm button can never bypass it.
 */
export const confirmImportSchema = z.object({
  jobId: z.string().min(1),
  acknowledged: z.literal(true),
});

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
