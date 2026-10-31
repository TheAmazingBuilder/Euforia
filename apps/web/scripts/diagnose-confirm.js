/* eslint-disable @typescript-eslint/no-require-imports -- Node diagnosis script */
/** Reproduce the browser confirm-500 with the full session-like engine state. */
const {
  OcrRecognitionEngine,
  OcrMockError,
  __testing,
} = require("../src/mocks/ocr-engine.ts");

const engine = new OcrRecognitionEngine();

function uploadAndCreate(name, size, now) {
  const { screenshot } = engine.uploadScreenshot(
    { name, sizeBytes: size, mimeType: "image/png", width: 1920, height: 1080 },
    now,
  );
  const job = engine.createJob(
    { screenshotId: screenshot.id, platform: "AUTO", mode: "AUTOMATIC" },
    "usr_demo",
    now,
  );
  return { job, screenshot };
}

const START = 1_000_000;
const PIPELINE = 9_000; // > TOTAL_PIPELINE_MS (~8.4s)

// Mimic the browser session: 6 jobs, one correction, three drafts on job 6.
const files = [
  ["shot.png", 480_000],
  ["shot.png", 480_000], // duplicate forced
  ["nav.png", 333_000],
  ["nav2.png", 333_001],
  ["nav3.png", 333_002],
  ["multi.png", 640_000],
];
let now = START;
let jobId = "";
for (let i = 0; i < files.length; i += 1) {
  now += 20_000;
  const created = uploadAndCreate(files[i][0], files[i][1], now);
  jobId = created.job.id;
  if (i === 0) {
    const result = engine.getResult(jobId, now + PIPELINE);
    const trade = result.trades[0];
    engine.updateDraft(
      jobId,
      {
        symbol: trade.fields.symbol?.value ?? "XAUUSD",
        direction: "BUY",
        platform: result.detectedPlatform,
        entryPrice: trade.fields.entryPrice?.value ?? "1",
        exitPrice: trade.fields.exitPrice?.value ?? null,
        volume: trade.fields.volume?.value ?? null,
        stopLoss: "2639.10",
        takeProfit: trade.fields.takeProfit?.value ?? null,
        profitLoss: trade.fields.profitLoss?.value ?? null,
        currency: trade.fields.currency?.value ?? null,
        openTime: trade.fields.openTime?.value ?? null,
        closeTime: trade.fields.closeTime?.value ?? null,
        positionId: trade.fields.positionId?.value ?? null,
        orderId: trade.fields.orderId?.value ?? null,
      },
      now + PIPELINE,
      1,
    );
  }
  if (i < 5) {
    try {
      engine.getResult(jobId, now + PIPELINE);
    } catch {
      // FAILED scenario throws NOT_AVAILABLE - expected in the rotation.
    }
  }
}

const draftInputFromResult = __testing.draftInputFromResult;
const result = engine.getResult(jobId, now + PIPELINE);
for (const index of [1, 2, 3]) {
  const input = draftInputFromResult(jobId, result, index);
  engine.updateDraft(jobId, input, now + PIPELINE + index, index);
}

try {
  const confirmed = engine.confirmImport(jobId, now + PIPELINE + 10);
  console.log("confirm OK", JSON.stringify(confirmed.trades));
} catch (error) {
  if (error instanceof OcrMockError) {
    console.log("OcrMockError", error.status, error.code, error.message);
  } else {
    console.log("UNEXPECTED:", error instanceof Error ? error.stack : error);
  }
}
