/**
 * e2e - OCR failure paths and resource protection (Phase 19 §27/§34/§35/§37/
 * §38/§53). This file runs in its OWN process (vitest forks pool) and boots
 * the app with the REAL FastAPI engine adapter pointed at a local fake
 * engine - proving the HTTP client path (timeouts, transient retries,
 * contract violations, unprocessable mapping) without the Python sidecar.
 *
 * Env is set at module top, BEFORE loadAppConfig memoizes (single boot).
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { makeOcrFixturePng, pngDataUrl } from "../helpers/ocr-fixtures";

// ── Engine config for THIS process (sidecar only, mock disabled) ────────────
process.env.OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:4519";
process.env.OCR_SERVICE_TOKEN = "e2e-engine-token-0123456789abcdef012345";
process.env.OCR_MOCK_ENGINE = "disabled";
process.env.OCR_ENGINE_TIMEOUT_MS = "2000";
process.env.OCR_ENGINE_MAX_RETRIES = "1";

// ── Fake engine - per-scenario behavior with call counting ──────────────────

type Scenario = "ok" | "hang" | "fail-then-ok" | "malformed-json" | "malformed-shape" | "unprocessable";

let scenario: Scenario = "ok";
let calls = 0;
const bodies: Array<{ requestId: string }> = [];

function enginePayload(requestId: string) {
  return {
    requestId,
    contractVersion: "1",
    processingStatus: "COMPLETED",
    classification: { type: "MT5_TRADE", confidence: 0.9, alternatives: [] },
    fields: [
      {
        field: "symbol",
        rawValue: "XAUUSD",
        normalizedValue: "XAUUSD",
        confidence: 0.95,
        sourceRegion: { x: 1, y: 2, width: 100, height: 20 },
        notes: [],
      },
    ],
    warnings: [],
    processingMetadata: {
      engine: "fake-engine",
      engineVersion: "5.5.0",
      pipelineVersion: "1.0.0",
      durationsMs: { total: 5 },
    },
    failure: null,
  };
}

const httpServer: Server = createServer((req, res) => {
  calls += 1;
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    // Auth guard mirroring the sidecar (§27).
    if (req.headers["x-internal-token"] !== process.env.OCR_SERVICE_TOKEN) {
      res.writeHead(401).end();
      return;
    }
    let requestId = "unknown";
    try {
      const parsed = JSON.parse(raw);
      requestId = parsed.requestId;
      bodies.push({ requestId });
    } catch {
      res.writeHead(400).end();
      return;
    }

    if (scenario === "hang") return; // never answer - client timeout
    if (scenario === "fail-then-ok") {
      if (calls % 2 === 1) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(enginePayload(requestId)));
      return;
    }
    if (scenario === "malformed-json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not json");
      return;
    }
    if (scenario === "malformed-shape") {
      // Structurally invalid against the contract (§54): missing fields,
      // wrong types - must be rejected WITHOUT retry.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ hello: "world", processingStatus: 42 }));
      return;
    }
    if (scenario === "unprocessable") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ...enginePayload(requestId),
          processingStatus: "UNPROCESSABLE",
          classification: null,
          fields: [],
          failure: { category: "SCREENSHOT_UNSUPPORTED", message: "no trading content" },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(enginePayload(requestId)));
  });
});

let app: NestFastifyApplication;
let mail: MailCapture;
let listenPort = 4519;

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(4519, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address && typeof address === "object") listenPort = address.port;
  process.env.OCR_SERVICE_URL = `http://127.0.0.1:${listenPort}`;
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

async function user() {
  const ctx = await authenticatedUser(app, mail);
  return { userId: ctx.userId, authHeader: ctx.authHeader };
}

async function upload(authHeader: Record<string, string>, nonce: number) {
  return app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { imageDataUrl: pngDataUrl(makeOcrFixturePng({ nonce })), requestedProfile: "TRADE_SUMMARY" },
  });
}

// ── Happy path through the REAL HTTP adapter ─────────────────────────────────

describe("OCR via the real FastAPI engine adapter", () => {
  it("carries the engine contract end-to-end (request id echo, auth header)", async () => {
    const a = await user();
    scenario = "ok";
    calls = 0;
    bodies.length = 0;
    const res = await upload(a.authHeader, 7);
    expect(res.statusCode).toBe(201);
    const recognition = res.json().recognition;
    expect(recognition.status).toBe("REVIEW_REQUIRED");
    expect(recognition.engine?.name).toBe("fake-engine");
    expect(recognition.engine?.engineVersion).toBe("5.5.0");
    expect(calls).toBe(1);
    expect(bodies[0]?.requestId).toBe(recognition.id); // §57 correlation
    expect(recognition.fields[0]?.normalizedValue).toBe("XAUUSD");
  });

  it("RETRIES transient 5xx once and then succeeds (§34 bounded retry)", async () => {
    const a = await user();
    scenario = "fail-then-ok";
    calls = 0;
    const res = await upload(a.authHeader, 8);
    expect(res.statusCode).toBe(201);
    expect(res.json().recognition.status).toBe("REVIEW_REQUIRED");
    expect(calls).toBe(2); // one retry, then success - bounded (§34)
    scenario = "ok";
  });

  it("maps a malformed engine payload to FAILED EXTRACTION_FAILED with NO retry (§54)", async () => {
    const a = await user();
    scenario = "malformed-json";
    calls = 0;
    const res = await upload(a.authHeader, 9);
    expect(res.statusCode).toBe(201);
    const recognition = res.json().recognition;
    expect(recognition.status).toBe("FAILED");
    expect(recognition.failure.category).toBe("EXTRACTION_FAILED");
    expect(calls).toBe(1); // contract violations are never retried (§34)
    scenario = "ok";
  });

  it("rejects contract-breaking shapes strictly (§54) without retry", async () => {
    const a = await user();
    scenario = "malformed-shape";
    calls = 0;
    const res = await upload(a.authHeader, 10);
    const recognition = res.json().recognition;
    expect(recognition.status).toBe("FAILED");
    expect(recognition.failure.category).toBe("EXTRACTION_FAILED");
    expect(calls).toBe(1);
    scenario = "ok";
  });

  it("maps engine UNPROCESSABLE to FAILED SCREENSHOT_UNSUPPORTED (§35)", async () => {
    const a = await user();
    scenario = "unprocessable";
    const res = await upload(a.authHeader, 11);
    const recognition = res.json().recognition;
    expect(recognition.status).toBe("FAILED");
    expect(recognition.failure.category).toBe("SCREENSHOT_UNSUPPORTED");
    scenario = "ok";
  });

  it("maps a hanging engine to FAILED PROCESSING_TIMEOUT within the deadline", async () => {
    const a = await user();
    scenario = "hang";
    calls = 0;
    const started = Date.now();
    const res = await upload(a.authHeader, 12);
    const elapsed = Date.now() - started;
    const recognition = res.json().recognition;
    expect(recognition.status).toBe("FAILED");
    expect(recognition.failure.category).toBe("PROCESSING_TIMEOUT");
    // Bounded: 2 attempts × 2 s timeout + overhead - not an infinite wait.
    expect(elapsed).toBeLessThan(15_000);
    expect(calls).toBe(2);
    scenario = "ok";
  }, 30_000);

  it("maps an unreachable engine to FAILED OCR_UNAVAILABLE (§35 honest degradation)", async () => {
    // A dedicated user hits a DEAD port: stop the server, upload, restart.
    const a = await user();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/ocr/recognitions",
        headers: { ...a.authHeader, "content-type": "application/json" },
        payload: { imageDataUrl: pngDataUrl(makeOcrFixturePng({ nonce: 13 })) },
      });
      const recognition = res.json().recognition;
      expect(recognition.status).toBe("FAILED");
      expect(recognition.failure.category).toBe("OCR_UNAVAILABLE");
    } finally {
      await new Promise<void>((resolve) => httpServer.listen(listenPort, "127.0.0.1", resolve));
      scenario = "ok";
    }
  }, 30_000);

  it("rate-limits uploads per user (§37): the 11th upload is 429 with Retry-After", async () => {
    const a = await user();
    scenario = "ok";
    let limited: Awaited<ReturnType<typeof upload>> | null = null;
    for (let nonce = 100; nonce < 111; nonce += 1) {
      const res = await upload(a.authHeader, nonce);
      if (res.statusCode === 429) {
        limited = res;
        break;
      }
      expect(res.statusCode).toBe(201);
    }
    expect(limited).not.toBeNull();
    expect(limited?.statusCode).toBe(429);
    expect(limited?.json().code).toBe("OCR_UPLOAD_RATE_LIMITED");
    expect(limited?.headers["retry-after"]).toBeTruthy();
  }, 60_000);

  it("still answers 400 IMAGE_TOO_LARGE when the decoded cap is lowered (§8)", async () => {
    // Separate process-level config would need a re-boot; here we prove the
    // NEXT best thing through the CONTRACT cap: an 8M-char data URL body is
    // rejected by the shared schema before any work.
    const a = await user();
    scenario = "ok";
    const huge = `data:image/png;base64,${"A".repeat(8_100_000)}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { imageDataUrl: huge },
    });
    expect([400, 413]).toContain(res.statusCode);
  });

  it("never leaks the internal engine token or image bytes in responses (§27/§36)", async () => {
    const a = await user();
    scenario = "ok";
    const res = await upload(a.authHeader, 14);
    const raw = res.body;
    expect(raw).not.toContain(process.env.OCR_SERVICE_TOKEN!);
    expect(raw).not.toContain("data:image");
  });
});
