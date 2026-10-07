"use client";

import type { OcrConfidenceBand, OcrExtractedField, OcrRecognitionStatus } from "@cosmoz/shared";

import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * Import & Recognition — centralized feature model (PROMPT 3 §16/§22/§64).
 *
 * Everything the views need to agree on lives here: the wizard steps, the
 * processing-stage timeline (display only — the pipeline itself advances
 * server-side), status → stamp mapping, per-field validation rules and the
 * financial formatting rules. The wire contract is @cosmoz/shared's OCR
 * schema; these are the VIEW models on top of it.
 */

// ── Wizard steps (§4 workflow) ──────────────────────────────────────────────

export type RecognitionStep =
  | "overview"
  | "configure"
  | "processing"
  | "result"
  | "review"
  | "success";

export const STEP_INDEX: Record<Exclude<RecognitionStep, "overview">, number> = {
  configure: 1,
  processing: 1,
  result: 2,
  review: 3,
  success: 4,
};

// ── Processing stages (§15/§16 — display timeline) ──────────────────────────

/**
 * The stages the OCR orchestrator will report (UPLOADING → … → COMPLETED).
 * The mock advances the real job server-side; the UI derives WHERE in the
 * timeline a job is from its status + elapsed wall-clock, so a backend that
 * later emits real progress events only changes this mapper.
 */
export type ProgressStage = "uploading" | "preprocessing" | "ocr" | "classification" | "extraction" | "normalization" | "done";

/** Stage boundaries in ms since job creation (must mirror the mock pipeline). */
export const STAGE_TIMELINE_MS: Array<{ stage: ProgressStage; at: number }> = [
  { stage: "uploading", at: 0 },
  { stage: "preprocessing", at: 400 },
  { stage: "ocr", at: 1_000 },
  { stage: "classification", at: 1_900 },
  { stage: "extraction", at: 2_600 },
  { stage: "normalization", at: 3_400 },
  { stage: "done", at: 4_500 },
];

export function stageFromElapsed(elapsedMs: number): ProgressStage {
  let current: ProgressStage = "uploading";
  for (const entry of STAGE_TIMELINE_MS) {
    if (elapsedMs >= entry.at) current = entry.stage;
  }
  return current;
}

// ── Status → visual language (Le Registre: outcomes get stamped) ────────────

export type StampTone = "win" | "loss" | "warn" | "ink" | "accent";

export function statusStamp(status: OcrRecognitionStatus): { tone: StampTone; labelKey: keyof RecognitionDict["statuses"] } {
  switch (status) {
    case "QUEUED":
      return { tone: "ink", labelKey: "QUEUED" };
    case "PROCESSING":
      return { tone: "accent", labelKey: "PROCESSING" };
    case "REVIEW_REQUIRED":
      return { tone: "warn", labelKey: "REVIEW_REQUIRED" };
    case "CONFIRMED":
      return { tone: "win", labelKey: "CONFIRMED" };
    case "FAILED":
      return { tone: "loss", labelKey: "FAILED" };
  }
}

export function confidenceStamp(band: OcrConfidenceBand): { tone: StampTone; labelKey: keyof RecognitionDict["result"]["bands"] } {
  switch (band) {
    case "HIGH":
      return { tone: "win", labelKey: "HIGH" };
    case "MEDIUM":
      return { tone: "ink", labelKey: "MEDIUM" };
    case "LOW":
      return { tone: "warn", labelKey: "LOW" };
    case "UNKNOWN":
      return { tone: "loss", labelKey: "UNKNOWN" };
  }
}

// ── Field model (§19/§20) ───────────────────────────────────────────────────

/**
 * The field groups of the trade-draft review (§24). Order is presentation
 * order; the review sections mirror the trade form.
 */
export const FIELD_ORDER = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profit",
  "openTime",
  "closeTime",
] as const satisfies readonly string[];

export type FieldKey = (typeof FIELD_ORDER)[number];

export const DRAFT_SECTIONS: Array<{
  titleKey: keyof RecognitionDict["draft"]["sections"];
  fields: readonly FieldKey[];
}> = [
  { titleKey: "basic", fields: ["symbol", "direction"] },
  { titleKey: "execution", fields: ["entryPrice", "exitPrice", "volume"] },
  { titleKey: "risk", fields: ["stopLoss", "takeProfit"] },
  { titleKey: "result", fields: ["profit"] },
  { titleKey: "timing", fields: ["openTime", "closeTime"] },
];

/** Whether a field needs user attention (never silently trusted, §20). */
export function needsReview(field: OcrExtractedField): boolean {
  return field.validationStatus !== "VALID" || field.confidenceBand === "LOW" || field.warnings.length > 0;
}

export function isMissing(field: OcrExtractedField): boolean {
  return field.validationStatus === "MISSING" || field.normalizedValue === null;
}

// ── Per-field validation (§22 — Zod-grade rules, centralized) ───────────────

export type FieldValidation =
  | { ok: true; value: string }
  | { ok: false; messageKey: "invalid"; message: string };

const DECIMAL_FIELDS = new Set<FieldKey>(["volume", "entryPrice", "exitPrice", "stopLoss", "takeProfit", "profit"]);
const DATETIME_FIELDS = new Set<FieldKey>(["openTime", "closeTime"]);
const POSITIVE_FIELDS = new Set<FieldKey>(["volume"]);

/**
 * Client-side validation for edited values. The API re-validates with the
 * same domain rules on confirm — this is the immediate feedback layer, not
 * the authority (financial data never trusts `if (!value)`, §22).
 */
export function validateFieldValue(field: FieldKey, raw: string): FieldValidation {
  const value = raw.trim();
  if (value === "") {
    // Clearing a value is legitimate (null clears, contract §21).
    return { ok: true, value: "" };
  }
  if (field === "direction") {
    const upper = value.toUpperCase();
    if (upper !== "BUY" && upper !== "SELL") {
      return { ok: false, messageKey: "invalid", message: "BUY or SELL" };
    }
    return { ok: true, value: upper };
  }
  if (field === "symbol") {
    const symbol = value.toUpperCase();
    if (!/^[A-Z0-9._-]{3,20}$/.test(symbol)) {
      return { ok: false, messageKey: "invalid", message: "3–20 characters — letters, digits, . _ -" };
    }
    return { ok: true, value: symbol };
  }
  if (DECIMAL_FIELDS.has(field)) {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
      return { ok: false, messageKey: "invalid", message: "A decimal number — e.g. 2645.32" };
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
      return { ok: false, messageKey: "invalid", message: "A decimal number — e.g. 2645.32" };
    }
    if (POSITIVE_FIELDS.has(field) && numeric <= 0) {
      return { ok: false, messageKey: "invalid", message: "Volume must be positive" };
    }
    return { ok: true, value: normalized };
  }
  if (DATETIME_FIELDS.has(field)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, messageKey: "invalid", message: "A valid date and time" };
    }
    return { ok: true, value: parsed.toISOString() };
  }
  return { ok: true, value };
}

// ── Financial + temporal display (§47/§48 — exact, centralized) ─────────────

/**
 * Financial values travel as decimal strings and are displayed exactly —
 * 2645.32 never loses precision (§47). Readable thousands grouping with the
 * original decimals preserved; sign is data.
 */
export function formatFinancial(value: string | null): string {
  if (value === null || value.trim() === "") return "";
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return value;
  const [integer, decimals] = normalized.split(".");
  const sign = integer.startsWith("-") || integer.startsWith("+") ? integer[0] : "";
  const digits = sign ? integer.slice(1) : integer;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const signForDisplay = sign === "+" ? "+" : sign;
  return `${signForDisplay}${grouped}${decimals ? `.${decimals}` : ""}`;
}

/** P&L semantic ink — the ONE colored numeral of its row (Le Registre #3). */
export function profitTone(value: string | null): "profit" | "loss" | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  if (numeric > 0) return "profit";
  if (numeric < 0) return "loss";
  return null;
}

/** Extracted timestamps display in the user's locale, minute precision (§48). */
export function formatExtractedTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Relative "created" labels for history rows (client clock is fine here). */
export function formatRelative(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

/** Best-effort platform label — V2 §18: prefer the detected platform field
 * (sidecar v3 emits MT5/MT4/CTRADER/...), fall back to the legacy type. */
export function platformLabel(
  dict: RecognitionDict,
  classification: { type: string; platform?: string | null } | null,
): string {
  if (!classification) return dict.settings.platformAuto;
  switch (classification.platform) {
    case "MT5":
      return dict.settings.platformMt5;
    case "MT4":
      return dict.settings.platformMt4;
    case "TRADINGVIEW":
      return dict.settings.platformTradingview;
    case "CTRADER":
      return dict.settings.platformCtrader;
    case "NINJATRADER":
      return dict.settings.platformNinjatrader;
    case "INTERACTIVE_BROKERS":
      return dict.settings.platformIbkr;
    case "DERIV":
      return dict.settings.platformDeriv;
  }
  if (classification.type === "UNKNOWN") return dict.settings.platformAuto;
  if (classification.type === "MT5_TRADE") return dict.settings.platformMt5;
  if (classification.type === "TRADINGVIEW_CHART") return dict.settings.platformTradingview;
  return dict.settings.platformOther;
}

/** Mean confidence over readable fields — the history "Confidence" column. */
export function recognitionConfidence(fields: readonly OcrExtractedField[]): number | null {
  const readable = fields.filter((field) => field.validationStatus !== "MISSING");
  if (readable.length === 0) return null;
  const sum = readable.reduce((total, field) => total + field.confidence, 0);
  return Math.round((sum / readable.length) * 100);
}

// ── Upload constraints (reused limits — §11, no arbitrary hardcodes) ────────

/** Mirrors ocrCreateInputSchema's 8 400 000-char data-URL ceiling ≈ 6 MB decoded. */
export const UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
/** PDF statements (engine quality §4.3) ride the same data-URL ceiling. */
export const ACCEPTED_MIMES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.pdf";

export function isPdfFile(file: { type: string; name: string }): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Human storage size for the retention indicator (engine quality §4.2). */
export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
