/**
 * Recognition constants — centralized limits, field metadata and derived
 * helpers (spec §16 "Centralize these values", §11 file-size policy).
 *
 * Upload budget: the project has NO standalone upload-size config; the
 * closest global contract is the shared screenshot data-URL schema
 * (`addScreenshotInputSchema`, max 8_000_000 chars ≈ 6 MB of binary once
 * base64-inflated). The recognition uploader aligns with it instead of
 * inventing an arbitrary limit.
 */

import type {
  ConfidenceLevel,
  RecognitionFieldKey,
  RecognitionFieldKind,
  RecognitionFieldStatus,
  RecognitionJob,
  RecognitionMode,
  RecognitionPlatform,
} from "./types";

// ── Upload constraints (spec §11) ────────────────────────────────────────────

export const RECOGNITION_ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const RECOGNITION_ACCEPTED_EXTENSIONS = ".png,.jpg,.jpeg,.webp";

/** Aligned with the shared screenshot data-URL budget (see header). */
export const RECOGNITION_MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

// ── Confidence bands (spec §18) ──────────────────────────────────────────────

export const CONFIDENCE_HIGH_MIN = 90;
export const CONFIDENCE_MEDIUM_MIN = 70;

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH_MIN) return "HIGH";
  if (score >= CONFIDENCE_MEDIUM_MIN) return "MEDIUM";
  return "LOW";
}

// ── Field metadata (spec §19/§21) ────────────────────────────────────────────

/** Editor kind per recognized field — drives the inline editor + validation. */
export const RECOGNITION_FIELD_KINDS: Record<RecognitionFieldKey, RecognitionFieldKind> = {
  platform: "text",
  symbol: "text",
  direction: "direction",
  volume: "decimal",
  entryPrice: "decimal",
  exitPrice: "decimal",
  stopLoss: "decimal",
  takeProfit: "decimal",
  pnl: "signedDecimal",
  currency: "text",
  openTime: "datetime",
  closeTime: "datetime",
  positionId: "identifier",
  orderId: "identifier",
  accountBalance: "decimal",
  accountEquity: "decimal",
};

/** Fields that make it into the trade draft (identifiers/balance stay out). */
export const DRAFT_FIELD_KEYS: readonly RecognitionFieldKey[] = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "pnl",
  "currency",
  "openTime",
  "closeTime",
];

/** Primary fields shown first in the result view (spec §17). */
export const PRIMARY_FIELD_KEYS: readonly RecognitionFieldKey[] = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "pnl",
];

/** Secondary fields (timing, account context) — collapsible group. */
export const SECONDARY_FIELD_KEYS: readonly RecognitionFieldKey[] = [
  "platform",
  "currency",
  "openTime",
  "closeTime",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
];

// ── Recognition options (spec §14) ───────────────────────────────────────────

/** Platform options; V1 supports AUTO + MT5 — the rest ship disabled. */
export const RECOGNITION_PLATFORM_OPTIONS: readonly {
  value: RecognitionPlatform;
  enabled: boolean;
}[] = [
  { value: "AUTO", enabled: true },
  { value: "MT5", enabled: true },
  { value: "TRADINGVIEW", enabled: false },
  { value: "CTRADER", enabled: false },
  { value: "OTHER", enabled: false },
];

/** Mode options; V1 supports AUTOMATIC only — the rest ship disabled. */
export const RECOGNITION_MODE_OPTIONS: readonly {
  value: RecognitionMode;
  enabled: boolean;
}[] = [
  { value: "AUTOMATIC", enabled: true },
  { value: "TRADE_DETAILS", enabled: false },
  { value: "ACCOUNT_POSITION", enabled: false },
  { value: "CHART_ANALYSIS", enabled: false },
];

// ── Derived job aggregates (history, stats, details) ─────────────────────────

/** Average confidence across every read field of every detected trade. */
export function jobAverageConfidence(job: RecognitionJob): number | null {
  const scores: number[] = [];
  for (const trade of job.result?.trades ?? []) {
    for (const field of trade.fields) {
      if (field.confidence !== null) scores.push(field.confidence);
    }
  }
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, n) => acc + n, 0);
  return Math.round(sum / scores.length);
}

/**
 * "Needs review" — the job completed but something demands human eyes:
 * warnings present, any LOW-confidence field, or key fields missing
 * (spec §26/§30).
 */
export function jobNeedsReview(job: RecognitionJob): boolean {
  if (job.status !== "COMPLETED" || !job.result) return false;
  if (job.result.warnings.length > 0) return true;
  return (job.result.trades ?? []).some((trade) =>
    trade.fields.some(
      (field) =>
        field.status !== "NOT_APPLICABLE" &&
        (field.status === "NOT_FOUND" ||
          (field.confidence !== null && confidenceLevel(field.confidence) === "LOW")),
    ),
  );
}

/** Number of trades the job detected (history column, spec §30). */
export function jobTradeCount(job: RecognitionJob): number {
  return job.result?.trades.length ?? 0;
}

/**
 * Planned risk/reward from SL/TP around the entry — "if calculable"
 * (spec §24). Returns null when SL or TP is missing/degenerate.
 */
export function plannedRiskReward(
  entry: number,
  stopLoss: number | null,
  takeProfit: number | null,
): number | null {
  if (stopLoss === null || takeProfit === null) return null;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (risk <= 0) return null;
  return reward / risk;
}

/** Human label for a field status — testids/assertions stay in the UI layer. */
export const FIELD_STATUS_SET: readonly RecognitionFieldStatus[] = [
  "FOUND",
  "NOT_FOUND",
  "UNCERTAIN",
  "NOT_APPLICABLE",
];
