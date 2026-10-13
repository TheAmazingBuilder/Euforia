/**
 * Recognition domain model — OCR & Trade Recognition V1 (frontend-only).
 *
 * These types are the CONTRACT between the UI and the recognition service
 * (spec §41/§42/§68): components consume them through hooks, hooks through
 * the `RecognitionService` interface. When the NestJS/FastAPI pipeline
 * ships, an `ApiRecognitionService` will implement the same interface with
 * API DTOs — none of these shapes may leak Prisma or FastAPI details
 * (spec §70), and none of them assume a single trade (spec §27).
 *
 * Financial values are STRINGS preserving the recognized precision
 * ("2645.32" stays "2645.32" — spec §47); numeric parsing happens only in
 * the validation layer (schemas.ts) and the mock import mapper.
 */

// ── Job lifecycle (spec §16) ─────────────────────────────────────────────────

/** Recognition job statuses — centralized (spec §16). */
export type RecognitionJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** Pipeline stages, in execution order (spec §16). */
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

/** Error categories surfaced to the user (spec §32) — never raw backend errors. */
export type RecognitionErrorCode =
  | "UPLOAD_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "RECOGNITION_FAILED"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "IMPORT_FAILED";

// ── Confidence (spec §18) ────────────────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

// ── Recognized fields (spec §19, §20) ────────────────────────────────────────

/** Extensible field model — V1 set (spec §19). */
export const RECOGNITION_FIELD_KEYS = [
  "platform",
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
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
] as const;

export type RecognitionFieldKey = (typeof RECOGNITION_FIELD_KEYS)[number];

/** How a field was found on the screenshot (spec §19). */
export type RecognitionFieldStatus =
  | "FOUND"
  | "NOT_FOUND"
  | "UNCERTAIN"
  | "NOT_APPLICABLE";

/** Editor/validation kind of a field value (spec §21). */
export type RecognitionFieldKind =
  | "text"
  | "direction"
  | "decimal"
  | "signedDecimal"
  | "datetime"
  | "identifier";

/**
 * Source region of a recognized field, normalized (0..1) against the
 * screenshot dimensions — the P1 "View source" highlight (spec §25) hangs
 * off this. Optional: V1 result views do not render it.
 */
export type RecognitionSourceRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One recognized field with its recognition confidence (spec §18/§20). */
export type RecognizedField = {
  key: RecognitionFieldKey;
  status: RecognitionFieldStatus;
  /** Normalized value as a string — null when NOT_FOUND. */
  value: string | null;
  /** 0–100 recognition confidence; null when the field was not read. */
  confidence: number | null;
  /** True once the user corrected the value (spec §21 inline editing). */
  edited: boolean;
  /** P1-ready source region (spec §25) — absent in most V1 results. */
  source?: RecognitionSourceRegion;
};

// ── Result (spec §17, §27) ───────────────────────────────────────────────────

/** One recognized trade. V1 returns 0..1; the array keeps multi-trade open. */
export type RecognizedTrade = {
  id: string;
  fields: RecognizedField[];
};

/** Warning codes — the service sends STABLE CODES, the UI localizes them. */
export type RecognitionWarningCode =
  | "LOW_CONFIDENCE_FIELD"
  | "FIELD_NOT_FOUND"
  | "MULTIPLE_TRADES"
  | "INCOMPLETE_SCREENSHOT"
  | "SENSITIVE_INFO"
  | "NO_TRADE_DETECTED";

export type RecognitionWarning = {
  id: string;
  code: RecognitionWarningCode;
  /** Field the warning is attached to, when field-scoped (spec §26). */
  fieldKey?: RecognitionFieldKey;
};

export type DetectedPlatform = "MT5" | "TRADINGVIEW" | "CTRADER" | "OTHER";

export type RecognitionResult = {
  detectedPlatform: DetectedPlatform | null;
  /** Ordered by detection confidence. V1: at most one element (spec §27). */
  trades: RecognizedTrade[];
  warnings: RecognitionWarning[];
  completedAt: string;
  /** Total processing duration — shown in the details view (spec §31). */
  durationMs: number;
};

// ── Job (spec §16) ───────────────────────────────────────────────────────────

export type RecognitionPlatform = "AUTO" | DetectedPlatform;

export type RecognitionMode =
  | "AUTOMATIC"
  | "TRADE_DETAILS"
  | "ACCOUNT_POSITION"
  | "CHART_ANALYSIS";

/** File metadata captured at upload time — no file content in the model. */
export type RecognitionFileMeta = {
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export type RecognitionJob = {
  id: string;
  status: RecognitionJobStatus;
  /** Current stage while PROCESSING (null otherwise). */
  stage: RecognitionStage | null;
  /** 0–100 while PROCESSING. */
  progress: number;
  file: RecognitionFileMeta;
  /**
   * Browser preview URL (object URL for fresh uploads, null for seeded
   * history entries whose blob is long gone). UI-only rendering concern.
   */
  previewUrl: string | null;
  platform: RecognitionPlatform;
  mode: RecognitionMode;
  createdAt: string;
  completedAt: string | null;
  error: RecognitionErrorCode | null;
  result: RecognitionResult | null;
  /** Set once the user confirmed the import — links to the journal trade. */
  importedTradeId: string | null;
};

/** A screenshot registered by the service, ready for a recognition job. */
export type UploadedScreenshot = {
  id: string;
  file: RecognitionFileMeta;
  previewUrl: string;
};

// ── Trade draft (spec §23, §24) ──────────────────────────────────────────────

/**
 * Draft trade assembled from a recognized trade after user review. Strings
 * keep the reviewed precision; the draft is NOT a stored Trade until
 * `confirmImport` succeeds (spec §23).
 */
export type TradeDraft = {
  symbol: string;
  direction: "BUY" | "SELL";
  platform: string;
  volume: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  pnl: string | null;
  currency: string | null;
  /** datetime-local strings ("YYYY-MM-DDTHH:mm") — converted to ISO at import. */
  openTime: string | null;
  closeTime: string | null;
  notes: string | null;
};

export type ConfirmImportResponse = {
  tradeId: string;
};
