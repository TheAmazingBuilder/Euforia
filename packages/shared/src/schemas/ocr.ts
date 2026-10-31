import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives";
import { pageCursorSchema } from "./security";

/**
 * OCR & Trade Screenshot Recognition contract (Phase 19).
 *
 * Architectural invariants (Phase 19 §4/§21/§22/§28/§42):
 * - OCR output is an UNTRUSTED machine-generated interpretation until the
 *   user explicitly confirms it - every uncertain value carries a confidence
 *   representation and an explicit validation status (§17/§20).
 * - Recognition NEVER creates a canonical Trade directly; Trading Core owns
 *   the Trade. Confirmed values live on the recognition as user corrections.
 * - Raw → normalized separation is preserved end to end (§13): ambiguous
 *   input stays ambiguous (no silent transformation, §14).
 * - Financial values travel as decimal strings - never `number` (§14).
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
 * concurrency guards. CANCELLED does not exist yet - there is no cancel
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
 * Extraction profiles (Recognition V1.1 - Account & Chart expansion).
 *
 * TRADE_SUMMARY is the V1 target: MT5-style trade summary lines consumed by
 * the trade journal. ACCOUNT_POSITION reads account-level snapshots (login,
 * server, currency, leverage, balance, equity, margin, free margin, margin
 * level + the open-positions table as grouped candidates). CHART_ANALYSIS
 * reads chart screenshots (symbol, timeframe, OHLC quote panel, current
 * price, change and the visible indicator readings). The rule stays §12:
 * one deliberately small field vocabulary per profile, never a universal
 * OCR schema.
 */
export const ocrExtractionProfileSchema = z.enum(["TRADE_SUMMARY", "ACCOUNT_POSITION", "CHART_ANALYSIS"]);
export type OcrExtractionProfile = z.infer<typeof ocrExtractionProfileSchema>;

export const ocrFieldKeySchema = z.enum([
  // TRADE_SUMMARY vocabulary (V1).
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
  // ACCOUNT_POSITION vocabulary - the account snapshot header.
  "accountLogin",
  "accountServer",
  "accountCurrency",
  "accountLeverage",
  "accountBalance",
  "accountEquity",
  "accountMargin",
  "accountFreeMargin",
  "accountMarginLevel",
  // CHART_ANALYSIS vocabulary - quote panel + visible indicator readings.
  "chartTimeframe",
  "chartTime",
  "chartOpen",
  "chartHigh",
  "chartLow",
  "chartClose",
  "chartPrice",
  "chartChangePct",
  "chartRsi",
  "chartMacd",
  "chartAtr",
  "chartStoch",
  "chartAdx",
  "chartMa",
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
  "accountBalance",
  "accountEquity",
  "accountMargin",
  "accountFreeMargin",
  "accountMarginLevel",
  "chartOpen",
  "chartHigh",
  "chartLow",
  "chartClose",
  "chartPrice",
  "chartChangePct",
  "chartRsi",
  "chartMacd",
  "chartAtr",
  "chartStoch",
  "chartAdx",
  "chartMa",
] as const satisfies readonly (typeof ocrFieldKeySchema.options)[number][];

/** ACCOUNT_POSITION vocabulary - the snapshot header (positions are candidates). */
export const OCR_ACCOUNT_FIELD_KEYS = [
  "accountLogin",
  "accountServer",
  "accountCurrency",
  "accountLeverage",
  "accountBalance",
  "accountEquity",
  "accountMargin",
  "accountFreeMargin",
  "accountMarginLevel",
] as const satisfies readonly (typeof ocrFieldKeySchema.options)[number][];

/** CHART_ANALYSIS vocabulary - quote panel + visible indicator readings. */
export const OCR_CHART_FIELD_KEYS = [
  "chartTimeframe",
  "chartTime",
  "chartOpen",
  "chartHigh",
  "chartLow",
  "chartClose",
  "chartPrice",
  "chartChangePct",
  "chartRsi",
  "chartMacd",
  "chartAtr",
  "chartStoch",
  "chartAdx",
  "chartMa",
] as const satisfies readonly (typeof ocrFieldKeySchema.options)[number][];

/**
 * The import-critical floor PER PROFILE (§16/§19): only these missing fields
 * raise MISSING_REQUIRED_FIELD, and only these count against completeness.
 * TRADE mirrors trade-import eligibility (symbol, direction, volume,
 * entry price); ACCOUNT mirrors a meaningful snapshot (currency + balance +
 * equity); CHART mirrors a usable reading (timeframe + close).
 */
export const OCR_PROFILE_REQUIRED_FIELD_KEYS: Record<OcrExtractionProfile, readonly OcrFieldKey[]> = {
  TRADE_SUMMARY: ["symbol", "direction", "volume", "entryPrice"],
  ACCOUNT_POSITION: ["accountCurrency", "accountBalance", "accountEquity"],
  CHART_ANALYSIS: ["chartTimeframe", "chartClose"],
};

// ── Confidence model (§17) ───────────────────────────────────────────────────

/** Coarse, explainable band derived from the numeric confidence. */
export const ocrConfidenceBandSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export type OcrConfidenceBand = z.infer<typeof ocrConfidenceBandSchema>;

/** Explicit uncertainty representation (§20) - missing values are preserved. */
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
 * previous confirmations. A hint for the review UI - never applied
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
  /** Text as read by the engine - preserved for debugging and review (§13). */
  rawValue: z.string().max(512).nullable(),
  /** Normalized domain value - decimal-string / enum / ISO timestamp / symbol. */
  normalizedValue: z.string().max(256).nullable(),
  /** Numeric confidence 0..1 - a heuristic signal, never certainty (§17). */
  confidence: z.number().min(0).max(1),
  confidenceBand: ocrConfidenceBandSchema,
  validationStatus: ocrValidationStatusSchema,
  /** Where the value came from, in original-image pixel coordinates (§18). */
  sourceRegion: ocrSourceRegionSchema.nullable(),
  warnings: z.array(z.string().max(256)).max(8),
  /** History-derived hint (corrections memory) - advisory only. */
  suggestion: ocrFieldSuggestionSchema.optional(),
});
export type OcrExtractedField = z.infer<typeof ocrExtractedFieldSchema>;

// ── Screenshot classification (§9) ───────────────────────────────────────────

/**
 * Deterministic keyword-heuristic classification. Provider-specific logic
 * stays minimal: only platforms the product actually targets (§9).
 */
/**
 * Screenshot taxonomy (V2 spec §19) - additive extension. The legacy
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
  /** V2 §18 - detected platform (default keeps old persisted rows valid). */
  platform: ocrPlatformSchema.default("UNKNOWN"),
});
export type OcrClassification = z.infer<typeof ocrClassificationSchema>;

// ── Asset metadata (§6 - metadata + storage reference, never the binary) ────

export const ocrAssetSchema = z.object({
  id: uuidSchema,
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().positive(),
  /** V2 - null for PDF statements (the pages carry the rendering). */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
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
 * User corrections - the authoritative confirmed values (§21). Values are
 * raw user input (strings); the API re-normalizes and re-validates them with
 * the same domain rules as machine values before persisting.
 */
export const ocrCorrectionRecordSchema = z.partialRecord(
  ocrFieldKeySchema,
  z.string().max(128).nullable(),
);
export type OcrCorrectionRecord = z.infer<typeof ocrCorrectionRecordSchema>;

// ── Multi-trade drafts (engine quality phase §2.2) ─────────────────────────

/**
 * One trade draft grouped from an account-history screenshot. Grouping is
 * EVIDENCE - the user confirms each draft independently (human-in-the-loop,
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

// ── V2 §16 - structured recognition issues ─────────────────────────────────

/**
 * Stable issue codes (V2 spec §16). Every issue is derived from the stored
 * recognition evidence - never a free-text judgment call. `field` scopes the
 * issue to one extracted field when the code is field-level; `detail` is a
 * STABLE token (e.g. a trade id or matched-on evidence), not prose.
 */
export const ocrIssueCodeSchema = z.enum([
  "LOW_OCR_CONFIDENCE",
  "UNKNOWN_PLATFORM",
  "UNKNOWN_SYMBOL",
  "AMBIGUOUS_DIRECTION",
  "AMBIGUOUS_NUMBER",
  "INVALID_PRICE_RELATIONSHIP",
  "INVALID_TIMESTAMP",
  "MISSING_REQUIRED_FIELD",
  "CONFLICTING_FIELDS",
  "UNSUPPORTED_SCREENSHOT",
  "PROFILE_TYPE_MISMATCH",
  "POSSIBLE_DUPLICATE",
  "POSSIBLE_TRADE_DUPLICATE",
]);
export type OcrIssueCode = z.infer<typeof ocrIssueCodeSchema>;

export const ocrIssueSchema = z.object({
  code: ocrIssueCodeSchema,
  field: ocrFieldKeySchema.nullable(),
  detail: z.string().max(256).nullable(),
});
export type OcrIssue = z.infer<typeof ocrIssueSchema>;

// ── V2 §15 - deterministic recognition quality score ───────────────────

/**
 * Composite quality score with EXPLAINABLE components (V2 spec §15):
 *   fieldConfidence - mean confidence over readable fields (text evidence);
 *   completeness    - share of the import-critical fields present;
 *   validation      - cross-field/domain validation penalty (INVALID fields);
 *   consistency     - evidence agreement (duplicates/unknown classification
 *                     penalize; fusion agreement feeds this for sets).
 * The score is a deterministic function of the stored fields - the same
 * recognition always produces the same score (V2 §77).
 */
export const ocrQualityScoreSchema = z.object({
  score: z.number().min(0).max(1),
  components: z.object({
    fieldConfidence: z.number().min(0).max(1),
    completeness: z.number().min(0).max(1),
    validation: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
  }),
});
export type OcrQualityScore = z.infer<typeof ocrQualityScoreSchema>;

// ── V2 §23 - trade timeline ─────────────────────────────────────────────

/**
 * Deterministic chronology derived from the recognized timestamps plus the
 * recognition lifecycle. OPEN_TIME/CLOSE_TIME carry the timezone-unknown
 * wall-clock canonical form (§16 - never converted, never invented);
 * UPLOADED/CONFIRMED carry real ISO instants. Entries with no recognized
 * timestamp are omitted - never guessed.
 */
export const ocrTimelineEntrySchema = z.object({
  kind: z.enum(["OPEN_TIME", "CLOSE_TIME", "UPLOADED", "CONFIRMED"]),
  /** Wall-clock canonical string for OPEN/CLOSE, ISO instant otherwise. */
  at: z.string().max(32).nullable(),
  /** Raw recognized stamp when the entry came from the OCR fields. */
  raw: z.string().max(64).nullable(),
});
export type OcrTimelineEntry = z.infer<typeof ocrTimelineEntrySchema>;

// ── V2 §4 - trade duplicate detection (different screenshot, same trade) ──

/** Evidence tokens explaining WHY a trade looks like a duplicate. */
export const ocrTradeDuplicateEvidenceSchema = z.enum([
  "SYMBOL",
  "DIRECTION",
  "ENTRY_PRICE",
  "ENTRY_TIME",
]);
export type OcrTradeDuplicateEvidence = z.infer<typeof ocrTradeDuplicateEvidenceSchema>;

export const ocrPossibleTradeDuplicateSchema = z.object({
  tradeId: uuidSchema,
  matchedOn: z.array(ocrTradeDuplicateEvidenceSchema).max(4),
  detectedAt: isoDateTimeSchema,
});
export type OcrPossibleTradeDuplicate = z.infer<typeof ocrPossibleTradeDuplicateSchema>;

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
  /** Authoritative user corrections - set at confirmation (§21). */
  corrections: ocrCorrectionRecordSchema.nullable(),
  /**
   * Canonical Trade created from the confirmed values through Trading Core
   * (Phase 21 bridge - the ONLY sanctioned OCR→Trade path, §77). Null while
   * the recognition is unconfirmed and when the confirmed values could not
   * resolve into a complete trade (stable skip warning explains why).
   * One-way provenance: deleting the recognition never deletes the Trade.
   * For a grouped confirmation this is the FIRST imported draft.
   */
  tradeId: uuidSchema.nullable(),
  /** Every Trade imported from this recognition (grouped confirmation N>1). */
  tradeIds: z.array(uuidSchema).max(20).default([]),
  /** Multi-trade drafts (account-history screenshots) - null when mono. */
  candidates: z.array(ocrTradeCandidateSchema).max(20).nullable(),
  /**
   * Perceptual duplicate flag (engine quality §2.1): this screenshot is a
   * near-match of an EARLIER recognition by the same user. Advisory - the
   * pipeline still runs; the review UI surfaces the warning.
   */
  duplicateOf: z
    .object({
      recognitionId: uuidSchema,
      createdAt: isoDateTimeSchema,
      tradeId: uuidSchema.nullable(),
    })
    .nullable(),
  /** ACCOUNTS module attachment (engine quality §3.1) - null until chosen. */
  accountId: uuidSchema.nullable(),
  /** Playbook tag suggestions (engine quality §3.3) - set at confirmation. */
  suggestedTags: z.array(z.string().max(64)).max(8).default([]),
  /**
   * V2 §16 - structured issues derived from the stored evidence at read
   * time (the derivation is a pure function; confirmed rows never mutate).
   */
  issues: z.array(ocrIssueSchema).max(32).default([]),
  /** V2 §15 - deterministic quality score (null when nothing is readable). */
  qualityScore: ocrQualityScoreSchema.nullable(),
  /** V2 §23 - derived chronology (only entries with real evidence). */
  timeline: z.array(ocrTimelineEntrySchema).max(16).default([]),
  /**
   * V2 §4 - content-based trade duplicate flag (different screenshot, same
   * trade). Advisory at review time; confirmation REQUIRES an explicit
   * acknowledgment to proceed (V2 §58 - the user decides, never a silent
   * discard, and never a silent double import).
   */
  possibleTradeDuplicate: ocrPossibleTradeDuplicateSchema.nullable(),
  /**
   * V2 §32 - set when this recognition was produced by an explicit
   * reprocess of an earlier one. The original row is NEVER mutated
   * (§33); a reprocess is a fresh, independently confirmable recognition.
   */
  reprocessedFrom: uuidSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OcrRecognition = z.infer<typeof ocrRecognitionSchema>;

// ── API payloads (§40) ───────────────────────────────────────────────────────

/**
 * Upload input. The wire format mirrors the existing frontend screenshot
 * contract (`addScreenshotInputSchema`: data URL ≤ 8 400 000 chars) - image
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
  /** ACCOUNTS attachment chosen at upload (engine quality §3.1) - optional. */
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
  /** V2 §62 - detected-platform filter (jsonb path filter server-side). */
  platform: ocrPlatformSchema.optional(),
  /** V2 §62 - recognized screenshot-type filter (jsonb path filter). */
  screenshotType: ocrScreenshotTypeSchema.optional(),
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
 * per multi-trade draft - each with its own corrections and an include
 * flag. When batches are present, `corrections` is ignored (kept required
 * for single-trade backward compatibility and idempotent replay).
 * `accountId` attaches the ACCOUNTS module target at confirmation time.
 */
export const ocrConfirmInputSchema = z
  .object({
    corrections: ocrCorrectionRecordSchema,
    batches: z.array(ocrConfirmBatchSchema).min(1).max(20).optional(),
    accountId: uuidSchema.nullable().optional(),
    /**
     * V2 §58 - explicit acknowledgment of advisory duplicate warnings.
     * A flagged recognition cannot be confirmed without the matching
     * acknowledgment (409 otherwise): the user saw the warning and chose
     * to proceed - never a silent double import.
     */
    acknowledgeDuplicateScreenshot: z.boolean().default(false),
    acknowledgeDuplicateTrade: z.boolean().default(false),
  })
  .refine((input) => input.batches === undefined || input.batches.length >= 1, {
    message: "batches must not be empty",
  });
export type OcrConfirmInput = z.infer<typeof ocrConfirmInputSchema>;

/**
 * Re-OCR by crop (engine quality §2.4): re-run the engine over a framed
 * region of the stored screenshot. The result is EPHEMERAL guidance for
 * the review - it never rewrites the stored machine result.
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
  /** Correction counts per field - where the engine struggles for YOU. */
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
  /** V2 §30 - share of confirmed recognitions that carried corrections. */
  correctionRate: z.number().min(0).max(1).nullable(),
  /** V2 §30 - recognized platform distribution over the window (detected
   * platforms only - legacy rows without the field are not fabricated). */
  platformDistribution: z
    .array(z.object({ platform: ocrPlatformSchema, count: z.number().int().nonnegative() }))
    .max(8),
  /** V2 §30 - recognized screenshot-type distribution over the window. */
  typeDistribution: z
    .array(z.object({ type: ocrScreenshotTypeSchema, count: z.number().int().nonnegative() }))
    .max(10),
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

// ── V2 §1/§2/§14/§15/§18 - multi-screenshot recognition sets ────────────────

/** A member's recognized fields as stored on its own recognition row. */
export const ocrSetMemberSchema = z.object({
  order: z.number().int().min(0).max(15),
  recognitionId: uuidSchema,
  /** Fully-derived member DTO - the individual result is NEVER destroyed. */
  recognition: ocrRecognitionSchema,
});
export type OcrSetMember = z.infer<typeof ocrSetMemberSchema>;

/**
 * One conflicting field across members (V2 §18): both readings are kept
 * with their provenance - the user decides, nothing is auto-merged away.
 */
export const ocrFieldConflictSchema = z.object({
  field: ocrFieldKeySchema,
  values: z
    .array(
      z.object({
        value: z.string().max(256),
        recognitionId: uuidSchema,
      }),
    )
    .min(2)
    .max(6),
});
export type OcrFieldConflict = z.infer<typeof ocrFieldConflictSchema>;

/** The fused draft - one TradeDraft out of N member recognitions (V2 §18). */
export const ocrFusedDraftSchema = z.object({
  fields: z.array(ocrExtractedFieldSchema).max(64),
  /** Fields whose members disagreed - kept for the review UI. */
  conflicts: z.array(ocrFieldConflictSchema).max(16),
  /** V2 §16 - issues derived from the fused evidence. */
  issues: z.array(ocrIssueSchema).max(32),
  /** V2 §15 - quality over the fused fields (agreement lifts consistency). */
  qualityScore: ocrQualityScoreSchema.nullable(),
  /** V2 §23 - chronology across members (entry/position/exit shots). */
  timeline: z.array(ocrTimelineEntrySchema).max(16),
  /** True when the members AGREE on symbol + direction (correlation check,
   * V2 §14: insufficient evidence stays a "possible group" for the user). */
  coherent: z.boolean(),
});

export type OcrFusedDraft = z.infer<typeof ocrFusedDraftSchema>;

export const ocrSetStatusSchema = z.enum(["REVIEW_REQUIRED", "CONFIRMED", "FAILED"]);
export type OcrSetStatus = z.infer<typeof ocrSetStatusSchema>;

export const ocrSetSchema = z.object({
  id: uuidSchema,
  status: ocrSetStatusSchema,
  /** Reading order chosen at upload - index 0 first. */
  members: z.array(ocrSetMemberSchema).min(1).max(6),
  fused: ocrFusedDraftSchema.nullable(),
  corrections: ocrCorrectionRecordSchema.nullable(),
  tradeId: uuidSchema.nullable(),
  tradeIds: z.array(uuidSchema).max(20).default([]),
  accountId: uuidSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OcrSet = z.infer<typeof ocrSetSchema>;

export const ocrSetCreateInputSchema = z.object({
  /** 2..6 screenshots of one trading event, in reading order. Single-image
   * workflows stay on POST /ocr/recognitions (one job = one image). */
  imageDataUrls: z
    .array(
      z
        .string()
        .min(30)
        .max(8_400_000)
        .refine(
          (value) =>
            (value.startsWith("data:image/") || value.startsWith("data:application/pdf;")) &&
            value.includes(";base64,"),
          { message: "expected a base64 data URL for an image or a PDF" },
        ),
    )
    .min(2)
    .max(6),
  // Sets FUSE trade drafts - the fusion grammar is trade-shaped, so the
  // set path stays TRADE_SUMMARY-only (account/chart workflows use the
  // single-image route; honest restriction, not a hidden failure).
  requestedProfile: z.literal("TRADE_SUMMARY").default("TRADE_SUMMARY"),
  accountId: uuidSchema.nullable().optional(),
});
export type OcrSetCreateInput = z.infer<typeof ocrSetCreateInputSchema>;

export const ocrSetCreateResponseSchema = z.object({ set: ocrSetSchema });
export type OcrSetCreateResponse = z.infer<typeof ocrSetCreateResponseSchema>;

export const ocrSetResponseSchema = z.object({ set: ocrSetSchema });
export type OcrSetResponse = z.infer<typeof ocrSetResponseSchema>;

export const ocrSetPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(256).optional(),
});
export type OcrSetPageQuery = z.infer<typeof ocrSetPageQuerySchema>;

export const ocrSetPageResponseSchema = z.object({
  items: z.array(ocrSetSchema).max(50),
  nextCursor: z.string().max(256).nullable(),
});
export type OcrSetPageResponse = z.infer<typeof ocrSetPageResponseSchema>;

/**
 * Confirmation of the FUSED draft. Corrections are canonicalized against
 * the fused fields with the SAME domain rules as the single-trade path.
 * The explicit duplicate acknowledgments carry the same semantics as the
 * single recognition confirm (V2 §58).
 */
export const ocrSetConfirmInputSchema = z.object({
  corrections: ocrCorrectionRecordSchema,
  accountId: uuidSchema.nullable().optional(),
  acknowledgeDuplicateScreenshot: z.boolean().default(false),
  acknowledgeDuplicateTrade: z.boolean().default(false),
});
export type OcrSetConfirmInput = z.infer<typeof ocrSetConfirmInputSchema>;

export const ocrSetDeleteResponseSchema = z.object({ deleted: z.literal(true), id: uuidSchema });
export type OcrSetDeleteResponse = z.infer<typeof ocrSetDeleteResponseSchema>;

// ── V2 §28 - screenshot collections ─────────────────────────────────────────

export const ocrCollectionItemSchema = z.object({
  recognitionId: uuidSchema,
  addedAt: isoDateTimeSchema,
});
export type OcrCollectionItem = z.infer<typeof ocrCollectionItemSchema>;

export const ocrCollectionSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(64),
  createdAt: isoDateTimeSchema,
  /** Membership in reading order of insertion (newest first). */
  items: z.array(ocrCollectionItemSchema).max(200),
});
export type OcrCollection = z.infer<typeof ocrCollectionSchema>;

export const ocrCollectionCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
export type OcrCollectionCreateInput = z.infer<typeof ocrCollectionCreateInputSchema>;

export const ocrCollectionCreateResponseSchema = z.object({ collection: ocrCollectionSchema });
export type OcrCollectionCreateResponse = z.infer<typeof ocrCollectionCreateResponseSchema>;

export const ocrCollectionListResponseSchema = z.object({
  collections: z.array(ocrCollectionSchema).max(100),
});
export type OcrCollectionListResponse = z.infer<typeof ocrCollectionListResponseSchema>;

export const ocrCollectionAddItemInputSchema = z.object({
  recognitionId: uuidSchema,
});
export type OcrCollectionAddItemInput = z.infer<typeof ocrCollectionAddItemInputSchema>;

export const ocrCollectionAddItemResponseSchema = z.object({ collection: ocrCollectionSchema });
export type OcrCollectionAddItemResponse = z.infer<typeof ocrCollectionAddItemResponseSchema>;

export const ocrCollectionDeleteResponseSchema = z.object({ deleted: z.literal(true), id: uuidSchema });
export type OcrCollectionDeleteResponse = z.infer<typeof ocrCollectionDeleteResponseSchema>;

/** Removing one recognition from one collection. */
export const ocrCollectionRemoveItemParamsSchema = z.object({
  id: uuidSchema,
  recognitionId: uuidSchema,
});
export type OcrCollectionRemoveItemParams = z.infer<typeof ocrCollectionRemoveItemParamsSchema>;

// ── V2 §32/§39 - reprocessing (a fresh recognition from the same asset) ─────

export const ocrReprocessResponseSchema = z.object({ recognition: ocrRecognitionSchema });
export type OcrReprocessResponse = z.infer<typeof ocrReprocessResponseSchema>;

// ── Recognition V2/V3 - the /recognition wire family ─────────────────────────
// Frontend-derived API surface for the recognition backend (jobs, drafts,
// groups, collections, corrections). Distinct from the legacy /ocr family
// above: jobs are first-class, drafts are user-editable, groups fuse several
// screenshots into one trade, collections organise assets. Wire conventions
// are the house ones - UTC ISO-8601 Z, decimal strings, zod-validated
// everywhere, 16 normalized field keys (engine's 10 + 6 wire-only).

/** The 16 wire field keys (engine keys + account/chart keys, profit→profitLoss). */
export const recognitionFieldKeySchema = z.enum([
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
  "openTime",
  "closeTime",
  "platform",
  "currency",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
]);
export type RecognitionFieldKey = z.infer<typeof recognitionFieldKeySchema>;

/** Per-field read state (never invented - the engine signals each state). */
export const recognitionFieldStateSchema = z.enum(["FOUND", "UNCERTAIN", "NOT_FOUND"]);
export type RecognitionFieldState = z.infer<typeof recognitionFieldStateSchema>;

/** Normalized 0..1 source region (frontend §25 - resolution independent). */
const recognitionRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

/** One recognized field on the wire (0..100 confidence, user edits flagged). */
export const recognizedFieldSchema = z.object({
  key: recognitionFieldKeySchema,
  value: z.string().max(256).nullable(),
  state: recognitionFieldStateSchema,
  confidence: z.number().int().min(0).max(100).nullable(),
  sourceRegion: recognitionRegionSchema.optional(),
  editedByUser: z.boolean().optional(),
});
export type RecognizedField = z.infer<typeof recognizedFieldSchema>;

/** One recognized trade within a (multi-trade) screenshot result. */
export const recognizedTradeSchema = z.object({
  /** 1-based position within the screenshot. */
  index: z.number().int().positive(),
  fields: z.partialRecord(recognitionFieldKeySchema, recognizedFieldSchema),
  pageIndex: z.number().int().nonnegative().optional(),
});
export type RecognizedTrade = z.infer<typeof recognizedTradeSchema>;

/** Typed warning codes (free-string engine warnings are mapped, never leaked). */
export const recognitionWarningSchema = z.object({
  code: z.enum(["SCREENSHOT_INCOMPLETE", "LOW_CONFIDENCE_FIELD", "FIELD_NOT_DETECTED"]),
  message: z.string().max(256),
  field: recognitionFieldKeySchema.optional(),
});
export type RecognitionWarning = z.infer<typeof recognitionWarningSchema>;

/** Platform as detected by the engine (AUTO lives only on job inputs). */
export const detectedPlatformSchema = z.enum(["METATRADER_5", "TRADINGVIEW", "OTHER"]);
export type DetectedPlatform = z.infer<typeof detectedPlatformSchema>;

/** Coarse pipeline stage (the frontend's finer timeline is display-only). */
export const recognitionStageSchema = z.enum(["UPLOADING", "OCR", "COMPLETED"]);
export type RecognitionStage = z.infer<typeof recognitionStageSchema>;

export const recognitionJobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type RecognitionJobStatus = z.infer<typeof recognitionJobStatusSchema>;

export const recognitionJobErrorCodeSchema = z.enum([
  "SERVICE_UNAVAILABLE",
  "UNSUPPORTED_IMAGE",
  "RECOGNITION_FAILED",
]);
export type RecognitionJobErrorCode = z.infer<typeof recognitionJobErrorCodeSchema>;

/** The uploaded screenshot as the job sees it (PDF pages counted, dims nullable). */
export const recognitionScreenshotSchema = z.object({
  id: uuidSchema,
  name: z.string().max(120),
  sizeBytes: z.number().int().positive(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  uploadedAt: isoDateTimeSchema,
  documentPageCount: z.number().int().min(1).max(1000).optional(),
});
export type RecognitionScreenshot = z.infer<typeof recognitionScreenshotSchema>;

/** The full recognition result attached to a completed job. */
export const recognitionResultSchema = z.object({
  jobId: uuidSchema,
  detectedPlatform: detectedPlatformSchema,
  platformConfidence: z.number().int().min(0).max(100).nullable(),
  trades: z.array(recognizedTradeSchema).min(1).max(20),
  warnings: z.array(recognitionWarningSchema).max(16),
  /** Evidence-weighted mean of detected field confidences (never a constant). */
  overallConfidence: z.number().int().min(0).max(100).nullable(),
  /** V3 engine quality (0..100 components; consistency only for fused jobs). */
  quality: z
    .object({
      overall: z.number().min(0).max(100),
      components: z.object({
        textRecognition: z.number(),
        fieldExtraction: z.number(),
        tradingInterpretation: z.number(),
        crossFieldValidation: z.number(),
        consistency: z.number().nullable(),
      }),
    })
    .optional(),
  versions: z
    .object({
      engine: z.string().max(64),
      pipeline: z.string().max(32),
      schema: z.literal("3"),
    })
    .optional(),
  processingMs: z.number().int().nonnegative().nullable(),
  completedAt: isoDateTimeSchema.nullable(),
});
export type RecognitionResult = z.infer<typeof recognitionResultSchema>;

/** GET /recognition/jobs/:id - the job aggregate. */
export const recognitionJobSchema = z.object({
  id: uuidSchema,
  ownerId: uuidSchema,
  status: recognitionJobStatusSchema,
  stage: recognitionStageSchema,
  progress: z.number().int().min(0).max(100),
  platform: z.enum(["AUTO", "METATRADER_5", "TRADINGVIEW", "OTHER"]),
  mode: z.enum(["AUTOMATIC"]),
  screenshot: recognitionScreenshotSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  processingMs: z.number().int().nonnegative().nullable(),
  error: z
    .object({ code: recognitionJobErrorCodeSchema, message: z.string() })
    .nullable(),
  /** The trade created by the ONLY confirm bridge (explicit user action). */
  importedTradeId: uuidSchema.nullable(),
  importedTradeIds: z.array(uuidSchema).max(20).optional(),
  hasWarnings: z.boolean(),
});
export type RecognitionJob = z.infer<typeof recognitionJobSchema>;

/** History row (keyset-paginated list) - the list projection of a job. */
export const recognitionHistoryItemSchema = z.object({
  id: uuidSchema,
  status: recognitionJobStatusSchema,
  platform: z.enum(["AUTO", "METATRADER_5", "TRADINGVIEW", "OTHER"]),
  detectedPlatform: detectedPlatformSchema.nullable(),
  screenshotName: z.string().max(120),
  sizeBytes: z.number().int().positive(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  documentPageCount: z.number().int().min(1).max(1000).optional(),
  detectedTradeCount: z.number().int().min(0).max(20),
  overallConfidence: z.number().int().min(0).max(100).nullable(),
  hasWarnings: z.boolean(),
  error: z
    .object({ code: recognitionJobErrorCodeSchema, message: z.string() })
    .nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  processingMs: z.number().int().nonnegative().nullable(),
  importedTradeId: uuidSchema.nullable(),
  /** V3 facets (§62/§41) - present only when meaningful. */
  correctedCount: z.number().int().nonnegative().optional(),
  duplicateWarned: z.literal(true).optional(),
  qualityOverall: z.number().min(0).max(100).optional(),
  screenshotId: uuidSchema,
});
export type RecognitionHistoryItem = z.infer<typeof recognitionHistoryItemSchema>;

/** GET /recognition/jobs list query - server-side history filters. */
export const recognitionJobListQuerySchema = z.object({
  status: recognitionJobStatusSchema.optional(),
  platform: z.string().max(32).optional(),
  mimeType: z.string().max(64).optional(),
  corrected: z.enum(["true", "false"]).optional(),
  duplicate: z.enum(["true", "false"]).optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type RecognitionJobListQuery = z.infer<typeof recognitionJobListQuerySchema>;

/** Stored JSONB draft shape (OcrRecognition.draft / OcrRecognitionGroup.fusedDraft). */
export const tradeDraftRecordSchema = z.object({
  symbol: z.string().max(64).nullable(),
  direction: z.enum(["BUY", "SELL"]).nullable(),
  volume: z.string().max(64).nullable(),
  entryPrice: z.string().max(64).nullable(),
  exitPrice: z.string().max(64).nullable(),
  stopLoss: z.string().max(64).nullable(),
  takeProfit: z.string().max(64).nullable(),
  profitLoss: z.string().max(64).nullable(),
  openTime: z.string().max(64).nullable(),
  closeTime: z.string().max(64).nullable(),
  platform: z.string().max(32).nullable(),
  currency: z.string().max(16).nullable(),
  positionId: z.string().max(64).nullable(),
  orderId: z.string().max(64).nullable(),
  accountBalance: z.string().max(64).nullable().optional(),
  accountEquity: z.string().max(64).nullable().optional(),
});
export type TradeDraftRecord = z.infer<typeof tradeDraftRecordSchema>;

/** Wire draft = stored record + server-added provenance. */
export const tradeDraftSchema = tradeDraftRecordSchema.extend({
  platform: detectedPlatformSchema.nullable(),
  jobId: uuidSchema,
  updatedAt: isoDateTimeSchema,
  tradeIndex: z.number().int().positive().max(20).optional(),
});
export type TradeDraft = z.infer<typeof tradeDraftSchema>;

/** PUT /recognition/jobs/:id/draft - the user's corrected draft (≡ record). */
export const tradeDraftUpdateInputSchema = tradeDraftRecordSchema;
export type TradeDraftUpdateInput = z.infer<typeof tradeDraftUpdateInputSchema>;

/** POST /recognition/uploads - data-URL upload (image or PDF). */
export const recognitionUploadInputSchema = z.object({
  fileDataUrl: z
    .string()
    .min(30)
    .max(8_400_000)
    .refine(
      (v) =>
        (v.startsWith("data:image/") || v.startsWith("data:application/pdf;")) &&
        v.includes(";base64,"),
      { message: "expected a base64 data URL for an image or a PDF" },
    ),
  name: z.string().min(1).max(255),
});
export type RecognitionUploadInput = z.infer<typeof recognitionUploadInputSchema>;

/** POST /recognition/jobs - start recognition on a previously uploaded asset. */
export const createRecognitionJobInputSchema = z.object({
  screenshotId: uuidSchema,
  platform: z.enum(["AUTO", "METATRADER_5", "TRADINGVIEW", "OTHER"]).default("AUTO"),
  mode: z.enum(["AUTOMATIC"]).default("AUTOMATIC"),
});
export type CreateRecognitionJobInput = z.infer<typeof createRecognitionJobInputSchema>;

/** POST /recognition/jobs/:id/confirm - THE trade bridge (explicit human action). */
export const recognitionConfirmInputSchema = z.object({
  tradeIndexes: z.array(z.number().int().positive().max(20)).max(20).optional(),
  accountId: uuidSchema.optional(),
});
export type RecognitionConfirmInput = z.infer<typeof recognitionConfirmInputSchema>;

/** POST /recognition/jobs/:id/recrop - re-read a zoomed region of the asset. */
export const recognitionRecropInputSchema = z.object({
  region: recognitionRegionSchema,
  tradeIndex: z.number().int().positive().max(20).optional(),
});
export type RecognitionRecropInput = z.infer<typeof recognitionRecropInputSchema>;

// ── Groups (V3 - fuse several screenshots into one trade) ────────────────────

/** Machine-readable correlation evidence between two members. */
export const correlationEvidenceSchema = z.object({
  kind: z.string(),
  score: z.number().min(0).max(1),
  detail: z.string().max(256),
});
export type CorrelationEvidence = z.infer<typeof correlationEvidenceSchema>;

export const recognitionGroupMemberSchema = z.object({
  jobId: uuidSchema,
  status: recognitionJobStatusSchema,
  screenshotName: z.string().max(120),
  detectedPlatform: detectedPlatformSchema.nullable(),
  /** Raw screenshot type token (provider vocabulary, deliberately not an enum). */
  screenshotType: z.string().max(64).nullable(),
  trade: recognizedTradeSchema.nullable(),
  overallConfidence: z.number().int().min(0).max(100).nullable(),
  uploadedAt: isoDateTimeSchema,
});
export type RecognitionGroupMember = z.infer<typeof recognitionGroupMemberSchema>;

export const recognitionGroupSchema = z.object({
  id: uuidSchema,
  ownerId: uuidSchema,
  status: z.enum(["PROPOSED", "ACTIVE", "CONFIRMED", "DISCARDED"]),
  members: z.array(recognitionGroupMemberSchema).min(0).max(8),
  evidence: z.array(correlationEvidenceSchema),
  fusionConfidence: z.number().min(0).max(100),
  autoConfirmed: z.boolean(),
  fusedDraft: tradeDraftSchema.nullable(),
  /** Winning member per wire key (field → jobId). */
  fieldOrigins: z.record(z.string(), uuidSchema).optional(),
  conflicts: z
    .array(
      z.object({
        field: z.string(),
        values: z
          .array(z.object({ value: z.string(), jobId: uuidSchema }))
          .min(2),
        selectedJobId: uuidSchema,
      }),
    )
    .optional(),
  timeline: z
    .array(
      z.object({
        jobId: uuidSchema,
        role: z.enum(["ENTRY", "EXIT", "POSITION"]),
        at: isoDateTimeSchema.nullable(),
      }),
    )
    .optional(),
  quality: z
    .object({
      overall: z.number().min(0).max(100),
      components: z.record(z.string(), z.number().nullable()),
    })
    .nullable(),
  importedTradeId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RecognitionGroup = z.infer<typeof recognitionGroupSchema>;

export const recognitionGroupSummarySchema = z.object({
  id: uuidSchema,
  status: z.enum(["PROPOSED", "ACTIVE", "CONFIRMED", "DISCARDED"]),
  memberCount: z.number().int().min(2).max(8),
  leadScreenshotName: z.string(),
  fusionConfidence: z.number().min(0).max(100),
  importedTradeId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type RecognitionGroupSummary = z.infer<typeof recognitionGroupSummarySchema>;

/** POST /recognition/groups - correlate 2..8 jobs into one trade. */
export const recognitionGroupCreateInputSchema = z.object({
  jobIds: z.array(uuidSchema).min(2).max(8),
});
export type RecognitionGroupCreateInput = z.infer<typeof recognitionGroupCreateInputSchema>;

/** POST /recognition/groups/:id/confirm - confirm the fused draft. */
export const recognitionGroupConfirmInputSchema = z.object({
  accountId: uuidSchema.optional(),
});
export type RecognitionGroupConfirmInput = z.infer<typeof recognitionGroupConfirmInputSchema>;

// ── Collections (V3 - asset-based organization) ──────────────────────────────

export const recognitionCollectionSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(64),
  description: z.string().max(280).nullable(),
  assetsCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RecognitionCollection = z.infer<typeof recognitionCollectionSchema>;

export const recognitionCollectionDetailSchema = recognitionCollectionSchema.extend({
  assets: z.array(recognitionScreenshotSchema),
});
export type RecognitionCollectionDetail = z.infer<typeof recognitionCollectionDetailSchema>;

export const recognitionCollectionCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().max(280).nullable().optional(),
});
export type RecognitionCollectionCreateInput = z.infer<typeof recognitionCollectionCreateInputSchema>;

export const recognitionCollectionAssetInputSchema = z.object({
  assetId: uuidSchema,
});
export type RecognitionCollectionAssetInput = z.infer<typeof recognitionCollectionAssetInputSchema>;

// ── Draft coherence (pure domain rule - shared by jobs, groups, quality) ─────

export interface DraftCoherenceInput {
  direction?: string | null;
  entryPrice?: string | null;
  exitPrice?: string | null;
  stopLoss?: string | null;
  takeProfit?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
}

export interface DraftCoherenceIssue {
  field: string;
  message: string;
}

/**
 * The THREE domain coherence rules (mirrors the §19 validation battery):
 *   1. stop-loss must sit on the losing side of entry (BUY: < entry; SELL: >);
 *   2. take-profit must sit on the winning side of entry;
 *   3. closeTime must not precede openTime.
 * Each rule fires only when its operands are present and parseable as
 * decimals; direction defaults to BUY when absent. Exactly these three -
 * callers derive `applicableRules` from the same operand presence, so any
 * additional issue here would poison the cross-field quality component.
 */
export function validateDraftCoherence(draft: DraftCoherenceInput): DraftCoherenceIssue[] {
  const issues: DraftCoherenceIssue[] = [];
  const parse = (value: string | null | undefined): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const entry = parse(draft.entryPrice);
  const stop = parse(draft.stopLoss);
  const target = parse(draft.takeProfit);
  const direction: "BUY" | "SELL" = draft.direction === "SELL" ? "SELL" : "BUY";

  if (entry !== null && stop !== null) {
    const invalid = direction === "BUY" ? stop >= entry : stop <= entry;
    if (invalid) {
      issues.push({
        field: "stopLoss",
        message:
          direction === "BUY"
            ? "Stop loss must be below the entry price for a BUY."
            : "Stop loss must be above the entry price for a SELL.",
      });
    }
  }
  if (entry !== null && target !== null) {
    const invalid = direction === "BUY" ? target <= entry : target >= entry;
    if (invalid) {
      issues.push({
        field: "takeProfit",
        message:
          direction === "BUY"
            ? "Take profit must be above the entry price for a BUY."
            : "Take profit must be below the entry price for a SELL.",
      });
    }
  }

  const open = parse(draft.openTime);
  const close = parse(draft.closeTime);
  if (open !== null && close !== null && close < open) {
    issues.push({
      field: "closeTime",
      message: "Close time must not be earlier than the open time.",
    });
  }
  return issues;
}
