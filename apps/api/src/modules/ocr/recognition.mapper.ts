/**
 * Recognition wire mapper - PURE functions, no I/O, no Nest (unit-testable
 * in plain node, house standard).
 *
 * Maps the internal recognition aggregate (Phase-19 rows + engine payload)
 * onto the FRONTEND-DERIVED wire contract (shared `recognitionJobSchema`,
 * `recognitionResultSchema`, `recognitionHistoryItemSchema`):
 *
 *   - persisted row states → frontend job statuses (§33 "adapt to the
 *     frontend"): QUEUED→PENDING, REVIEW_REQUIRED/CONFIRMED→COMPLETED;
 *   - the engine's 10 field keys → the frontend's 16 (profit→profitLoss;
 *     fields with no engine signal in V1 stay NOT_FOUND - never invented);
 *   - pixel source regions → normalized 0..1 coordinates (frontend §25);
 *   - 0..1 engine confidences → 0..100 (the frontend bands ≥85/≥65/<65);
 *   - free-string engine warnings → typed frontend warning codes (§26);
 *   - overallConfidence = evidence-weighted mean of detected field
 *     confidences (§59: derived from actual field-level evidence, never an
 *     arbitrary constant).
 *
 * The stored user draft (§72) overlays the machine fields so a confirmed
 * recognition replays with `editedByUser` on corrected values (§21/§82).
 */
import type {
  DetectedPlatform,
  RecognitionFieldKey,
  RecognitionFieldState,
  RecognitionHistoryItem,
  RecognitionJob,
  RecognitionJobErrorCode,
  RecognitionJobStatus,
  RecognitionResult,
  RecognitionStage,
  RecognitionWarning,
  RecognizedField,
  RecognizedTrade,
} from "../../shared/contracts";
import type { OcrClassification, OcrExtractedField } from "../../shared/contracts";
import type { OcrRecognitionRow, TradeDraftRecord } from "./ocr.repository";

// ── Status / stage / progress (§33) ──────────────────────────────────────────

export function mapWireStatus(rowStatus: string): RecognitionJobStatus {
  switch (rowStatus) {
    case "QUEUED":
      return "PENDING";
    case "PROCESSING":
      return "PROCESSING";
    case "REVIEW_REQUIRED":
    case "CONFIRMED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

export function mapWireStage(rowStatus: string): RecognitionStage {
  switch (rowStatus) {
    case "QUEUED":
      return "UPLOADING";
    case "REVIEW_REQUIRED":
    case "CONFIRMED":
      return "COMPLETED";
    // PROCESSING / FAILED / CANCELLED report the last real stage - the OCR
    // pass is where request-scoped work happens or stops.
    default:
      return "OCR";
  }
}

/**
 * Failure category → frontend job error code (§91 mapping - stable codes,
 * user-facing copy lives on the client). The category itself is preserved
 * server-side for diagnostics.
 */
export function mapFailureToJobErrorCode(category: string): RecognitionJobErrorCode {
  switch (category) {
    case "OCR_UNAVAILABLE":
      return "SERVICE_UNAVAILABLE";
    case "SCREENSHOT_UNSUPPORTED":
    case "RESOURCE_LIMIT":
      return "UNSUPPORTED_IMAGE";
    default:
      // PROCESSING_TIMEOUT / EXTRACTION_FAILED / VALIDATION_FAILED / ENGINE_ERROR
      return "RECOGNITION_FAILED";
  }
}

// ── Field mapping (§47/§48/§58) ──────────────────────────────────────────────

/** Engine field key → frontend field key (§48 alias table, explicit + tested). */
const ENGINE_FIELD_TO_WIRE: Record<string, RecognitionFieldKey> = {
  symbol: "symbol",
  direction: "direction",
  volume: "volume",
  entryPrice: "entryPrice",
  exitPrice: "exitPrice",
  stopLoss: "stopLoss",
  takeProfit: "takeProfit",
  profit: "profitLoss",
  openTime: "openTime",
  closeTime: "closeTime",
};

/** Fields the V1 engine does not extract yet - rendered NOT_FOUND, honestly. */
const WIRE_ONLY_KEYS: readonly RecognitionFieldKey[] = [
  "platform",
  "currency",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
];

const PRIMARY_KEYS: readonly RecognitionFieldKey[] = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
];

function stateOf(status: string, band: string, hasValue: boolean): RecognitionFieldState {
  if (!hasValue) {
    // Nothing parseable was read from the image - an AMBIGUOUS read (raw text
    // present but uninterpretable) still counts as an uncertain signal.
    return "NOT_FOUND";
  }
  if (status === "INVALID" || status === "AMBIGUOUS") return "UNCERTAIN";
  if (status === "LOW_CONFIDENCE" || band === "LOW" || band === "UNKNOWN") return "UNCERTAIN";
  return "FOUND";
}

function normalizedRegion(
  region: { x: number; y: number; width: number; height: number } | null,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | undefined {
  if (region === null || width <= 0 || height <= 0) return undefined;
  // Defensive clamp: a misbehaving engine box must never break the wire
  // contract (0..1) - the value degrades, the payload stays valid.
  const clamp = (v: number) => Math.min(1, Math.max(0, round6(v)));
  return {
    x: clamp(region.x / width),
    y: clamp(region.y / height),
    width: clamp(region.width / width),
    height: clamp(region.height / height),
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Build the full 16-key recognized-field record for one trade. The draft
 * (user declaration) overlays machine values: a draft field that differs
 * from the machine value is authoritative, flagged editedByUser (§21/§82).
 */
export function buildTradeFields(
  engineFields: OcrExtractedField[],
  assetWidth: number,
  assetHeight: number,
  draft: Record<string, string | null> | TradeDraftRecord | null,
): Record<RecognitionFieldKey, RecognizedField> {
  const byKey = new Map(engineFields.map((f) => [f.field as string, f]));
  const record = {} as Record<RecognitionFieldKey, RecognizedField>;

  const put = (key: RecognitionFieldKey, field: RecognizedField) => {
    record[key] = field;
  };

  for (const [engineKey, wireKey] of Object.entries(ENGINE_FIELD_TO_WIRE)) {
    const engineField = byKey.get(engineKey);
    if (engineField === undefined) {
      put(wireKey, { key: wireKey, value: null, state: "NOT_FOUND", confidence: null });
      continue;
    }
    const band = engineField.confidenceBand;
    // A normalized value is PRESERVED even when INVALID (kept for review,
    // §19) - the value renders flagged UNCERTAIN, never hidden.
    const hasValue = engineField.normalizedValue !== null;
    const value = hasValue ? (engineField.normalizedValue as string) : null;
    put(wireKey, {
      key: wireKey,
      value,
      state: stateOf(engineField.validationStatus, band, hasValue),
      confidence: Math.round(engineField.confidence * 100),
      sourceRegion: normalizedRegion(engineField.sourceRegion, assetWidth, assetHeight),
    });
  }
  for (const key of WIRE_ONLY_KEYS) {
    put(key, { key, value: null, state: "NOT_FOUND", confidence: null });
  }

  // Draft overlay - the user's reviewed declaration wins where it differs.
  if (draft !== null) {
    for (const [rawKey, rawValue] of Object.entries(draft)) {
      const key = rawKey as RecognitionFieldKey;
      const existing = record[key];
      if (existing === undefined) continue;
      if (rawValue === null || rawValue === "") {
        record[key] = { ...existing, value: null, state: "NOT_FOUND", confidence: null, editedByUser: true };
        continue;
      }
      if (existing.value !== rawValue) {
        record[key] = { ...existing, value: rawValue, state: "FOUND", confidence: 100, editedByUser: true };
      }
    }
  }

  return record;
}

// ── Warnings (§26/§60) ──────────────────────────────────────────────────────

/** Deterministic engine-warning → typed frontend warning mapping. */
export function mapEngineWarnings(
  engineWarnings: string[],
  fields: Partial<Record<RecognitionFieldKey, RecognizedField>>,
): RecognitionWarning[] {
  const warnings: RecognitionWarning[] = [];
  const push = (warning: RecognitionWarning) => {
    if (!warnings.some((w) => w.code === warning.code && w.field === warning.field && w.message === warning.message)) {
      warnings.push(warning);
    }
  };

  for (const raw of engineWarnings) {
    if (raw === "TIMEZONE_UNKNOWN") {
      push({
        code: "SCREENSHOT_INCOMPLETE",
        message: "The screenshot does not state a timezone - verify the times before importing.",
      });
      continue;
    }
    if (raw === "DIRECTIONAL_INCONSISTENCY") {
      push({
        code: "LOW_CONFIDENCE_FIELD",
        message: "Some price relationships look inconsistent for the detected direction - review them below.",
      });
      continue;
    }
    if (raw === "AMBIGUOUS_THOUSANDS_SEPARATOR") {
      push({
        code: "LOW_CONFIDENCE_FIELD",
        message: "A number on this screenshot is ambiguous - confirm the intended value.",
      });
      continue;
    }
    // Unknown engine tokens stay honest but bounded: a typed code + engine text.
    push({ code: "SCREENSHOT_INCOMPLETE", message: raw.slice(0, 200) });
  }

  // Derived, evidence-based warnings (§57/§60) - missing primary fields and
  // low-confidence values are surfaced even when the engine stayed silent.
  for (const key of PRIMARY_KEYS) {
    const field = fields[key];
    if (field === undefined) continue;
    if (field.state === "NOT_FOUND") {
      push({
        code: "FIELD_NOT_DETECTED",
        message: "This field was not detected on the screenshot - add it before importing.",
        field: key,
      });
    } else if (field.state === "UNCERTAIN" || (field.confidence !== null && field.confidence < 65)) {
      push({
        code: "LOW_CONFIDENCE_FIELD",
        message: "This value was recognized with low confidence - double-check it.",
        field: key,
      });
    }
  }

  return warnings.slice(0, 16);
}

// ── Aggregates ───────────────────────────────────────────────────────────────

function overallConfidenceOf(fields: Partial<Record<RecognitionFieldKey, RecognizedField>>): number | null {
  const relevant = PRIMARY_KEYS.map((key) => fields[key]?.confidence ?? null).filter(
    (c): c is number => c !== null,
  );
  if (relevant.length === 0) return null;
  const mean = relevant.reduce((sum, c) => sum + c, 0) / relevant.length;
  return Math.round(mean);
}

export function classificationToDetectedPlatform(
  classification: OcrClassification | null,
): DetectedPlatform {
  const type = classification?.type ?? "UNKNOWN";
  switch (type) {
    case "MT5_TRADE":
      return "METATRADER_5";
    case "TRADINGVIEW_CHART":
      return "TRADINGVIEW";
    default:
      // Never fabricate a platform (§44) - UNKNOWN degrades to OTHER.
      return "OTHER";
  }
}

/** GET …/result payload, or null when the row carries no reviewable result. */
export function toRecognitionResult(row: OcrRecognitionRow): RecognitionResult | null {
  const classification = (row.result?.classification ?? null) as OcrClassification | null;
  if (row.result === null) return null;

  const detectedPlatform = classificationToDetectedPlatform(classification);
  const engineFields = (row.result?.fields ?? []) as OcrExtractedField[];

  // V2 - grouped trades payload. Absent (older pipeline answers) → exactly
  // one trade from the flat fields, byte-identical to V1 behavior.
  const payloadTrades = row.result.trades ?? null;
  let trades: RecognizedTrade[];
  if (payloadTrades !== null && payloadTrades.length > 0) {
    trades = payloadTrades.map((trade, position) => {
      const draftForIndex = readDraftForIndex(row, position + 1);
      const fields = buildTradeFields(
        trade.fields as OcrExtractedField[],
        row.asset.width ?? 0,
        row.asset.height ?? 0,
        draftForIndex,
      );
      return {
        index: position + 1,
        fields,
        ...(trade.pageIndex > 0 || (payloadTrades.length > 1 && payloadTrades.some((t) => t.pageIndex > 0))
          ? { pageIndex: trade.pageIndex }
          : {}),
      };
    });
  } else {
    const draftForIndex = readDraftForIndex(row, 1);
    const fields = buildTradeFields(engineFields, row.asset.width ?? 0, row.asset.height ?? 0, draftForIndex);
    trades = [{ index: 1, fields }];
  }

  const primaryFields = trades[0]?.fields ?? buildTradeFields(engineFields, row.asset.width ?? 0, row.asset.height ?? 0, null);
  const warnings = mapEngineWarnings(row.result.warnings ?? [], primaryFields);

  // V3 - recognition versioning (spec §44): how this result was produced,
  // echoed from the persisted engine metadata when available.
  const engineMeta = row.result.engine;
  const versions: RecognitionResult["versions"] =
    engineMeta !== null && engineMeta !== undefined
      ? {
          engine: `${engineMeta.name} ${engineMeta.engineVersion}`.slice(0, 64),
          pipeline: engineMeta.pipelineVersion.slice(0, 32),
          schema: "3",
        }
      : undefined;

  return {
    jobId: row.id,
    detectedPlatform,
    platformConfidence:
      classification === null ? null : Math.round(classification.confidence * 100),
    trades,
    warnings,
    overallConfidence: overallConfidenceOf(primaryFields),
    ...(row.quality !== null ? { quality: row.quality as RecognitionResult["quality"] } : {}),
    ...(versions !== undefined ? { versions } : {}),
    processingMs: row.result.durationMs ?? null,
    completedAt: row.processingFinishedAt ? row.processingFinishedAt.toISOString() : null,
  };
}

/** The stored draft for one trade index (V2 drafts map, V1 scalar mirror). */
function readDraftForIndex(row: OcrRecognitionRow, tradeIndex: number): Record<string, string | null> | TradeDraftRecord | null {
  if (row.drafts !== null) {
    const draft = row.drafts[String(tradeIndex)];
    if (draft !== undefined) return draft;
    return null;
  }
  return tradeIndex === 1 ? row.draft : null;
}

function screenshotOf(row: OcrRecognitionRow) {
  return {
    id: row.asset.id,
    name: row.asset.originalName,
    sizeBytes: row.asset.sizeBytes,
    mimeType: row.asset.mime as "image/png" | "image/jpeg" | "image/webp" | "application/pdf",
    width: row.asset.width,
    height: row.asset.height,
    uploadedAt: row.asset.createdAt.toISOString(),
    ...(row.asset.documentPageCount !== null
      ? { documentPageCount: row.asset.documentPageCount }
      : {}),
  };
}

/** GET /recognition/jobs/:id payload. */
export function toRecognitionJobDto(row: OcrRecognitionRow): RecognitionJob {
  return {
    id: row.id,
    ownerId: row.userId,
    status: mapWireStatus(row.status),
    stage: mapWireStage(row.status),
    progress: 100,
    platform: (row.requestedPlatform as RecognitionJob["platform"]) ?? "AUTO",
    mode: (row.mode as RecognitionJob["mode"]) ?? "AUTOMATIC",
    screenshot: screenshotOf(row),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.processingFinishedAt ? row.processingFinishedAt.toISOString() : null,
    processingMs:
      row.processingStartedAt !== null && row.processingFinishedAt !== null
        ? Math.max(0, row.processingFinishedAt.getTime() - row.processingStartedAt.getTime())
        : null,
    error:
      row.failureCategory !== null
        ? {
            code: mapFailureToJobErrorCode(row.failureCategory),
            message: row.failureMessage ?? "",
          }
        : null,
    importedTradeId: row.importedTradeId,
    ...(row.importedTradeIds !== null && row.importedTradeIds.length > 0
      ? { importedTradeIds: row.importedTradeIds }
      : {}),
    hasWarnings: (row.result?.warnings ?? []).length > 0,
  };
}

/**
 * V3 - count the user-corrected fields of a row (spec §62 `corrected`
 * facet): a draft value that DIFFERS from the machine value is a
 * correction. Reads the stored drafts against the engine payload; pure.
 */
export function countCorrectedFields(row: OcrRecognitionRow): number {
  if (row.result === null) return 0;
  const machineByWireKey = new Map<string, string | null>();
  const wireKeys: Record<string, string> = {
    symbol: "symbol",
    direction: "direction",
    volume: "volume",
    entryPrice: "entryPrice",
    exitPrice: "exitPrice",
    stopLoss: "stopLoss",
    takeProfit: "takeProfit",
    profit: "profitLoss",
    openTime: "openTime",
    closeTime: "closeTime",
  };
  const engineFields = (row.result.fields ?? []) as Array<{
    field?: string;
    normalizedValue?: string | null;
  }>;
  for (const engineField of engineFields) {
    const engineKey = typeof engineField.field === "string" ? engineField.field : null;
    if (engineKey === null) continue;
    const wireKey = wireKeys[engineKey];
    if (wireKey === undefined) continue;
    machineByWireKey.set(wireKey, engineField.normalizedValue ?? null);
  }
  // Trades payload (V2): use the LEAD trade's fields when present (the
  // machine surface the correction counting keys on).
  const leadTrade = row.result.trades?.[0];
  if (leadTrade !== undefined) {
    machineByWireKey.clear();
    for (const engineField of (leadTrade.fields ?? []) as Array<{
      field?: string;
      normalizedValue?: string | null;
    }>) {
      const engineKey = typeof engineField.field === "string" ? engineField.field : null;
      if (engineKey === null) continue;
      const wireKey = wireKeys[engineKey];
      if (wireKey === undefined) continue;
      machineByWireKey.set(wireKey, engineField.normalizedValue ?? null);
    }
  }
  const drafts: Array<Record<string, string | null>> = [];
  if (row.drafts !== null) {
    drafts.push(...(Object.values(row.drafts) as unknown as Array<Record<string, string | null>>));
  } else if (row.draft !== null) {
    drafts.push(row.draft as unknown as Record<string, string | null>);
  }
  let corrected = 0;
  for (const draft of drafts) {
    for (const [wireKey, value] of Object.entries(draft)) {
      if (!machineByWireKey.has(wireKey)) continue;
      if ((machineByWireKey.get(wireKey) ?? null) !== value) corrected += 1;
    }
  }
  return corrected;
}

/** GET /recognition/jobs list item (§30 history columns). */
export function toHistoryItem(row: OcrRecognitionRow): RecognitionHistoryItem {
  const classification = (row.result?.classification ?? null) as OcrClassification | null;
  const hasResult = row.result !== null;
  const quality = (row.quality as { overall: number } | null) ?? null;
  return {
    id: row.id,
    status: mapWireStatus(row.status),
    platform: (row.requestedPlatform as RecognitionHistoryItem["platform"]) ?? "AUTO",
    detectedPlatform: hasResult ? classificationToDetectedPlatform(classification) : null,
    screenshotName: row.asset.originalName,
    sizeBytes: row.asset.sizeBytes,
    mimeType: row.asset.mime as "image/png" | "image/jpeg" | "image/webp" | "application/pdf",
    width: row.asset.width,
    height: row.asset.height,
    ...(row.asset.documentPageCount !== null
      ? { documentPageCount: row.asset.documentPageCount }
      : {}),
    detectedTradeCount: hasResult
      ? (row.result?.trades !== undefined && row.result?.trades !== null && row.result.trades.length > 0
          ? row.result.trades.length
          : 1)
      : 0,
    overallConfidence: hasResult ? toRecognitionResult(row)?.overallConfidence ?? null : null,
    hasWarnings: (row.result?.warnings ?? []).length > 0,
    error:
      row.failureCategory !== null
        ? {
            code: mapFailureToJobErrorCode(row.failureCategory),
            message: row.failureMessage ?? "",
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.processingFinishedAt ? row.processingFinishedAt.toISOString() : null,
    processingMs:
      row.processingStartedAt !== null && row.processingFinishedAt !== null
        ? Math.max(0, row.processingFinishedAt.getTime() - row.processingStartedAt.getTime())
        : null,
    importedTradeId: row.importedTradeId,
    // V3 history filter facets (spec §62) - honest only when computable.
    ...(row.result !== null && row.status !== "QUEUED" && row.status !== "PROCESSING"
      ? { correctedCount: countCorrectedFields(row) }
      : {}),
    ...(row.asset.duplicateWarned ? { duplicateWarned: true } : {}),
    ...(quality !== null ? { qualityOverall: quality.overall } : {}),
    // V3 - underlying asset id (collections add-flow, spec §41).
    screenshotId: row.assetId,
  };
}
