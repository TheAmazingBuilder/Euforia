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
import type {
  OcrClassification,
  OcrExtractionProfile,
  OcrExtractedField,
  OcrFieldKey,
  OcrIssue,
  OcrQualityScore,
  OcrTimelineEntry,
  OcrTradeDuplicateEvidence,
  OcrValidationStatus,
} from "../../shared/contracts";
import { OCR_PROFILE_REQUIRED_FIELD_KEYS } from "../../shared/contracts";

/** Candidate-key warnings must stay short and stable (client-copyable). */
export const TIMEZONE_UNKNOWN_WARNING = "TIMEZONE_UNKNOWN";
export const USER_CORRECTED_WARNING = "USER_CORRECTED";
export const AMBIGUOUS_SEPARATOR_WARNING = "AMBIGUOUS_THOUSANDS_SEPARATOR";
export const CURRENCY_STRIPPED_WARNING = "CURRENCY_SYMBOL_STRIPPED";
export const DIRECTIONAL_INCONSISTENCY_WARNING = "DIRECTIONAL_INCONSISTENCY";
export const TIMESTAMP_ORDER_WARNING = "TIMESTAMP_ORDER_INCONSISTENCY";

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

const SIGNED_DECIMAL_KEYS: ReadonlySet<OcrFieldKey> = new Set([
  "profit",
  // Account snapshots: balances/equity CAN legitimately be negative (a
  // blown account is still a truthful snapshot — never "validated away").
  "accountBalance",
  "accountEquity",
  "accountMargin",
  "accountFreeMargin",
  "accountMarginLevel",
  // Chart: signed change % and MACD readings are data.
  "chartChangePct",
  "chartMacd",
]);
const DECIMAL_KEYS: ReadonlySet<OcrFieldKey> = new Set([
  "volume", "entryPrice", "exitPrice", "stopLoss", "takeProfit", "profit",
  "accountBalance", "accountEquity", "accountMargin", "accountFreeMargin", "accountMarginLevel",
  "chartOpen", "chartHigh", "chartLow", "chartClose", "chartPrice", "chartChangePct",
  "chartRsi", "chartMacd", "chartAtr", "chartStoch", "chartAdx", "chartMa",
]);
/** Non-negative chart prices — an OHLC quote is never negative. */
const POSITIVE_DECIMAL_KEYS: ReadonlySet<OcrFieldKey> = new Set([
  "chartOpen", "chartHigh", "chartLow", "chartClose", "chartPrice",
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
  // Account balances are EXCLUDED on purpose: a negative balance is a
  // truthful snapshot, never invalidated (Account profile honesty rule).
  for (const key of ["volume", "entryPrice", "exitPrice", "stopLoss", "takeProfit"] as const) {
    const value = decimal(key);
    const field = byKey.get(key);
    if (value !== null && field && !value.greaterThan("0")) {
      byKey.set(key, invalidate(field, key, "must be positive"));
    }
  }
  // Chart quote geometry (Account & Chart expansion): H >= max(O, C),
  // L <= min(O, C), price inside [L, H] — each rule only fires when BOTH
  // operands are present (§19: a missing operand never invalidates).
  const chartOpen = decimal("chartOpen");
  const chartHigh = decimal("chartHigh");
  const chartLow = decimal("chartLow");
  const chartClose = decimal("chartClose");
  if (chartHigh !== null && chartOpen !== null && chartHigh.lessThan(chartOpen)) {
    const field = byKey.get("chartHigh");
    if (field) byKey.set("chartHigh", invalidate(field, "chartHigh", "high below open"));
  }
  if (chartHigh !== null && chartClose !== null && chartHigh.lessThan(chartClose)) {
    const field = byKey.get("chartHigh");
    if (field) byKey.set("chartHigh", invalidate(field, "chartHigh", "high below close"));
  }
  if (chartLow !== null && chartOpen !== null && chartLow.greaterThan(chartOpen)) {
    const field = byKey.get("chartLow");
    if (field) byKey.set("chartLow", invalidate(field, "chartLow", "low above open"));
  }
  if (chartLow !== null && chartClose !== null && chartLow.greaterThan(chartClose)) {
    const field = byKey.get("chartLow");
    if (field) byKey.set("chartLow", invalidate(field, "chartLow", "low above close"));
  }
  const chartPrice = decimal("chartPrice");
  if (chartPrice !== null && chartLow !== null && chartPrice.lessThan(chartLow)) {
    const field = byKey.get("chartPrice");
    if (field) byKey.set("chartPrice", invalidate(field, "chartPrice", "price below range"));
  }
  if (chartPrice !== null && chartHigh !== null && chartPrice.greaterThan(chartHigh)) {
    const field = byKey.get("chartPrice");
    if (field) byKey.set("chartPrice", invalidate(field, "chartPrice", "price above range"));
  }
  for (const key of POSITIVE_DECIMAL_KEYS) {
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

  // Timestamp order (V2 §17): close must not precede open. Only fires when
  // both are present; each side carries the timezone-unknown wall clock
  // (§16) so the comparison is calendar-and-clock honest — no tz inference.
  const openTime = byKey.get("openTime");
  const closeTime = byKey.get("closeTime");
  if (openTime?.normalizedValue && closeTime?.normalizedValue) {
    const open = Date.parse(`${openTime.normalizedValue}Z`);
    const close = Date.parse(`${closeTime.normalizedValue}Z`);
    if (!Number.isNaN(open) && !Number.isNaN(close) && close < open) {
      byKey.set("closeTime", invalidateTimestamp(closeTime));
    }
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
  void reason; // kept out of user-visible data — the status token is the contract
  const token = DIRECTIONAL_INCONSISTENCY_WARNING;
  const warnings = [...field.warnings];
  if (!warnings.includes(token)) warnings.push(token);
  return { ...field, validationStatus: "INVALID", warnings: warnings.slice(0, 8) as typeof field.warnings };
}

/** Timestamp-order violations carry their own stable token (V2 §17). */
function invalidateTimestamp(field: OcrExtractedField): OcrExtractedField {
  const warnings = [...field.warnings];
  if (!warnings.includes(TIMESTAMP_ORDER_WARNING)) warnings.push(TIMESTAMP_ORDER_WARNING);
  return { ...field, validationStatus: "INVALID", warnings: warnings.slice(0, 8) as typeof field.warnings };
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

// ── Perceptual duplicate detection (engine quality §2.1) ────────────────────

/** Popcount per hex nibble — table lookup keeps the hot loop branch-free. */
const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Hamming distance between two 64-bit dHash fingerprints given as 16-char
 * hex strings. Returns null when either input is malformed — callers treat
 * null as "cannot compare" (advisory signal, never a hard failure).
 */
export function hammingDistance64(a: string, b: string): number | null {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return null;
  let distance = 0;
  for (let i = 0; i < 16; i += 1) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    distance += NIBBLE_POPCOUNT[x] ?? 0;
  }
  return distance;
}

/**
 * Near-duplicate threshold (of 64 bits): dHash of the SAME panel reshot or
 * recompressed differs by a handful of bits; a different panel differs by
 * far more. 8 is the conservative middle — the flag is advisory anyway.
 */
export const DUPLICATE_HAMMING_THRESHOLD = 8;

/** Corrections-memory pattern key input (engine quality §2.3). */
export interface CorrectionPatternEntry {
  fieldKey: OcrFieldKey;
  rawValue: string;
  correctedValue: string;
}

/**
 * Collect the correction-pattern entries from one confirmation: every field
 * the user CHANGED (machine rawValue ≠ corrected value) becomes a memory
 * row. Unchanged fields and null (cleared) values never enter the memory.
 */
export function collectCorrectionPatterns(
  machineFields: OcrExtractedField[],
  corrections: Record<string, string | null>,
): CorrectionPatternEntry[] {
  const rawByKey = new Map<string, string>();
  for (const field of machineFields) {
    if (field.rawValue !== null) rawByKey.set(field.field, field.rawValue);
  }
  const entries: CorrectionPatternEntry[] = [];
  for (const [key, value] of Object.entries(corrections)) {
    if (value === null || value.length === 0) continue;
    const rawValue = rawByKey.get(key);
    if (rawValue === undefined || rawValue === value) continue;
    entries.push({ fieldKey: key as OcrFieldKey, rawValue, correctedValue: value });
  }
  return entries;
}

/** Playbook tag suggestions (engine quality §3.3) — deterministic hints. */
export function suggestedTagsForImport(values: {
  symbol: string | null;
  openTime: string | null;
  instrumentAssetClass?: string | null;
}): string[] {
  const tags: string[] = ["Import"];
  // Session from the confirmed open time (UTC wall clock, §16 — no tz guess
  // beyond the coarse session buckets the trader already reasons with).
  const hour = values.openTime ? Number.parseInt(values.openTime.slice(11, 13), 10) : NaN;
  if (!Number.isNaN(hour)) {
    if (hour >= 23 || hour < 7) tags.push("Session Asia");
    else if (hour < 12) tags.push("Session London");
    else if (hour < 21) tags.push("Session New York");
  }
  const assetClass = values.instrumentAssetClass?.toUpperCase();
  if (assetClass === "FOREX") tags.push("Forex");
  else if (assetClass === "METAL") tags.push("Metals");
  else if (assetClass === "INDEX") tags.push("Indices");
  else if (assetClass === "CRYPTO") tags.push("Crypto");
  else if (assetClass === "ENERGY") tags.push("Energy");
  return tags.slice(0, 8);
}

// ── V2 §16 — structured recognition issues (derived, never persisted) ───────

/** Confidence below this band is report-worthy (V2 §16 LOW_OCR_CONFIDENCE). */
export const LOW_OCR_CONFIDENCE_THRESHOLD = 0.7;

/**
 * The import-critical floor per profile — shared OCR_PROFILE_REQUIRED_FIELD_KEYS.
 * Kept as the TRADE default for callers that do not know a profile (fusion
 * of sets is a TRADE-only feature, so the default is honest there).
 */
export const REQUIRED_FIELD_KEYS: readonly OcrFieldKey[] = OCR_PROFILE_REQUIRED_FIELD_KEYS.TRADE_SUMMARY;

export interface RecognitionIssueInput {
  fields: readonly OcrExtractedField[];
  classification: OcrClassification | null;
  duplicateOf: { recognitionId: string } | null;
  possibleTradeDuplicate: { tradeId: string; matchedOn: readonly string[] } | null;
  /** The symbol resolved against the instrument catalog (null = unknown). */
  symbolInCatalog: boolean;
  /** Extraction profile — scopes the required-field floor (defaults TRADE). */
  profile?: OcrExtractionProfile;
}

/**
 * Derive the structured issue list from the STORED recognition evidence
 * (V2 §16). Pure + deterministic: the same recognition always yields the
 * same issues (V2 §77). Issues are READ-TIME derivations — confirmed rows
 * never mutate (V2 §33) and improved logic retroactively explains old rows.
 */
export function deriveRecognitionIssues(input: RecognitionIssueInput): OcrIssue[] {
  const issues: OcrIssue[] = [];
  const push = (issue: OcrIssue) => {
    if (issues.length < 32) issues.push(issue);
  };

  const required = OCR_PROFILE_REQUIRED_FIELD_KEYS[input.profile ?? "TRADE_SUMMARY"];
  for (const field of input.fields) {
    if (field.validationStatus === "MISSING") {
      if ((required as readonly string[]).includes(field.field)) {
        push({ code: "MISSING_REQUIRED_FIELD", field: field.field, detail: null });
      }
      continue;
    }
    if (field.confidence < LOW_OCR_CONFIDENCE_THRESHOLD) {
      push({ code: "LOW_OCR_CONFIDENCE", field: field.field, detail: null });
    }
    if (field.validationStatus === "INVALID") {
      const timestamp = field.field === "openTime" || field.field === "closeTime";
      push({
        code: timestamp ? "INVALID_TIMESTAMP" : "INVALID_PRICE_RELATIONSHIP",
        field: field.field,
        detail: null,
      });
    }
    if (field.validationStatus === "AMBIGUOUS") {
      if (field.field === "direction") {
        push({ code: "AMBIGUOUS_DIRECTION", field: field.field, detail: null });
      } else {
        push({ code: "AMBIGUOUS_NUMBER", field: field.field, detail: null });
      }
    }
  }

  // Account & Chart headers are flat label-driven lists — a required value
  // the engine NEVER PRODUCED is meaningful absence (the review must say
  // "enter it manually"). Trade rows keep the legacy semantics: candidate
  // grouping makes empty MAIN fields normal, so absence stays un-flagged
  // there (the multi-trade review owns that evidence).
  if (input.profile === "ACCOUNT_POSITION" || input.profile === "CHART_ANALYSIS") {
    for (const key of required) {
      if (!input.fields.some((f) => f.field === key)) {
        push({ code: "MISSING_REQUIRED_FIELD", field: key, detail: null });
      }
    }
  }

  // A chart legend on an ACCOUNT run (or an account header on a CHART run)
  // is honest evidence of a profile mismatch — the review must know the
  // extraction ran against the wrong vocabulary.
  if (input.profile !== undefined && input.classification !== null) {
    const type = input.classification.type;
    const mismatch =
      (input.profile === "ACCOUNT_POSITION" && type !== "ACCOUNT_SUMMARY" && type !== "OPEN_POSITION" && type !== "POSITION_DETAIL") ||
      (input.profile === "CHART_ANALYSIS" && type !== "CHART" && type !== "TRADINGVIEW_CHART") ||
      (input.profile === "TRADE_SUMMARY" && (type === "ACCOUNT_SUMMARY" || type === "CHART"));
    if (mismatch) {
      push({ code: "PROFILE_TYPE_MISMATCH", field: null, detail: type });
    }
  }
  if (input.classification === null || input.classification.type === "UNKNOWN") {
    push({ code: "UNSUPPORTED_SCREENSHOT", field: null, detail: null });
  }
  if (input.classification !== null && input.classification.platform === "UNKNOWN") {
    push({ code: "UNKNOWN_PLATFORM", field: null, detail: null });
  }
  if (!input.symbolInCatalog) {
    const symbol = input.fields.find((f) => f.field === "symbol" && f.normalizedValue !== null);
    if (symbol) {
      push({ code: "UNKNOWN_SYMBOL", field: "symbol", detail: symbol.normalizedValue });
    }
  }
  if (input.duplicateOf !== null) {
    push({ code: "POSSIBLE_DUPLICATE", field: null, detail: input.duplicateOf.recognitionId });
  }
  if (input.possibleTradeDuplicate !== null) {
    push({
      code: "POSSIBLE_TRADE_DUPLICATE",
      field: null,
      detail: input.possibleTradeDuplicate.tradeId,
    });
  }
  return issues;
}

// ── V2 §15 — deterministic quality score ─────────────────────────────────────

/** Documented weights — the score is explainable, not adjustable (V2 §15). */
export const QUALITY_SCORE_WEIGHTS = {
  fieldConfidence: 0.4,
  completeness: 0.25,
  validation: 0.2,
  consistency: 0.15,
} as const;

/** Per-INVALID-field penalty on the validation component. */
export const VALIDATION_PENALTY_PER_FIELD = 0.2;
/** Penalties on the consistency component (evidence disagreement). */
export const CONSISTENCY_PENALTY_DUPLICATE = 0.3;
export const CONSISTENCY_PENALTY_UNKNOWN = 0.3;

export interface QualityScoreInput {
  fields: readonly OcrExtractedField[];
  classification: OcrClassification | null;
  duplicateOf: { recognitionId: string } | null;
  /** Extraction profile — scopes the completeness component (defaults TRADE). */
  profile?: OcrExtractionProfile;
}

/**
 * Deterministic composite quality score (V2 §15). Bounded 0..1, explainable
 * through its components, reproducible (V2 §77: same input → same score).
 */
export function computeQualityScore(input: QualityScoreInput): OcrQualityScore | null {
  const readable = input.fields.filter((f) => f.validationStatus !== "MISSING");
  if (readable.length === 0) return null;

  const fieldConfidence =
    readable.reduce((total, field) => total + field.confidence, 0) / readable.length;

  const required = OCR_PROFILE_REQUIRED_FIELD_KEYS[input.profile ?? "TRADE_SUMMARY"];
  const completeness =
    required.filter((key) =>
      input.fields.some((f) => f.field === key && f.normalizedValue !== null),
    ).length / required.length;

  const invalidCount = input.fields.filter((f) => f.validationStatus === "INVALID").length;
  const validation = Math.max(0, 1 - invalidCount * VALIDATION_PENALTY_PER_FIELD);

  let consistency = 1;
  if (input.duplicateOf !== null) consistency -= CONSISTENCY_PENALTY_DUPLICATE;
  if (input.classification === null || input.classification.type === "UNKNOWN") {
    consistency -= CONSISTENCY_PENALTY_UNKNOWN;
  }
  consistency = Math.max(0, consistency);

  const score =
    QUALITY_SCORE_WEIGHTS.fieldConfidence * fieldConfidence +
    QUALITY_SCORE_WEIGHTS.completeness * completeness +
    QUALITY_SCORE_WEIGHTS.validation * validation +
    QUALITY_SCORE_WEIGHTS.consistency * consistency;

  return {
    score: round3(score),
    components: {
      fieldConfidence: round3(fieldConfidence),
      completeness: round3(completeness),
      validation: round3(validation),
      consistency: round3(consistency),
    },
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ── V2 §23 — trade timeline (derived chronology) ─────────────────────────────

export interface TimelineInput {
  fields: readonly OcrExtractedField[];
  uploadedAt: string | null;
  confirmedAt: string | null;
}

/**
 * Deterministic chronology from recognized timestamps + lifecycle facts
 * (V2 §23). Entries without evidence are OMITTED — a missing timestamp is
 * never invented (§20/§23). Wall-clock stamps keep their canonical form
 * (no timezone conversion, §16).
 */
export function buildRecognitionTimeline(input: TimelineInput): OcrTimelineEntry[] {
  const timeline: OcrTimelineEntry[] = [];
  const byKey = new Map(input.fields.map((f) => [f.field, f]));
  const open = byKey.get("openTime");
  const close = byKey.get("closeTime");
  if (open?.normalizedValue) {
    timeline.push({ kind: "OPEN_TIME", at: open.normalizedValue, raw: open.rawValue });
  }
  if (close?.normalizedValue) {
    timeline.push({ kind: "CLOSE_TIME", at: close.normalizedValue, raw: close.rawValue });
  }
  if (input.uploadedAt) {
    timeline.push({ kind: "UPLOADED", at: input.uploadedAt, raw: null });
  }
  if (input.confirmedAt) {
    timeline.push({ kind: "CONFIRMED", at: input.confirmedAt, raw: null });
  }
  return timeline.slice(0, 16);
}

// ── V2 §4 — trade duplicate evidence (pure decision, DB lookup is the caller's) ─

export interface TradeDuplicateCandidateValues {
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: string | null;
  /** Timezone-unknown wall clock (canonical) or null — §16. */
  openTime: string | null;
}

export interface TradeDuplicateExistingValues {
  entryPrice: string | null;
  /** ISO instant of the existing trade's entry. */
  entryAt: string | null;
}

/** ±48h window — tolerant to the ≤14h timezone spread of wall-clock stamps. */
export const TRADE_DUPLICATE_TIME_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Evidence comparison (pure): symbol + direction are the PREREQUISITES
 * (both must match — compared by the caller before calling); each further
 * agreement adds an evidence token. The caller flags a duplicate when at
 * least ONE further evidence matches (V2 §4: "different screenshots
 * representing the same trade").
 */
export function tradeDuplicateEvidence(
  candidate: TradeDuplicateCandidateValues,
  existing: TradeDuplicateExistingValues,
): OcrTradeDuplicateEvidence[] {
  const evidence: OcrTradeDuplicateEvidence[] = [];
  if (
    candidate.entryPrice !== null &&
    existing.entryPrice !== null &&
    new Prisma.Decimal(candidate.entryPrice).equals(new Prisma.Decimal(existing.entryPrice))
  ) {
    evidence.push("ENTRY_PRICE");
  }
  if (candidate.openTime !== null && existing.entryAt !== null) {
    // Wall clock vs instant: parse the wall clock as if UTC (§16 — an
    // assumption ONLY inside a ±48h window, never a persisted conversion).
    const candidateMs = Date.parse(`${candidate.openTime}Z`);
    const existingMs = Date.parse(existing.entryAt);
    if (
      !Number.isNaN(candidateMs) &&
      !Number.isNaN(existingMs) &&
      Math.abs(candidateMs - existingMs) <= TRADE_DUPLICATE_TIME_WINDOW_MS
    ) {
      evidence.push("ENTRY_TIME");
    }
  }
  return evidence;
}
