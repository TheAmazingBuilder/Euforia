/**
 * OCR & Trade Recognition — frontend contract (Prompt 3 §16, §19, §22, §42).
 *
 * Pure, dependency-free module: types, enums, constants, Zod schemas and
 * validation helpers shared by the UI (components/ocr), the service hooks
 * (lib/api/queries/recognition) and the mock adapter (mocks/ocr-engine +
 * mocks/handlers/recognition). No React, no fetch, no mocks imports —
 * deterministic and unit-testable in plain node.
 *
 * The future NestJS contract mirrors these shapes 1:1; the frontend never
 * talks to FastAPI (§3/§68) and never assumes the OCR engine lives here.
 */

import { z } from "zod";

// ── Enums (§16/§19 — centralized, unions over arbitrary strings) ────────────

export const RECOGNITION_JOB_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type RecognitionJobStatus = (typeof RECOGNITION_JOB_STATUSES)[number];

export const RECOGNITION_STAGES = [
  "UPLOADING",
  "PREPROCESSING",
  "OCR",
  "CLASSIFICATION",
  "EXTRACTION",
  "NORMALIZATION",
  "COMPLETED",
] as const;
export type RecognitionStage = (typeof RECOGNITION_STAGES)[number];

export const RECOGNITION_FIELD_STATES = [
  "FOUND",
  "NOT_FOUND",
  "UNCERTAIN",
  "NOT_APPLICABLE",
] as const;
export type RecognitionFieldState = (typeof RECOGNITION_FIELD_STATES)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const RECOGNITION_PLATFORMS = [
  "AUTO",
  "METATRADER_5",
  "TRADINGVIEW",
  "CTRADER",
  "OTHER",
] as const;
export type RecognitionPlatform = (typeof RECOGNITION_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<RecognitionPlatform, string> = {
  AUTO: "Auto Detect",
  METATRADER_5: "MetaTrader 5",
  TRADINGVIEW: "TradingView",
  CTRADER: "cTrader",
  OTHER: "Other",
};

/**
 * Recognition modes (§14). V1 ships AUTOMATIC only — every other entry is
 * future functionality and MUST be rendered disabled / "coming soon", never
 * pretending to work.
 */
export const RECOGNITION_MODES = [
  "AUTOMATIC",
  "TRADE_DETAILS",
  "ACCOUNT_POSITION",
  "CHART_ANALYSIS",
] as const;
export type RecognitionMode = (typeof RECOGNITION_MODES)[number];

export const MODE_LABELS: Record<RecognitionMode, string> = {
  AUTOMATIC: "Automatic",
  TRADE_DETAILS: "Trade Details",
  ACCOUNT_POSITION: "Account / Position",
  CHART_ANALYSIS: "Chart Analysis",
};

/** The only mode the V1 pipeline actually supports (§14). */
export const SUPPORTED_RECOGNITION_MODE: RecognitionMode = "AUTOMATIC";

/** Recognizable field keys (§19 — extensible; V1 set). */
export const RECOGNITION_FIELD_KEYS = [
  "platform",
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
  "currency",
  "openTime",
  "closeTime",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
] as const;
export type RecognitionFieldKey = (typeof RECOGNITION_FIELD_KEYS)[number];

export const FIELD_LABELS: Record<RecognitionFieldKey, string> = {
  platform: "Platform",
  symbol: "Symbol",
  direction: "Direction",
  volume: "Volume",
  entryPrice: "Entry Price",
  exitPrice: "Exit Price",
  stopLoss: "Stop Loss",
  takeProfit: "Take Profit",
  profitLoss: "P&L",
  currency: "Currency",
  openTime: "Open Time",
  closeTime: "Close Time",
  positionId: "Position ID",
  orderId: "Order ID",
  accountBalance: "Account Balance",
  accountEquity: "Account Equity",
};

/** Field value types drive inline-edit validation (§21). */
export type RecognitionFieldType =
  | "symbol"
  | "direction"
  | "volume"
  | "price"
  | "pnl"
  | "currency"
  | "datetime"
  | "identifier";

export const FIELD_TYPES: Record<RecognitionFieldKey, RecognitionFieldType> = {
  platform: "identifier",
  symbol: "symbol",
  direction: "direction",
  volume: "volume",
  entryPrice: "price",
  exitPrice: "price",
  stopLoss: "price",
  takeProfit: "price",
  profitLoss: "pnl",
  currency: "currency",
  openTime: "datetime",
  closeTime: "datetime",
  positionId: "identifier",
  orderId: "identifier",
  accountBalance: "pnl",
  accountEquity: "pnl",
};

/** Fields shown first in the Detected Trade panel, in this order. */
export const PRIMARY_FIELD_ORDER: RecognitionFieldKey[] = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
];

/** Secondary fields (identifiers, timing, account context) below the fold. */
export const SECONDARY_FIELD_ORDER: RecognitionFieldKey[] = [
  "currency",
  "openTime",
  "closeTime",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
];

// ── Upload constraints (§11) ────────────────────────────────────────────────

/** PNG / JPG / JPEG / WEBP (§11) + application/pdf (V2). */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
export const ACCEPTED_PDF_MIME = "application/pdf" as const;
export const ACCEPTED_PDF_EXTENSION = ".pdf" as const;
export const ACCEPTED_MEDIA_MIME_TYPES = [...ACCEPTED_IMAGE_TYPES, ACCEPTED_PDF_MIME] as const;
export const ACCEPTED_MEDIA_EXTENSIONS = [...ACCEPTED_EXTENSIONS, ACCEPTED_PDF_EXTENSION] as const;

/**
 * No global file-size configuration exists in this repository (audited) —
 * these module-level constants are therefore the single source of truth for
 * the recognition feature (§11 allows a local limit when no centralized
 * config is present). PDF statements get a larger budget: multi-page
 * history exports weigh more than a single screenshot.
 */
export const OCR_MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
export const OCR_MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadValidationError =
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "PDF_TOO_MANY_PAGES";

export function validateScreenshotFile(file: {
  type: string;
  size: number;
  name: string;
}): UploadValidationError | null {
  if (file.size <= 0) return "EMPTY_FILE";
  const isPdf =
    file.type === ACCEPTED_PDF_MIME ||
    file.name.toLowerCase().endsWith(ACCEPTED_PDF_EXTENSION);
  if (isPdf) {
    if (file.size > OCR_MAX_PDF_BYTES) return "FILE_TOO_LARGE";
    return null;
  }
  const extensionOk = ACCEPTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  );
  const mimeOk = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  if (!mimeOk && !extensionOk) return "UNSUPPORTED_FORMAT";
  if (file.size > OCR_MAX_SCREENSHOT_BYTES) return "FILE_TOO_LARGE";
  return null;
}

export const UPLOAD_ERROR_MESSAGES: Record<UploadValidationError, string> = {
  UNSUPPORTED_FORMAT:
    "This file format isn't supported. Use PNG, JPG, WEBP or a PDF statement.",
  FILE_TOO_LARGE:
    "This file is too large. Screenshots stay under 10 MB and PDFs under 25 MB.",
  EMPTY_FILE: "This file is empty. Choose a valid screenshot.",
  PDF_TOO_MANY_PAGES:
    "This PDF has too many pages. Statements up to 20 pages are supported.",
};

// ── Source regions (§25 — optional, model must not prevent them) ────────────

/**
 * Normalized (0..1) bounding box on the screenshot — future FastAPI payload
 * shape kept intact so the highlight-on-screenshot UX can light up the
 * moment real regions arrive.
 */
export interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Recognized field (§18/§19/§20) ──────────────────────────────────────────

export interface RecognizedField {
  key: RecognitionFieldKey;
  /** Raw recognized value — null when NOT_FOUND. */
  value: string | null;
  state: RecognitionFieldState;
  /** 0–100, null when the field has no readable signal. */
  confidence: number | null;
  /** Present when the recognizer could locate the value on the image. */
  sourceRegion?: SourceRegion;
  /** Set once the user corrects the value inline (§21). */
  editedByUser?: boolean;
}

export function confidenceLevel(confidence: number | null): ConfidenceLevel | null {
  if (confidence === null) return null;
  if (confidence >= 85) return "HIGH";
  if (confidence >= 65) return "MEDIUM";
  return "LOW";
}

// ── Warnings (§26) ──────────────────────────────────────────────────────────

export const RECOGNITION_WARNING_CODES = [
  "LOW_CONFIDENCE_FIELD",
  "FIELD_NOT_DETECTED",
  "SCREENSHOT_INCOMPLETE",
  "MULTIPLE_TRADES_POSSIBLE",
  "POSITION_SIZE_UNCERTAIN",
  "SENSITIVE_INFO_POSSIBLE",
  // V3 issue taxonomy (spec §29) — deterministic codes only.
  "UNKNOWN_PLATFORM",
  "UNKNOWN_SCREEN_TYPE",
  "UNKNOWN_SYMBOL",
  "AMBIGUOUS_DIRECTION",
  "AMBIGUOUS_NUMBER",
  "INVALID_PRICE_RELATIONSHIP",
  "MISSING_REQUIRED_FIELD",
  "INVALID_TIMESTAMP",
  "CONFLICTING_FIELDS",
  "UNSUPPORTED_SCREENSHOT",
  "POSSIBLE_DUPLICATE",
  "POSSIBLE_TRADE_DUPLICATE",
] as const;
export type RecognitionWarningCode = (typeof RECOGNITION_WARNING_CODES)[number];

export interface RecognitionWarning {
  code: RecognitionWarningCode;
  message: string;
  /** The field the warning is attached to, when applicable (§26). */
  field?: RecognitionFieldKey;
}

// ── Recognized trade / result (§17/§27) ─────────────────────────────────────

export interface RecognizedTrade {
  /** 1-based index — the model supports multiple trades (§27). */
  index: number;
  fields: Record<RecognitionFieldKey, RecognizedField>;
  /** PDF imports (V2): the 0-based page this trade was read from. */
  pageIndex?: number;
}

export interface RecognitionResult {
  jobId: string;
  /** Platform the recognizer identified (or the user-forced platform). */
  detectedPlatform: Exclude<RecognitionPlatform, "AUTO">;
  platformConfidence: number | null;
  /** V1 returns exactly one trade; the array keeps §27 possible. */
  trades: RecognizedTrade[];
  warnings: RecognitionWarning[];
  overallConfidence: number | null;
  /** V3 deterministic quality score with components (spec §28). */
  quality?: RecognitionQuality;
  /** V3 recognition versioning (spec §44). */
  versions?: RecognitionVersions;
  processingMs: number | null;
  completedAt: string | null;
}

// ── Screenshot + job model (§11/§16) ────────────────────────────────────────

export interface RecognitionScreenshot {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  /** PDF-only (V2) — number of pages counted at the boundary. */
  documentPageCount?: number;
}

export interface RecognitionJob {
  id: string;
  ownerId: string;
  status: RecognitionJobStatus;
  stage: RecognitionStage;
  /** 0–100 while PROCESSING; 100 once terminal. */
  progress: number;
  platform: RecognitionPlatform;
  mode: RecognitionMode;
  screenshot: RecognitionScreenshot;
  createdAt: string;
  completedAt: string | null;
  /** Wall-clock processing duration once terminal, else null. */
  processingMs: number | null;
  error: RecognitionJobError | null;
  /** Set when the draft was confirmed and imported into the journal (§28). */
  importedTradeId: string | null;
  /** V2 multi-trade — every canonical trade created by this job, in order. */
  importedTradeIds?: string[];
  hasWarnings: boolean;
}

export interface RecognitionJobError {
  /** Machine-readable code — maps to a user-facing category (§32). */
  code: RecognitionErrorCode;
  message: string;
}

export const RECOGNITION_ERROR_CODES = [
  "RECOGNITION_FAILED",
  "UNSUPPORTED_IMAGE",
  "UPLOAD_FAILED",
  "NETWORK_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;
export type RecognitionErrorCode = (typeof RECOGNITION_ERROR_CODES)[number];

/** §32 — distinct, user-facing error copy. Never raw backend errors. */
export const RECOGNITION_ERROR_MESSAGES: Record<RecognitionErrorCode, string> = {
  RECOGNITION_FAILED:
    "We couldn't recognize enough information from this screenshot. Try a sharper, full-window capture.",
  UNSUPPORTED_IMAGE:
    "This image format isn't supported. Use PNG, JPG or WEBP.",
  UPLOAD_FAILED:
    "We couldn't upload this file. Check your connection and try again.",
  NETWORK_ERROR: "Connection lost. Check your network and try again.",
  SERVICE_UNAVAILABLE:
    "Recognition service temporarily unavailable. Give it a moment and try again.",
};

// ── History (§30) ───────────────────────────────────────────────────────────

export interface RecognitionHistoryItem {
  id: string;
  status: RecognitionJobStatus;
  platform: RecognitionPlatform;
  detectedPlatform: Exclude<RecognitionPlatform, "AUTO"> | null;
  screenshotName: string;
  sizeBytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** PDF-only page count (V2) — absent for images. */
  documentPageCount?: number;
  /** Count of recognized trades (V1: 0 or 1). */
  detectedTradeCount: number;
  overallConfidence: number | null;
  hasWarnings: boolean;
  error: RecognitionJobError | null;
  createdAt: string;
  completedAt: string | null;
  processingMs: number | null;
  importedTradeId: string | null;
  /** V3 history filter facets (spec §62) — optional for V1/V2 compat. */
  correctedCount?: number;
  duplicateWarned?: boolean;
  qualityOverall?: number | null;
  /** V3 — the underlying asset id (collections add-flow, spec §41). */
  screenshotId?: string;
}

// ── Trade draft (§23/§24) ───────────────────────────────────────────────────

export const TRADE_DIRECTIONS = ["BUY", "SELL"] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

/**
 * Draft input — every field user-editable. Prices are strings in the form
 * layer (exact decimals, no float drift) and parsed by the schema below.
 */
export interface TradeDraftInput {
  symbol: string;
  direction: TradeDirection;
  platform: Exclude<RecognitionPlatform, "AUTO">;
  entryPrice: string | null;
  exitPrice: string | null;
  volume: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  profitLoss: string | null;
  currency: string | null;
  openTime: string | null;
  closeTime: string | null;
  positionId: string | null;
  orderId: string | null;
}

export interface TradeDraft extends TradeDraftInput {
  jobId: string;
  updatedAt: string;
}

// ── Draft validation (§22 — Zod + cross-field coherence) ────────────────────

const PRICE_MAX_DECIMALS = 6;

const decimalPattern = /^-?\d+(\.\d+)?$/;

export const tradeDraftSchema = z.object({
  jobId: z.string().min(1),
  updatedAt: z.string().min(1),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,12}$/, "Symbol must be 3–12 letters or digits (e.g. XAUUSD)."),
  direction: z.enum(TRADE_DIRECTIONS),
  platform: z.enum(["METATRADER_5", "TRADINGVIEW", "CTRADER", "OTHER"]),
  entryPrice: nullableDecimal("Entry price"),
  exitPrice: nullableDecimal("Exit price"),
  volume: nullableDecimal("Volume"),
  stopLoss: nullableDecimal("Stop loss"),
  takeProfit: nullableDecimal("Take profit"),
  profitLoss: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim().replace(/^\+/, "")))
    .refine(
      (v) => v === null || (decimalPattern.test(v) && Math.abs(Number(v)) < 1e12),
      "P&L must be a decimal amount (e.g. 146.80 or -52.10).",
    ),
  currency: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim().toUpperCase()))
    .refine(
      (v) => v === null || /^[A-Z]{3}$/.test(v),
      "Currency must be a 3-letter code (e.g. USD).",
    ),
  openTime: nullableDatetime("Open time"),
  closeTime: nullableDatetime("Close time"),
  positionId: nullableIdentifier("Position ID"),
  orderId: nullableIdentifier("Order ID"),
});

function nullableDecimal(label: string) {
  return z
    .union([z.string(), z.null()])
    .transform((v) =>
      v === null || v.trim() === "" ? null : v.trim().replace(/\s/g, "").replace(/^\+/, ""),
    )
    .refine(
      (v) => v === null || (decimalPattern.test(v) && Number(v) > 0),
      `${label} must be a positive decimal.`,
    )
    .refine(
      (v) => v === null || decimalPart(v).length <= PRICE_MAX_DECIMALS,
      `${label} supports at most ${PRICE_MAX_DECIMALS} decimals.`,
    );
}

function nullableDatetime(label: string) {
  return z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim()))
    .refine(
      (v) => v === null || !Number.isNaN(Date.parse(v)),
      `${label} is not a valid date.`,
    )
    .transform((v) => (v === null ? null : new Date(v).toISOString()));
}

function nullableIdentifier(label: string) {
  return z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim()))
    .refine(
      (v) => v === null || /^[A-Za-z0-9_-]{1,32}$/.test(v),
      `${label} must be 1–32 letters, digits, dashes or underscores.`,
    );
}

function decimalPart(v: string): string {
  const dot = v.indexOf(".");
  return dot === -1 ? "" : v.slice(dot + 1);
}

export type TradeDraftSchema = z.infer<typeof tradeDraftSchema>;

export interface DraftValidationIssue {
  field: keyof TradeDraftInput;
  message: string;
}

/**
 * Cross-field coherence rules (§22) applied after the per-field schema:
 * BUY → SL below entry, TP above entry; SELL mirrored; close after open.
 * Returns every violation, not just the first.
 */
export function validateDraftCoherence(
  draft: TradeDraftSchema,
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const entry = numOrNull(draft.entryPrice);
  const sl = numOrNull(draft.stopLoss);
  const tp = numOrNull(draft.takeProfit);

  if (entry !== null && sl !== null) {
    if (draft.direction === "BUY" && sl >= entry) {
      issues.push({
        field: "stopLoss",
        message: "For a BUY, the stop loss must sit below the entry price.",
      });
    }
    if (draft.direction === "SELL" && sl <= entry) {
      issues.push({
        field: "stopLoss",
        message: "For a SELL, the stop loss must sit above the entry price.",
      });
    }
  }
  if (entry !== null && tp !== null) {
    if (draft.direction === "BUY" && tp <= entry) {
      issues.push({
        field: "takeProfit",
        message: "For a BUY, the take profit must sit above the entry price.",
      });
    }
    if (draft.direction === "SELL" && tp >= entry) {
      issues.push({
        field: "takeProfit",
        message: "For a SELL, the take profit must sit below the entry price.",
      });
    }
  }
  if (draft.openTime !== null && draft.closeTime !== null) {
    if (Date.parse(draft.closeTime) <= Date.parse(draft.openTime)) {
      issues.push({
        field: "closeTime",
        message: "The close time must come after the open time.",
      });
    }
  }
  return issues;
}

/** Parses a validated draft (throws ZodError on invalid input). */
export function parseTradeDraft(
  input: TradeDraftInput & { jobId: string; updatedAt: string },
): TradeDraftSchema {
  return tradeDraftSchema.parse(input);
}

function numOrNull(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── Risk / reward for the review screen (§24 — derived, not stored) ─────────

export interface RiskRewardSummary {
  riskDistance: number | null;
  rewardDistance: number | null;
  ratio: number | null;
  label: string | null;
}

export function computeRiskReward(draft: {
  direction: TradeDirection;
  entryPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
}): RiskRewardSummary {
  const entry = numOrNull(draft.entryPrice);
  const sl = numOrNull(draft.stopLoss);
  const tp = numOrNull(draft.takeProfit);
  if (entry === null || sl === null || tp === null) {
    return { riskDistance: null, rewardDistance: null, ratio: null, label: null };
  }
  const riskDistance = draft.direction === "BUY" ? entry - sl : sl - entry;
  const rewardDistance = draft.direction === "BUY" ? tp - entry : entry - tp;
  if (riskDistance <= 0 || rewardDistance <= 0) {
    return { riskDistance, rewardDistance, ratio: null, label: null };
  }
  const ratio = rewardDistance / riskDistance;
  return {
    riskDistance,
    rewardDistance,
    ratio,
    label: `1 : ${ratio.toFixed(2).replace(/\.?0+$/, "")}`,
  };
}

// ── Processing steps (§15 — presentation mapping of the stage timeline) ─────

export interface ProcessingStepView {
  id: string;
  label: string;
  stages: RecognitionStage[];
}

export const PROCESSING_STEPS: ProcessingStepView[] = [
  { id: "uploaded", label: "Image uploaded", stages: ["UPLOADING"] },
  { id: "preprocessing", label: "Image preprocessing", stages: ["PREPROCESSING"] },
  { id: "reading", label: "Reading screenshot", stages: ["OCR"] },
  {
    id: "detecting",
    label: "Detecting trade fields",
    stages: ["CLASSIFICATION", "EXTRACTION"],
  },
  { id: "drafting", label: "Building trade draft", stages: ["NORMALIZATION"] },
];

export function stepStateForStage(
  stage: RecognitionStage,
  status: RecognitionJobStatus,
): Array<"done" | "current" | "pending"> {
  const currentStepIndex = PROCESSING_STEPS.findIndex((step) =>
    step.stages.includes(stage),
  );
  return PROCESSING_STEPS.map((step, index) => {
    if (status === "COMPLETED") return "done" as const;
    if (index < currentStepIndex) return "done" as const;
    if (index === currentStepIndex) {
      return status === "PROCESSING" || status === "PENDING"
        ? ("current" as const)
        : ("done" as const);
    }
    return "pending" as const;
  });
}

// ── Job → draft projection ──────────────────────────────────────────────────

/**
 * Projects the recognized fields of trade #tradeIndex into a draft input —
 * user corrections already applied (§23).
 */
export function draftInputFromResult(
  jobId: string,
  result: RecognitionResult,
  tradeIndex = 1,
): TradeDraftInput {
  const trade =
    result.trades.find((t) => t.index === tradeIndex) ?? result.trades[0];
  const pick = (key: RecognitionFieldKey): string | null => {
    const field = trade.fields[key];
    if (field === undefined) return null;
    if (field.state === "NOT_FOUND" || field.state === "NOT_APPLICABLE") return null;
    return field.value;
  };
  const directionRaw = pick("direction");
  return {
    symbol: pick("symbol") ?? "",
    direction: directionRaw === "SELL" ? "SELL" : "BUY",
    platform: result.detectedPlatform,
    entryPrice: pick("entryPrice"),
    exitPrice: pick("exitPrice"),
    volume: pick("volume"),
    stopLoss: pick("stopLoss"),
    takeProfit: pick("takeProfit"),
    profitLoss: pick("profitLoss"),
    currency: pick("currency"),
    openTime: pick("openTime"),
    closeTime: pick("closeTime"),
    positionId: pick("positionId"),
    orderId: pick("orderId"),
  };
}

// ── Request/response payloads (service boundary §39) ────────────────────────

export const uploadScreenshotInputSchema = z.object({
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(OCR_MAX_PDF_BYTES),
  mimeType: z.enum(ACCEPTED_MEDIA_MIME_TYPES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  documentPageCount: z.number().int().positive().max(20).optional(),
});

export type UploadScreenshotInput = z.infer<typeof uploadScreenshotInputSchema>;

export const createRecognitionJobInputSchema = z.object({
  screenshotId: z.string().min(1),
  platform: z.enum(RECOGNITION_PLATFORMS),
  mode: z
    .enum(RECOGNITION_MODES)
    .refine(
      (mode) => mode === SUPPORTED_RECOGNITION_MODE,
      "Only Automatic recognition is available in this version.",
    ),
});

export type CreateRecognitionJobInput = z.infer<typeof createRecognitionJobInputSchema>;

export const updateTradeDraftInputSchema = tradeDraftSchema.omit({
  jobId: true,
  updatedAt: true,
});

export type UpdateTradeDraftInput = z.infer<typeof updateTradeDraftInputSchema>;

// ── Analytics event names (§53 — emitted by the service since V2) ───────────

export const RECOGNITION_ANALYTICS_EVENTS = {
  uploadStarted: "recognition_upload_started",
  uploadCompleted: "recognition_upload_completed",
  duplicateWarned: "recognition_duplicate_warned",
  duplicateProcessed: "recognition_duplicate_processed",
  recognitionStarted: "recognition_started",
  recognitionCompleted: "recognition_completed",
  recognitionFailed: "recognition_failed",
  recognitionCancelled: "recognition_cancelled",
  reviewStarted: "recognition_review_started",
  fieldCorrected: "recognition_field_corrected",
  recropped: "recognition_recropped",
  importConfirmed: "recognition_import_confirmed",
  importCancelled: "recognition_import_cancelled",
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// OCR V2 wire additions — mirrored 1:1 from the shared contract
// (packages/shared/src/schemas/ocr.ts). Same shapes, frontend-friendly
// interfaces; the backend remains the validation authority.
// ═════════════════════════════════════════════════════════════════════════════

/** Perceptual duplicate verdict attached to an upload response (V2). */
export interface UploadDuplicateInfo {
  perceptualHash: string;
  hammingDistance: number;
  matchedAssetId: string;
  matchedUploadName: string;
  matchedUploadAt: string;
  latestJobId: string | null;
  importedTradeIds: string[];
}

export interface UploadScreenshotResponse {
  screenshot: RecognitionScreenshot;
  duplicate?: UploadDuplicateInfo | null;
}

/** Draft stored per trade index (V2 multi-trade). */
export interface TradeDraftWithIndex extends TradeDraft {
  tradeIndex: number;
}

export interface RecognitionDraftSlot {
  tradeIndex: number;
  draft: TradeDraftWithIndex | null;
}

/** POST …/confirm body (V2) — both fields optional (V1-compatible). */
export interface ConfirmImportInput {
  tradeIndexes?: number[];
  accountId?: string;
}

export interface ConfirmedTradeRef {
  tradeId: string;
  tradeIndex: number;
}

/** Normalized 0..1 rectangle on the original upload (V2 crop re-recognition). */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SuggestionSource = "CORRECTIONS_MEMORY" | "INSTRUMENT_CATALOG";

export interface RecognitionSuggestionValue {
  value: string;
  count: number;
  source: SuggestionSource;
}

export interface RecognitionSuggestion {
  field: RecognitionFieldKey;
  values: RecognitionSuggestionValue[];
}

export interface SymbolCandidate {
  symbol: string;
  name: string;
  assetClass: string;
}

/** V3 strategy/playbook deterministic match (spec §38–§40) — suggestion only. */
export interface RecognitionStrategyMatch {
  strategyId: string;
  name: string;
  /** 0..100 deterministic equality score. */
  confidence: number;
  reasons: string[];
}

export interface RecognitionSuggestionsResponse {
  suggestions: RecognitionSuggestion[];
  symbolCandidates: SymbolCandidate[];
  /** V3 — optional so V2 payloads stay valid. */
  strategyMatches?: RecognitionStrategyMatch[];
}

export interface RecognitionFunnel {
  uploads: number;
  jobs: number;
  completed: number;
  failed: number;
  cancelled: number;
  reviewStarted: number;
  confirmed: number;
  confirmedTrades: number;
}

export interface RecognitionFieldCorrectionStat {
  field: RecognitionFieldKey;
  corrected: number;
  total: number;
  /** 0..1 */
  rate: number;
}

export interface RecognitionAnalyticsResponse {
  windowDays: number;
  funnel: RecognitionFunnel;
  duplicates: { warnings: number; processed: number };
  corrections: {
    confirmedFields: number;
    correctedFields: number;
    byField: RecognitionFieldCorrectionStat[];
  };
  performance: {
    avgProcessingMs: number | null;
    avgOverallConfidence: number | null;
  };
  perDay: Array<{ date: string; uploads: number; confirmed: number }>;
}

export interface RecognitionStorageResponse {
  assetsCount: number;
  totalBytes: number;
  oldestUploadAt: string | null;
  /** Server retention in days; 0 = retention sweep disabled. */
  retentionDays: number;
  nextSweepAt: string | null;
}

/** SSE progress snapshot (live bridge only; the mocked build keeps polling). */
export interface RecognitionProgressEvent {
  jobId: string;
  status: RecognitionJobStatus;
  stage: RecognitionStage;
  progress: number;
  at: string;
  terminal: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// OCR V3 — multi-screenshot fusion (N → 1), timeline, collections,
// reprocessing, history filters, strategy matching. Additive only: every
// V1/V2 payload stays valid (master prompt §8/§89). Shapes mirror the shared
// @cosmoz/shared ocr schema 1:1.
// ═════════════════════════════════════════════════════════════════════════════

/** V3 deterministic per-recognition quality score (spec §28). */
export interface RecognitionQuality {
  overall: number;
  components: {
    textRecognition: number;
    fieldExtraction: number;
    tradingInterpretation: number;
    crossFieldValidation: number;
    /** Multi-screenshot agreement — null for single-image jobs. */
    consistency: number | null;
  };
}

/** V3 recognition versioning (spec §44) — reproducibility metadata. */
export interface RecognitionVersions {
  engine: string;
  pipeline: string;
  schema: string;
}

// ── Fusion evidence & conflicts (spec §14/§18/§31) ──────────────────────────

export const RECOGNITION_CORRELATION_KINDS = [
  "SYMBOL",
  "DIRECTION",
  "PLATFORM",
  "ACCOUNT",
  "POSITION_ID",
  "ORDER_ID",
  "TIMESTAMP_PROXIMITY",
  "SCREENSHOT_TYPE",
  "VOLUME",
] as const;
export type RecognitionCorrelationKind = (typeof RECOGNITION_CORRELATION_KINDS)[number];

export interface RecognitionCorrelationEvidence {
  kind: RecognitionCorrelationKind;
  /** 0..1 deterministic strength. */
  score: number;
  detail: string;
}

/** Conflicting field across members — every value preserved, user decides. */
export interface RecognitionConflict {
  field: RecognitionFieldKey;
  values: Array<{
    jobId: string;
    screenshotName: string;
    value: string;
    confidence: number | null;
  }>;
  /** Value the deterministic fusion selected (strongest evidence). */
  selectedJobId: string;
}

/** Deterministic chronology entry (spec §36/§61) — never invented. */
export interface RecognitionTimelineEntry {
  jobId: string;
  screenshotName: string;
  role: "ENTRY" | "POSITION" | "EXIT" | "ACCOUNT" | "CHART" | "UNSPECIFIED";
  at: string | null;
}

// ── Recognition groups (N screenshots → one trade draft) ───────────────────

export const RECOGNITION_GROUP_STATUSES = [
  "PROPOSED",
  "ACTIVE",
  "CONFIRMED",
  "DISCARDED",
] as const;
export type RecognitionGroupStatus = (typeof RECOGNITION_GROUP_STATUSES)[number];

export interface RecognitionGroupMember {
  jobId: string;
  status: RecognitionJobStatus;
  screenshotName: string;
  detectedPlatform: Exclude<RecognitionPlatform, "AUTO"> | null;
  screenshotType: string | null;
  /** Recognized trade index 1 of this member (the fusion input). */
  trade: RecognizedTrade | null;
  overallConfidence: number | null;
  uploadedAt: string;
}

export interface RecognitionGroup {
  id: string;
  ownerId: string;
  status: RecognitionGroupStatus;
  members: RecognitionGroupMember[];
  evidence: RecognitionCorrelationEvidence[];
  /** Aggregate 0..100 — the documented fusion confidence. */
  fusionConfidence: number;
  /** True when evidence is strong enough to auto-accept the grouping. */
  autoConfirmed: boolean;
  /** Fused, editable draft — null until the group becomes ACTIVE. */
  fusedDraft: TradeDraft | null;
  /** Which member job supplied each draft field (provenance, spec §35). */
  fieldOrigins?: Record<string, string>;
  conflicts: RecognitionConflict[];
  timeline: RecognitionTimelineEntry[];
  quality: RecognitionQuality | null;
  /** Canonical trade created on group confirmation (Trading Core §70). */
  importedTradeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecognitionGroupSummary {
  id: string;
  status: RecognitionGroupStatus;
  memberCount: number;
  leadScreenshotName: string;
  fusionConfidence: number;
  importedTradeId: string | null;
  createdAt: string;
}

export interface RecognitionGroupListResponse {
  groups: RecognitionGroupSummary[];
}

export interface RecognitionGroupCreateInput {
  jobIds: string[];
}

export interface RecognitionGroupCreateResponse {
  group: RecognitionGroup;
}

export interface RecognitionGroupConfirmInput {
  accountId?: string;
}

export interface RecognitionGroupConfirmResponse {
  tradeId: string;
  group: RecognitionGroup;
}

// ── Screenshot collections (spec §41) ───────────────────────────────────────

export interface RecognitionCollection {
  id: string;
  name: string;
  description: string | null;
  assetsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecognitionCollectionDetail extends RecognitionCollection {
  assets: RecognitionScreenshot[];
}

export interface RecognitionCollectionListResponse {
  collections: RecognitionCollection[];
}

export interface RecognitionCollectionCreateInput {
  name: string;
  description?: string | null;
}

export interface RecognitionCollectionMutationResponse {
  collection: RecognitionCollectionDetail;
}

// ── Reprocessing (spec §45) ─────────────────────────────────────────────────

export interface RecognitionReprocessResponse {
  /** The NEW job (PENDING) — distinct id, same underlying asset. */
  job: RecognitionJob;
  reprocessedFromJobId: string;
}

// ── History filters (spec §62) ──────────────────────────────────────────────

export interface RecognitionJobListQuery {
  status?: RecognitionJobStatus;
  platform?: RecognitionPlatform;
  mimeType?: string;
  corrected?: "true" | "false";
  duplicate?: "true" | "false";
  minConfidence?: number;
  from?: string;
  to?: string;
}
