/**
 * e2e — ops phase (engine quality §3.2/§4.1/§4.2): OCR-quality analytics,
 * storage indicator, retention purge, SSE progress stream — against the
 * REAL AppModule, the REAL database and the DETERMINISTIC mock engine.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { ocrRecognitionResponseSchema } from "../../src/shared/contracts";
import { makeHappyPathPng, pngDataUrl } from "../helpers/ocr-fixtures";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { OcrRetentionService } from "../../src/modules/ocr/ocr-retention.service";

let app: NestFastifyApplication;
let mail: MailCapture;
let prisma: PrismaService;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

interface UserCtx {
  userId: string;
  authHeader: Record<string, string>;
}

async function user(): Promise<UserCtx> {
  const ctx = await authenticatedUser(app, mail);
  return { userId: ctx.userId, authHeader: ctx.authHeader };
}

async function upload(authHeader: Record<string, string>) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { imageDataUrl: pngDataUrl(makeHappyPathPng()), requestedProfile: "TRADE_SUMMARY" },
  });
  return { status: res.statusCode, body: ocrRecognitionResponseSchema.parse(res.json()) };
}

// ── Analytics (§3.2) ─────────────────────────────────────────────────────────

describe("GET /ocr/analytics", () => {
  it("is 401 without credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ocr/analytics" });
    expect(res.statusCode).toBe(401);
  });

  it("answers a coherent funnel for a user with traffic", async () => {
    const a = await user();
    await upload(a.authHeader);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/analytics?days=30",
      headers: a.authHeader,
    });
    if (res.statusCode !== 200) {
      throw new Error(`analytics failed ${res.statusCode}: ${res.body.slice(0, 400)}`);
    }
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.windowDays).toBe(30);
    expect(body.funnel.uploads).toBeGreaterThanOrEqual(1);
    // The deterministic mock engine lands in REVIEW_REQUIRED → completed.
    expect(body.funnel.completed).toBeGreaterThanOrEqual(1);
    expect(body.funnel.reviewRequired).toBeGreaterThanOrEqual(1);
    expect(body.funnel.importedTrades).toBe(0); // nothing confirmed for this user yet
    expect(Array.isArray(body.correctionsByField)).toBe(true);
  });

  it("rejects an out-of-range window with 400", async () => {
    const a = await user();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/analytics?days=9999",
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Storage (§4.2) ───────────────────────────────────────────────────────────

describe("GET /ocr/storage", () => {
  it("is 401 without credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ocr/storage" });
    expect(res.statusCode).toBe(401);
  });

  it("reports usage and retention for a user with a stored screenshot", async () => {
    const a = await user();
    await upload(a.authHeader);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/storage",
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.assetCount).toBeGreaterThanOrEqual(1);
    expect(body.retainedAssetCount).toBeGreaterThanOrEqual(1);
    expect(body.usedBytes).toBeGreaterThan(0);
    expect(body.purgedAssetCount).toBe(0);
    expect(body.retentionDays).toBeGreaterThanOrEqual(0);
    expect(body.oldestRetainedAssetAt).not.toBeNull();
  });
});

// ── Retention purge (§4.2) ──────────────────────────────────────────────────

describe("screenshot retention", () => {
  it("purges the binary of an aged CONFIRMED recognition and the image 404s", async () => {
    const a = await user();
    const created = await upload(a.authHeader);
    const recognition = created.body.recognition;

    // Confirm the recognition (memory row — the purger only touches
    // CONFIRMED/FAILED after the hard window, REVIEW_REQUIRED after 2×).
    await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: { symbol: "XAUUSD" } },
    });

    // Backdate the row beyond the retention window (default 30 days).
    const aged = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.ocrRecognition.update({
      where: { id: recognition.id },
      data: { createdAt: aged, updatedAt: aged, confirmedAt: aged },
    });

    const retention = app.get(OcrRetentionService);
    const outcome = await retention.purgeExpired();
    expect(outcome.purged).toBeGreaterThanOrEqual(1);

    // The metadata row survives; the asset reports purged; the bytes 404.
    const reloaded = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${recognition.id}`,
      headers: a.authHeader,
    });
    expect(reloaded.statusCode).toBe(200);
    expect(ocrRecognitionResponseSchema.parse(reloaded.json()).recognition.asset.purged).toBe(true);

    const image = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${recognition.id}/image`,
      headers: a.authHeader,
    });
    expect(image.statusCode).toBe(404);

    // Idempotent: a second pass purges nothing more.
    const second = await retention.purgeExpired();
    expect(second.purged).toBe(0);
  });
});

// ── SSE progress (§4.1) ─────────────────────────────────────────────────────

describe("GET /ocr/recognitions/:id/events (SSE)", () => {
  it("is 401 without credentials", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/events",
    });
    expect(res.statusCode).toBe(401);
  });

  it("streams the status and closes on a settled job", async () => {
    const a = await user();
    const created = await upload(a.authHeader);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/events`,
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    // The mock pipeline settles synchronously — the stream carries the
    // current status event and closes (bounded window, no hang).
    expect(res.body).toContain("event: status");
    expect(res.body).toContain("REVIEW_REQUIRED");
  });

  it("emits gone for a foreign or deleted recognition (§39)", async () => {
    const a = await user();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000009999/events",
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("event: gone");
  });
});
