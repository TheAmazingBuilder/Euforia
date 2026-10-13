/**
 * OCR & Trade Recognition — mock engine (Prompt 3 §40, §41, §60).
 *
 * The mocked recognition backend. Jobs live in an in-memory store and the
 * pipeline state (status / stage / progress) is ALWAYS derived from
 * timestamps at read time — no setTimeout-driven UI states, no timers that
 * drift or leak (the same derive-on-read discipline as the accounts engine).
 * When the real NestJS orchestrator arrives, this file is swapped for HTTP
 * calls and every UI component keeps working untouched (§41).
 *
 * All mock data is fictional and intended only for frontend development
 * (§60): realistic platforms, symbols and confidences, never real brokers.
 */

import {
  createRecognitionJobInputSchema,
  draftInputFromResult,
  parseTradeDraft,
  validateDraftCoherence,
  uploadScreenshotInputSchema,
  type ConfirmImportInput,
  type CreateRecognitionJobInput,
  type CropRegion,
  type RecognitionAnalyticsResponse,
  type RecognitionCollection,
  type RecognitionCollectionDetail,
  type RecognitionConflict,
  type RecognitionCorrelationEvidence,
  type RecognitionCorrelationKind,
  type RecognitionFieldKey,
  type RecognitionGroup,
  type RecognitionGroupStatus,
  type RecognitionGroupSummary,
  type RecognitionHistoryItem,
  type RecognitionJob,
  type RecognitionJobListQuery,
  type RecognitionQuality,
  type RecognitionResult,
  type RecognitionScreenshot,
  type RecognitionStage,
  type RecognitionStorageResponse,
  type RecognitionStrategyMatch,
  type RecognitionSuggestion,
  type RecognitionTimelineEntry,
  type RecognitionWarning,
  type RecognizedField,
  type RecognizedTrade,
  type TradeDraft,
  type TradeDraftInput,
  type TradeDraftWithIndex,
  type UploadDuplicateInfo,
  FIELD_TYPES,
  RECOGNITION_FIELD_KEYS,
} from "../lib/recognition/contract.ts";

/**
 * Mock error with a machine-readable code — self-contained (no store
 * dependency) so the engine stays unit-testable in plain node (§58), the
 * same discipline as the accounts engine.
 */
export class OcrMockError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = "OcrMockError";
    this.status = status;
    this.code = code;
  }
}

// ── Pipeline timeline (deterministic; state derived on read) ────────────────

const STAGE_DURATIONS_MS: Record<Exclude<RecognitionStage, "COMPLETED">, number> = {
  UPLOADING: 500,
  PREPROCESSING: 1300,
  OCR: 2400,
  CLASSIFICATION: 1500,
  EXTRACTION: 1700,
  NORMALIZATION: 1000,
};

const STAGE_SEQUENCE = Object.keys(STAGE_DURATIONS_MS) as Exclude<
  RecognitionStage,
  "COMPLETED"
>[];

const STAGE_STARTS_MS: Record<Exclude<RecognitionStage, "COMPLETED">, number> = (() => {
  const starts = {} as Record<Exclude<RecognitionStage, "COMPLETED">, number>;
  let elapsed = 0;
  for (const stage of STAGE_SEQUENCE) {
    starts[stage] = elapsed;
    elapsed += STAGE_DURATIONS_MS[stage];
  }
  return starts;
})();

const TOTAL_PIPELINE_MS =
  STAGE_STARTS_MS[STAGE_SEQUENCE[STAGE_SEQUENCE.length - 1]] +
  STAGE_DURATIONS_MS[STAGE_SEQUENCE[STAGE_SEQUENCE.length - 1]];

/** Where the failing scenario gives up: partway through the OCR stage. */
const FAIL_AT_MS = STAGE_STARTS_MS.OCR + 1_400;

function stageAndProgressAt(elapsedMs: number): {
  stage: RecognitionStage;
  progress: number;
} {
  if (elapsedMs >= TOTAL_PIPELINE_MS) {
    return { stage: "COMPLETED", progress: 100 };
  }
  let stage: RecognitionStage = STAGE_SEQUENCE[0];
  for (const candidate of STAGE_SEQUENCE) {
    if (elapsedMs >= STAGE_STARTS_MS[candidate]) stage = candidate;
  }
  const completedStages = STAGE_SEQUENCE.indexOf(stage as Exclude<RecognitionStage, "COMPLETED">);
  const fraction =
    (elapsedMs - STAGE_STARTS_MS[stage as Exclude<RecognitionStage, "COMPLETED">]) /
    STAGE_DURATIONS_MS[stage as Exclude<RecognitionStage, "COMPLETED">];
  const progress = Math.min(
    99,
    Math.round(((completedStages + Math.max(0, fraction)) / STAGE_SEQUENCE.length) * 100),
  );
  return { stage, progress };
}

// ── Scenarios (§60 — fictional, varied confidence, varied completeness) ─────

type ScenarioKey = "XAUUSD_BUY" | "EURUSD_BUY" | "NAS100_LOW" | "FAILED" | "BTCUSD_PARTIAL" | "HISTORY_MULTI";

interface FieldSpec {
  key: RecognitionFieldKey;
  value: string | null;
  state: RecognizedField["state"];
  confidence: number | null;
  /** Normalized bounding box [x, y, w, h] on a full-window screenshot. */
  region?: [number, number, number, number];
}

interface ScenarioSpec {
  detectedPlatform: "METATRADER_5" | "TRADINGVIEW" | "CTRADER" | "OTHER";
  platformConfidence: number;
  fields: FieldSpec[];
  extraWarnings: RecognitionWarning[];
  /** V2 — extra trades of a multi-trade (history) scenario. */
  additionalTrades?: FieldSpec[][];
}

const r = (key: RecognitionFieldKey, value: string, confidence: number, region: [number, number, number, number]): FieldSpec => ({
  key,
  value,
  state: "FOUND",
  confidence,
  region,
});

const SCENARIOS: Record<Exclude<ScenarioKey, "FAILED">, ScenarioSpec> = {
  XAUUSD_BUY: {
    detectedPlatform: "METATRADER_5",
    platformConfidence: 96,
    fields: [
      r("symbol", "XAUUSD", 97, [0.04, 0.12, 0.1, 0.032]),
      r("direction", "BUY", 96, [0.15, 0.12, 0.06, 0.032]),
      r("volume", "0.10", 95, [0.3, 0.28, 0.08, 0.03]),
      r("entryPrice", "2645.32", 98, [0.62, 0.42, 0.12, 0.028]),
      r("exitPrice", "2659.98", 92, [0.62, 0.5, 0.12, 0.028]),
      {
        key: "stopLoss",
        value: "2638.50",
        state: "UNCERTAIN",
        confidence: 72,
        region: [0.62, 0.58, 0.12, 0.028],
      },
      r("takeProfit", "2660.00", 94, [0.62, 0.66, 0.12, 0.028]),
      r("profitLoss", "146.80", 95, [0.78, 0.2, 0.14, 0.03]),
      r("currency", "USD", 98, [0.92, 0.2, 0.05, 0.03]),
      r("openTime", "2025-05-14T09:47:12Z", 91, [0.04, 0.92, 0.18, 0.026]),
      r("closeTime", "2025-05-14T11:32:40Z", 90, [0.23, 0.92, 0.18, 0.026]),
      r("positionId", "48192034", 93, [0.04, 0.04, 0.14, 0.03]),
      r("orderId", "48192041", 88, [0.2, 0.04, 0.14, 0.03]),
      r("accountBalance", "10245.50", 86, [0.78, 0.12, 0.14, 0.03]),
      { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
    ],
    extraWarnings: [
      {
        code: "LOW_CONFIDENCE_FIELD",
        message: "Low confidence on Stop Loss — verify the value before importing.",
        field: "stopLoss",
      },
    ],
  },
  EURUSD_BUY: {
    detectedPlatform: "METATRADER_5",
    platformConfidence: 97,
    fields: [
      r("symbol", "EURUSD", 98, [0.04, 0.12, 0.1, 0.032]),
      r("direction", "BUY", 97, [0.15, 0.12, 0.06, 0.032]),
      r("volume", "0.50", 96, [0.3, 0.28, 0.08, 0.03]),
      r("entryPrice", "1.08432", 98, [0.62, 0.42, 0.12, 0.028]),
      r("exitPrice", "1.08912", 97, [0.62, 0.5, 0.12, 0.028]),
      r("stopLoss", "1.08190", 96, [0.62, 0.58, 0.12, 0.028]),
      r("takeProfit", "1.08980", 95, [0.62, 0.66, 0.12, 0.028]),
      r("profitLoss", "240.00", 97, [0.78, 0.2, 0.14, 0.03]),
      r("currency", "USD", 99, [0.92, 0.2, 0.05, 0.03]),
      r("openTime", "2025-05-15T07:12:05Z", 95, [0.04, 0.92, 0.18, 0.026]),
      r("closeTime", "2025-05-15T09:03:44Z", 94, [0.23, 0.92, 0.18, 0.026]),
      r("positionId", "50231187", 95, [0.04, 0.04, 0.14, 0.03]),
      r("orderId", "50231192", 92, [0.2, 0.04, 0.14, 0.03]),
      r("accountBalance", "10485.50", 90, [0.78, 0.12, 0.14, 0.03]),
      { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
    ],
    extraWarnings: [],
  },
  NAS100_LOW: {
    detectedPlatform: "CTRADER",
    platformConfidence: 81,
    fields: [
      r("symbol", "NAS100", 84, [0.04, 0.12, 0.1, 0.032]),
      r("direction", "SELL", 82, [0.15, 0.12, 0.06, 0.032]),
      {
        key: "volume",
        value: "1.00",
        state: "UNCERTAIN",
        confidence: 61,
        region: [0.3, 0.28, 0.08, 0.03],
      },
      r("entryPrice", "18245.5", 88, [0.62, 0.42, 0.12, 0.028]),
      r("exitPrice", "18190.2", 79, [0.62, 0.5, 0.12, 0.028]),
      {
        key: "stopLoss",
        value: "18310.0",
        state: "UNCERTAIN",
        confidence: 58,
        region: [0.62, 0.58, 0.12, 0.028],
      },
      { key: "takeProfit", value: null, state: "NOT_FOUND", confidence: null },
      r("profitLoss", "553.00", 86, [0.78, 0.2, 0.14, 0.03]),
      r("currency", "USD", 93, [0.92, 0.2, 0.05, 0.03]),
      r("openTime", "2025-05-16T13:30:18Z", 77, [0.04, 0.92, 0.18, 0.026]),
      r("closeTime", "2025-05-16T14:44:02Z", 74, [0.23, 0.92, 0.18, 0.026]),
      r("positionId", "CT-88213", 83, [0.04, 0.04, 0.14, 0.03]),
      { key: "orderId", value: null, state: "NOT_FOUND", confidence: null },
      r("accountBalance", "11038.50", 72, [0.78, 0.12, 0.14, 0.03]),
      { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
    ],
    extraWarnings: [
      {
        code: "LOW_CONFIDENCE_FIELD",
        message: "Low confidence on Stop Loss — verify the value before importing.",
        field: "stopLoss",
      },
      {
        code: "FIELD_NOT_DETECTED",
        message: "Take Profit was not detected on this screenshot — add it manually if the trade had one.",
        field: "takeProfit",
      },
      {
        code: "POSITION_SIZE_UNCERTAIN",
        message: "Position size could not be determined with certainty.",
        field: "volume",
      },
    ],
  },
  BTCUSD_PARTIAL: {
    detectedPlatform: "TRADINGVIEW",
    platformConfidence: 89,
    fields: [
      r("symbol", "BTCUSD", 95, [0.04, 0.12, 0.1, 0.032]),
      r("direction", "BUY", 93, [0.15, 0.12, 0.06, 0.032]),
      {
        key: "volume",
        value: "0.02",
        state: "UNCERTAIN",
        confidence: 68,
        region: [0.3, 0.28, 0.08, 0.03],
      },
      r("entryPrice", "67245.0", 94, [0.62, 0.42, 0.12, 0.028]),
      { key: "exitPrice", value: null, state: "NOT_FOUND", confidence: null },
      { key: "stopLoss", value: null, state: "NOT_FOUND", confidence: null },
      r("takeProfit", "68900.0", 87, [0.62, 0.66, 0.12, 0.028]),
      r("profitLoss", "312.40", 90, [0.78, 0.2, 0.14, 0.03]),
      r("currency", "USD", 96, [0.92, 0.2, 0.05, 0.03]),
      r("openTime", "2025-05-17T02:05:51Z", 82, [0.04, 0.92, 0.18, 0.026]),
      { key: "closeTime", value: null, state: "NOT_FOUND", confidence: null },
      r("positionId", "TV-559021", 85, [0.04, 0.04, 0.14, 0.03]),
      { key: "orderId", value: null, state: "NOT_FOUND", confidence: null },
      r("accountBalance", "11350.90", 78, [0.78, 0.12, 0.14, 0.03]),
      { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
    ],
    extraWarnings: [
      {
        code: "FIELD_NOT_DETECTED",
        message: "Exit price was not detected — the position may still be open or partially visible.",
        field: "exitPrice",
      },
      {
        code: "SCREENSHOT_INCOMPLETE",
        message: "Screenshot appears incomplete — the lower account panel was cut off.",
      },
    ],
  },
  HISTORY_MULTI: {
    detectedPlatform: "METATRADER_5",
    platformConfidence: 95,
    fields: [
      r("symbol", "XAUUSD", 96, [0.04, 0.12, 0.1, 0.032]),
      r("direction", "BUY", 97, [0.15, 0.12, 0.06, 0.032]),
      r("volume", "0.25", 95, [0.3, 0.28, 0.08, 0.03]),
      r("entryPrice", "2645.32", 97, [0.62, 0.42, 0.12, 0.028]),
      r("exitPrice", "2659.98", 94, [0.62, 0.5, 0.12, 0.028]),
      r("stopLoss", "2638.50", 93, [0.62, 0.58, 0.12, 0.028]),
      r("takeProfit", "2660.00", 92, [0.62, 0.66, 0.12, 0.028]),
      r("profitLoss", "366.50", 96, [0.78, 0.2, 0.14, 0.03]),
      r("currency", "USD", 98, [0.92, 0.2, 0.05, 0.03]),
      r("openTime", "2025-05-14T09:47:12Z", 93, [0.04, 0.92, 0.18, 0.026]),
      r("closeTime", "2025-05-14T11:32:40Z", 92, [0.23, 0.92, 0.18, 0.026]),
      r("positionId", "48192034", 94, [0.04, 0.04, 0.14, 0.03]),
      r("orderId", "48192041", 90, [0.2, 0.04, 0.14, 0.03]),
      r("accountBalance", "10245.50", 88, [0.78, 0.12, 0.14, 0.03]),
      { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
    ],
    extraWarnings: [],
    additionalTrades: [
      [
        r("symbol", "EURUSD", 97, [0.04, 0.18, 0.1, 0.032]),
        r("direction", "SELL", 96, [0.15, 0.18, 0.06, 0.032]),
        r("volume", "0.80", 95, [0.3, 0.34, 0.08, 0.03]),
        r("entryPrice", "1.08432", 97, [0.62, 0.48, 0.12, 0.028]),
        r("exitPrice", "1.08122", 95, [0.62, 0.56, 0.12, 0.028]),
        r("stopLoss", "1.08690", 93, [0.62, 0.64, 0.12, 0.028]),
        r("takeProfit", "1.07980", 92, [0.62, 0.72, 0.12, 0.028]),
        r("profitLoss", "248.00", 96, [0.78, 0.26, 0.14, 0.03]),
        r("currency", "USD", 98, [0.92, 0.26, 0.05, 0.03]),
        r("openTime", "2025-05-15T07:12:05Z", 93, [0.04, 0.94, 0.18, 0.026]),
        r("closeTime", "2025-05-15T09:03:44Z", 92, [0.23, 0.94, 0.18, 0.026]),
        r("positionId", "50231187", 94, [0.04, 0.10, 0.14, 0.03]),
        r("orderId", "50231192", 91, [0.2, 0.10, 0.14, 0.03]),
        { key: "accountBalance", value: null, state: "NOT_APPLICABLE", confidence: null },
        { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
      ],
      [
        r("symbol", "NAS100", 93, [0.04, 0.24, 0.1, 0.032]),
        r("direction", "BUY", 94, [0.15, 0.24, 0.06, 0.032]),
        { key: "volume", value: "2.00", state: "UNCERTAIN", confidence: 64, region: [0.3, 0.4, 0.08, 0.03] },
        r("entryPrice", "18245.5", 95, [0.62, 0.54, 0.12, 0.028]),
        r("exitPrice", "18312.0", 93, [0.62, 0.62, 0.12, 0.028]),
        { key: "stopLoss", value: "18190.0", state: "UNCERTAIN", confidence: 66, region: [0.62, 0.7, 0.12, 0.028] },
        r("takeProfit", "18340.0", 90, [0.62, 0.78, 0.12, 0.028]),
        r("profitLoss", "-133.00", 94, [0.78, 0.32, 0.14, 0.03]),
        r("currency", "USD", 97, [0.92, 0.32, 0.05, 0.03]),
        r("openTime", "2025-05-16T13:30:18Z", 91, [0.04, 0.96, 0.18, 0.026]),
        r("closeTime", "2025-05-16T14:44:02Z", 90, [0.23, 0.96, 0.18, 0.026]),
        r("positionId", "CT-88213", 92, [0.04, 0.16, 0.14, 0.03]),
        { key: "orderId", value: null, state: "NOT_FOUND", confidence: null },
        { key: "accountBalance", value: null, state: "NOT_APPLICABLE", confidence: null },
        { key: "accountEquity", value: null, state: "NOT_APPLICABLE", confidence: null },
      ],
    ],
  },
};

/** Deterministic rotation so every scenario is reachable during real use. */
const SCENARIO_ROTATION: ScenarioKey[] = [
  "XAUUSD_BUY",
  "EURUSD_BUY",
  "NAS100_LOW",
  "FAILED",
  "BTCUSD_PARTIAL",
  "HISTORY_MULTI",
];

function buildTrade(index: number, spec: ScenarioSpec): RecognizedTrade {
  const fields = {} as Record<RecognitionFieldKey, RecognizedField>;
  for (const key of RECOGNITION_FIELD_KEYS) {
    const specField = spec.fields.find((f) => f.key === key);
    if (specField === undefined) {
      fields[key] = { key, value: null, state: "NOT_APPLICABLE", confidence: null };
      continue;
    }
    fields[key] = {
      key: specField.key,
      value: specField.value,
      state: specField.state,
      confidence: specField.confidence,
      ...(specField.region
        ? {
            sourceRegion: {
              x: specField.region[0],
              y: specField.region[1],
              width: specField.region[2],
              height: specField.region[3],
            },
          }
        : {}),
    };
  }
  return { index, fields };
}

function buildResult(
  jobId: string,
  spec: ScenarioSpec,
  processingMs: number,
  completedAtMs: number,
): RecognitionResult {
  const trade = buildTrade(1, spec);
  // V2 — multi-trade scenarios: additional trades follow trade #1.
  const trades: RecognizedTrade[] = [
    trade,
    ...(spec.additionalTrades ?? []).map((tradeFields, extraIndex) =>
      buildTrade(extraIndex + 2, { ...spec, fields: tradeFields }),
    ),
  ];
  const foundFields = Object.values(trade.fields).filter(
    (f) => f.state === "FOUND" && f.confidence !== null,
  );
  const uncertain = Object.values(trade.fields).filter(
    (f) => f.state === "UNCERTAIN",
  );
  const notFound = Object.values(trade.fields).filter((f) => f.state === "NOT_FOUND");
  const warnings: RecognitionWarning[] = [...spec.extraWarnings];
  if ((spec.additionalTrades ?? []).length > 0 && !warnings.some((w) => w.code === "MULTIPLE_TRADES_POSSIBLE")) {
    warnings.push({
      code: "MULTIPLE_TRADES_POSSIBLE",
      message: `${trades.length} trades were detected on this upload — review each one before importing.`,
    });
  }
  if (notFound.length > 0 && !warnings.some((w) => w.code === "FIELD_NOT_DETECTED")) {
    warnings.push({
      code: "SCREENSHOT_INCOMPLETE",
      message: "Some trade information was detected, but several fields require review.",
    });
  }
  void uncertain;
  const overall = [...foundFields, ...uncertain];
  const overallConfidence =
    overall.length > 0
      ? Math.round(
          overall.reduce((sum, f) => sum + (f.confidence ?? 0), 0) / overall.length,
        )
      : null;
  return {
    jobId,
    detectedPlatform: spec.detectedPlatform,
    platformConfidence: spec.platformConfidence,
    trades,
    warnings,
    overallConfidence,
    processingMs,
    completedAt: new Date(completedAtMs).toISOString(),
  };
}

// ── Internal store ──────────────────────────────────────────────────────────

interface InternalJob {
  id: string;
  ownerId: string;
  createdAtMs: number;
  platform: CreateRecognitionJobInput["platform"];
  mode: CreateRecognitionJobInput["mode"];
  screenshot: RecognitionScreenshot;
  scenario: ScenarioKey;
  cancelledAtMs: number | null;
  importedTradeId: string | null;
  /** V2 — every canonical trade created by this job (batch confirm). */
  importedTradeIds: string[];
  draft: TradeDraft | null;
  /** V2 — drafts per trade index (index 1 mirrors the scalar draft). */
  drafts: Record<string, TradeDraftWithIndex>;
  /** V3 — the job this reprocess spawned (lineage, spec §45). */
  reprocessedFromJobId: string | null;
  /** V3 — the upload-time duplicate warning fired for this job's asset. */
  duplicateWarned: boolean;
}

/** V2 — in-session analytics ledger (stable tokens; bounded metadata). */
interface OcrEventRecord {
  type: string;
  jobId: string | null;
  metadata: Record<string, number | string> | null;
  atMs: number;
}

/** V2 — corrections memory entry (in-session). */
interface CorrectionEntry {
  field: RecognitionFieldKey;
  rawValue: string | null;
  correctedValue: string;
  count: number;
}

/** V3 — in-session recognition group (N screenshots → one trade draft). */
interface InternalGroup {
  id: string;
  ownerId: string;
  status: RecognitionGroupStatus;
  createdAtMs: number;
  updatedAtMs: number;
  memberJobIds: string[];
  evidence: RecognitionCorrelationEvidence[];
  fusionConfidence: number;
  autoConfirmed: boolean;
  fusedDraft: TradeDraft | null;
  fieldOrigins: Record<string, string>;
  conflicts: RecognitionConflict[];
  timeline: RecognitionTimelineEntry[];
  quality: RecognitionQuality | null;
  importedTradeId: string | null;
}

/** V3 — in-session screenshot collection (references, not storage, §41). */
interface InternalCollection {
  id: string;
  name: string;
  description: string | null;
  assetIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

/** V2 — simulated perceptual anchor: name+size+mime of the upload. The
 * mocked build cannot decode pixels, so visual identity is SIMULATED by
 * file identity — deterministic, honest, and documented. */
function simulatedHashOf(screenshot: { name: string; sizeBytes: number; mimeType: string }): string {
  const key = `${screenshot.name}|${screenshot.sizeBytes}|${screenshot.mimeType}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(2).slice(0, 16);
}

// ── V3 — deterministic quality mirror (spec §28; same math as the API) ──────

const QUALITY_IDENTITY_KEYS: RecognitionFieldKey[] = ["symbol", "direction", "volume", "entryPrice"];

function computeQualityFromResult(
  result: RecognitionResult,
  consistency?: number | null,
): RecognitionQuality {
  const lead = result.trades[0];
  const fields = lead?.fields ?? ({} as Record<RecognitionFieldKey, RecognizedField>);
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

  const confidences = Object.values(fields)
    .filter((field) => field.value !== null && field.confidence !== null)
    .map((field) => field.confidence as number);
  const textRecognition = confidences.length > 0
    ? clamp(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : 0;

  const coreFound = QUALITY_IDENTITY_KEYS.filter((key) => {
    const field = fields[key];
    return field !== undefined && field.value !== null && field.state !== "NOT_FOUND";
  }).length;
  const fieldExtraction = clamp((coreFound / QUALITY_IDENTITY_KEYS.length) * 100);

  let interpretation = 0;
  for (const key of QUALITY_IDENTITY_KEYS) {
    const field = fields[key];
    if (field === undefined || field.value === null) continue;
    interpretation += field.state === "UNCERTAIN" ? 10 : field.state === "FOUND" ? 25 : 0;
  }
  const tradingInterpretation = clamp(interpretation);

  const draft = draftInputFromResult(result.jobId, result, 1);
  const issues = validateDraftCoherence({
    ...draft,
    jobId: result.jobId,
    updatedAt: result.completedAt ?? new Date(0).toISOString(),
  } as TradeDraft);
  const hasPrices = [draft.entryPrice, draft.stopLoss, draft.takeProfit].some((v) => v !== null);
  const hasTimes = draft.openTime !== null || draft.closeTime !== null;
  const applicableRules = (hasPrices ? 2 : 0) + (hasTimes ? 1 : 0);
  const crossFieldValidation =
    applicableRules === 0 ? 0 : clamp(((applicableRules - issues.length) / applicableRules) * 100);

  const resolvedConsistency =
    consistency === null || consistency === undefined ? null : clamp(consistency);

  const parts: Array<{ value: number; weight: number }> = [
    { value: textRecognition, weight: 0.2 },
    { value: fieldExtraction, weight: 0.3 },
    { value: tradingInterpretation, weight: 0.25 },
    { value: crossFieldValidation, weight: 0.25 },
  ];
  if (resolvedConsistency !== null) parts.push({ value: resolvedConsistency, weight: 0.2 });
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
  return {
    overall: clamp(weighted / totalWeight),
    components: {
      textRecognition,
      fieldExtraction,
      tradingInterpretation,
      crossFieldValidation,
      consistency: resolvedConsistency,
    },
  };
}

// ── V3 — fusion mirror (spec §14/§31/§36; condensed deterministic rules) ────

interface FusionMemberProjection {
  jobId: string;
  screenshotName: string;
  trade: RecognizedTrade | null;
  detectedPlatform: string | null;
  screenshotType: string | null;
}

const FUSION_FIELD_KEYS: RecognitionFieldKey[] = [
  "symbol", "direction", "volume", "entryPrice", "exitPrice",
  "stopLoss", "takeProfit", "profitLoss", "currency",
  "openTime", "closeTime", "positionId", "orderId",
];

const TIMESTAMP_PROXIMITY_MS = 4 * 60 * 60 * 1000;
const AUTO_CONFIRM_THRESHOLD = 75;

function memberValue(member: FusionMemberProjection, field: RecognitionFieldKey): string | null {
  const record = member.trade?.fields?.[field];
  if (record === undefined || record === null) return null;
  const cleaned = record.value?.trim().toUpperCase() ?? "";
  return cleaned === "" ? null : cleaned;
}

function memberConfidence(member: FusionMemberProjection, field: RecognitionFieldKey): number | null {
  return member.trade?.fields?.[field]?.confidence ?? null;
}

function correlateMembers(a: FusionMemberProjection, b: FusionMemberProjection): RecognitionCorrelationEvidence[] {
  const evidence: RecognitionCorrelationEvidence[] = [];
  const push = (kind: RecognitionCorrelationKind, score: number, detail: string) =>
    evidence.push({ kind, score, detail });

  const symbolA = memberValue(a, "symbol");
  const symbolB = memberValue(b, "symbol");
  if (symbolA !== null && symbolB !== null) {
    push("SYMBOL", symbolA === symbolB ? 1 : 0,
      symbolA === symbolB ? `symbol ${symbolA} matches on both screenshots` : `symbols differ (${symbolA} vs ${symbolB})`);
  }
  const directionA = memberValue(a, "direction");
  const directionB = memberValue(b, "direction");
  if (directionA !== null && directionB !== null) {
    push("DIRECTION", directionA === directionB ? 1 : 0,
      directionA === directionB ? `direction ${directionA} matches` : `directions differ (${directionA} vs ${directionB})`);
  }
  if (a.detectedPlatform !== null && b.detectedPlatform !== null) {
    push("PLATFORM", a.detectedPlatform === b.detectedPlatform ? 0.8 : 0,
      a.detectedPlatform === b.detectedPlatform ? `platform ${a.detectedPlatform} matches` : "platforms differ");
  }
  const volumeA = memberValue(a, "volume");
  const volumeB = memberValue(b, "volume");
  if (volumeA !== null && volumeB !== null) {
    push("VOLUME", volumeA === volumeB ? 0.6 : 0, volumeA === volumeB ? `volume ${volumeA} matches` : "volumes differ");
  }
  const positionA = memberValue(a, "positionId");
  const positionB = memberValue(b, "positionId");
  if (positionA !== null && positionB !== null) {
    push("POSITION_ID", positionA === positionB ? 1 : 0, positionA === positionB ? "position id matches" : "position ids differ");
  }
  const timesOf = (member: FusionMemberProjection) =>
    [memberValue(member, "openTime"), memberValue(member, "closeTime")]
      .map((value) => (value === null ? Number.NaN : Date.parse(value)))
      .filter((parsed) => !Number.isNaN(parsed));
  let bestDelta: number | null = null;
  for (const timeA of timesOf(a)) {
    for (const timeB of timesOf(b)) {
      const delta = Math.abs(timeA - timeB);
      if (delta <= TIMESTAMP_PROXIMITY_MS && (bestDelta === null || delta < bestDelta)) bestDelta = delta;
    }
  }
  if (bestDelta !== null) {
    push("TIMESTAMP_PROXIMITY",
      Math.round((1 - bestDelta / TIMESTAMP_PROXIMITY_MS) * 100) / 100,
      `recognized timestamps are ${Math.round(bestDelta / 60000)} min apart`);
  }
  if (a.screenshotType !== null && b.screenshotType !== null) {
    push("SCREENSHOT_TYPE", a.screenshotType === b.screenshotType ? 0.5 : 0.7,
      a.screenshotType === b.screenshotType ? "same screenshot type on both" : "complementary screenshot types");
  }
  return evidence;
}

const EVIDENCE_WEIGHTS: Record<string, number> = {
  SYMBOL: 2, DIRECTION: 2, PLATFORM: 1, VOLUME: 1,
  POSITION_ID: 1.5, ORDER_ID: 1.5, TIMESTAMP_PROXIMITY: 1.5,
  SCREENSHOT_TYPE: 1, ACCOUNT: 1,
};

function aggregateEvidenceMock(pairs: RecognitionCorrelationEvidence[][]): {
  fusionConfidence: number;
  autoConfirmed: boolean;
} {
  const byKind = new Map<string, number[]>();
  for (const pair of pairs) {
    for (const item of pair) {
      const bucket = byKind.get(item.kind) ?? [];
      bucket.push(item.score);
      byKind.set(item.kind, bucket);
    }
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [kind, scores] of byKind) {
    const weight = EVIDENCE_WEIGHTS[kind] ?? 1;
    weightedSum += mean(scores) * weight;
    weightTotal += weight;
  }
  let confidence = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0;
  const symbolScores = byKind.get("SYMBOL");
  const directionScores = byKind.get("DIRECTION");
  const symbolMismatch = symbolScores !== undefined && mean(symbolScores) < 1;
  if (symbolMismatch) confidence = Math.min(confidence, 40);
  const directionMismatch = directionScores !== undefined && mean(directionScores) < 1;
  const symbolAgrees = symbolScores !== undefined && mean(symbolScores) === 1;
  const directionAgrees = directionScores !== undefined && mean(directionScores) === 1;
  return {
    fusionConfidence: Math.round(confidence),
    autoConfirmed: !symbolMismatch && !directionMismatch && symbolAgrees && directionAgrees && confidence >= AUTO_CONFIRM_THRESHOLD,
  };
}

function timelineRoleOf(screenshotType: string | null): RecognitionTimelineEntry["role"] {
  const type = (screenshotType ?? "").toUpperCase();
  if (type.includes("HISTORY")) return "EXIT";
  if (type.includes("POSITION")) return "POSITION";
  if (type.includes("ORDER") || type.includes("DETAIL")) return "ENTRY";
  if (type.includes("ACCOUNT")) return "ACCOUNT";
  if (type.includes("CHART")) return "CHART";
  return "UNSPECIFIED";
}

// ── V3 — simulated strategy catalog (documented mock; the real catalog
// arrives with the Playbook domain — schema comment, trades V1 §36) ──────────

const STRATEGY_CATALOG = [
  { id: "stg-gold-breakout", name: "Gold Breakout NY", symbol: "XAUUSD", direction: "BUY" },
  { id: "stg-gold-swing", name: "Gold Swing Reversal", symbol: "XAUUSD", direction: "SELL" },
  { id: "stg-tech-reversal", name: "Tech Index Reversal", symbol: "NAS100", direction: "SELL" },
  { id: "stg-euro-pullback", name: "Euro Session Pullback", symbol: "EURUSD", direction: "BUY" },
  { id: "stg-btc-trend", name: "Bitcoin Trend Rider", symbol: "BTCUSD", direction: "BUY" },
];

/** Deterministic equality matching — suggestions only, never auto-assigned. */
function strategyMatchesFor(symbol: string | null): RecognitionStrategyMatch[] {
  if (symbol === null || symbol.trim().length < 2) return [];
  const normalized = symbol.trim().toUpperCase();
  return STRATEGY_CATALOG.filter((entry) => entry.symbol === normalized)
    .slice(0, 4)
    .map((entry) => ({
      strategyId: entry.id,
      name: entry.name,
      confidence: 70,
      reasons: [`Symbol = ${entry.symbol}`],
    }));
}

/** V3 — how many tracked fields the user's drafts changed vs the machine read. */
const CORRECTION_TRACKED: RecognitionFieldKey[] = [
  "symbol", "direction", "volume", "entryPrice", "exitPrice",
  "stopLoss", "takeProfit", "profitLoss", "currency",
];

function countCorrectedFields(job: InternalJob): number {
  let corrected = 0;
  const result = job.scenario === "FAILED" ? null : buildResult(job.id, SCENARIOS[job.scenario as Exclude<ScenarioKey, "FAILED">], 0, 0);
  if (result === null) return 0;
  for (const draft of Object.values(job.drafts)) {
    const machine = result.trades.find((trade) => trade.index === (draft.tradeIndex ?? 1));
    if (machine === undefined) continue;
    for (const key of CORRECTION_TRACKED) {
      const machineField = machine.fields[key];
      const rawValue =
        machineField !== undefined && machineField.state !== "NOT_FOUND" && machineField.state !== "NOT_APPLICABLE"
          ? machineField.value
          : null;
      const draftValue = (draft as unknown as Record<string, string | null>)[key] ?? null;
      const normalized = draftValue !== null && draftValue !== "" ? draftValue : null;
      if (normalized === null && rawValue === null) continue;
      if (normalized !== rawValue) corrected += 1;
    }
  }
  return corrected;
}

export class OcrRecognitionEngine {
  private screenshots = new Map<string, RecognitionScreenshot>();
  private jobs = new Map<string, InternalJob>();
  private screenshotSeq = 0;
  private jobSeq = 0;
  private tradeSeq = 0;
  private scenarioCursor = 0;
  /** V2 — upload registry keyed by the simulated perceptual anchor. */
  private uploadRegistry = new Map<string, { screenshotId: string; atMs: number }>();
  /** V2 — in-session analytics ledger. */
  private events: OcrEventRecord[] = [];
  /** V2 — in-session corrections memory. */
  private corrections = new Map<string, CorrectionEntry>();
  /** V3 — screenshot ids whose upload fired the duplicate warning. */
  private warnedScreenshotIds = new Set<string>();
  /** V3 — in-session recognition groups. */
  private groups = new Map<string, InternalGroup>();
  /** V3 — in-session screenshot collections. */
  private collections = new Map<string, InternalCollection>();
  private groupSeq = 0;
  private collectionSeq = 0;
  private readonly rotation: readonly ScenarioKey[];

  /** Optional rotation override — unit tests pin scenarios for determinism. */
  constructor(rotation: readonly ScenarioKey[] = SCENARIO_ROTATION) {
    this.rotation = rotation;
  }

  /** Fresh state — used by unit tests. */
  reset(): void {
    this.screenshots.clear();
    this.jobs.clear();
    this.screenshotSeq = 0;
    this.jobSeq = 0;
    this.tradeSeq = 0;
    this.scenarioCursor = 0;
    this.uploadRegistry.clear();
    this.events = [];
    this.corrections.clear();
    this.warnedScreenshotIds.clear();
    this.groups.clear();
    this.collections.clear();
    this.groupSeq = 0;
    this.collectionSeq = 0;
  }

  /** V2 — analytics event recording (bounded metadata only). */
  private recordEvent(type: string, jobId: string | null, metadata?: Record<string, number | string>): void {
    this.events.push({ type, jobId, metadata: metadata ?? null, atMs: Date.now() });
  }

  uploadScreenshot(
    raw: unknown,
    nowMs: number,
  ): { screenshot: RecognitionScreenshot; duplicate?: UploadDuplicateInfo | null } {
    const input = uploadScreenshotInputSchema.parse(raw);
    this.screenshotSeq += 1;
    const screenshot: RecognitionScreenshot = {
      id: `scr_${String(this.screenshotSeq).padStart(4, "0")}`,
      name: input.name,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      uploadedAt: new Date(nowMs).toISOString(),
      ...(input.mimeType === "application/pdf" && input.documentPageCount !== undefined
        ? { documentPageCount: input.documentPageCount }
        : {}),
    };
    this.screenshots.set(screenshot.id, screenshot);
    this.recordEvent("recognition_upload_completed", null, { bytes: input.sizeBytes, mime: input.mimeType });

    // V2 duplicate verdict — SIMULATED by file identity in the mocked build
    // (the real build hashes pixels with dHash in the sidecar). Re-uploading
    // the same file (same name + size + type) warns, never blocks.
    const hash = simulatedHashOf(screenshot);
    const previous = this.uploadRegistry.get(hash);
    let duplicate: UploadDuplicateInfo | null = null;
    if (previous !== undefined && previous.screenshotId !== screenshot.id) {
      const latestJob = [...this.jobs.values()]
        .filter((job) => job.screenshot.id === previous.screenshotId)
        .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
      const importedTradeIds = [...this.jobs.values()]
        .filter((job) => job.screenshot.id === previous.screenshotId)
        .flatMap((job) => job.importedTradeIds);
      duplicate = {
        perceptualHash: hash,
        hammingDistance: 0,
        matchedAssetId: previous.screenshotId,
        matchedUploadName: latestJob?.screenshot.name ?? screenshot.name,
        matchedUploadAt: new Date(previous.atMs).toISOString(),
        latestJobId: latestJob?.id ?? null,
        importedTradeIds,
      };
      this.recordEvent("recognition_duplicate_warned", latestJob?.id ?? null, { hammingDistance: 0 });
    }
    this.uploadRegistry.set(hash, { screenshotId: screenshot.id, atMs: nowMs });
    if (duplicate !== null) this.warnedScreenshotIds.add(screenshot.id);
    return { screenshot, ...(duplicate !== null ? { duplicate } : {}) };
  }

  createJob(raw: unknown, ownerId: string, nowMs: number): RecognitionJob {
    const input = createRecognitionJobInputSchema.parse(raw);
    const screenshot = this.screenshots.get(input.screenshotId);
    if (screenshot === undefined) {
      throw new OcrMockError(404, "Unknown screenshot — upload it again.", "SCREENSHOT_NOT_FOUND");
    }
    this.jobSeq += 1;
    const scenario = this.rotation[this.scenarioCursor % this.rotation.length];
    this.scenarioCursor += 1;
    const job: InternalJob = {
      id: `rec_${String(this.jobSeq).padStart(4, "0")}`,
      ownerId,
      createdAtMs: nowMs,
      platform: input.platform,
      mode: input.mode,
      screenshot,
      scenario,
      cancelledAtMs: null,
      importedTradeId: null,
      importedTradeIds: [],
      draft: null,
      drafts: {},
      reprocessedFromJobId: null,
      duplicateWarned: this.warnedScreenshotIds.has(screenshot.id),
    };
    this.jobs.set(job.id, job);
    this.recordEvent("recognition_started", job.id, { platform: input.platform, mode: input.mode });
    return this.exportJob(job, nowMs);
  }

  getJob(id: string, nowMs: number): RecognitionJob {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    return this.exportJob(job, nowMs);
  }

  listJobs(query: RecognitionJobListQuery = {}, nowMs: number = Date.now()): RecognitionHistoryItem[] {
    let items = [...this.jobs.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((job) => this.exportHistoryItem(job, nowMs));
    // V3 history filters (spec §62) — every facet optional; omitted facets
    // never constrain the list. Server-side (engine) semantics so both the
    // UI and the future live swap behave identically.
    if (query.status !== undefined) items = items.filter((item) => item.status === query.status);
    if (query.platform !== undefined) items = items.filter((item) => item.platform === query.platform);
    if (query.mimeType !== undefined) items = items.filter((item) => item.mimeType === query.mimeType);
    if (query.duplicate !== undefined) {
      const want = query.duplicate === "true";
      items = items.filter((item) => (item.duplicateWarned ?? false) === want);
    }
    if (query.corrected !== undefined) {
      const want = query.corrected === "true";
      items = items.filter((item) => ((item.correctedCount ?? 0) > 0) === want);
    }
    if (query.minConfidence !== undefined) {
      items = items.filter((item) => item.overallConfidence !== null && item.overallConfidence >= query.minConfidence!);
    }
    if (query.from !== undefined) {
      const lower = `${query.from}T00:00:00.000Z`;
      items = items.filter((item) => item.createdAt >= lower);
    }
    if (query.to !== undefined) {
      const upper = `${query.to}T23:59:59.999Z`;
      items = items.filter((item) => item.createdAt <= upper);
    }
    return items;
  }

  getResult(id: string, nowMs: number): RecognitionResult {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    if (derived.status === "PENDING" || derived.status === "PROCESSING") {
      throw new OcrMockError(409, "Recognition is still running.", "NOT_READY");
    }
    if (derived.status === "CANCELLED") {
      throw new OcrMockError(409, "Recognition was cancelled before completing.", "NOT_AVAILABLE");
    }
    if (derived.status === "FAILED") {
      throw new OcrMockError(
        409,
        "Recognition failed — no result is available.",
        "NOT_AVAILABLE",
      );
    }
    return this.resultFor(job);
  }

  getDraft(id: string): TradeDraft | null {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    return job.draft;
  }

  updateDraft(
    id: string,
    raw: unknown,
    nowMs: number,
    tradeIndex = 1,
  ): TradeDraftWithIndex {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    if (derived.status !== "COMPLETED") {
      throw new OcrMockError(
        409,
        "Wait for recognition to complete before saving a draft.",
        "JOB_NOT_COMPLETED",
      );
    }
    const parsed = parseTradeDraft({
      ...(raw as TradeDraftInput),
      jobId: job.id,
      updatedAt: new Date(nowMs).toISOString(),
    });
    const coherence = validateDraftCoherence(parsed);
    if (coherence.length > 0) {
      throw new OcrMockError(422, coherence[0].message, "DRAFT_INVALID");
    }
    const draft: TradeDraftWithIndex = { ...parsed, jobId: job.id, updatedAt: parsed.updatedAt, tradeIndex };
    job.drafts[String(tradeIndex)] = draft;
    if (tradeIndex === 1) job.draft = draft;

    // V2 corrections memory — machine read vs the user's declaration.
    const result = this.resultFor(job);
    const trade = result.trades.find((entry) => entry.index === tradeIndex);
    if (trade !== undefined) {
      const tracked: RecognitionFieldKey[] = [
        "symbol", "direction", "volume", "entryPrice", "exitPrice",
        "stopLoss", "takeProfit", "profitLoss", "currency",
      ];
      let corrected = 0;
      for (const key of tracked) {
        const machine = trade.fields[key];
        const rawValue = machine !== undefined && machine.state !== "NOT_FOUND" && machine.state !== "NOT_APPLICABLE"
          ? machine.value
          : null;
        const draftValue = (parsed as unknown as Record<string, string | null>)[key] ?? null;
        const normalized = draftValue !== null && draftValue !== "" ? draftValue : null;
        if (normalized === null && rawValue === null) continue;
        if (normalized === rawValue) continue;
        corrected += 1;
        const memoryKey = `${key}|${rawValue ?? ""}|${normalized ?? ""}`;
        const entry = this.corrections.get(memoryKey);
        if (entry === undefined) {
          this.corrections.set(memoryKey, { field: key, rawValue, correctedValue: normalized ?? "", count: 1 });
        } else {
          entry.count += 1;
        }
      }
      if (corrected > 0) {
        this.recordEvent("recognition_field_corrected", job.id, { field: "mixed", count: corrected, tradeIndex });
      }
    }
    this.recordEvent("recognition_review_started", job.id, { tradeIndex });
    return draft;
  }

  /** V2 — every draft slot of the job (one per detected trade). */
  getDrafts(id: string): Array<{ tradeIndex: number; draft: TradeDraftWithIndex | null }> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const detected = this.resultFor(job).trades.length;
    const slots: Array<{ tradeIndex: number; draft: TradeDraftWithIndex | null }> = [];
    for (let tradeIndex = 1; tradeIndex <= Math.max(detected, 1); tradeIndex += 1) {
      slots.push({ tradeIndex, draft: job.drafts[String(tradeIndex)] ?? null });
    }
    return slots;
  }

  /** V2 — crop re-recognition (simulated): zone fields get a confidence lift. */
  recrop(id: string, region: CropRegion, tradeIndex: number, nowMs: number): RecognitionResult {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    if (derived.status !== "COMPLETED") {
      throw new OcrMockError(409, "Wait for recognition to complete before re-reading a zone.", "JOB_NOT_COMPLETED");
    }
    const result = this.resultFor(job);
    const zone = {
      x0: region.x,
      y0: region.y,
      x1: Math.min(1, region.x + region.width),
      y1: Math.min(1, region.y + region.height),
    };
    let refined = 0;
    for (const trade of result.trades) {
      if (trade.index !== tradeIndex) continue;
      for (const key of RECOGNITION_FIELD_KEYS) {
        const field = trade.fields[key];
        const box = field.sourceRegion;
        if (box === undefined) continue;
        const intersects =
          box.x < zone.x1 && box.x + box.width > zone.x0 && box.y < zone.y1 && box.y + box.height > zone.y0;
        if (!intersects) continue;
        refined += 1;
        if (field.value !== null) {
          trade.fields[key] = { ...field, state: "FOUND", confidence: Math.max(field.confidence ?? 0, 97) };
        } else {
          trade.fields[key] = { ...field, state: "UNCERTAIN", confidence: 68 };
        }
      }
    }
    this.recordEvent("recognition_recropped", job.id, { tradeIndex, refined });
    return result;
  }

  /** V2 — suggestions from the in-session corrections memory (+ simulated catalog). */
  getSuggestions(symbol: string | null): {
    suggestions: RecognitionSuggestion[];
    symbolCandidates: Array<{ symbol: string; name: string; assetClass: string }>;
    strategyMatches?: RecognitionStrategyMatch[];
  } {
    const byField = new Map<RecognitionFieldKey, CorrectionEntry[]>();
    for (const entry of this.corrections.values()) {
      const bucket = byField.get(entry.field) ?? [];
      bucket.push(entry);
      byField.set(entry.field, bucket);
    }
    const suggestions: RecognitionSuggestion[] = [...byField.entries()]
      .map(([field, bucket]) => ({
        field,
        values: bucket
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((entry) => ({ value: entry.correctedValue, count: entry.count, source: "CORRECTIONS_MEMORY" as const })),
      }))
      .filter((suggestion) => suggestion.values.length > 0)
      .sort((a, b) => a.field.localeCompare(b.field));
    const CATALOG = [
      { symbol: "XAUUSD", name: "Gold vs US Dollar", assetClass: "METAL" },
      { symbol: "XAGUSD", name: "Silver vs US Dollar", assetClass: "METAL" },
      { symbol: "EURUSD", name: "Euro vs US Dollar", assetClass: "FOREX" },
      { symbol: "GBPUSD", name: "Pound vs US Dollar", assetClass: "FOREX" },
      { symbol: "USDJPY", name: "US Dollar vs Yen", assetClass: "FOREX" },
      { symbol: "NAS100", name: "US Tech 100 Index", assetClass: "INDEX" },
      { symbol: "BTCUSD", name: "Bitcoin vs US Dollar", assetClass: "CRYPTO" },
    ];
    const symbolCandidates =
      symbol !== null && symbol.trim().length >= 2
        ? CATALOG.filter((entry) => entry.symbol.startsWith(symbol.trim().toUpperCase())).slice(0, 6)
        : [];
    // V3 — deterministic strategy/playbook matches (spec §38–§40). The
    // simulated catalog stands in for the future Playbook domain; matches
    // are SUGGESTIONS the user must accept, never auto-assignments.
    const strategyMatches = strategyMatchesFor(symbol);
    return { suggestions, symbolCandidates, ...(strategyMatches.length > 0 ? { strategyMatches } : {}) };
  }

  /** V2 — in-session analytics (funnel, corrections, duplicates, performance). */
  getAnalytics(windowDays: number): RecognitionAnalyticsResponse {
    const cutoffMs = Date.now() - Math.min(Math.max(windowDays, 1), 365) * 24 * 60 * 60 * 1000;
    const events = this.events.filter((event) => event.atMs >= cutoffMs);
    const count = (type: string): number => events.filter((event) => event.type === type).length;
    const confirmedEvents = events.filter((event) => event.type === "recognition_import_confirmed");
    const confirmedTrades = confirmedEvents.reduce((sum, event) => sum + Number(event.metadata?.trades ?? 1), 0);
    const correctionsByField = new Map<RecognitionFieldKey, number>();
    let correctedTotal = 0;
    for (const entry of this.corrections.values()) {
      correctionsByField.set(entry.field, (correctionsByField.get(entry.field) ?? 0) + entry.count);
      correctedTotal += entry.count;
    }
    const confirmedFields = confirmedTrades * 9; // the tracked field count
    const completedJobs = [...this.jobs.values()].filter(
      (job) => this.derive(job, Date.now()).status === "COMPLETED",
    );
    const avgProcessingMs =
      completedJobs.length > 0
        ? Math.round(
            completedJobs.reduce((sum) => sum + TOTAL_PIPELINE_MS, 0) / completedJobs.length,
          )
        : null;
    const confidenceValues = completedJobs.map((job) => {
      const spec = SCENARIOS[job.scenario as Exclude<ScenarioKey, "FAILED">];
      return spec ? buildResult(job.id, spec, 0, 0).overallConfidence ?? 0 : 0;
    });
    const avgOverallConfidence =
      confidenceValues.length > 0
        ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
        : null;
    return {
      windowDays: Math.min(Math.max(windowDays, 1), 365),
      funnel: {
        uploads: count("recognition_upload_completed"),
        jobs: count("recognition_started"),
        completed: count("recognition_completed"),
        failed: count("recognition_failed") + completedJobs.filter((job) => job.scenario === "FAILED").length,
        cancelled: count("recognition_cancelled"),
        reviewStarted: count("recognition_review_started"),
        confirmed: confirmedEvents.length,
        confirmedTrades,
      },
      duplicates: {
        warnings: count("recognition_duplicate_warned"),
        processed: count("recognition_duplicate_processed"),
      },
      corrections: {
        confirmedFields,
        correctedFields: correctedTotal,
        byField: [...correctionsByField.entries()].map(([field, corrected]) => ({
          field,
          corrected,
          total: confirmedFields,
          rate: confirmedFields > 0 ? Math.min(1, corrected / confirmedFields) : 0,
        })),
      },
      performance: { avgProcessingMs, avgOverallConfidence: confidenceValues.length > 0 ? avgOverallConfidence : null },
      perDay: [],
    };
  }

  /** V2 — storage snapshot (in-session assets; retention disabled in mocks). */
  getStorage(): RecognitionStorageResponse {
    const assets = [...this.screenshots.values()];
    return {
      assetsCount: assets.length,
      totalBytes: assets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
      oldestUploadAt:
        assets.length > 0
          ? assets.map((asset) => asset.uploadedAt).sort((a, b) => a.localeCompare(b))[0] ?? null
          : null,
      retentionDays: 0,
      nextSweepAt: null,
    };
  }

  /** V2 — SSE-equivalent snapshot for the mocked build (poll seam). */
  getProgress(id: string, nowMs: number): {
    jobId: string;
    status: RecognitionJob["status"];
    stage: RecognitionStage;
    progress: number;
    at: string;
    terminal: boolean;
  } {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    const terminal = derived.status === "COMPLETED" || derived.status === "FAILED" || derived.status === "CANCELLED";
    return {
      jobId: job.id,
      status: derived.status,
      stage: derived.stage,
      progress: derived.progress,
      at: new Date(nowMs).toISOString(),
      terminal,
    };
  }

  confirmImport(
    id: string,
    nowMs: number,
    input: ConfirmImportInput = {},
  ): {
    tradeId: string;
    trades: Array<{ tradeId: string; tradeIndex: number }>;
    accountId?: string;
    job: RecognitionJob;
  } {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    // Idempotent replay — the SAME trade ids, never a second import (§79).
    if (job.importedTradeIds.length > 0) {
      return {
        tradeId: job.importedTradeIds[0] ?? job.importedTradeId ?? "",
        trades: job.importedTradeIds.map((tradeId, index) => ({ tradeId, tradeIndex: index + 1 })),
        job: this.exportJob(job, nowMs),
      };
    }
    const derived = this.derive(job, nowMs);
    if (derived.status !== "COMPLETED") {
      throw new OcrMockError(409, "Only completed recognitions can be imported.", "JOB_NOT_COMPLETED");
    }
    const detected = this.resultFor(job).trades.length;
    const draftedIndexes = Object.keys(job.drafts).map((key) => Number(key));
    const requestedIndexes =
      input.tradeIndexes !== undefined && input.tradeIndexes.length > 0
        ? [...new Set(input.tradeIndexes)]
        : draftedIndexes;
    if (input.tradeIndexes !== undefined && requestedIndexes.length === 0) {
      throw new OcrMockError(409, "No trade indexes were requested.", "NO_DRAFT");
    }
    if (requestedIndexes.length === 0) {
      throw new OcrMockError(409, "Review the trade draft before importing.", "NO_DRAFT");
    }
    const batch: Array<{ tradeIndex: number; draft: TradeDraftWithIndex }> = [];
    const missing: number[] = [];
    for (const tradeIndex of requestedIndexes.sort((a, b) => a - b)) {
      if (tradeIndex > Math.max(detected, 1)) {
        missing.push(tradeIndex);
        continue;
      }
      const draft = job.drafts[String(tradeIndex)];
      if (draft === undefined) {
        missing.push(tradeIndex);
        continue;
      }
      const coherence = validateDraftCoherence(draft);
      if (coherence.length > 0) {
        throw new OcrMockError(422, coherence[0].message, "DRAFT_INVALID");
      }
      batch.push({ tradeIndex, draft });
    }
    if (missing.length > 0) {
      throw new OcrMockError(
        409,
        `Review and save a draft for trade ${missing.join(", ")} before importing.`,
        "NO_DRAFT",
      );
    }
    const trades = batch.map(({ tradeIndex }) => {
      this.tradeSeq += 1;
      const tradeId = `TRD-OCR-${String(this.tradeSeq).padStart(3, "0")}`;
      return { tradeId, tradeIndex };
    });
    job.importedTradeIds = trades.map((entry) => entry.tradeId);
    job.importedTradeId = job.importedTradeIds[0] ?? null;
    this.recordEvent("recognition_import_confirmed", job.id, {
      trades: trades.length,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    });
    return {
      tradeId: job.importedTradeIds[0] ?? "",
      trades,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      job: this.exportJob(job, nowMs),
    };
  }

  cancelJob(id: string, nowMs: number): RecognitionJob {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    if (derived.status !== "PENDING" && derived.status !== "PROCESSING") {
      throw new OcrMockError(409, "This recognition is no longer running.", "NOT_CANCELLABLE");
    }
    job.cancelledAtMs = nowMs;
    this.recordEvent("recognition_cancelled", job.id);
    return this.exportJob(job, nowMs);
  }

  retryJob(id: string, nowMs: number): RecognitionJob {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(job, nowMs);
    if (derived.status !== "FAILED") {
      throw new OcrMockError(409, "Only failed recognitions can be retried.", "NOT_RETRYABLE");
    }
    // Re-run the same screenshot through the pipeline as a NEW job (§56) —
    // the next rotation entry keeps the sequence deterministic.
    const scenario =
      this.rotation[this.scenarioCursor % this.rotation.length];
    this.scenarioCursor += 1;
    this.jobSeq += 1;
    const retry: InternalJob = {
      id: `rec_${String(this.jobSeq).padStart(4, "0")}`,
      ownerId: job.ownerId,
      createdAtMs: nowMs,
      platform: job.platform,
      mode: job.mode,
      screenshot: job.screenshot,
      scenario,
      cancelledAtMs: null,
      importedTradeId: null,
      importedTradeIds: [],
      draft: null,
      drafts: {},
      reprocessedFromJobId: null,
      duplicateWarned: job.duplicateWarned,
    };
    this.jobs.set(retry.id, retry);
    return this.exportJob(retry, nowMs);
  }

  deleteJob(id: string): void {
    if (!this.jobs.has(id)) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    this.jobs.delete(id);
  }

  // ── V3 — reprocess, fusion groups, collections ────────────────────────────

  /**
   * V3 reprocess (spec §45): run a NEW recognition over the SAME asset with
   * the current pipeline. The historical recognition (and any trade it
   * produced) is NEVER mutated — the response is a fresh job the user
   * reviews exactly like any other.
   */
  reprocessJob(id: string, nowMs: number): { job: RecognitionJob; reprocessedFromJobId: string } {
    const source = this.jobs.get(id);
    if (source === undefined) {
      throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
    }
    const derived = this.derive(source, nowMs);
    if (derived.status !== "COMPLETED" && derived.status !== "FAILED" && derived.status !== "CANCELLED") {
      throw new OcrMockError(
        409,
        "Wait for the current recognition to finish before re-running it.",
        "NOT_REPROCESSABLE",
      );
    }
    const scenario = this.rotation[this.scenarioCursor % this.rotation.length];
    this.scenarioCursor += 1;
    this.jobSeq += 1;
    const job: InternalJob = {
      id: `rec_${String(this.jobSeq).padStart(4, "0")}`,
      ownerId: source.ownerId,
      createdAtMs: nowMs,
      platform: source.platform,
      mode: source.mode,
      screenshot: source.screenshot,
      scenario,
      cancelledAtMs: null,
      importedTradeId: null,
      importedTradeIds: [],
      draft: null,
      drafts: {},
      reprocessedFromJobId: source.id,
      duplicateWarned: source.duplicateWarned,
    };
    this.jobs.set(job.id, job);
    this.recordEvent("recognition_reprocessed", job.id, { sourceJobId: source.id });
    return { job: this.exportJob(job, nowMs), reprocessedFromJobId: source.id };
  }

  // ── V3 — multi-screenshot fusion groups (spec §14/§15/§31/§36) ────────────

  private scenarioTypeOf(scenario: ScenarioKey): string {
    return scenario === "HISTORY_MULTI" ? "MT5_HISTORY" : "MT5_TRADE";
  }

  private memberProjectionOf(job: InternalJob): FusionMemberProjection {
    const result = this.resultFor(job);
    return {
      jobId: job.id,
      screenshotName: job.screenshot.name,
      trade: result.trades[0] ?? null,
      detectedPlatform: result.detectedPlatform,
      screenshotType: this.scenarioTypeOf(job.scenario),
    };
  }

  private exportGroup(group: InternalGroup): RecognitionGroup {
    const members: RecognitionGroup["members"] = [];
    for (const jobId of group.memberJobIds) {
      const job = this.jobs.get(jobId);
      if (job === undefined) continue; // deleted screenshots leave the group view, never break it
      const projection = this.memberProjectionOf(job);
      members.push({
        jobId: job.id,
        status: this.derive(job, Date.now()).status,
        screenshotName: projection.screenshotName,
        detectedPlatform: projection.detectedPlatform as RecognitionGroup["members"][number]["detectedPlatform"],
        screenshotType: projection.screenshotType,
        trade: projection.trade,
        overallConfidence: projection.trade === null ? null : computeQualityFromResult(this.resultFor(job)).overall,
        uploadedAt: job.screenshot.uploadedAt,
      });
    }
    return {
      id: group.id,
      ownerId: group.ownerId,
      status: group.status,
      members,
      evidence: group.evidence,
      fusionConfidence: group.fusionConfidence,
      autoConfirmed: group.autoConfirmed,
      fusedDraft: group.fusedDraft,
      fieldOrigins: group.fieldOrigins,
      conflicts: group.conflicts,
      timeline: group.timeline,
      quality: group.quality,
      importedTradeId: group.importedTradeId,
      createdAt: new Date(group.createdAtMs).toISOString(),
      updatedAt: new Date(group.updatedAtMs).toISOString(),
    };
  }

  /** Create a group from 2..8 completed jobs (spec §14/§15). */
  createGroup(raw: unknown, ownerId: string, nowMs: number): { group: RecognitionGroup } {
    const input = raw as { jobIds?: unknown };
    const jobIds = Array.isArray(input?.jobIds) ? input.jobIds : [];
    const unique = [...new Set(jobIds.filter((id): id is string => typeof id === "string"))];
    if (unique.length < 2 || unique.length > 8) {
      throw new OcrMockError(
        400,
        "Select between 2 and 8 completed recognitions to group.",
        "VALIDATION_ERROR",
      );
    }
    const jobs: InternalJob[] = [];
    for (const jobId of unique) {
      const job = this.jobs.get(jobId);
      if (job === undefined) {
        throw new OcrMockError(404, "Recognition job not found.", "JOB_NOT_FOUND");
      }
      if (this.derive(job, nowMs).status !== "COMPLETED") {
        throw new OcrMockError(
          409,
          "Only completed recognitions can be grouped.",
          "JOB_NOT_COMPLETED",
        );
      }
      jobs.push(job);
    }

    const projections = jobs.map((job) => this.memberProjectionOf(job));
    const lead = projections[0];
    if (lead === undefined) {
      throw new OcrMockError(400, "Select between 2 and 8 completed recognitions to group.", "VALIDATION_ERROR");
    }
    const pairs = projections.slice(1).map((member) => correlateMembers(lead, member));
    const evidence = pairs.flat().slice(0, 24);
    const { fusionConfidence, autoConfirmed } = aggregateEvidenceMock(pairs);

    // Fused draft: strongest field confidence wins, ties → earliest member.
    const values: Record<string, string | null> = {};
    const fieldOrigins: Record<string, string> = {};
    const conflicts: RecognitionConflict[] = [];
    for (const field of FUSION_FIELD_KEYS) {
      const present = projections
        .map((projection) => ({
          jobId: projection.jobId,
          screenshotName: projection.screenshotName,
          value: memberValue(projection, field),
          confidence: memberConfidence(projection, field),
        }))
        .filter((entry): entry is { jobId: string; screenshotName: string; value: string; confidence: number | null } => entry.value !== null);
      if (present.length === 0) {
        values[field] = null;
        continue;
      }
      const first = present[0];
      if (first === undefined) {
        values[field] = null;
        continue;
      }
      let best: { jobId: string; screenshotName: string; value: string; confidence: number | null } = first;
      for (const candidate of present.slice(1)) {
        if ((candidate.confidence ?? -1) > (best.confidence ?? -1)) best = candidate;
      }
      values[field] = best.value;
      fieldOrigins[field] = best.jobId;
      const distinct = new Set(present.map((entry) => entry.value));
      if (distinct.size > 1) {
        conflicts.push({
          field,
          values: present.slice(0, 8).map((entry) => ({
            jobId: entry.jobId,
            screenshotName: entry.screenshotName,
            value: entry.value,
            confidence: entry.confidence,
          })),
          selectedJobId: best.jobId,
        });
      }
    }

    // Timeline: recognized timestamps only — never invented (spec §36).
    const timelineEntries = projections.map((projection) => {
      const openTime = memberValue(projection, "openTime");
      const closeTime = memberValue(projection, "closeTime");
      const at = openTime ?? closeTime;
      const parsed = at === null ? Number.NaN : Date.parse(at);
      return {
        jobId: projection.jobId,
        screenshotName: projection.screenshotName,
        role: timelineRoleOf(projection.screenshotType),
        at: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      };
    });
    const withTime = timelineEntries
      .filter((entry) => entry.at !== null)
      .sort((a, b) => Date.parse(a.at as string) - Date.parse(b.at as string));
    const withoutTime = timelineEntries.filter((entry) => entry.at === null);
    const timeline = [...withTime, ...withoutTime].slice(0, 8);

    // Group consistency = mean pairwise identity agreement (0..100).
    const identityScores = pairs.map((pair) => {
      const identity = pair.filter((item) => item.kind === "SYMBOL" || item.kind === "DIRECTION");
      return identity.length > 0 ? identity.reduce((sum, item) => sum + item.score, 0) / identity.length : 0;
    });
    const consistency =
      identityScores.length > 0
        ? Math.round((identityScores.reduce((sum, value) => sum + value, 0) / identityScores.length) * 100)
        : 0;

    // Fusable = the fused read has an identity (symbol + direction).
    const direction = values.direction === "SELL" ? "SELL" : values.direction === "BUY" ? "BUY" : null;
    const fusable =
      typeof values.symbol === "string" && values.symbol !== "" && direction !== null;
    const leadResult = this.resultFor(jobs[0] as InternalJob);
    const quality = computeQualityFromResult(leadResult, consistency);

    this.groupSeq += 1;
    const group: InternalGroup = {
      id: `grp_${String(this.groupSeq).padStart(3, "0")}`,
      ownerId,
      status: "PROPOSED",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      memberJobIds: unique,
      evidence,
      fusionConfidence,
      autoConfirmed: autoConfirmed && fusable,
      fusedDraft: null,
      fieldOrigins,
      conflicts: conflicts.slice(0, 16),
      timeline,
      quality,
      importedTradeId: null,
    };
    if (fusable) {
      // Machine values only — the derivation NEVER invents a value (§24).
      group.fusedDraft = {
        jobId: group.id,
        updatedAt: new Date(nowMs).toISOString(),
        symbol: values.symbol as string,
        direction: direction as TradeDraftInput["direction"],
        platform: (leadResult.detectedPlatform ?? "OTHER") as TradeDraftInput["platform"],
        entryPrice: values.entryPrice ?? null,
        exitPrice: values.exitPrice ?? null,
        volume: values.volume ?? null,
        stopLoss: values.stopLoss ?? null,
        takeProfit: values.takeProfit ?? null,
        profitLoss: values.profitLoss ?? null,
        currency: values.currency ?? null,
        openTime: values.openTime ?? null,
        closeTime: values.closeTime ?? null,
        positionId: values.positionId ?? null,
        orderId: values.orderId ?? null,
      };
      if (group.autoConfirmed) group.status = "ACTIVE";
    }
    this.groups.set(group.id, group);
    this.recordEvent("recognition_group_created", null, {
      members: unique.length,
      fusionConfidence,
      autoConfirmed: group.autoConfirmed ? "true" : "false",
    });
    return { group: this.exportGroup(group) };
  }

  listGroups(): { groups: RecognitionGroupSummary[] } {
    const groups = [...this.groups.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((group) => {
        const leadJobId = group.memberJobIds[0];
        const leadJob = leadJobId !== undefined ? this.jobs.get(leadJobId) : undefined;
        return {
          id: group.id,
          status: group.status,
          memberCount: group.memberJobIds.length,
          leadScreenshotName: leadJob?.screenshot.name ?? "(removed screenshot)",
          fusionConfidence: group.fusionConfidence,
          importedTradeId: group.importedTradeId,
          createdAt: new Date(group.createdAtMs).toISOString(),
        };
      });
    return { groups };
  }

  getGroup(id: string): { group: RecognitionGroup } {
    const group = this.groups.get(id);
    if (group === undefined) {
      throw new OcrMockError(404, "Recognition group not found.", "GROUP_NOT_FOUND");
    }
    return { group: this.exportGroup(group) };
  }

  /** Edit the fused draft — SAME validated rules as a job draft (§74). */
  updateGroupDraft(id: string, raw: unknown, nowMs: number): { draft: TradeDraft } {
    const group = this.groups.get(id);
    if (group === undefined) {
      throw new OcrMockError(404, "Recognition group not found.", "GROUP_NOT_FOUND");
    }
    if (group.status !== "PROPOSED" && group.status !== "ACTIVE") {
      throw new OcrMockError(
        409,
        "This group is finished and its draft can no longer change.",
        "GROUP_ALREADY_CONFIRMED",
      );
    }
    const parsed = parseTradeDraft({
      ...(raw as TradeDraftInput),
      jobId: group.id,
      updatedAt: new Date(nowMs).toISOString(),
    });
    const coherence = validateDraftCoherence(parsed);
    if (coherence.length > 0) {
      throw new OcrMockError(422, coherence[0].message, "DRAFT_INVALID");
    }
    group.fusedDraft = parsed;
    group.status = "ACTIVE";
    group.updatedAtMs = nowMs;
    return { draft: parsed };
  }

  /**
   * THE group human-in-the-loop gate: converts the fused draft into exactly
   * ONE canonical trade (idempotent per group — replay returns the SAME id).
   */
  confirmGroup(
    id: string,
    nowMs: number,
    input: { accountId?: string } = {},
  ): { tradeId: string; group: RecognitionGroup } {
    const group = this.groups.get(id);
    if (group === undefined) {
      throw new OcrMockError(404, "Recognition group not found.", "GROUP_NOT_FOUND");
    }
    // Idempotent replay — the SAME trade id, never a second import (§51).
    if (group.status === "CONFIRMED") {
      if (group.importedTradeId !== null) {
        return { tradeId: group.importedTradeId, group: this.exportGroup(group) };
      }
      throw new OcrMockError(
        409,
        "This group confirmation is being finalized — retry in a moment.",
        "GROUP_ALREADY_CONFIRMED",
      );
    }
    if (group.status !== "PROPOSED" && group.status !== "ACTIVE") {
      throw new OcrMockError(
        409,
        "This group was discarded and can no longer be imported.",
        "GROUP_ALREADY_CONFIRMED",
      );
    }
    if (group.fusedDraft === null) {
      throw new OcrMockError(409, "Review the fused trade draft before importing.", "NO_DRAFT");
    }
    const coherence = validateDraftCoherence(group.fusedDraft);
    if (coherence.length > 0) {
      throw new OcrMockError(422, coherence[0].message, "DRAFT_INVALID");
    }
    this.tradeSeq += 1;
    group.importedTradeId = `TRD-OCR-${String(this.tradeSeq).padStart(3, "0")}`;
    group.status = "CONFIRMED";
    group.updatedAtMs = nowMs;
    this.recordEvent("recognition_group_confirmed", null, {
      groupId: group.id,
      members: group.memberJobIds.length,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    });
    return { tradeId: group.importedTradeId, group: this.exportGroup(group) };
  }

  /** Dissolve a group — every member recognition stays intact (spec §15). */
  discardGroup(id: string): { ok: boolean } {
    const group = this.groups.get(id);
    if (group === undefined) {
      throw new OcrMockError(404, "Recognition group not found.", "GROUP_NOT_FOUND");
    }
    if (group.status !== "PROPOSED" && group.status !== "ACTIVE") {
      throw new OcrMockError(
        409,
        "This group is already finished.",
        "GROUP_ALREADY_CONFIRMED",
      );
    }
    group.status = "DISCARDED";
    group.updatedAtMs = Date.now();
    this.recordEvent("recognition_group_discarded", null, { groupId: group.id });
    return { ok: true };
  }

  // ── V3 — screenshot collections (spec §41) ────────────────────────────────

  private exportCollectionSummary(collection: InternalCollection): RecognitionCollection {
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      assetsCount: collection.assetIds.length,
      createdAt: new Date(collection.createdAtMs).toISOString(),
      updatedAt: new Date(collection.updatedAtMs).toISOString(),
    };
  }

  private exportCollectionDetail(collection: InternalCollection): RecognitionCollectionDetail {
    const assets = collection.assetIds
      .map((assetId) => this.screenshots.get(assetId))
      .filter((asset): asset is RecognitionScreenshot => asset !== undefined)
      .slice(0, 200);
    return { ...this.exportCollectionSummary(collection), assets };
  }

  createCollection(raw: unknown, nowMs: number): { collection: RecognitionCollectionDetail } {
    const input = raw as { name?: unknown; description?: unknown };
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (name.length < 1 || name.length > 64) {
      throw new OcrMockError(400, "The collection name is required (1–64 characters).", "VALIDATION_ERROR");
    }
    let description: string | null = null;
    if (typeof input?.description === "string") {
      const trimmed = input.description.trim();
      if (trimmed.length > 280) {
        throw new OcrMockError(400, "The collection description must be 280 characters or fewer.", "VALIDATION_ERROR");
      }
      description = trimmed === "" ? null : trimmed;
    }
    this.collectionSeq += 1;
    const collection: InternalCollection = {
      id: `col_${String(this.collectionSeq).padStart(3, "0")}`,
      name,
      description,
      assetIds: [],
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.collections.set(collection.id, collection);
    this.recordEvent("recognition_collection_created", null, { collectionId: collection.id });
    return { collection: this.exportCollectionDetail(collection) };
  }

  listCollections(): { collections: RecognitionCollection[] } {
    return {
      collections: [...this.collections.values()]
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .map((collection) => this.exportCollectionSummary(collection)),
    };
  }

  getCollection(id: string): { collection: RecognitionCollectionDetail } {
    const collection = this.collections.get(id);
    if (collection === undefined) {
      throw new OcrMockError(404, "Collection not found.", "COLLECTION_NOT_FOUND");
    }
    return { collection: this.exportCollectionDetail(collection) };
  }

  deleteCollection(id: string): { ok: boolean } {
    const collection = this.collections.get(id);
    if (collection === undefined) {
      throw new OcrMockError(404, "Collection not found.", "COLLECTION_NOT_FOUND");
    }
    this.collections.delete(id);
    this.recordEvent("recognition_collection_deleted", null, { collectionId: id });
    return { ok: true };
  }

  addCollectionAsset(collectionId: string, assetId: string): { collection: RecognitionCollectionDetail } {
    const collection = this.collections.get(collectionId);
    if (collection === undefined) {
      throw new OcrMockError(404, "Collection not found.", "COLLECTION_NOT_FOUND");
    }
    if (!this.screenshots.has(assetId)) {
      throw new OcrMockError(404, "Screenshot not found.", "SCREENSHOT_NOT_FOUND");
    }
    if (!collection.assetIds.includes(assetId)) {
      collection.assetIds.push(assetId);
      collection.updatedAtMs = Date.now();
      this.recordEvent("recognition_collection_asset_added", null, { collectionId, assetId });
    }
    return { collection: this.exportCollectionDetail(collection) };
  }

  removeCollectionAsset(collectionId: string, assetId: string): { collection: RecognitionCollectionDetail } {
    const collection = this.collections.get(collectionId);
    if (collection === undefined) {
      throw new OcrMockError(404, "Collection not found.", "COLLECTION_NOT_FOUND");
    }
    const before = collection.assetIds.length;
    collection.assetIds = collection.assetIds.filter((id) => id !== assetId);
    if (collection.assetIds.length !== before) {
      collection.updatedAtMs = Date.now();
      this.recordEvent("recognition_collection_asset_removed", null, { collectionId, assetId });
    }
    return { collection: this.exportCollectionDetail(collection) };
  }


  // ── Derivation ────────────────────────────────────────────────────────────

  private derive(
    job: InternalJob,
    nowMs: number,
  ): {
    status: RecognitionJob["status"];
    stage: RecognitionStage;
    progress: number;
    completedAtMs: number | null;
  } {
    const elapsed = nowMs - job.createdAtMs;
    if (job.cancelledAtMs !== null) {
      const cancelledElapsed = job.cancelledAtMs - job.createdAtMs;
      const atCancel = stageAndProgressAt(cancelledElapsed);
      return {
        status: "CANCELLED",
        stage: atCancel.stage,
        progress: atCancel.progress,
        completedAtMs: job.cancelledAtMs,
      };
    }
    if (job.scenario === "FAILED") {
      if (elapsed >= FAIL_AT_MS) {
        const atFail = stageAndProgressAt(FAIL_AT_MS);
        return {
          status: "FAILED",
          stage: atFail.stage,
          progress: atFail.progress,
          completedAtMs: job.createdAtMs + FAIL_AT_MS,
        };
      }
      const running = stageAndProgressAt(elapsed);
      return { status: "PROCESSING", stage: running.stage, progress: running.progress, completedAtMs: null };
    }
    if (elapsed >= TOTAL_PIPELINE_MS) {
      return {
        status: "COMPLETED",
        stage: "COMPLETED",
        progress: 100,
        completedAtMs: job.createdAtMs + TOTAL_PIPELINE_MS,
      };
    }
    const running = stageAndProgressAt(elapsed);
    return {
      status: "PROCESSING",
      stage: running.stage,
      progress: running.progress,
      completedAtMs: null,
    };
  }

  private resultFor(job: InternalJob): RecognitionResult {
    const spec = SCENARIOS[job.scenario as Exclude<ScenarioKey, "FAILED">];
    const processingMs = TOTAL_PIPELINE_MS;
    const result = buildResult(
      job.id,
      spec,
      processingMs,
      job.createdAtMs + TOTAL_PIPELINE_MS,
    );
    // V3 — deterministic quality (spec §28) + versioning (spec §44). The
    // SAME result always produces the SAME score; single-image jobs keep
    // consistency null (never an invented number).
    result.quality = computeQualityFromResult(result);
    result.versions = { engine: "Mock Recognition Engine 3", pipeline: "mock-3", schema: "3" };
    return result;
  }

  private exportJob(job: InternalJob, nowMs: number): RecognitionJob {
    const derived = this.derive(job, nowMs);
    const resultReady = derived.status === "COMPLETED";
    return {
      id: job.id,
      ownerId: job.ownerId,
      status: derived.status,
      stage: derived.stage,
      progress: derived.progress,
      platform: job.platform,
      mode: job.mode,
      screenshot: job.screenshot,
      createdAt: new Date(job.createdAtMs).toISOString(),
      completedAt: derived.completedAtMs === null ? null : new Date(derived.completedAtMs).toISOString(),
      processingMs: derived.completedAtMs === null ? null : derived.completedAtMs - job.createdAtMs,
      error:
        derived.status === "FAILED"
          ? {
              code: "RECOGNITION_FAILED" as const,
              message:
                "We couldn't recognize enough information from this screenshot. Try a sharper, full-window capture.",
            }
          : null,
      importedTradeId: job.importedTradeId,
      ...(job.importedTradeIds.length > 0 ? { importedTradeIds: job.importedTradeIds } : {}),
      hasWarnings: resultReady
        ? this.resultFor(job).warnings.length > 0
        : false,
    };
  }

  private exportHistoryItem(job: InternalJob, nowMs: number): RecognitionHistoryItem {
    const exported = this.exportJob(job, nowMs);
    const spec =
      job.scenario !== "FAILED"
        ? SCENARIOS[job.scenario as Exclude<ScenarioKey, "FAILED">]
        : null;
    const completed = exported.status === "COMPLETED";
    return {
      id: exported.id,
      status: exported.status,
      platform: exported.platform,
      detectedPlatform: completed && spec ? spec.detectedPlatform : null,
      screenshotName: job.screenshot.name,
      sizeBytes: job.screenshot.sizeBytes,
      mimeType: job.screenshot.mimeType,
      width: job.screenshot.width,
      height: job.screenshot.height,
      ...(job.screenshot.documentPageCount !== undefined
        ? { documentPageCount: job.screenshot.documentPageCount }
        : {}),
      detectedTradeCount: completed ? this.resultFor(job).trades.length : 0,
      overallConfidence:
        completed && spec
          ? buildResult(job.id, spec, 0, 0).overallConfidence
          : null,
      hasWarnings: exported.hasWarnings,
      error: exported.error,
      createdAt: exported.createdAt,
      completedAt: exported.completedAt,
      processingMs: exported.processingMs,
      importedTradeId: exported.importedTradeId,
      // V3 history facets (spec §62) — duplicated flag, correction count,
      // overall quality of the completed read.
      duplicateWarned: job.duplicateWarned,
      correctedCount: countCorrectedFields(job),
      qualityOverall:
        completed && spec ? computeQualityFromResult(buildResult(job.id, spec, 0, 0)).overall : null,
      // V3 — underlying asset id (collections add-flow, spec §41).
      screenshotId: job.screenshot.id,
    };
  }
}

/** Singleton behind the mock API (one store per browser session). */
export const ocrRecognitionEngine = new OcrRecognitionEngine();

/** Exposed for unit tests only — not part of the app surface. */
export const __testing = {
  TOTAL_PIPELINE_MS,
  FAIL_AT_MS,
  stageAndProgressAt,
  draftInputFromResult,
  buildResult,
  FIELD_TYPES,
};
