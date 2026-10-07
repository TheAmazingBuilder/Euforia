/**
 * Deterministic mock OCR engine (Phase 19 §57) — dev/test infrastructure,
 * NEVER registered in production (same gate as the Accounts mock provider:
 * config.ocr.mockEngineEnabled defaults to non-production only).
 *
 * It is a PURE function of (checksum, extraction profile) — no clock reads,
 * no randomness — so the same screenshot always yields byte-identical
 * results (idempotency-friendly, tests rely on it).
 *
 * Controlled scenarios are selected by the FNV-1a bucket of the checksum,
 * exactly like the mock trading provider's "fail-*" secrets (Phase 3 §55):
 * tests generate fixture images with a nonce that lands in the desired
 * bucket (test helper makeOcrFixturePng). Buckets:
 *
 *   % 50 === 0 → UNPROCESSABLE  (engine refuses the image)
 *   % 50 === 1 → malformed payload (contract violation — Nest must reject)
 *   otherwise  → COMPLETED with a coherent MT5-style field set
 *
 * The mock never claims to read pixels: its output documents the PIPELINE
 * behavior (field validation, banding, review, confirmation), while real
 * recognition is the FastAPI sidecar's responsibility (§28: honest tech
 * choice; §62: never claim a feature is production-ready when it is not).
 */
import { Injectable } from "@nestjs/common";
import {
  EngineMalformedResponseError,
  OCR_CONTRACT_VERSION,
  type EngineRecognizeRequest,
  type EngineResponse,
  type OcrEngine,
} from "./ocr-engine.port";
import { fnv1a32 } from "../ocr.logic";

const SYMBOLS = ["XAUUSD", "EURUSD", "BTCUSD", "GBPJPY", "US30"] as const;

@Injectable()
export class DeterministicOcrEngine implements OcrEngine {
  readonly info = {
    name: "deterministic-mock",
    engineVersion: "1.0.0",
    pipelineVersion: "1.0.0",
    contractVersion: OCR_CONTRACT_VERSION,
  };

  async recognize(request: EngineRecognizeRequest): Promise<EngineResponse> {
    const seed = fnv1a32(`${request.metadata.checksumSha256}|${request.extractionProfile}`);
    const bucket = seed % 50;

    if (bucket === 0) {
      return {
        requestId: request.requestId,
        contractVersion: OCR_CONTRACT_VERSION,
        processingStatus: "UNPROCESSABLE",
        classification: null,
        fields: [],
        tradeCandidates: [],
        perceptualHash: null,
        warnings: ["no recognizable trading content in this image (mock scenario)"],
        processingMetadata: { engine: this.info.name, engineVersion: this.info.engineVersion, pipelineVersion: this.info.pipelineVersion, durationsMs: { total: 1 }, passes: [], layoutTemplate: null, deskewDeg: null, documentPages: null, documentWidth: null, documentHeight: null },
        failure: { category: "SCREENSHOT_UNSUPPORTED", message: "no recognizable trading content (mock scenario)" },
      };
    }

    if (bucket === 1) {
      // Deliberately type-broken payload — the Nest side MUST reject it with
      // EXTRACTION_FAILED (contract violation, never retried, §34/§54).
      throw new EngineMalformedResponseError("mock engine produced a contract-breaking payload (scenario bucket 1)");
    }

    const direction = seed % 2 === 0 ? "BUY" : "SELL";
    const symbol = SYMBOLS[seed % SYMBOLS.length] ?? "XAUUSD";
    const volume = `${(10 + (seed % 90)).toString().padStart(2, "0")}`; // 0.10 .. 0.99 lots
    const entryUnits = 1000 + (seed % 2000);
    const entry = `${entryUnits}.${(seed % 90 + 10).toString().padStart(2, "0")}`;
    const slOffset = `${10 + (seed % 5)}.00`;
    const tpOffset = `${20 + (seed % 10)}.00`;
    const profitUnits = (seed % 400) - 200;
    const profit = `${profitUnits >= 0 ? "" : "-"}${Math.abs(profitUnits)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;

    // Directional coherence is BUILT IN (BUY: SL < entry < TP) so the happy
    // path exercises clean domain validation; the violation paths are covered
    // by explicit unit vectors against ocr.logic, not by the mock.
    const entryDec = Number(entry);
    const sl = direction === "BUY" ? entryDec - Number(slOffset) : entryDec + Number(slOffset);
    const tp = direction === "BUY" ? entryDec + Number(tpOffset) : entryDec - Number(tpOffset);
    const exit = direction === "BUY" ? entryDec + Number(profit) / 100 : entryDec - Number(profit) / 100;

    const fmt = (value: number): string => `${value.toFixed(2)}`;
    const regionX = seed % 120;
    const regionY = 40 + (seed % 500);

    return {
      requestId: request.requestId,
      contractVersion: OCR_CONTRACT_VERSION,
      processingStatus: "COMPLETED",
      classification: {
        type: "MT5_TRADE",
        confidence: 0.92,
        alternatives: [
          { type: "TRADINGVIEW_CHART", confidence: 0.3 },
          { type: "UNKNOWN", confidence: 0.1 },
        ],
      },
      fields: [
        { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.97, sourceRegion: { x: regionX, y: regionY, width: 120, height: 22 }, notes: [] },
        { field: "direction", rawValue: direction.toLowerCase(), normalizedValue: direction, confidence: 0.94, sourceRegion: { x: regionX + 130, y: regionY, width: 60, height: 22 }, notes: [] },
        { field: "volume", rawValue: `0.${volume}`, normalizedValue: `0.${volume}`, confidence: 0.9, sourceRegion: { x: regionX + 200, y: regionY, width: 70, height: 22 }, notes: [] },
        { field: "entryPrice", rawValue: entry, normalizedValue: entry, confidence: 0.96, sourceRegion: { x: regionX, y: regionY + 30, width: 110, height: 22 }, notes: [] },
        { field: "stopLoss", rawValue: fmt(sl), normalizedValue: fmt(sl), confidence: 0.88, sourceRegion: { x: regionX + 120, y: regionY + 30, width: 110, height: 22 }, notes: [] },
        { field: "takeProfit", rawValue: fmt(tp), normalizedValue: fmt(tp), confidence: 0.87, sourceRegion: { x: regionX + 240, y: regionY + 30, width: 110, height: 22 }, notes: [] },
        { field: "exitPrice", rawValue: fmt(exit), normalizedValue: fmt(exit), confidence: 0.83, sourceRegion: null, notes: [] },
        { field: "profit", rawValue: profit, normalizedValue: profit, confidence: 0.91, sourceRegion: null, notes: [] },
        {
          field: "openTime",
          rawValue: "2026.01.05 09:30",
          normalizedValue: "2026-01-05T09:30:00",
          confidence: 0.86,
          sourceRegion: { x: regionX, y: regionY + 60, width: 180, height: 22 },
          notes: ["TIMEZONE_UNKNOWN"],
        },
        {
          field: "closeTime",
          rawValue: "2026.01.05 10:15",
          normalizedValue: "2026-01-05T10:15:00",
          confidence: 0.42,
          sourceRegion: { x: regionX, y: regionY + 90, width: 180, height: 22 },
          notes: ["TIMEZONE_UNKNOWN", "LOW_CONFIDENCE"],
        },
      ],
      warnings: [],
      tradeCandidates: [],
      perceptualHash: null,
      processingMetadata: {
        engine: this.info.name,
        engineVersion: this.info.engineVersion,
        pipelineVersion: this.info.pipelineVersion,
        durationsMs: { preprocess: 2, ocr: 4, normalize: 1, total: 7 },
        passes: [],
        layoutTemplate: null,
        deskewDeg: null,
        documentPages: null,
        documentWidth: null,
        documentHeight: null,
      },
      failure: null,
    };
  }
}

/**
 * Explicit "no engine available" adapter — registered when production has
 * neither a sidecar URL nor an allowed mock. Every recognition attempt
 * fails with a TRANSIENT error that the service maps to OCR_UNAVAILABLE
 * (§35): an honest, explicit degradation — never a fake result (§57).
 */
@Injectable()
export class UnavailableOcrEngine implements OcrEngine {
  readonly info = {
    name: "unavailable",
    engineVersion: "0.0.0",
    pipelineVersion: "0.0.0",
    contractVersion: OCR_CONTRACT_VERSION,
  };

  async recognize(_request: EngineRecognizeRequest): Promise<EngineResponse> {
    throw new EngineMalformedResponseError(
      "unreachable — the service checks engine availability before invoking",
    );
  }
}
