import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives";
import { pageCursorSchema } from "./security";

/**
 * OCR & Trade Screenshot Recognition contract (Phase 19).
 *
 * Architectural invariants (Phase 19 §4/§21/§22/§28/§42):
 * - OCR output is an UNTRUSTED machine-generated interpretation until the
 *   user explicitly confirms it — every uncertain value carries a confidence
 *   representation and an explicit validation status (§17/§20).
 * - Recognition NEVER creates a canonical Trade directly; Trading Core owns
 *   the Trade. Confirmed values live on the recognition as user corrections.
 * - Raw → normalized separation is preserved end to end (§13): ambiguous
 *   input stays ambiguous (no silent transformation, §14).
 * - Financial values travel as decimal strings — never `number` (§14).
 * - Timestamps extracted from screenshots carry an explicit timezone status;
 *   the engine NEVER silently assumes a timezone (§16).
 */

// ── Lifecycle (§24) ──────────────────────────────────────────────────────────

/**
 * Recognition lifecycle states that actually exist in this build:
 *
 *   QUEUED → PROCESSING → REVIEW_REQUIRED → CONFIRMED
 *                      ↘ FAILED
 *
 * Processing is request-scoped (no external queue in this build), so QUEUED
 * and PROCESSING are transitional states persisted for observability and
 * concurrency guards. CANCELLED does not exist yet — there is no cancel
 * endpoint in V1 (§24: "use only states required by the actual product").
 */
export const ocrRecognitionStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "REVIEW_REQUIRED",
  "FAILED",
  "CONFIRMED",
]);
export type OcrRecognitionStatus = z.infer<typeof ocrRecognitionStatusSchema>;

// ── Extraction profile + field keys (§12: only what the product needs) ──────

/**
 * V1 extraction profile. The only consumer target is the trade journal:
 * MT5-style trade summary lines (symbol, direction, prices, SL/TP, volume,
 * profit, timestamps). One profile, deliberately small (§12: "do not create
 * an enormous universal OCR schema merely because these fields are possible").
 */
export const ocrExtractionProfileSchema = z.enum(["TRADE_SUMMARY"]);
export type OcrExtractionProfile = z.infer<typeof ocrExtractionProfileSchema>;

export const ocrFieldKeySchema = z.enum([
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
]);
export type OcrFieldKey = z.infer<typeof ocrFieldKeySchema>;

/** Field keys whose confirmed/normalized value is a decimal-as-string (§14). */
export const OCR_DECIMAL_FIELD_KEYS = [
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profit",
] as const satisfies readonly (typeof ocrFieldKeySchema.options)[number][];

// ── Confidence model (§17) ───────────────────────────────────────────────────

/** Coarse, explainable band derived from the numeric confidence. */
export const ocrConfidenceBandSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export type OcrConfidenceBand = z.infer<typeof ocrConfidenceBandSchema>;

/** Explicit uncertainty representation (§20) — missing values are preserved. */
export const ocrValidationStatusSchema = z.enum([
  "VALID",
  "MISSING",
  "AMBIGUOUS",
  "LOW_CONFIDENCE",
  "INVALID",
]);
export type OcrValidationStatus = z.infer<typeof ocrValidationStatusSchema>;

// ── Source regions (§18) ─────────────────────────────────────────────────────

export const ocrSourceRegionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type OcrSourceRegion = z.infer<typeof ocrSourceRegionSchema>;

// ── Extracted field (§13/§17) ────────────────────────────────────────────────

export const ocrExtractedFieldSchema = z.object({
  field: ocrFieldKeySchema,
  /** Text as read by the engine — preserved for debugging and review (§13). */
  rawValue: z.string().max(512).nullable(),
  /** Normalized domain value — decimal-string / enum / ISO timestamp / symbol. */
  normalizedValue: z.string().max(256).nullable(),
  /** Numeric confidence 0..1 — a heuristic signal, never certainty (§17). */
  confidence: z.number().min(0).max(1),
  confidenceBand: ocrConfidenceBandSchema,
  validationStatus: ocrValidationStatusSchema,
  /** Where the value came from, in original-image pixel coordinates (§18). */
  sourceRegion: ocrSourceRegionSchema.nullable(),
  warnings: z.array(z.string().max(256)).max(8),
});
export type OcrExtractedField = z.infer<typeof ocrExtractedFieldSchema>;

// ── Screenshot classification (§9) ───────────────────────────────────────────

/**
 * Deterministic keyword-heuristic classification. Provider-specific logic
 * stays minimal: only platforms the product actually targets (§9).
 */
export const ocrScreenshotTypeSchema = z.enum([
  "MT5_TRADE",
  "TRADINGVIEW_CHART",
  "UNKNOWN",
]);
export type OcrScreenshotType = z.infer<typeof ocrScreenshotTypeSchema>;

export const ocrClassificationCandidateSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
});

export const ocrClassificationSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
  alternatives: z.array(ocrClassificationCandidateSchema).max(4),
});
export type OcrClassification = z.infer<typeof ocrClassificationSchema>;

// ── Asset metadata (§6 — metadata + storage reference, never the binary) ────

export const ocrAssetSchema = z.object({
  id: uuidSchema,
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: isoDateTimeSchema,
});
export type OcrAsset = z.infer<typeof ocrAssetSchema>;

// ── Engine metadata (§33) + failure taxonomy (§35) ──────────────────────────

export const ocrEngineInfoSchema = z.object({
  name: z.string().min(1).max(64),
  engineVersion: z.string().min(1).max(32),
  pipelineVersion: z.string().min(1).max(32),
  contractVersion: z.string().min(1).max(8),
});
export type OcrEngineInfo = z.infer<typeof ocrEngineInfoSchema>;

/**
 * Processing failure categories (§35). `UNAUTHORIZED`/`NOT_FOUND` are HTTP
 * envelope concerns and are intentionally not here; upload-rejection errors
 * surface as 400/413 at request time and never as a persisted recognition.
 */
export const ocrFailureCategorySchema = z.enum([
  "PROCESSING_TIMEOUT",
  "OCR_UNAVAILABLE",
  "SCREENSHOT_UNSUPPORTED",
  "EXTRACTION_FAILED",
  "VALIDATION_FAILED",
  "RESOURCE_LIMIT",
  "ENGINE_ERROR",
]);
export type OcrFailureCategory = z.infer<typeof ocrFailureCategorySchema>;

export const ocrFailureSchema = z.object({
  category: ocrFailureCategorySchema,
  message: z.string().max(256),
});
export type OcrFailure = z.infer<typeof ocrFailureSchema>;

// ── Recognition aggregate ────────────────────────────────────────────────────

/**
 * User corrections — the authoritative confirmed values (§21). Values are
 * raw user input (strings); the API re-normalizes and re-validates them with
 * the same domain rules as machine values before persisting.
 */
export const ocrCorrectionRecordSchema = z.record(
  ocrFieldKeySchema,
  z.string().max(128).nullable(),
);
export type OcrCorrectionRecord = z.infer<typeof ocrCorrectionRecordSchema>;

export const ocrRecognitionSchema = z.object({
  id: uuidSchema,
  status: ocrRecognitionStatusSchema,
  extractionProfile: ocrExtractionProfileSchema,
  classification: ocrClassificationSchema.nullable(),
  fields: z.array(ocrExtractedFieldSchema).max(64),
  warnings: z.array(z.string().max(256)).max(16),
  asset: ocrAssetSchema,
  engine: ocrEngineInfoSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  failure: ocrFailureSchema.nullable(),
  /** Authoritative user corrections — set at confirmation (§21). */
  corrections: ocrCorrectionRecordSchema.nullable(),
  /**
   * Canonical Trade created from the confirmed values through Trading Core
   * (Phase 21 bridge — the ONLY sanctioned OCR→Trade path, §77). Null while
   * the recognition is unconfirmed and when the confirmed values could not
   * resolve into a complete trade (stable skip warning explains why).
   * One-way provenance: deleting the recognition never deletes the Trade.
   */
  tradeId: uuidSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OcrRecognition = z.infer<typeof ocrRecognitionSchema>;

// ── API payloads (§40) ───────────────────────────────────────────────────────

/**
 * Upload input. The wire format mirrors the existing frontend screenshot
 * contract (`addScreenshotInputSchema`: data URL ≤ 8 400 000 chars — large
 * enough to carry the decoded OCR_UPLOAD_MAX_BYTES cap) — the only image
 * format the product currently speaks (§2/§8). The binary size after base64
 * decoding is bounded server-side (OCR_UPLOAD_MAX_BYTES).
 */
export const ocrCreateInputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(30)
    .max(8_400_000)
    .startsWith("data:image/")
    .includes(";base64,"),
  requestedProfile: ocrExtractionProfileSchema.default("TRADE_SUMMARY"),
});
export type OcrCreateInput = z.infer<typeof ocrCreateInputSchema>;

export const ocrRecognitionResponseSchema = z.object({
  recognition: ocrRecognitionSchema,
});
export type OcrRecognitionResponse = z.infer<typeof ocrRecognitionResponseSchema>;

/** Keyset pagination, same compound-key pattern as security events (§49). */
export const ocrRecognitionPageQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: pageCursorSchema.optional(),
  status: ocrRecognitionStatusSchema.optional(),
});
export type OcrRecognitionPageQuery = z.infer<typeof ocrRecognitionPageQuerySchema>;

export const ocrRecognitionPageSchema = z.object({
  items: z.array(ocrRecognitionSchema),
  nextCursor: pageCursorSchema.nullable(),
});
export type OcrRecognitionPage = z.infer<typeof ocrRecognitionPageSchema>;

/**
 * Confirmation payload (§21): user-reviewed values that become authoritative.
 * Unknown fields and machine fields the user did not touch are simply absent;
 * `null` explicitly clears a value (e.g. an ambiguous timestamp).
 */
export const ocrConfirmInputSchema = z.object({
  corrections: ocrCorrectionRecordSchema,
});
export type OcrConfirmInput = z.infer<typeof ocrConfirmInputSchema>;

/** Direction values accepted inside corrections (mirrors the trade domain). */
export const OCR_DIRECTION_VALUES = ["BUY", "SELL"] as const;

export const ocrDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  id: uuidSchema,
});
export type OcrDeleteResponse = z.infer<typeof ocrDeleteResponseSchema>;
