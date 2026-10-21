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
const CURRENCIES = ["USD", "EUR"] as const;
const LEVERAGES = ["1:500", "1:100", "1:30"] as const;
const TIMEFRAMES = ["M5", "M15", "H1", "H4", "D1"] as const;

@Injectable()
export class DeterministicOcrEngine implements OcrEngine {
  readonly info = {
    name: "deterministic-mock",
    engineVersion: "1.1.0",
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

    // Profile routing (Account & Chart V1.1): the mock mirrors the real
    // engine's vocabulary so the whole review flow works in dev/test mode.
    if (request.extractionProfile === "ACCOUNT_POSITION") {
      return this.accountSnapshot(request, seed);
    }
    if (request.extractionProfile === "CHART_ANALYSIS") {
      return this.chartReading(request, seed);
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
        platform: "MT5",
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

  /**
   * ACCOUNT_POSITION mock — a coherent account snapshot: header fields + ONE
   * open-position candidate. Equity = balance + floating, free margin =
   * equity − margin, margin level = equity / margin — the coherence the
   * review UI (and its cross-field rules) can rely on. Same checksum yields
   * the same snapshot (deterministic, idempotency-friendly).
   */
  private accountSnapshot(request: EngineRecognizeRequest, seed: number): EngineResponse {
    const currency = CURRENCIES[seed % CURRENCIES.length] ?? "USD";
    const leverage = LEVERAGES[seed % LEVERAGES.length] ?? "1:500";
    const balance = `${10_000 + (seed % 40_000)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;
    const floating = ((seed % 900) - 400) / 10; // −40.0 .. +49.9
    const margin = `${50 + (seed % 900)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;
    const equity = (Number(balance) + floating).toFixed(2);
    const freeMargin = (Number(equity) - Number(margin)).toFixed(2);
    const marginLevel = ((Number(equity) / Number(margin)) * 100).toFixed(2);
    const symbol = SYMBOLS[seed % SYMBOLS.length] ?? "XAUUSD";
    const direction = seed % 2 === 0 ? "BUY" : "SELL";
    const volume = `0.${(10 + (seed % 90)).toString().padStart(2, "0")}`;
    const entry = `${1000 + (seed % 2000)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;
    const regionY = 40 + (seed % 300);
    const region = (offset: number): { x: number; y: number; width: number; height: number } => ({
      x: 60 + offset,
      y: regionY,
      width: 140,
      height: 22,
    });

    return {
      requestId: request.requestId,
      contractVersion: OCR_CONTRACT_VERSION,
      processingStatus: "COMPLETED",
      classification: {
        type: "ACCOUNT_SUMMARY",
        confidence: 0.93,
        alternatives: [
          { type: "OPEN_POSITION", confidence: 0.4 },
          { type: "UNKNOWN", confidence: 0.1 },
        ],
        platform: "MT5",
      },
      fields: [
        { field: "accountLogin", rawValue: "5102083990", normalizedValue: "5102083990", confidence: 0.95, sourceRegion: region(0), notes: [] },
        { field: "accountServer", rawValue: "MetaQuotes-Demo", normalizedValue: "MetaQuotes-Demo", confidence: 0.93, sourceRegion: region(10), notes: [] },
        { field: "accountCurrency", rawValue: currency, normalizedValue: currency, confidence: 0.97, sourceRegion: region(20), notes: [] },
        { field: "accountLeverage", rawValue: leverage, normalizedValue: leverage, confidence: 0.94, sourceRegion: region(30), notes: [] },
        { field: "accountBalance", rawValue: balance, normalizedValue: balance, confidence: 0.96, sourceRegion: region(40), notes: [] },
        { field: "accountEquity", rawValue: equity, normalizedValue: equity, confidence: 0.95, sourceRegion: region(50), notes: [] },
        { field: "accountMargin", rawValue: margin, normalizedValue: margin, confidence: 0.92, sourceRegion: region(60), notes: [] },
        { field: "accountFreeMargin", rawValue: freeMargin, normalizedValue: freeMargin, confidence: 0.91, sourceRegion: region(70), notes: [] },
        { field: "accountMarginLevel", rawValue: marginLevel, normalizedValue: marginLevel, confidence: 0.9, sourceRegion: region(80), notes: [] },
      ],
      warnings: [],
      tradeCandidates: [
        {
          fields: [
            { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.94, sourceRegion: region(0), notes: [] },
            { field: "direction", rawValue: direction.toLowerCase(), normalizedValue: direction, confidence: 0.92, sourceRegion: region(10), notes: [] },
            { field: "volume", rawValue: volume, normalizedValue: volume, confidence: 0.9, sourceRegion: region(20), notes: [] },
            { field: "entryPrice", rawValue: entry, normalizedValue: entry, confidence: 0.89, sourceRegion: region(30), notes: [] },
          ],
        },
      ],
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

  /**
   * CHART_ANALYSIS mock — a coherent chart reading: symbol + timeframe +
   * OHLC (high >= max(open, close), low <= min(open, close)) + price = close
   * with explicit provenance + signed change % + visible indicator readings.
   */
  private chartReading(request: EngineRecognizeRequest, seed: number): EngineResponse {
    const symbol = SYMBOLS[seed % SYMBOLS.length] ?? "XAUUSD";
    const timeframe = TIMEFRAMES[seed % TIMEFRAMES.length] ?? "H1";
    const close = `${1000 + (seed % 2000)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;
    const closeDec = Number(close);
    const open = (closeDec - ((seed % 200) - 100) / 10).toFixed(2);
    const high = (Math.max(Number(open), closeDec) + ((seed % 50) + 1) / 10).toFixed(2);
    const low = (Math.min(Number(open), closeDec) - ((seed % 50) + 1) / 10).toFixed(2);
    const changePct = (((seed % 600) - 300) / 100).toFixed(2);
    const rsi = `${30 + (seed % 40)}.${seed % 9}`;
    const macdRaw = ((seed % 200) - 100) / 100;
    const macd = `${macdRaw >= 0 ? "" : "-"}${Math.abs(macdRaw).toFixed(2)}`;
    const atr = `${1 + (seed % 30)}.${((seed % 90) + 10).toString().padStart(2, "0")}`;
    const ma = (closeDec - ((seed % 300) - 150) / 10).toFixed(2);
    const regionY = 40 + (seed % 300);
    const region = (offset: number): { x: number; y: number; width: number; height: number } => ({
      x: 60 + offset,
      y: regionY,
      width: 140,
      height: 22,
    });

    return {
      requestId: request.requestId,
      contractVersion: OCR_CONTRACT_VERSION,
      processingStatus: "COMPLETED",
      classification: {
        type: "CHART",
        confidence: 0.9,
        alternatives: [
          { type: "TRADINGVIEW_CHART", confidence: 0.35 },
          { type: "UNKNOWN", confidence: 0.1 },
        ],
        platform: "TRADINGVIEW",
      },
      fields: [
        { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.96, sourceRegion: region(0), notes: [] },
        { field: "chartTimeframe", rawValue: timeframe, normalizedValue: timeframe, confidence: 0.95, sourceRegion: region(10), notes: [] },
        { field: "chartOpen", rawValue: open, normalizedValue: open, confidence: 0.9, sourceRegion: region(20), notes: [] },
        { field: "chartHigh", rawValue: high, normalizedValue: high, confidence: 0.89, sourceRegion: region(30), notes: [] },
        { field: "chartLow", rawValue: low, normalizedValue: low, confidence: 0.88, sourceRegion: region(40), notes: [] },
        { field: "chartClose", rawValue: close, normalizedValue: close, confidence: 0.93, sourceRegion: region(50), notes: [] },
        { field: "chartPrice", rawValue: close, normalizedValue: close, confidence: 0.91, sourceRegion: region(60), notes: ["PRICE_FROM_CLOSE"] },
        { field: "chartChangePct", rawValue: changePct, normalizedValue: changePct, confidence: 0.85, sourceRegion: region(70), notes: [] },
        { field: "chartRsi", rawValue: rsi, normalizedValue: rsi, confidence: 0.87, sourceRegion: region(80), notes: [] },
        { field: "chartMacd", rawValue: macd, normalizedValue: macd, confidence: 0.84, sourceRegion: region(90), notes: [] },
        { field: "chartAtr", rawValue: atr, normalizedValue: atr, confidence: 0.86, sourceRegion: region(100), notes: [] },
        { field: "chartMa", rawValue: ma, normalizedValue: ma, confidence: 0.83, sourceRegion: region(110), notes: [] },
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
