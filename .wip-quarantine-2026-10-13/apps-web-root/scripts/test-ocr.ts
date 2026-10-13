/**
 * OCR & Trade Recognition unit tests (Prompt 3 §58) — run with Node 24
 * native TS stripping: `node scripts/test-ocr.ts`
 *
 * Covers: upload validation (§11), field confidence tiers (§18), draft
 * validation + cross-field coherence (§22), draft projection (§23), risk /
 * reward derivation (§24), the full engine lifecycle (§16/§40: processing →
 * completed / partial / low-confidence / failed / cancelled, retry §56,
 * confirm §28, delete), and the negative security checks (§37/§58/§63):
 * no execution surface, no secrets in any serialized view, results never
 * authoritative without user confirmation.
 */
import assert from "node:assert/strict";

import {
  OCR_MAX_SCREENSHOT_BYTES,
  computeRiskReward,
  confidenceLevel,
  draftInputFromResult,
  parseTradeDraft,
  tradeDraftSchema,
  validateDraftCoherence,
  validateScreenshotFile,
  type RecognitionResult,
} from "../src/lib/recognition/contract.ts";
import {
  OcrRecognitionEngine,
  OcrMockError,
  __testing,
} from "../src/mocks/ocr-engine.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  ✗ ${name}`);
  }
}

const START = 1_000_000;
const DONE = START + __testing.TOTAL_PIPELINE_MS + 10;

function uploadAndCreate(
  engine: OcrRecognitionEngine,
  now: number,
  name = "XAUUSD_MT5.png",
): string {
  // V2 — uploadScreenshot returns the { screenshot, duplicate } envelope.
  const { screenshot } = engine.uploadScreenshot(
    { name, sizeBytes: 480_000, mimeType: "image/png", width: 1920, height: 1080 },
    now,
  );
  const job = engine.createJob(
    { screenshotId: screenshot.id, platform: "AUTO", mode: "AUTOMATIC" },
    "usr_demo",
    now,
  );
  return job.id;
}

async function main() {
  console.log("— Upload validation (§11) —");
  await test("accepts a valid PNG within the size limit", () => {
    assert.equal(
      validateScreenshotFile({ type: "image/png", size: 480_000, name: "shot.png" }),
      null,
    );
  });
  await test("accepts JPG/JPEG/WEBP by mime or extension", () => {
    assert.equal(
      validateScreenshotFile({ type: "", size: 100, name: "shot.jpg" }),
      null,
    );
    assert.equal(
      validateScreenshotFile({ type: "image/webp", size: 100, name: "capture" }),
      null,
    );
  });
  await test("rejects unsupported formats (§32 copy exists)", () => {
    assert.equal(
      validateScreenshotFile({ type: "image/gif", size: 100, name: "anim.gif" }),
      "UNSUPPORTED_FORMAT",
    );
  });
  await test("rejects oversized files at exactly the boundary", () => {
    assert.equal(
      validateScreenshotFile({
        type: "image/png",
        size: OCR_MAX_SCREENSHOT_BYTES + 1,
        name: "big.png",
      }),
      "FILE_TOO_LARGE",
    );
    assert.equal(
      validateScreenshotFile({
        type: "image/png",
        size: OCR_MAX_SCREENSHOT_BYTES,
        name: "big.png",
      }),
      null,
    );
  });
  await test("rejects empty files", () => {
    assert.equal(
      validateScreenshotFile({ type: "image/png", size: 0, name: "empty.png" }),
      "EMPTY_FILE",
    );
  });

  console.log("— Confidence tiers (§18) —");
  await test("classifies HIGH/MEDIUM/LOW with stable boundaries", () => {
    assert.equal(confidenceLevel(97), "HIGH");
    assert.equal(confidenceLevel(85), "HIGH");
    assert.equal(confidenceLevel(84), "MEDIUM");
    assert.equal(confidenceLevel(65), "MEDIUM");
    assert.equal(confidenceLevel(64), "LOW");
    assert.equal(confidenceLevel(null), null);
  });

  console.log("— Draft validation (§22) —");
  const baseDraft = {
    jobId: "rec_test",
    updatedAt: new Date(START).toISOString(),
    symbol: "XAUUSD",
    direction: "BUY" as const,
    platform: "METATRADER_5" as const,
    entryPrice: "2645.32",
    exitPrice: "2659.98",
    volume: "0.10",
    stopLoss: "2638.50",
    takeProfit: "2660.00",
    profitLoss: "146.80",
    currency: "usd",
    openTime: "2025-05-14T09:47:12Z",
    closeTime: "2025-05-14T11:32:40Z",
    positionId: "48192034",
    orderId: null,
  };
  await test("parses a fully valid draft and normalizes currency", () => {
    const parsed = parseTradeDraft(baseDraft);
    assert.equal(parsed.currency, "USD");
    assert.equal(parsed.symbol, "XAUUSD");
  });
  await test("rejects an invalid symbol", () => {
    assert.throws(() => parseTradeDraft({ ...baseDraft, symbol: "x!" }));
  });
  await test("rejects non-positive volume", () => {
    assert.throws(() => parseTradeDraft({ ...baseDraft, volume: "0" }));
    assert.throws(() => parseTradeDraft({ ...baseDraft, volume: "-1" }));
  });
  await test("rejects bad currency and P&L formats", () => {
    assert.throws(() => parseTradeDraft({ ...baseDraft, currency: "USDD" }));
    assert.throws(() => parseTradeDraft({ ...baseDraft, profitLoss: "abc" }));
    const ok = parseTradeDraft({ ...baseDraft, profitLoss: "-52.10" });
    assert.equal(ok.profitLoss, "-52.10");
  });
  await test("rejects a malformed datetime", () => {
    assert.throws(() => parseTradeDraft({ ...baseDraft, openTime: "not-a-date" }));
  });
  await test("coherence: BUY stop loss must sit below entry", () => {
    const issues = validateDraftCoherence(
      tradeDraftSchema.parse({ ...baseDraft, stopLoss: "2660.00" }),
    );
    assert.ok(issues.some((i) => i.field === "stopLoss"));
  });
  await test("coherence: SELL stop loss must sit above entry, take profit below", () => {
    const issues = validateDraftCoherence(
      tradeDraftSchema.parse({
        ...baseDraft,
        direction: "SELL",
        stopLoss: "2600.00",
        takeProfit: "2700.00",
        exitPrice: null,
      }),
    );
    assert.ok(issues.some((i) => i.field === "stopLoss"));
    assert.ok(issues.some((i) => i.field === "takeProfit"));
  });
  await test("coherence: close time must come after open time", () => {
    const issues = validateDraftCoherence(
      tradeDraftSchema.parse({
        ...baseDraft,
        closeTime: "2025-05-14T08:00:00Z",
      }),
    );
    assert.ok(issues.some((i) => i.field === "closeTime"));
  });

  console.log("— Risk / reward (§24) —");
  await test("computes the XAUUSD example at 1:2", () => {
    const rr = computeRiskReward({
      direction: "BUY",
      entryPrice: "2645.32",
      stopLoss: "2638.50",
      takeProfit: "2660.00",
    });
    assert.equal(rr.ratio !== null && rr.ratio > 2.1 && rr.ratio < 2.3, true);
    assert.ok(rr.label !== null && rr.label.startsWith("1 :"));
  });
  await test("returns null when any leg is missing", () => {
    const rr = computeRiskReward({
      direction: "BUY",
      entryPrice: "100",
      stopLoss: "95",
      takeProfit: null,
    });
    assert.equal(rr.label, null);
  });

  console.log("— Engine lifecycle (§16/§40) —");
  await test("processing job derives stage/progress from elapsed time", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const early = engine.getJob(id, START + 1_000);
    assert.equal(early.status, "PROCESSING");
    assert.equal(early.stage, "PREPROCESSING");
    assert.ok(early.progress > 0 && early.progress < 100);
    assert.equal(early.error, null);
    assert.equal(__testing.TOTAL_PIPELINE_MS > 5_000, true);
  });
  await test("XAUUSD scenario completes with warnings, regions and P&L", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const done = engine.getJob(id, DONE);
    assert.equal(done.status, "COMPLETED");
    assert.equal(done.stage, "COMPLETED");
    assert.equal(done.progress, 100);
    assert.equal(done.processingMs !== null, true);
    assert.equal(done.hasWarnings, true);
    const result: RecognitionResult = engine.getResult(id, DONE);
    assert.equal(result.detectedPlatform, "METATRADER_5");
    const trade = result.trades[0];
    assert.equal(trade.fields.symbol.value, "XAUUSD");
    assert.equal(trade.fields.direction.value, "BUY");
    assert.equal(trade.fields.entryPrice.value, "2645.32");
    assert.equal(trade.fields.stopLoss.state, "UNCERTAIN");
    assert.equal(trade.fields.stopLoss.confidence, 72);
    assert.ok(result.warnings.some((w) => w.field === "stopLoss"));
    assert.ok(result.overallConfidence !== null && result.overallConfidence > 80);
    assert.ok(trade.fields.entryPrice.sourceRegion !== undefined);
  });
  await test("EURUSD scenario completes clean with high confidence", () => {
    const engine = new OcrRecognitionEngine(["EURUSD_BUY"]);
    const id = uploadAndCreate(engine, START, "EURUSD_buy.png");
    const result = engine.getResult(id, DONE);
    assert.equal(result.trades[0].fields.symbol.value, "EURUSD");
    assert.ok((result.overallConfidence ?? 0) >= 90);
    assert.equal(result.warnings.length, 0);
    const history = engine.listJobs({}, DONE)[0];
    assert.equal(history.detectedTradeCount, 1);
    assert.ok(history.overallConfidence !== null);
  });
  await test("NAS100 scenario is low-confidence with field warnings", () => {
    const engine = new OcrRecognitionEngine(["NAS100_LOW"]);
    const id = uploadAndCreate(engine, START, "NAS100_sell.png");
    const result = engine.getResult(id, DONE);
    assert.equal(result.trades[0].fields.symbol.value, "NAS100");
    assert.equal(result.trades[0].fields.takeProfit.state, "NOT_FOUND");
    assert.ok(result.overallConfidence !== null && result.overallConfidence < 85);
    assert.ok(result.warnings.some((w) => w.field === "takeProfit"));
    assert.ok(result.warnings.some((w) => w.field === "stopLoss"));
  });
  await test("FAILED scenario fails mid-OCR with §32 user-facing copy", () => {
    const engine = new OcrRecognitionEngine(["FAILED"]);
    const id = uploadAndCreate(engine, START, "blurry.png");
    const running = engine.getJob(id, START + 2_000);
    assert.equal(running.status, "PROCESSING");
    const failedJob = engine.getJob(id, START + __testing.FAIL_AT_MS + 10);
    assert.equal(failedJob.status, "FAILED");
    assert.equal(failedJob.stage, "OCR");
    assert.equal(failedJob.error?.code, "RECOGNITION_FAILED");
    assert.throws(
      () => engine.getResult(id, START + __testing.FAIL_AT_MS + 10),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_AVAILABLE",
    );
  });
  await test("getResult during processing is NOT_READY (409)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    assert.throws(
      () => engine.getResult(id, START + 500),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_READY",
    );
  });
  await test("BTCUSD scenario is a partial read (missing exit + SL)", () => {
    const engine = new OcrRecognitionEngine(["BTCUSD_PARTIAL"]);
    const id = uploadAndCreate(engine, START, "btcusd_tv.png");
    const result = engine.getResult(id, DONE);
    const trade = result.trades[0];
    assert.equal(trade.fields.symbol.value, "BTCUSD");
    assert.equal(trade.fields.exitPrice.state, "NOT_FOUND");
    assert.equal(trade.fields.stopLoss.state, "NOT_FOUND");
    assert.ok(result.warnings.length >= 2);
  });
  await test("cancel during processing freezes the job (§55)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const cancelled = engine.cancelJob(id, START + 1_200);
    assert.equal(cancelled.status, "CANCELLED");
    const later = engine.getJob(id, START + __testing.TOTAL_PIPELINE_MS + 100);
    assert.equal(later.status, "CANCELLED");
    assert.throws(
      () => engine.cancelJob(id, START + 1_300),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_CANCELLABLE",
    );
    assert.throws(
      () => engine.getResult(id, START + 2_000),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_AVAILABLE",
    );
  });
  await test("retrying a FAILED job starts a NEW runnable job (§56)", () => {
    const engine = new OcrRecognitionEngine(["FAILED", "EURUSD_BUY"]);
    const failedId = uploadAndCreate(engine, START, "retry-me.png");
    const failedJob = engine.getJob(failedId, START + __testing.FAIL_AT_MS + 10);
    assert.equal(failedJob.status, "FAILED");
    const retry = engine.retryJob(failedId, START + 900_000);
    assert.notEqual(retry.id, failedId);
    assert.equal(retry.status, "PROCESSING");
    const retryDone = engine.getJob(retry.id, START + 900_000 + __testing.TOTAL_PIPELINE_MS + 10);
    assert.equal(retryDone.status, "COMPLETED");
    const retryResult = engine.getResult(retry.id, START + 900_000 + __testing.TOTAL_PIPELINE_MS + 10);
    assert.equal(retryResult.trades[0].fields.symbol.value, "EURUSD");
    // A COMPLETED job is never retryable — retry is exclusive to failures (§56).
    assert.throws(
      () => engine.retryJob(retry.id, START + 900_000 + __testing.TOTAL_PIPELINE_MS + 20),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_RETRYABLE",
    );
  });
  await test("confirm without a draft is rejected (§28 explicit action)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    assert.throws(
      () => engine.confirmImport(id, DONE),
      (error: unknown) => error instanceof OcrMockError && error.code === "NO_DRAFT",
    );
  });
  await test("incoherent draft updates are rejected with 422", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    const draftInput = draftInputFromResult(id, result);
    assert.throws(
      () => engine.updateDraft(id, { ...draftInput, stopLoss: "2700.00" }, DONE),
      (error: unknown) => error instanceof OcrMockError && error.code === "DRAFT_INVALID",
    );
  });
  await test("a valid draft saves, then confirm imports with a trade id", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    const draftInput = draftInputFromResult(id, result);
    const saved = engine.updateDraft(id, draftInput, DONE);
    assert.equal(saved.jobId, id);
    const { tradeId, job } = engine.confirmImport(id, DONE + 1_000);
    assert.match(tradeId, /^TRD-OCR-\d+$/);
    assert.equal(job.importedTradeId, tradeId);
    // V2 idempotent replay — the SAME trade id, never a second import (§79).
    const replay = engine.confirmImport(id, DONE + 2_000);
    assert.equal(replay.tradeId, tradeId);
  });
  await test("draft projection carries corrected values (§23)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    const corrected: RecognitionResult = {
      ...result,
      trades: [
        {
          ...result.trades[0],
          fields: {
            ...result.trades[0].fields,
            stopLoss: {
              ...result.trades[0].fields.stopLoss,
              value: "2630.00",
            },
          },
        },
      ],
    };
    const input = draftInputFromResult(id, corrected);
    assert.equal(input.stopLoss, "2630.00");
    assert.equal(input.direction, "BUY");
    assert.equal(input.symbol, "XAUUSD");
  });
  await test("NOT_FOUND fields project to null in the draft", () => {
    const engine = new OcrRecognitionEngine(["BTCUSD_PARTIAL"]);
    const id = uploadAndCreate(engine, START, "partial.png");
    const result = engine.getResult(id, DONE);
    const input = draftInputFromResult(id, result);
    assert.equal(input.exitPrice, null);
    assert.equal(input.stopLoss, null);
    assert.equal(input.entryPrice, "67245.0");
  });
  await test("delete removes the job from history", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    engine.deleteJob(id);
    assert.throws(
      () => engine.getJob(id, START),
      (error: unknown) => error instanceof OcrMockError && error.code === "JOB_NOT_FOUND",
    );
  });
  await test("history lists newest first with complete §30 columns", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "FAILED"]);
    uploadAndCreate(engine, START, "first.png");
    uploadAndCreate(engine, START + 10_000, "second.png");
    const history = engine.listJobs({}, START + __testing.TOTAL_PIPELINE_MS + 20_000);
    assert.equal(history.length, 2);
    assert.ok(
      Date.parse(history[0].createdAt) >= Date.parse(history[1].createdAt),
    );
    const sample = history[0];
    for (const key of [
      "id",
      "status",
      "platform",
      "screenshotName",
      "sizeBytes",
      "mimeType",
      "detectedTradeCount",
      "overallConfidence",
      "hasWarnings",
      "createdAt",
    ] as const) {
      assert.ok(key in sample);
    }
    // Newest first: "second.png" (the FAILED job) leads, "first.png" follows.
    assert.equal(history[0].screenshotName, "second.png");
    assert.equal(history[0].status, "FAILED");
    assert.equal(history[1].screenshotName, "first.png");
    assert.equal(history[1].status, "COMPLETED");
    assert.equal(history[1].detectedTradeCount, 1);
  });
  await test("unknown job ids throw JOB_NOT_FOUND on every route", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    assert.throws(() => engine.getJob("rec_nope", START), OcrMockError);
    assert.throws(() => engine.getResult("rec_nope", START), OcrMockError);
    assert.throws(() => engine.getDraft("rec_nope"), OcrMockError);
    assert.throws(() => engine.deleteJob("rec_nope"), OcrMockError);
  });
  await test("unknown screenshot ids are rejected at job creation", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    assert.throws(
      () =>
        engine.createJob(
          { screenshotId: "scr_nope", platform: "AUTO", mode: "AUTOMATIC" },
          "usr_demo",
          START,
        ),
      (error: unknown) => error instanceof OcrMockError && error.code === "SCREENSHOT_NOT_FOUND",
    );
  });

  console.log("— Negative security (§37/§58/§63) —");
  await test("no execution surface exists on the engine", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const engineAny = engine as unknown as Record<string, unknown>;
    for (const forbidden of [
      "placeOrder",
      "closeTrade",
      "modifySl",
      "setLeverage",
      "execute",
    ]) {
      assert.equal(forbidden in engineAny, false);
    }
  });
  await test("serialized job/result/history never contain secrets or tokens", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const blobs = [
      JSON.stringify(engine.getJob(id, DONE)),
      JSON.stringify(engine.getResult(id, DONE)),
      JSON.stringify(engine.listJobs({}, DONE)),
      engine.getDraft(id) === null ? "" : JSON.stringify(engine.getDraft(id)),
    ];
    const forbidden = [
      "secret",
      "token",
      "apiKey",
      "api_key",
      "password",
      "credential",
      "bearer",
    ];
    for (const blob of blobs) {
      const lowered = blob.toLowerCase();
      for (const word of forbidden) {
        assert.equal(lowered.includes(word.toLowerCase()), false, `leaked "${word}"`);
      }
    }
  });
  await test("results never auto-confirm: import requires draft + explicit confirm", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const job = engine.getJob(id, DONE);
    assert.equal(job.importedTradeId, null);
    assert.throws(() => engine.confirmImport(id, DONE), OcrMockError);
  });

  // ═══ V2 — multi-trade, duplicates, corrections, recrop, analytics ═════
  console.log("\n— V2 — multi-trade, duplicates, corrections, recrop, analytics —");

  await test("HISTORY_MULTI scenario detects 3 trades with a MULTIPLE_TRADES_POSSIBLE warning", () => {
    const engine = new OcrRecognitionEngine(["HISTORY_MULTI"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    assert.equal(result.trades.length, 3);
    assert.ok(result.warnings.some((w) => w.code === "MULTIPLE_TRADES_POSSIBLE"));
    const second = result.trades[1];
    assert.equal(second?.fields.symbol?.value, "EURUSD");
    assert.equal(second?.fields.direction?.value, "SELL");
  });

  await test("per-index drafts are stored separately (V2 multi-trade)", () => {
    const engine = new OcrRecognitionEngine(["HISTORY_MULTI"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    const first = draftInputFromResult(id, result, 1);
    engine.updateDraft(id, first, DONE, 1);
    const third = draftInputFromResult(id, result, 3);
    engine.updateDraft(id, third, DONE, 3);
    const slots = engine.getDrafts(id);
    assert.equal(slots.length, 3);
    assert.equal(slots[0]?.draft?.tradeIndex, 1);
    assert.equal(slots[1]?.draft, null);
    assert.equal(slots[2]?.draft?.tradeIndex, 3);
  });

  await test("batch confirm imports every drafted trade; un-drafted indexes are rejected", () => {
    const engine = new OcrRecognitionEngine(["HISTORY_MULTI"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    for (const index of [1, 2, 3]) {
      engine.updateDraft(id, draftInputFromResult(id, result, index), DONE, index);
    }
    const confirmed = engine.confirmImport(id, DONE + 1_000);
    assert.equal(confirmed.trades.length, 3);
    assert.ok(confirmed.trades.every((entry) => /^TRD-OCR-\d+$/.test(entry.tradeId)));
    assert.equal(new Set(confirmed.trades.map((entry) => entry.tradeId)).size, 3);
    // subset request on a fresh engine
    const engine2 = new OcrRecognitionEngine(["HISTORY_MULTI"]);
    const id2 = uploadAndCreate(engine2, START);
    engine2.updateDraft(id2, draftInputFromResult(id2, engine2.getResult(id2, DONE), 2), DONE, 2);
    const partial = engine2.confirmImport(id2, DONE + 1_000, { tradeIndexes: [2] });
    assert.equal(partial.trades.length, 1);
    assert.equal(partial.trades[0]?.tradeIndex, 2);
    // un-drafted trade → NO_DRAFT
    const engine3 = new OcrRecognitionEngine(["HISTORY_MULTI"]);
    const id3 = uploadAndCreate(engine3, START);
    assert.throws(
      () => engine3.confirmImport(id3, DONE, { tradeIndexes: [1] }),
      (error: unknown) => error instanceof OcrMockError && error.code === "NO_DRAFT",
    );
  });

  await test("duplicate upload warns with a simulated anchor and never blocks", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const first = engine.uploadScreenshot(
      { name: "shot.png", sizeBytes: 480_000, mimeType: "image/png", width: 1920, height: 1080 },
      START,
    );
    assert.equal(first.duplicate ?? null, null);
    const second = engine.uploadScreenshot(
      { name: "shot.png", sizeBytes: 480_000, mimeType: "image/png", width: 1920, height: 1080 },
      START + 5_000,
    );
    assert.notEqual(second.duplicate ?? null, null);
    assert.equal(second.duplicate?.hammingDistance, 0);
    assert.equal(second.screenshot.id !== first.screenshot.id, true);
    // a DIFFERENT file does not warn
    const third = engine.uploadScreenshot(
      { name: "other.png", sizeBytes: 333_333, mimeType: "image/png", width: 1280, height: 720 },
      START + 9_000,
    );
    assert.equal(third.duplicate ?? null, null);
  });

  await test("corrections memory feeds suggestions (V2)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    const draftInput = draftInputFromResult(id, result);
    const machineVolume = result.trades[0]?.fields.volume?.value ?? "0.10";
    engine.updateDraft(id, { ...draftInput, volume: "0.15" }, DONE, 1);
    const suggestions = engine.getSuggestions(null);
    const volume = suggestions.suggestions.find((s) => s.field === "volume");
    assert.notEqual(volume, undefined);
    assert.ok(volume?.values.some((v) => v.value === "0.15"));
    void machineVolume;
    // symbol prefix catalog
    const gold = engine.getSuggestions("XAU");
    assert.ok(gold.symbolCandidates.some((c) => c.symbol === "XAUUSD"));
  });

  await test("recrop lifts confidence for fields inside the zone", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const before = engine.getResult(id, DONE);
    const stopLossConfidence = before.trades[0]?.fields.stopLoss?.confidence ?? 0;
    const after = engine.recrop(
      id,
      { x: 0.55, y: 0.5, width: 0.3, height: 0.25 },
      1,
      DONE,
    );
    const field = after.trades[0]?.fields.stopLoss;
    assert.equal(field?.state, "FOUND");
    assert.ok((field?.confidence ?? 0) >= 97);
    assert.ok((field?.confidence ?? 0) > stopLossConfidence);
    // far-away zone changes nothing
    const untouched = engine.recrop(id, { x: 0.0, y: 0.0, width: 0.1, height: 0.05 }, 1, DONE);
    assert.equal(untouched.trades[0]?.fields.symbol?.value, before.trades[0]?.fields.symbol?.value);
  });

  await test("analytics funnel + storage snapshot reflect in-session activity", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    engine.updateDraft(id, draftInputFromResult(id, result), DONE, 1);
    engine.confirmImport(id, DONE + 1_000);
    const analytics = engine.getAnalytics(30);
    assert.equal(analytics.funnel.jobs, 1);
    assert.equal(analytics.funnel.confirmed, 1);
    assert.equal(analytics.funnel.confirmedTrades, 1);
    assert.ok(analytics.funnel.uploads >= 1);
    assert.equal(analytics.performance.avgProcessingMs, __testing.TOTAL_PIPELINE_MS);
    const storage = engine.getStorage();
    assert.equal(storage.assetsCount, 1);
    assert.equal(storage.retentionDays, 0);
    assert.ok(storage.totalBytes > 0);
  });

  await test("progress snapshot derives terminal state (SSE seam, mocked build)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const running = engine.getProgress(id, START + 2_000);
    assert.equal(running.terminal, false);
    assert.ok(running.progress > 0 && running.progress < 100);
    const done = engine.getProgress(id, DONE);
    assert.equal(done.terminal, true);
    assert.equal(done.progress, 100);
  });

  // ── V3 — quality score, versioning, reprocess, groups, collections ────────

  console.log("— V3 quality score + versioning (spec §28/§44) —");
  await test("result carries the deterministic quality score with components", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    assert.ok(result.quality !== undefined);
    assert.ok(result.quality.overall >= 0 && result.quality.overall <= 100);
    assert.equal(result.quality.components.consistency, null); // single-image job
    for (const key of ["textRecognition", "fieldExtraction", "tradingInterpretation", "crossFieldValidation"] as const) {
      assert.ok(result.quality.components[key] >= 0 && result.quality.components[key] <= 100);
    }
    // Determinism (§77): the same read always produces the same score.
    assert.equal(
      JSON.stringify(engine.getResult(id, DONE).quality),
      JSON.stringify(result.quality),
    );
  });
  await test("result carries recognition versions (engine/pipeline/schema)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const result = engine.getResult(id, DONE);
    assert.ok(result.versions !== undefined);
    assert.ok(result.versions.engine.length > 0);
    assert.ok(result.versions.pipeline.length > 0);
    assert.equal(result.versions.schema, "3");
  });

  console.log("— V3 reprocess (spec §45) —");
  await test("reprocess spawns a NEW job over the same asset; history untouched", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "EURUSD_BUY"]);
    const sourceId = uploadAndCreate(engine, START);
    const sourceJob = engine.getJob(sourceId, DONE);
    const { job, reprocessedFromJobId } = engine.reprocessJob(sourceId, DONE + 1_000);
    assert.equal(reprocessedFromJobId, sourceId);
    assert.notEqual(job.id, sourceId);
    assert.equal(job.screenshot.id, sourceJob.screenshot.id); // SAME asset
    // Mock semantics: derive-on-read shows PROCESSING from the first read.
    assert.equal(job.status, "PROCESSING");
    // The source recognition is untouched.
    assert.equal(engine.getJob(sourceId, DONE + 1_000).status, "COMPLETED");
  });
  await test("reprocess rejects a job that is still running", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    assert.throws(
      () => engine.reprocessJob(id, START + 100),
      (error: unknown) => error instanceof OcrMockError && error.code === "NOT_REPROCESSABLE",
    );
  });

  console.log("— V3 fusion groups (spec §14/§15/§31/§36) —");
  await test("matching members auto-confirm into an ACTIVE group with a fused draft", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "XAUUSD_BUY"]);
    // Both members share the create timestamp so both are COMPLETED at DONE
    // (the pipeline state is derived on read from createdAtMs).
    const a = uploadAndCreate(engine, START, "entry.png");
    const b = uploadAndCreate(engine, START, "exit.png");
    const { group } = engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE);
    assert.equal(group.status, "ACTIVE"); // symbol+direction agree, confidence ≥ threshold
    assert.equal(group.autoConfirmed, true);
    assert.equal(group.members.length, 2);
    assert.ok(group.fusedDraft !== null);
    assert.equal(group.fusedDraft.symbol, "XAUUSD");
    assert.ok(group.evidence.some((e) => e.kind === "SYMBOL" && e.score === 1));
    assert.ok(group.evidence.some((e) => e.kind === "DIRECTION" && e.score === 1));
    assert.equal(group.quality.components.consistency, 100);
    assert.ok(group.fusionConfidence >= 75);
    // Provenance: every fused value traces back to a member job.
    for (const [field, origin] of Object.entries(group.fieldOrigins)) {
      assert.ok([a, b].includes(origin), `field ${field} origin ${origin} is a member`);
    }
  });
  await test("symbol mismatch caps confidence, keeps PROPOSED and PRESERVES conflicts", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "EURUSD_BUY"]);
    const a = uploadAndCreate(engine, START, "gold.png");
    const b = uploadAndCreate(engine, START, "euro.png");
    const { group } = engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE);
    assert.equal(group.status, "PROPOSED");
    assert.equal(group.autoConfirmed, false);
    assert.ok(group.fusionConfidence <= 40);
    const conflict = group.conflicts.find((c) => c.field === "symbol");
    assert.ok(conflict !== undefined);
    assert.deepEqual(conflict.values.map((v) => v.value).sort(), ["EURUSD", "XAUUSD"]);
    assert.ok([a, b].includes(conflict.selectedJobId));
    // Timeline never invents timestamps — entries keep member order when untimed.
    assert.ok(group.timeline.length === 2);
  });
  await test("group creation validates the 2..8 member window", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const a = uploadAndCreate(engine, START);
    assert.throws(
      () => engine.createGroup({ jobIds: [a] }, "usr_demo", DONE),
      (error: unknown) => error instanceof OcrMockError && error.code === "VALIDATION_ERROR",
    );
    const nine = Array.from({ length: 9 }, (_, i) => `rec_${i}`);
    assert.throws(
      () => engine.createGroup({ jobIds: nine }, "usr_demo", DONE),
      (error: unknown) => error instanceof OcrMockError && error.code === "VALIDATION_ERROR",
    );
  });
  await test("only completed recognitions can be grouped", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "FAILED"]);
    const a = uploadAndCreate(engine, START, "done.png");
    const b = uploadAndCreate(engine, START + 1_000, "running.png"); // FAILED scenario — still processing at DONE
    assert.throws(
      () => engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE),
      (error: unknown) => error instanceof OcrMockError && error.code === "JOB_NOT_COMPLETED",
    );
  });
  await test("fused draft edits follow the SAME validated rules (§74)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "EURUSD_BUY"]);
    const a = uploadAndCreate(engine, START, "gold.png");
    const b = uploadAndCreate(engine, START, "euro.png");
    const { group } = engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE);
    const draft = group.fusedDraft;
    assert.ok(draft !== null);
    // The mismatched fusion mixes price scales — the user rewrites the
    // price fields coherently (the §31 conflicts flow) before the draft
    // passes. Incoherent edits are refused with 422.
    const coherent = { ...draft, entryPrice: "2345.60", stopLoss: "2335.60", takeProfit: "2365.60", exitPrice: "2360.00" };
    const edited = engine.updateGroupDraft(group.id, coherent, DONE + 1_000);
    assert.equal(edited.draft.exitPrice, "2360.00");
    assert.equal(engine.getGroup(group.id).group.status, "ACTIVE");
    // Incoherent edit → 422 (BUY with SL above entry).
    assert.throws(
      () => engine.updateGroupDraft(group.id, { ...coherent, stopLoss: "9999.00" }, DONE + 2_000),
      (error: unknown) => error instanceof OcrMockError && error.code === "DRAFT_INVALID",
    );
  });
  await test("group confirm creates exactly ONE trade and replays idempotently (§51)", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "XAUUSD_BUY"]);
    const a = uploadAndCreate(engine, START, "entry.png");
    const b = uploadAndCreate(engine, START, "exit.png");
    const { group } = engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE);
    const first = engine.confirmGroup(group.id, DONE + 1_000, { accountId: "acc-1" });
    assert.ok(first.tradeId.startsWith("TRD-OCR-"));
    assert.equal(first.group.status, "CONFIRMED");
    assert.equal(first.group.importedTradeId, first.tradeId);
    // Idempotent replay — the SAME trade id, never a second import.
    const replay = engine.confirmGroup(group.id, DONE + 2_000);
    assert.equal(replay.tradeId, first.tradeId);
    // Members stay intact (spec §15) — both still reviewable recognitions.
    assert.equal(engine.getJob(a, DONE + 2_000).status, "COMPLETED");
    assert.equal(engine.getJob(b, DONE + 2_000).status, "COMPLETED");
  });
  await test("a PROPOSED group confirms through explicit user agreement; discard is final", () => {
    // Symbol mismatch → PROPOSED (below the auto-accept threshold) but still
    // fusable — the user reviews the conflicts, repairs the fused draft and
    // confirms manually (the §31/§74 flow).
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "EURUSD_BUY"]);
    const a = uploadAndCreate(engine, START, "gold.png");
    const b = uploadAndCreate(engine, START, "euro.png");
    const { group } = engine.createGroup({ jobIds: [a, b] }, "usr_demo", DONE);
    assert.equal(group.status, "PROPOSED");
    const draft = group.fusedDraft;
    assert.ok(draft !== null);
    engine.updateGroupDraft(
      group.id,
      { ...draft, symbol: "XAUUSD", entryPrice: "2345.60", stopLoss: "2335.60", takeProfit: "2365.60" },
      DONE + 500,
    );
    const confirmed = engine.confirmGroup(group.id, DONE + 1_000);
    assert.ok(confirmed.tradeId.startsWith("TRD-OCR-"));
    assert.equal(confirmed.group.status, "CONFIRMED");
    // Members stay intact (spec §15).
    assert.equal(engine.getJob(a, DONE + 1_000).status, "COMPLETED");
    assert.equal(engine.getJob(b, DONE + 1_000).status, "COMPLETED");

    // Discard: members intact, further confirms refused.
    const engine2 = new OcrRecognitionEngine(["XAUUSD_BUY", "XAUUSD_BUY"]);
    const e1 = uploadAndCreate(engine2, START, "m1.png");
    const e2 = uploadAndCreate(engine2, START, "m2.png");
    const g2 = engine2.createGroup({ jobIds: [e1, e2] }, "usr_demo", DONE).group;
    const discarded = engine2.discardGroup(g2.id);
    assert.equal(discarded.ok, true);
    assert.equal(engine2.getGroup(g2.id).group.status, "DISCARDED");
    assert.throws(
      () => engine2.confirmGroup(g2.id, DONE + 1_000),
      (error: unknown) => error instanceof OcrMockError && error.code === "GROUP_ALREADY_CONFIRMED",
    );
    assert.equal(engine2.getJob(e1, DONE + 1_000).status, "COMPLETED");
  });

  console.log("— V3 history filters + facets (spec §62) —");
  await test("history items expose duplicateWarned, correctedCount and qualityOverall", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const id = uploadAndCreate(engine, START);
    const before = engine.listJobs({}, DONE).find((item) => item.id === id);
    assert.equal(before?.duplicateWarned, false);
    assert.equal(before?.correctedCount, 0);
    assert.ok((before?.qualityOverall ?? 0) > 0);
    // A correction shows up in the facet.
    const result = engine.getResult(id, DONE);
    const draft = draftInputFromResult(id, result, 1);
    engine.updateDraft(id, { ...draft, exitPrice: "2399.99" }, DONE + 100);
    const after = engine.listJobs({}, DONE + 200).find((item) => item.id === id);
    assert.ok((after?.correctedCount ?? 0) > 0);
  });
  await test("duplicate re-upload marks the facet and drives the duplicate filter", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    uploadAndCreate(engine, START, "same.png");
    uploadAndCreate(engine, START + 1_000, "same.png"); // same identity → warned
    const all = engine.listJobs({}, DONE);
    assert.equal(all.length, 2);
    assert.equal(engine.listJobs({ duplicate: "true" }, DONE).length, 1);
    assert.equal(engine.listJobs({ duplicate: "false" }, DONE).length, 1);
  });
  await test("status / confidence / date facets filter the list", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY", "FAILED"]);
    uploadAndCreate(engine, START, "ok.png");
    uploadAndCreate(engine, START + 1_000, "bad.png");
    const iso = new Date(START).toISOString().slice(0, 10);
    assert.equal(engine.listJobs({ status: "COMPLETED" }, DONE).length, 1);
    assert.equal(engine.listJobs({ status: "FAILED" }, DONE).length, 1);
    // XAUUSD_BUY overall ≈ 93 — above 90; the FAILED job carries null → excluded.
    const high = engine.listJobs({ minConfidence: 90 }, DONE);
    assert.equal(high.length, 1);
    assert.equal(engine.listJobs({ from: iso, to: iso }, DONE).length, 2);
    assert.equal(engine.listJobs({ from: "2030-01-01" }, DONE).length, 0);
  });

  console.log("— V3 strategy matches (spec §38–§40) —");
  await test("suggestions carry deterministic strategy matches for known symbols", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const matches = engine.getSuggestions("xauusd").strategyMatches;
    assert.ok(matches !== undefined && matches.length === 2); // Gold Breakout NY + Gold Swing Reversal
    assert.ok(matches.every((match) => match.reasons.includes("Symbol = XAUUSD")));
    assert.ok(matches.every((match) => match.confidence === 70));
    assert.equal(engine.getSuggestions(null).strategyMatches, undefined);
    assert.equal(engine.getSuggestions("ZZZZZ").strategyMatches, undefined);
  });

  console.log("— V3 screenshot collections (spec §41) —");
  await test("collections reference uploads: create, add, remove, delete", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const { screenshot } = engine.uploadScreenshot(
      { name: "gold.png", sizeBytes: 480_000, mimeType: "image/png", width: 1920, height: 1080 },
      START,
    );
    const { collection } = engine.createCollection({ name: "Gold set", description: "May statements" }, START);
    assert.equal(collection.assetsCount, 0);
    const added = engine.addCollectionAsset(collection.id, screenshot.id);
    assert.equal(added.collection.assetsCount, 1);
    assert.equal(added.collection.assets[0]?.id, screenshot.id);
    // Idempotent add.
    assert.equal(engine.addCollectionAsset(collection.id, screenshot.id).collection.assetsCount, 1);
    const listed = engine.listCollections().collections[0];
    assert.equal(listed?.assetsCount, 1);
    assert.equal(listed?.name, "Gold set");
    const removed = engine.removeCollectionAsset(collection.id, screenshot.id);
    assert.equal(removed.collection.assetsCount, 0);
    const deleted = engine.deleteCollection(collection.id);
    assert.equal(deleted.ok, true);
    assert.throws(
      () => engine.getCollection(collection.id),
      (error: unknown) => error instanceof OcrMockError && error.code === "COLLECTION_NOT_FOUND",
    );
  });
  await test("collection validation: unknown asset refused, name required", () => {
    const engine = new OcrRecognitionEngine(["XAUUSD_BUY"]);
    const { collection } = engine.createCollection({ name: "Empty" }, START);
    assert.throws(
      () => engine.addCollectionAsset(collection.id, "scr_nope"),
      (error: unknown) => error instanceof OcrMockError && error.code === "SCREENSHOT_NOT_FOUND",
    );
    assert.throws(
      () => engine.createCollection({ name: "" }, START),
      (error: unknown) => error instanceof OcrMockError && error.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => engine.createCollection({ name: "x".repeat(65) }, START),
      (error: unknown) => error instanceof OcrMockError && error.code === "VALIDATION_ERROR",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const failure of failures) console.log(`  FAIL: ${failure}`);
    process.exit(1);
  }
}

main();
