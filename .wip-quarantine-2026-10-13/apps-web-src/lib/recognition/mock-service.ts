/**
 * MockRecognitionService — production-realistic mock of the future
 * NestJS-backed recognition pipeline (spec §40/§41).
 *
 * Design rules honored here:
 * - The UI NEVER references this module directly: it goes through the
 *   `RecognitionService` interface (factory in service.ts). No `if (mock)`
 *   logic exists in components (spec §41).
 * - Progress is delivered as EVENTS through the job store (stage + progress
 *   mutations), exactly the shape a future SSE/WebSocket bridge will emit —
 *   no component-level `setTimeout` fake processing (spec §15).
 * - Confirm-import exercises the REAL mock journal store
 *   (`mockStore.createTrade`) so "View Trade" opens the actual journal —
 *   mirroring what the NestJS orchestrator will do (create the trade, never
 *   trust client P&L — the store recomputes it).
 * - Scenario selection is deterministic per file name and only exists to
 *   exercise every UX state (success / partial / low confidence / failed):
 *     "fail-…"    → FAILED during OCR
 *     "partial-…" → completed, key fields missing + warnings
 *     "low-…"     → completed, low confidence + warnings
 *     anything else → clean high-confidence MT5 result
 *   A retried job always re-runs the success scenario (transient-failure
 *   story). All data is FICTIONAL (spec §60).
 */

import { mockStore } from "@/mocks/store";
import { localInputToISO } from "@/lib/utils/datetime";
import {
  RECOGNITION_ACCEPTED_MIME_TYPES,
  RECOGNITION_MAX_UPLOAD_BYTES,
} from "./constants";
import { RecognitionServiceError } from "./service";
import type { RecognitionService } from "./service";
import type {
  RecognizedField,
  RecognizedTrade,
  RecognitionFieldKey,
  RecognitionFieldStatus,
  RecognitionJob,
  RecognitionResult,
  RecognitionSourceRegion,
  RecognitionWarning,
  RecognitionWarningCode,
  TradeDraft,
  UploadedScreenshot,
} from "./types";

// ── Field/result builders ────────────────────────────────────────────────────

type FieldSeed = {
  key: RecognitionFieldKey;
  status?: RecognitionFieldStatus;
  value?: string | null;
  confidence?: number | null;
  source?: RecognitionSourceRegion;
};

function field(seed: FieldSeed): RecognizedField {
  return {
    key: seed.key,
    status: seed.status ?? (seed.value == null ? "NOT_FOUND" : "FOUND"),
    value: seed.value ?? null,
    confidence: seed.confidence ?? null,
    edited: false,
    source: seed.source,
  };
}

function warning(
  id: string,
  code: RecognitionWarningCode,
  fieldKey?: RecognizedField["key"],
): RecognitionWarning {
  return { id, code, fieldKey };
}

const FIELD_ORDER: readonly RecognitionFieldKey[] = [
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
];

function sortFields(trade: RecognizedTrade): RecognizedTrade {
  return {
    ...trade,
    fields: [...trade.fields].sort(
      (a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key),
    ),
  };
}

/** Human platform label stored in the `platform` field. */
const PLATFORM_LABELS = {
  MT5: "MetaTrader 5",
  TRADINGVIEW: "TradingView",
  CTRADER: "cTrader",
  OTHER: "Other",
} as const;

// ── Scenarios (spec §40) ─────────────────────────────────────────────────────

type ScenarioKey = "SUCCESS" | "PARTIAL" | "LOW_CONFIDENCE" | "FAILED";

type ScenarioPayload = {
  detectedPlatform: RecognitionResult["detectedPlatform"];
  trades: RecognizedTrade[];
  warnings: RecognitionWarning[];
};

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Clean, high-confidence MetaTrader 5 gold trade (spec §60 example). */
function successScenario(): ScenarioPayload {
  return {
    detectedPlatform: "MT5",
    trades: [
      sortFields({
        id: "trade-1",
        fields: [
          field({ key: "platform", value: PLATFORM_LABELS.MT5, confidence: 99 }),
          field({
            key: "symbol",
            value: "XAUUSD",
            confidence: 97,
            source: { x: 0.62, y: 0.08, width: 0.14, height: 0.05 },
          }),
          field({ key: "direction", value: "BUY", confidence: 98 }),
          field({ key: "volume", value: "0.10", confidence: 96 }),
          field({
            key: "entryPrice",
            value: "2645.32",
            confidence: 98,
            source: { x: 0.6, y: 0.42, width: 0.18, height: 0.05 },
          }),
          field({ key: "exitPrice", value: "2659.98", confidence: 93 }),
          field({ key: "stopLoss", value: "2638.50", confidence: 76 }),
          field({ key: "takeProfit", value: "2660.00", confidence: 89 }),
          field({ key: "pnl", value: "+146.80", confidence: 95 }),
          field({ key: "currency", value: "USD", confidence: 99 }),
          field({ key: "openTime", value: hoursAgoIso(2.1), confidence: 91 }),
          field({ key: "closeTime", value: hoursAgoIso(1.9), confidence: 88 }),
          field({ key: "positionId", value: "48211903", confidence: 87 }),
          field({ key: "orderId", value: "77341288", confidence: 84 }),
          field({ key: "accountBalance", value: "10248.55", confidence: 90 }),
          field({ key: "accountEquity", value: "10395.35", confidence: 90 }),
        ],
      }),
    ],
    warnings: [],
  };
}

/** Partial read: exit side missing, order id unreadable (spec §32 partial). */
function partialScenario(): ScenarioPayload {
  return {
    detectedPlatform: "MT5",
    trades: [
      sortFields({
        id: "trade-1",
        fields: [
          field({ key: "platform", value: PLATFORM_LABELS.MT5, confidence: 97 }),
          field({ key: "symbol", value: "EURUSD", confidence: 96 }),
          field({ key: "direction", value: "SELL", confidence: 97 }),
          field({ key: "volume", value: "0.50", confidence: 94 }),
          field({ key: "entryPrice", value: "1.08642", confidence: 95 }),
          field({ key: "exitPrice", status: "NOT_FOUND", value: null, confidence: null }),
          field({ key: "stopLoss", value: "1.08910", confidence: 81 }),
          field({ key: "takeProfit", value: "1.07980", confidence: 85 }),
          field({ key: "pnl", status: "NOT_FOUND", value: null, confidence: null }),
          field({ key: "currency", value: "USD", confidence: 99 }),
          field({ key: "openTime", value: hoursAgoIso(5.4), confidence: 89 }),
          field({ key: "closeTime", status: "NOT_FOUND", value: null, confidence: null }),
          field({ key: "positionId", value: "51022784", confidence: 82 }),
          field({ key: "orderId", status: "NOT_FOUND", value: null, confidence: null }),
          field({ key: "accountBalance", value: "8412.20", confidence: 88 }),
          field({ key: "accountEquity", value: "8412.20", confidence: 87 }),
        ],
      }),
    ],
    warnings: [
      warning("w1", "FIELD_NOT_FOUND", "exitPrice"),
      warning("w2", "FIELD_NOT_FOUND", "pnl"),
      warning("w3", "FIELD_NOT_FOUND", "closeTime"),
      warning("w4", "FIELD_NOT_FOUND", "orderId"),
      warning("w5", "INCOMPLETE_SCREENSHOT"),
    ],
  };
}

/** Low confidence across key fields + sensitive-data notice (spec §26/§38). */
function lowConfidenceScenario(): ScenarioPayload {
  return {
    detectedPlatform: "MT5",
    trades: [
      sortFields({
        id: "trade-1",
        fields: [
          field({ key: "platform", value: PLATFORM_LABELS.MT5, confidence: 92 }),
          field({ key: "symbol", value: "NAS100", confidence: 72 }),
          field({ key: "direction", value: "SELL", confidence: 91 }),
          field({ key: "volume", value: "2.00", confidence: 58 }),
          field({ key: "entryPrice", value: "18245.6", confidence: 66 }),
          field({ key: "exitPrice", value: "18190.2", confidence: 61 }),
          field({ key: "stopLoss", value: "18310.0", confidence: 55 }),
          field({ key: "takeProfit", value: "18120.0", confidence: 63 }),
          field({ key: "pnl", value: "-110.80", confidence: 69 }),
          field({ key: "currency", value: "USD", confidence: 77 }),
          field({ key: "openTime", value: hoursAgoIso(26), confidence: 64 }),
          field({ key: "closeTime", value: hoursAgoIso(25.7), confidence: 60 }),
          field({ key: "positionId", value: "99274615", confidence: 52 }),
          field({ key: "orderId", value: "99274616", confidence: 50 }),
          field({ key: "accountBalance", value: "15320.10", confidence: 71 }),
          field({ key: "accountEquity", value: "15209.30", confidence: 70 }),
        ],
      }),
    ],
    warnings: [
      warning("w1", "LOW_CONFIDENCE_FIELD", "volume"),
      warning("w2", "LOW_CONFIDENCE_FIELD", "entryPrice"),
      warning("w3", "LOW_CONFIDENCE_FIELD", "stopLoss"),
      warning("w4", "LOW_CONFIDENCE_FIELD", "takeProfit"),
      warning("w5", "SENSITIVE_INFO"),
    ],
  };
}

// ── Processing timeline (spec §15/§16) ───────────────────────────────────────

const STAGE_PLAN: readonly { stage: RecognitionJob["stage"]; duration: number; from: number; to: number }[] = [
  { stage: "UPLOADING", duration: 500, from: 0, to: 8 },
  { stage: "PREPROCESSING", duration: 800, from: 8, to: 24 },
  { stage: "OCR", duration: 1400, from: 24, to: 52 },
  { stage: "CLASSIFICATION", duration: 900, from: 52, to: 68 },
  { stage: "EXTRACTION", duration: 1100, from: 68, to: 88 },
  { stage: "NORMALIZATION", duration: 800, from: 88, to: 99 },
];

function scenarioForFileName(fileName: string): ScenarioKey {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("fail-")) return "FAILED";
  if (lower.startsWith("partial-")) return "PARTIAL";
  if (lower.startsWith("low-")) return "LOW_CONFIDENCE";
  return "SUCCESS";
}

// ── Seed history (spec §30/§60) — fictional, static timestamps ───────────────

function seedJob(
  id: string,
  fileName: string,
  createdAt: string,
  payload: ScenarioPayload | null,
  durationMs: number,
): RecognitionJob {
  const status: RecognitionJob["status"] = payload === null ? "FAILED" : "COMPLETED";
  return {
    id,
    status,
    stage: null,
    progress: status === "COMPLETED" ? 100 : 52,
    file: { fileName, fileSize: 1_820_000 + (id.charCodeAt(id.length - 1) % 9) * 137_000, mimeType: "image/png" },
    previewUrl: null,
    platform: "AUTO",
    mode: "AUTOMATIC",
    createdAt,
    completedAt: payload === null ? null : createdAt,
    error: payload === null ? "RECOGNITION_FAILED" : null,
    result:
      payload === null
        ? null
        : {
            ...payload,
            completedAt: createdAt,
            durationMs: durationMs,
          },
    importedTradeId: null,
  };
}

function buildSeedJobs(): RecognitionJob[] {
  return [
    seedJob(
      "rec-seed-01",
      "XAUUSD_mt5_london.png",
      "2026-09-30T13:24:05.000Z",
      successScenario(),
      5_120,
    ),
    seedJob(
      "rec-seed-02",
      "eurusd_session_review.png",
      "2026-09-29T16:02:41.000Z",
      {
        ...partialScenario(),
        trades: [
          sortFields({
            ...partialScenario().trades[0]!,
            fields: partialScenario().trades[0]!.fields.map((f) =>
              f.key === "stopLoss" ? { ...f, confidence: 68 } : f,
            ),
          }),
        ],
        warnings: [
          warning("w1", "FIELD_NOT_FOUND", "exitPrice"),
          warning("w2", "FIELD_NOT_FOUND", "pnl"),
          warning("w3", "LOW_CONFIDENCE_FIELD", "stopLoss"),
          warning("w4", "INCOMPLETE_SCREENSHOT"),
        ],
      },
      6_340,
    ),
    seedJob(
      "rec-seed-03",
      "nas100_open_range.png",
      "2026-09-29T09:47:12.000Z",
      {
        detectedPlatform: "TRADINGVIEW",
        trades: [
          sortFields({
            id: "trade-1",
            fields: [
              field({ key: "platform", value: PLATFORM_LABELS.TRADINGVIEW, confidence: 96 }),
              field({ key: "symbol", value: "NAS100", confidence: 95 }),
              field({ key: "direction", value: "BUY", confidence: 94 }),
              field({ key: "volume", value: "1.00", confidence: 92 }),
              field({ key: "entryPrice", value: "22184.4", confidence: 93 }),
              field({ key: "exitPrice", value: "22261.8", confidence: 90 }),
              field({ key: "stopLoss", value: "22120.0", confidence: 88 }),
              field({ key: "takeProfit", value: "22280.0", confidence: 87 }),
              field({ key: "pnl", value: "+77.40", confidence: 91 }),
              field({ key: "currency", value: "USD", confidence: 98 }),
              field({ key: "openTime", value: "2026-09-29T13:32:00.000Z", confidence: 86 }),
              field({ key: "closeTime", value: "2026-09-29T13:58:00.000Z", confidence: 84 }),
              field({ key: "positionId", status: "NOT_APPLICABLE", value: null, confidence: null }),
              field({ key: "orderId", status: "NOT_APPLICABLE", value: null, confidence: null }),
              field({ key: "accountBalance", status: "NOT_FOUND", value: null, confidence: null }),
              field({ key: "accountEquity", status: "NOT_FOUND", value: null, confidence: null }),
            ],
          }),
        ],
        warnings: [],
      },
      4_780,
    ),
    seedJob(
      "rec-seed-04",
      "btcusd_breakout.png",
      "2026-09-27T21:15:58.000Z",
      {
        detectedPlatform: "MT5",
        trades: [
          sortFields({
            id: "trade-1",
            fields: [
              field({ key: "platform", value: PLATFORM_LABELS.MT5, confidence: 98 }),
              field({ key: "symbol", value: "BTCUSD", confidence: 96 }),
              field({ key: "direction", value: "BUY", confidence: 95 }),
              field({ key: "volume", value: "0.20", confidence: 93 }),
              field({ key: "entryPrice", value: "63480.0", confidence: 94 }),
              field({ key: "exitPrice", value: "64120.0", confidence: 90 }),
              field({ key: "stopLoss", value: "62900.0", confidence: 82 }),
              field({ key: "takeProfit", value: "64300.0", confidence: 86 }),
              field({ key: "pnl", value: "+128.00", confidence: 92 }),
              field({ key: "currency", value: "USD", confidence: 99 }),
              field({ key: "openTime", value: "2026-09-27T20:02:00.000Z", confidence: 87 }),
              field({ key: "closeTime", value: "2026-09-27T21:01:00.000Z", confidence: 85 }),
              field({ key: "positionId", value: "71093342", confidence: 80 }),
              field({ key: "orderId", value: "71093343", confidence: 78 }),
              field({ key: "accountBalance", value: "12240.90", confidence: 88 }),
              field({ key: "accountEquity", value: "12368.90", confidence: 88 }),
            ],
          }),
        ],
        warnings: [],
      },
      5_560,
    ),
    seedJob(
      "rec-seed-05",
      "chart_daily_partial.png",
      "2026-09-26T11:38:27.000Z",
      null,
      4_930,
    ),
    seedJob(
      "rec-seed-06",
      "eurjpy_low_light.png",
      "2026-09-24T08:12:19.000Z",
      lowConfidenceScenario(),
      7_020,
    ),
  ];
}

// ── Service implementation ───────────────────────────────────────────────────

function createMockRecognitionService(): RecognitionService {
  const jobs = new Map<string, RecognitionJob>();
  const uploads = new Map<string, UploadedScreenshot>();
  const timers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  const listeners = new Set<() => void>();

  for (const job of buildSeedJobs()) jobs.set(job.id, job);

  let snapshot: RecognitionJob[] = [];
  const rebuild = () => {
    snapshot = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  rebuild();

  const emit = () => {
    rebuild();
    for (const listener of listeners) listener();
  };

  const patchJob = (id: string, patch: Partial<RecognitionJob>) => {
    const current = jobs.get(id);
    if (!current) return;
    jobs.set(id, { ...current, ...patch });
    emit();
  };

  const registerTimer = (jobId: string, handle: ReturnType<typeof setTimeout>) => {
    const set = timers.get(jobId) ?? new Set();
    set.add(handle);
    timers.set(jobId, set);
  };

  const clearTimers = (jobId: string) => {
    const set = timers.get(jobId);
    if (!set) return;
    for (const handle of set) clearTimeout(handle);
    timers.delete(jobId);
  };

  function runTimeline(jobId: string, scenario: ScenarioKey) {
    const started = Date.now();

    const runStage = (index: number) => {
      const plan = STAGE_PLAN[index]!;
      patchJob(jobId, { stage: plan.stage, progress: plan.from });
      registerTimer(
        jobId,
        setTimeout(() => {
          patchJob(jobId, { progress: Math.round((plan.from + plan.to) / 2) });
        }, Math.round(plan.duration / 2)),
      );
      const end = setTimeout(() => {
        if (scenario === "FAILED" && plan.stage === "OCR") {
          clearTimers(jobId);
          patchJob(jobId, {
            status: "FAILED",
            error: "RECOGNITION_FAILED",
            progress: plan.from,
            stage: "OCR",
          });
          return;
        }
        if (index + 1 < STAGE_PLAN.length) {
          runStage(index + 1);
          return;
        }
        clearTimers(jobId);
        const payload =
          scenario === "PARTIAL"
            ? partialScenario()
            : scenario === "LOW_CONFIDENCE"
              ? lowConfidenceScenario()
              : successScenario();
        patchJob(jobId, {
          status: "COMPLETED",
          stage: "COMPLETED",
          progress: 100,
          completedAt: new Date().toISOString(),
          error: null,
          result: {
            ...payload,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
          },
        });
      }, plan.duration);
      registerTimer(jobId, end);
    };

    runStage(0);
  }

  function resolveInstrument(symbol: string) {
    const instruments = mockStore.listInstruments();
    const wanted = symbol.trim().toUpperCase();
    const exact = instruments.find((i) => i.symbol.toUpperCase() === wanted);
    if (exact) return exact;
    // Common broker aliases (BTCUSD ↔ BTCUSDT).
    const alias = instruments.find(
      (i) =>
        i.symbol.toUpperCase().startsWith(wanted) ||
        wanted.startsWith(i.symbol.toUpperCase()),
    );
    if (alias) return alias;
    throw new RecognitionServiceError(
      "IMPORT_FAILED",
      `Unknown instrument for symbol ${symbol}`,
    );
  }

  function inferExitReason(
    direction: TradeDraft["direction"],
    exit: number,
    stopLoss: string | null,
    takeProfit: string | null,
  ) {
    const sl = stopLoss === null ? null : Number(stopLoss);
    const tp = takeProfit === null ? null : Number(takeProfit);
    if (direction === "BUY") {
      if (sl !== null && Number.isFinite(sl) && exit <= sl) return "SL" as const;
      if (tp !== null && Number.isFinite(tp) && exit >= tp) return "TP" as const;
    } else {
      if (sl !== null && Number.isFinite(sl) && exit >= sl) return "SL" as const;
      if (tp !== null && Number.isFinite(tp) && exit <= tp) return "TP" as const;
    }
    return "MANUAL" as const;
  }

  return {
    getJobsSnapshot: () => snapshot,

    getJob(id) {
      return jobs.get(id) ?? null;
    },

    subscribeJobs(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async uploadScreenshot(file) {
      if (!RECOGNITION_ACCEPTED_MIME_TYPES.includes(file.type as (typeof RECOGNITION_ACCEPTED_MIME_TYPES)[number])) {
        throw new RecognitionServiceError("UNSUPPORTED_FORMAT");
      }
      if (file.size <= 0 || file.size > RECOGNITION_MAX_UPLOAD_BYTES) {
        throw new RecognitionServiceError("UPLOAD_FAILED");
      }
      const upload: UploadedScreenshot = {
        id: crypto.randomUUID(),
        file: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
        previewUrl: URL.createObjectURL(file),
      };
      uploads.set(upload.id, upload);
      return upload;
    },

    async createRecognitionJob({ screenshot, platform, mode }) {
      const upload = uploads.get(screenshot.id);
      if (!upload) {
        throw new RecognitionServiceError("UPLOAD_FAILED", "Unknown screenshot upload");
      }
      const job: RecognitionJob = {
        id: crypto.randomUUID(),
        status: "PROCESSING",
        stage: "UPLOADING",
        progress: 0,
        file: upload.file,
        previewUrl: upload.previewUrl,
        platform,
        mode,
        createdAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        result: null,
        importedTradeId: null,
      };
      jobs.set(job.id, job);
      emit();
      runTimeline(job.id, scenarioForFileName(upload.file.fileName));
      return job;
    },

    async cancelRecognition(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new RecognitionServiceError("SERVER_ERROR", "Unknown job");
      if (job.status !== "PROCESSING" && job.status !== "PENDING") return;
      clearTimers(jobId);
      patchJob(jobId, {
        status: "CANCELLED",
        stage: null,
        progress: 0,
        completedAt: new Date().toISOString(),
      });
    },

    async retryRecognition(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new RecognitionServiceError("SERVER_ERROR", "Unknown job");
      if (job.status !== "FAILED" && job.status !== "CANCELLED") {
        throw new RecognitionServiceError("SERVER_ERROR", "Job is not retryable");
      }
      clearTimers(jobId);
      patchJob(jobId, {
        status: "PROCESSING",
        stage: "UPLOADING",
        progress: 0,
        error: null,
        result: null,
        completedAt: null,
      });
      // Retries re-run the clean scenario — the original failure is treated
      // as transient (the real pipeline will return the backend's verdict).
      runTimeline(jobId, "SUCCESS");
      return jobs.get(jobId)!;
    },

    async discardRecognition(jobId) {
      const job = jobs.get(jobId);
      if (!job) return; // already gone — idempotent discard
      if (job.importedTradeId) {
        // Imported jobs are part of the journal trail — never discard.
        throw new RecognitionServiceError(
          "IMPORT_FAILED",
          "Imported jobs cannot be discarded",
        );
      }
      clearTimers(jobId);
      jobs.delete(jobId);
      emit();
    },

    async confirmImport(jobId, draft) {
      const job = jobs.get(jobId);
      if (!job) throw new RecognitionServiceError("SERVER_ERROR", "Unknown job");
      if (job.status !== "COMPLETED" || !job.result) {
        throw new RecognitionServiceError("IMPORT_FAILED", "Job has no completed result");
      }
      // Idempotence: a job imports exactly one trade (spec §23).
      if (job.importedTradeId) return { tradeId: job.importedTradeId };

      const instrument = resolveInstrument(draft.symbol);
      const accounts = mockStore.listAccounts();
      const account = accounts.find((a) => a.isDefault) ?? accounts[0]!;
      if (!account) {
        throw new RecognitionServiceError("IMPORT_FAILED", "No trading account available");
      }

      // Draft times are datetime-local strings; the journal expects ISO UTC.
      const entryAt = localInputToISO(draft.openTime ?? "") ?? undefined;
      const exitAt = localInputToISO(draft.closeTime ?? "") ?? undefined;
      const exitPrice = draft.exitPrice?.trim() ? draft.exitPrice.trim() : null;
      const closed = exitPrice !== null && exitAt !== undefined;

      const entry = Number(draft.entryPrice);
      const stopLoss = draft.stopLoss?.trim() ? draft.stopLoss.trim() : null;
      const takeProfit = draft.takeProfit?.trim() ? draft.takeProfit.trim() : null;
      const plannedRR =
        stopLoss !== null && takeProfit !== null && Number.isFinite(entry) && entry > 0
          ? String(
              Math.round(
                (Math.abs(Number(takeProfit) - entry) /
                  Math.abs(entry - Number(stopLoss))) *
                  100,
              ) / 100,
            )
          : undefined;

      const baseInput = {
        accountId: account.id,
        instrumentId: instrument.id,
        direction: draft.direction,
        entryPrice: draft.entryPrice.trim(),
        ...(entryAt !== undefined ? { entryAt } : {}),
        size: { mode: "quantity", quantity: draft.volume.trim() } as const,
        ...(stopLoss !== null ? { initialStop: stopLoss } : {}),
        ...(takeProfit !== null ? { initialTP: takeProfit } : {}),
        ...(plannedRR !== undefined ? { plannedRR } : {}),
        reason:
          draft.notes?.trim() ||
          `Imported via OCR recognition — job ${job.id.slice(0, 8)}`,
        externalRef: `ocr-${job.id}`,
        outOfPlaybook: true,
      };

      const input = closed
        ? {
            variant: "closed" as const,
            ...baseInput,
            exitPrice: exitPrice!,
            exitAt: exitAt!,
            exitReason: inferExitReason(
              draft.direction,
              Number(exitPrice),
              stopLoss,
              takeProfit,
            ),
          }
        : { variant: "open" as const, ...baseInput };

      try {
        const response = mockStore.createTrade(input);
        const tradeId = response.id;
        patchJob(jobId, { importedTradeId: tradeId });
        return { tradeId };
      } catch (error) {
        if (error instanceof RecognitionServiceError) throw error;
        throw new RecognitionServiceError(
          "IMPORT_FAILED",
          error instanceof Error ? error.message : undefined,
        );
      }
    },
  };
}

export const mockRecognitionService = createMockRecognitionService();
