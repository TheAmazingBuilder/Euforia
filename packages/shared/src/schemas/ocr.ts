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

// ── Corrections memory (engine quality phase §2.3) ───────────────────────

/**
 * A per-field correction suggestion derived from the user's own history:
 * this exact raw reading was corrected to `value` `occurrences` times in
 * previous confirmations. A hint for the review UI — never applied
 * automatically (§21: nothing becomes authoritative without the user).
 */
export const ocrFieldSuggestionSchema = z.object({
  value: z.string().max(128),
  occurrences: z.number().int().min(1).max(10_000),
});
export type OcrFieldSuggestion = z.infer<typeof ocrFieldSuggestionSchema>;

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
  /** History-derived hint (corrections memory) — advisory only. */
  suggestion: ocrFieldSuggestionSchema.optional(),
});
export type OcrExtractedField = z.infer<typeof ocrExtractedFieldSchema>;

// ── Screenshot classification (§9) ───────────────────────────────────────────

/**
 * Deterministic keyword-heuristic classification. Provider-specific logic
 * stays minimal: only platforms the product actually targets (§9).
 */
/**
 * Screenshot taxonomy (V2 spec §19) — additive extension. The legacy
 * MT5_TRADE / TRADINGVIEW_CHART values stay valid forever (persisted
 * results and mocks keep parsing); the sidecar V2 pipeline (v3.0.0)
 * emits the finer TRADE_HISTORY / OPEN_POSITION / ... vocabulary.
 */
export const ocrScreenshotTypeSchema = z.enum([
  "MT5_TRADE",
  "TRADINGVIEW_CHART",
  "TRADE_HISTORY",
  "OPEN_POSITION",
  "ORDER",
  "TRADE_DETAIL",
  "ACCOUNT_SUMMARY",
  "CHART",
  "POSITION_DETAIL",
  "UNKNOWN",
]);
export type OcrScreenshotType = z.infer<typeof ocrScreenshotTypeSchema>;

/** Trading platforms recognized deterministically (V2 spec §18). */
export const ocrPlatformSchema = z.enum([
  "MT5",
  "MT4",
  "TRADINGVIEW",
  "CTRADER",
  "NINJATRADER",
  "INTERACTIVE_BROKERS",
  "DERIV",
  "UNKNOWN",
]);
export type OcrPlatform = z.infer<typeof ocrPlatformSchema>;

export const ocrClassificationCandidateSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
});

export const ocrClassificationSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
  alternatives: z.array(ocrClassificationCandidateSchema).max(4),
  /** V2 §18 — detected platform (default keeps old persisted rows valid). */
  platform: ocrPlatformSchema.default("UNKNOWN"),
});
export type OcrClassification = z.infer<typeof ocrClassificationSchema>;

// ── Asset metadata (§6 — metadata + storage reference, never the binary) ────

export const ocrAssetSchema = z.object({
  id: uuidSchema,
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: isoDateTimeSchema,
  /** Retention purged the binary (metadata rows remain, § ops review). */
  purged: z.boolean().default(false),
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

// ── Multi-trade drafts (engine quality phase §2.2) ─────────────────────────

/**
 * One trade draft grouped from an account-history screenshot. Grouping is
 * EVIDENCE — the user confirms each draft independently (human-in-the-loop,
 * §21); nothing is created before that.
 */
export const ocrTradeCandidateSchema = z.object({
  fields: z.array(ocrExtractedFieldSchema).max(16),
});
export type OcrTradeCandidate = z.infer<typeof ocrTradeCandidateSchema>;

/** One grouped-confirmation draft: corrections for one candidate + include. */
export const ocrConfirmBatchSchema = z.object({
  corrections: ocrCorrectionRecordSchema,
  include: z.boolean().default(true),
});
export type OcrConfirmBatch = z.infer<typeof ocrConfirmBatchSchema>;

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
   * For a grouped confirmation this is the FIRST imported draft.
   */
  tradeId: uuidSchema.nullable(),
  /** Every Trade imported from this recognition (grouped confirmation N>1). */
  tradeIds: z.array(uuidSchema).max(20).default([]),
  /** Multi-trade drafts (account-history screenshots) — null when mono. */
  candidates: z.array(ocrTradeCandidateSchema).max(20).nullable(),
  /**
   * Perceptual duplicate flag (engine quality §2.1): this screenshot is a
   * near-match of an EARLIER recognition by the same user. Advisory — the
   * pipeline still runs; the review UI surfaces the warning.
   */
  duplicateOf: z
    .object({
      recognitionId: uuidSchema,
      createdAt: isoDateTimeSchema,
      tradeId: uuidSchema.nullable(),
    })
    .nullable(),
  /** ACCOUNTS module attachment (engine quality §3.1) — null until chosen. */
  accountId: uuidSchema.nullable(),
  /** Playbook tag suggestions (engine quality §3.3) — set at confirmation. */
  suggestedTags: z.array(z.string().max(64)).max(8).default([]),
  confirmedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OcrRecognition = z.infer<typeof ocrRecognitionSchema>;

// ── API payloads (§40) ───────────────────────────────────────────────────────

/**
 * Upload input. The wire format mirrors the existing frontend screenshot
 * contract (`addScreenshotInputSchema`: data URL ≤ 8 400 000 chars) — image
 * formats plus the multi-page PDF statements (engine quality §4.3). The
 * binary size after base64 decoding is bounded server-side
 * (OCR_UPLOAD_MAX_BYTES).
 */
export const ocrCreateInputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(30)
    .max(8_400_000)
    .refine(
      (value) =>
        (value.startsWith("data:image/") || value.startsWith("data:application/pdf;")) &&
        value.includes(";base64,"),
      { message: "expected a base64 data URL for an image or a PDF" },
    ),
  requestedProfile: ocrExtractionProfileSchema.default("TRADE_SUMMARY"),
  /** ACCOUNTS attachment chosen at upload (engine quality §3.1) — optional. */
  accountId: uuidSchema.nullable().optional(),
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
 *
 * Grouped confirmation (engine quality §2.2): `batches` carries one entry
 * per multi-trade draft — each with its own corrections and an include
 * flag. When batches are present, `corrections` is ignored (kept required
 * for single-trade backward compatibility and idempotent replay).
 * `accountId` attaches the ACCOUNTS module target at confirmation time.
 */
export const ocrConfirmInputSchema = z
  .object({
    corrections: ocrCorrectionRecordSchema,
    batches: z.array(ocrConfirmBatchSchema).min(1).max(20).optional(),
    accountId: uuidSchema.nullable().optional(),
  })
  .refine((input) => input.batches === undefined || input.batches.length >= 1, {
    message: "batches must not be empty",
  });
export type OcrConfirmInput = z.infer<typeof ocrConfirmInputSchema>;

/**
 * Re-OCR by crop (engine quality §2.4): re-run the engine over a framed
 * region of the stored screenshot. The result is EPHEMERAL guidance for
 * the review — it never rewrites the stored machine result.
 */
export const ocrRecropInputSchema = z.object({
  region: ocrSourceRegionSchema,
});
export type OcrRecropInput = z.infer<typeof ocrRecropInputSchema>;

export const ocrRecropResponseSchema = z.object({
  fields: z.array(ocrExtractedFieldSchema).max(32),
  region: ocrSourceRegionSchema,
});
export type OcrRecropResponse = z.infer<typeof ocrRecropResponseSchema>;

/** Direction values accepted inside corrections (mirrors the trade domain). */
export const OCR_DIRECTION_VALUES = ["BUY", "SELL"] as const;

export const ocrDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  id: uuidSchema,
});
export type OcrDeleteResponse = z.infer<typeof ocrDeleteResponseSchema>;

// ── Analytics (engine quality §3.2) ────────────────────────────────────────

export const ocrAnalyticsQuerySchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
});
export type OcrAnalyticsQuery = z.infer<typeof ocrAnalyticsQuerySchema>;

export const ocrAnalyticsResponseSchema = z.object({
  /** The inclusive window the aggregates cover. */
  windowDays: z.number().int().min(1).max(365),
  funnel: z.object({
    uploads: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    reviewRequired: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    importedTrades: z.number().int().nonnegative(),
  }),
  /** Correction counts per field — where the engine struggles for YOU. */
  correctionsByField: z
    .array(
      z.object({
        field: ocrFieldKeySchema,
        corrections: z.number().int().nonnegative(),
        confirmations: z.number().int().nonnegative(),
      }),
    )
    .max(16),
  avgConfidence: z.number().min(0).max(1).nullable(),
  duplicatesBlocked: z.number().int().nonnegative(),
  avgDurationMs: z.number().int().nonnegative().nullable(),
});
export type OcrAnalyticsResponse = z.infer<typeof ocrAnalyticsResponseSchema>;

// ── Storage / retention (engine quality §4.2) ──────────────────────────────

export const ocrStorageResponseSchema = z.object({
  usedBytes: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  retainedAssetCount: z.number().int().nonnegative(),
  purgedAssetCount: z.number().int().nonnegative(),
  /** 0 = retention disabled. */
  retentionDays: z.number().int().min(0).max(3650),
  oldestRetainedAssetAt: isoDateTimeSchema.nullable(),
});
export type OcrStorageResponse = z.infer<typeof ocrStorageResponseSchema>;
