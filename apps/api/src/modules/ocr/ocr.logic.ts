/**
 * OCR recognition domain logic (Phase 19) — PURE functions, no I/O, no Nest.
 *
 * This file implements the raw → normalized → validated pipeline (§13) and
 * the human-in-the-loop correction semantics (§21) with the house discipline
 * established in Phase 18's calculators logic:
 *
 *   - Financial values use exact decimal semantics (§14) — Prisma.Decimal
 *     for every money/price/volume operation, decimal STRINGS on the wire.
 *   - Ambiguous input STAYS ambiguous (§14/§20): "1.234" is never silently
 *     interpreted as 1234 — it is flagged AMBIGUOUS and left for review.
 *   - Timestamps never get a silently assumed timezone (§16): wall-clock
 *     times are preserved without an offset and carry an explicit warning.
 *   - Symbols are preserved raw + normalized; no broker mapping is invented
 *     (§15).
 *   - Missing optional fields are MISSING, never invented (§20); domain
 *     rules only fire when BOTH operands are present (§19).
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { OcrExtractedField, OcrFieldKey, OcrValidationStatus } from "../../shared/contracts";

/** Candidate-key warnings must stay short and stable (client-copyable). */
export const TIMEZONE_UNKNOWN_WARNING = "TIMEZONE_UNKNOWN";
export const USER_CORRECTED_WARNING = "USER_CORRECTED";
export const AMBIGUOUS_SEPARATOR_WARNING = "AMBIGUOUS_THOUSANDS_SEPARATOR";
export const CURRENCY_STRIPPED_WARNING = "CURRENCY_SYMBOL_STRIPPED";
export const DIRECTIONAL_INCONSISTENCY_WARNING = "DIRECTIONAL_INCONSISTENCY";

// ── Confidence banding (§17) ─────────────────────────────────────────────────

/**
 * Heuristic, explainable bands. The numeric confidence is an OCR-engine
 * signal — never mathematical certainty (§17); the band exists for review
 * UX triage, not for automated decisions.
 */
export function confidenceBand(confidence: number): "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" {
  if (!Number.isFinite(confidence) || confidence < 0.3) return "UNKNOWN";
  if (confidence < 0.6) return "LOW";
  if (confidence < 0.85) return "MEDIUM";
  return "HIGH";
}

// ── Decimal normalization (§14) ──────────────────────────────────────────────

export interface DecimalNormalization {
  /** Canonical decimal string, or null when nothing could be normalized. */
  normalized: string | null;
  status: OcrValidationStatus;
  warnings: string[];
}

const DECIMAL_ALLOWED = /^[-+]?[\d.,]+$/;

/**
 * Normalize an OCR decimal fragment with EXACT semantics (§14).
 *
 * Separators: when both '.' and ',' appear, the LAST one is the decimal
 * separator and the other is thousands. When a separator repeats, it is a
 * thousands separator. A SINGLE separator followed by exactly three digits
 * is genuinely ambiguous ("1.234", "2,345") and is returned AMBIGUOUS —
 * never silently resolved (§14: "ambiguous input must remain ambiguous").
 * Currency symbols/letters are stripped with a warning before parsing.
 */
/** Separator-resolved literal text, BEFORE numeric normalization. */
interface ResolvedDecimalText {
  /** Plain-dot literal ("1,234.50" → "1234.50") or null when not parseable. */
  cleaned: string | null;
  status: "VALID" | "INVALID" | "AMBIGUOUS";
  warnings: string[];
}

/**
 * Resolve separators/currency text of a decimal fragment WITHOUT touching
 * its digits — shared by the machine normalization (toFixed) and the user
 * correction paths (which may preserve the declared precision).
 */
function resolveDecimalText(raw: string): ResolvedDecimalText {
  const warnings: string[] = [];
  let text = raw.trim();

  // Strip leading/trailing currency/unit text with an explicit warning (§14).
  // INTERIOR letters are garbage, not units — they must invalidate rather
  // than be silently collapsed ("12abc34" → 1234 would invent data).
  const stripped = text.replace(/^[^0-9.,+-]+/, "").replace(/[^0-9.,+-]+$/, "");
  if (stripped !== text) {
    warnings.push(CURRENCY_STRIPPED_WARNING);
    text = stripped;
  }
  if (text.length === 0 || !DECIMAL_ALLOWED.test(text)) {
    return { cleaned: null, status: "INVALID", warnings };
  }

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    // Both separators present — the later one is decimal, the other thousands.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    const cleaned = text.split(thousandSep).join("").split(decimalSep).join(".");
    return { cleaned, status: "VALID", warnings };
  }

  const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (sep !== null) {
    const occurrences = text.split(sep).length - 1;
    if (occurrences > 1) {
      // Repeated single separator — thousands grouping, unambiguous.
      return { cleaned: text.split(sep).join(""), status: "VALID", warnings };
    }
    const [, fraction = ""] = text.split(sep);
    if (fraction.length === 3) {
      // Exactly one separator + 3-digit group — genuinely ambiguous (§14).
      warnings.push(AMBIGUOUS_SEPARATOR_WARNING);
      return { cleaned: null, status: "AMBIGUOUS", warnings };
    }
    if (sep === ",") {
      return { cleaned: text.split(",").join("."), status: "VALID", warnings };
    }
    return { cleaned: text, status: "VALID", warnings };
  }

  return { cleaned: text, status: "VALID", warnings };
}

export function normalizeDecimal(raw: string): DecimalNormalization {
  const resolved = resolveDecimalText(raw);
  if (resolved.status !== "VALID" || resolved.cleaned === null) {
    return { normalized: null, status: resolved.status, warnings: resolved.warnings };
  }
  return finish(resolved.cleaned, resolved.warnings);
}

function finish(cleaned: string, warnings: string[]): DecimalNormalization {
  try {
    const dec = new Prisma.Decimal(cleaned);
    if (!dec.isFinite()) {
      return { normalized: null, status: "INVALID", warnings };
    }
    return { normalized: dec.toFixed(), status: "VALID", warnings };
  } catch {
    return { normalized: null, status: "INVALID", warnings };
  }
}

/**
 * A SINGLE separator followed by EXACTLY three fraction digits is the
 * ambiguous case ("1.234" could be 1.234 or 1234) — rejected for USER-typed
 * corrections even when the text is otherwise canonical wire form (§14: the
 * user can retype it clearly, "1.2340"). Machine values keep the AMBIGUOUS
 * status instead (normalizeDecimal).
 */
const AMBIGUOUS_CORRECTION_PATTERN = /^-?\d+[.,]\d{3}$/;

/**
 * Decimal-string parsing for USER-typed corrections (§21): the SAME
 * separator semantics as machine values, but ambiguous input is a hard
 * failure because the user can retype it clearly. Returns the NORMALIZED
 * wire form (toFixed — "2345.60" → "2345.6"); the user's declared precision
 * lives in the corrections record via parseCorrectedStoredDecimal. Negative
 * values are allowed only for signed fields (profit).
 */
export function parseCorrectedDecimal(raw: string, signed: boolean): string | null {
  const text = raw.trim();
  if (AMBIGUOUS_CORRECTION_PATTERN.test(text)) return null;
  const resolved = resolveDecimalText(text);
  if (resolved.status !== "VALID" || resolved.cleaned === null) return null;
  try {
    const dec = new Prisma.Decimal(resolved.cleaned);
    if (!dec.isFinite()) return null;
    if (!signed && dec.isNegative()) return null;
    return dec.toFixed();
  } catch {
    return null;
  }
}

/**
 * The STORED form of a user correction (§21): validated with the SAME rules,
 * but the user's declared precision is preserved — separators are
 * canonicalized to plain-dot form ("1,0850" → "1.0850") WITHOUT toFixed,
 * so a confirmation replay stays idempotent against the exact declaration
 * the user confirmed. Machine-merged fields never consume this form; they
 * read the normalized value (parseCorrectedDecimal).
 */
export function parseCorrectedStoredDecimal(raw: string, signed: boolean): string | null {
  const text = raw.trim();
  if (AMBIGUOUS_CORRECTION_PATTERN.test(text)) return null;
  const resolved = resolveDecimalText(text);
  if (resolved.status !== "VALID" || resolved.cleaned === null) return null;
  try {
    const dec = new Prisma.Decimal(resolved.cleaned);
    if (!dec.isFinite()) return null;
    if (!signed && dec.isNegative()) return null;
    return resolved.cleaned;
  } catch {
    return null;
  }
}

// ── Field-specific normalization (§12/§15/§16) ──────────────────────────────

/** Symbols are uppercased with non-alphanumerics removed — no broker merge (§15). */
export function normalizeSymbol(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Practical floor: a symbol is at least 3 characters (US30, EURUSD…).
  return cleaned.length >= 3 && cleaned.length <= 16 ? cleaned : null;
}

/**
 * Timestamp normalization (§16). Supported shapes:
 *   "2026.01.05 09:30:00" / "2026-01-05 09:30" / ISO with explicit Z or offset.
 * Wall-clock results keep NO offset — the timezone is unknown and stays
 * unknown (warning TIMEZONE_UNKNOWN). Only an explicit offset converts to UTC.
 */
export function normalizeTimestamp(raw: string): { normalized: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const text = raw.trim().replace(/\s+/g, " ");
  const dotted = text.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const dashed = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dotted || dashed) {
    const m = (dotted ?? dashed) as RegExpMatchArray;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6] ?? "00");
    if (![y, mo, d, h, mi, s].every((p) => Number.isFinite(p))) {
      return { normalized: null, warnings };
    }
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    if (
      date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d ||
      date.getUTCHours() !== h || date.getUTCMinutes() !== mi || date.getUTCSeconds() !== s
    ) {
      return { normalized: null, warnings };
    }
    // Calendar-valid wall clock — no timezone conversion, explicit warning.
    warnings.push(TIMEZONE_UNKNOWN_WARNING);
    return { normalized: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}`, warnings };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    // Explicit offset — converting to UTC is evidence-based, not a guess (§16).
    return { normalized: parsed.toISOString().replace(/\.\d{3}Z$/, "Z"), warnings };
  }
  return { normalized: null, warnings };
}

/** Direction normalization — BUY/SELL vocabulary (shared directionSchema). */
export function normalizeDirection(raw: string): "BUY" | "SELL" | null {
  const text = raw.trim().toLowerCase();
  if (text === "buy" || text === "b" || text === "long") return "BUY";
  if (text === "sell" || text === "s" || text === "short") return "SELL";
  return null;
}

const SIGNED_DECIMAL_KEYS: ReadonlySet<OcrFieldKey> = new Set(["profit"]);
const DECIMAL_KEYS: ReadonlySet<OcrFieldKey> = new Set([
  "volume", "entryPrice", "exitPrice", "stopLoss", "takeProfit", "profit",
]);

// ── Domain validation (§19) — applied to normalized values ──────────────────

/**
 * Domain rules over EXTRACTED fields. Only fires when both operands are
 * present (§19): a missing SL never invalidates an entry. Violations mark
 * the offending field INVALID (kept for review) — they never reject the
 * whole recognition (§19: "do not reject potentially valid screenshots
 * merely because optional fields are missing").
 */
export function applyDomainValidation(fields: OcrExtractedField[]): OcrExtractedField[] {
  const byKey = new Map(fields.map((f) => [f.field, f]));
  const decimal = (key: OcrFieldKey): Prisma.Decimal | null => {
    const field = byKey.get(key);
    if (!field || field.normalizedValue === null) return null;
    try {
      const dec = new Prisma.Decimal(field.normalizedValue);
      return dec.isFinite() ? dec : null;
    } catch {
      return null;
    }
  };

  // Positivity rules (§19): volume and prices must be > 0. Decimal#isPositive
  // treats zero as positive — use a strict comparison against 0 instead.
  for (const key of ["volume", "entryPrice", "exitPrice", "stopLoss", "takeProfit"] as const) {
    const value = decimal(key);
    const field = byKey.get(key);
    if (value !== null && field && !value.greaterThan("0")) {
      byKey.set(key, invalidate(field, key, "must be positive"));
    }
  }
  // Profit must be a finite number — any sign is legitimate.
  const profitField = byKey.get("profit");
  if (profitField && profitField.normalizedValue !== null && decimal("profit") === null) {
    byKey.set("profit", invalidate(profitField, "profit", "must be a finite number"));
  }

  // Directional coherence (§19) — only with all three values present.
  const direction = byKey.get("direction");
  const dir = direction?.normalizedValue === "BUY" ? "BUY" : direction?.normalizedValue === "SELL" ? "SELL" : null;
  const entry = decimal("entryPrice");
  const sl = decimal("stopLoss");
  const tp = decimal("takeProfit");
  if (dir !== null && entry !== null) {
    if (sl !== null && ((dir === "BUY" && !sl.lessThan(entry)) || (dir === "SELL" && !sl.greaterThan(entry)))) {
      const field = byKey.get("stopLoss");
      if (field) byKey.set("stopLoss", invalidate(field, "stopLoss", `SL must be ${dir === "BUY" ? "below" : "above"} entry`));
    }
    if (tp !== null && ((dir === "BUY" && !tp.greaterThan(entry)) || (dir === "SELL" && !tp.lessThan(entry)))) {
      const field = byKey.get("takeProfit");
      if (field) byKey.set("takeProfit", invalidate(field, "takeProfit", `TP must be ${dir === "BUY" ? "above" : "below"} entry`));
    }
  }

  return [...byKey.values()];
}

/** Stable per-rule warning tokens — the reason is not free user text. */
function invalidate(field: OcrExtractedField, key: OcrFieldKey, reason: string): OcrExtractedField {
  void key;
  const token = DIRECTIONAL_INCONSISTENCY_WARNING;
  const warnings = [...field.warnings];
  if (!warnings.includes(token)) warnings.push(token);
  void reason; // kept out of user-visible data — the status token is the contract
  return { ...field, validationStatus: "INVALID", warnings: warnings.slice(0, 8) };
}

// ── Corrections — the authoritative human values (§21) ──────────────────────

export class CorrectionError extends Error {
  constructor(readonly issues: ReadonlyArray<{ path: string; message: string }>) {
    super("correction rejected");
    this.name = "CorrectionError";
  }
}

/**
 * Validate + normalize one user correction. User input is RE-normalized with
 * the same rules as machine values — the user cannot smuggle ambiguous or
 * invalid values into the confirmed record. `null` explicitly clears a value.
 * Returns the canonical stored value (decimal string / BUY-SELL / symbol /
 * wall-clock ISO / null).
 */
export function validateCorrection(fieldKey: OcrFieldKey, value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;

  if (DECIMAL_KEYS.has(fieldKey)) {
    const parsed = parseCorrectedDecimal(text, SIGNED_DECIMAL_KEYS.has(fieldKey));
    if (parsed === null) {
      throw new CorrectionError([{ path: fieldKey, message: "not a valid decimal value for this field" }]);
    }
    return parsed;
  }
  if (fieldKey === "direction") {
    const parsed = normalizeDirection(text);
    if (parsed === null) {
      throw new CorrectionError([{ path: fieldKey, message: "must be BUY or SELL" }]);
    }
    return parsed;
  }
  if (fieldKey === "symbol") {
    const parsed = normalizeSymbol(text);
    if (parsed === null) {
      throw new CorrectionError([{ path: fieldKey, message: "must be a symbol of 3-16 alphanumeric characters" }]);
    }
    return parsed;
  }
  // Timestamps: wall clock is accepted (TIMEZONE_UNKNOWN warning applies at
  // review time); an explicit offset is canonicalized to UTC.
  const parsed = normalizeTimestamp(text);
  if (parsed.normalized === null) {
    throw new CorrectionError([{ path: fieldKey, message: "not a recognizable timestamp" }]);
  }
  return parsed.normalized;
}

/**
 * The STORED declaration form of a user correction (§21): validated with the
 * SAME domain rules as validateCorrection, but decimal fields keep the
 * user's declared precision (separators canonicalized to plain dot form,
 * trailing zeros preserved) so the confirmed record is an idempotent replay
 * handle of the exact declaration. Non-decimal fields have a single
 * canonical form — the stored declaration IS the normalized value.
 */
export function validateCorrectionStored(fieldKey: OcrFieldKey, value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;

  if (DECIMAL_KEYS.has(fieldKey)) {
    const parsed = parseCorrectedStoredDecimal(text, SIGNED_DECIMAL_KEYS.has(fieldKey));
    if (parsed === null) {
      throw new CorrectionError([{ path: fieldKey, message: "not a valid decimal value for this field" }]);
    }
    return parsed;
  }
  return validateCorrection(fieldKey, value);
}

/**
 * Merge user corrections into the machine field list (§21): corrected fields
 * become authoritative (confidence 1, VALID, USER_CORRECTED warning, source
 * region kept for provenance), missing fields may be ADDED, and values may
 * be cleared with null. Machine values NEVER overwrite confirmed ones later —
 * this merge happens once, inside the confirmation transaction (§50).
 */
export function applyCorrections(
  machineFields: OcrExtractedField[],
  corrections: Record<string, string | null>,
): { fields: OcrExtractedField[]; correctionCount: number } {
  const byKey = new Map(machineFields.map((f) => [f.field, f]));
  let count = 0;

  for (const [key, raw] of Object.entries(corrections)) {
    const fieldKey = key as OcrFieldKey;
    const canonical = validateCorrection(fieldKey, raw);
    const existing = byKey.get(fieldKey);
    count += 1;
    if (canonical === null) {
      // Explicit clear — keep the field visible but valueless (§20).
      byKey.set(fieldKey, {
        field: fieldKey,
        rawValue: existing?.rawValue ?? null,
        normalizedValue: null,
        confidence: existing?.confidence ?? 1,
        confidenceBand: "HIGH",
        validationStatus: "MISSING",
        sourceRegion: existing?.sourceRegion ?? null,
        warnings: [...(existing?.warnings ?? []), USER_CORRECTED_WARNING].slice(0, 8),
      });
      continue;
    }
    byKey.set(fieldKey, {
      field: fieldKey,
      rawValue: existing?.rawValue ?? null,
      normalizedValue: canonical,
      confidence: 1,
      confidenceBand: "HIGH",
      validationStatus: "VALID",
      sourceRegion: existing?.sourceRegion ?? null,
      warnings: [...(existing?.warnings.filter((w) => w !== USER_CORRECTED_WARNING) ?? []), USER_CORRECTED_WARNING].slice(-8),
    });
  }

  return { fields: applyCorrectionsSorted(byKey), correctionCount: count };
}

function applyCorrectionsSorted(byKey: Map<OcrFieldKey, OcrExtractedField>): OcrExtractedField[] {
  return applyDomainValidation([...byKey.values()]);
}

// ── Idempotency (§32) ────────────────────────────────────────────────────────

/** FNV-1a 32-bit — same primitive as the Accounts mock (house standard). */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic idempotency key: one recognition per (user, image, profile,
 * pipeline version) — §32. The checksum is already hex; the sha256 here is
 * over server-controlled values only (no user text).
 */
export function deriveIdempotencyKey(
  userId: string,
  checksumSha256: string,
  profile: string,
  pipelineVersion: string,
): string {
  return createHash("sha256")
    .update(`${userId}|${checksumSha256}|${profile}|${pipelineVersion}`)
    .digest("hex");
}
