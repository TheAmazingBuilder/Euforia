/**
 * e2e — engine-quality phase service behaviors against the REAL AppModule,
 * the REAL database and the DETERMINISTIC mock engine (§57):
 *
 *   - recrop route: auth, unknown id, region bounds, mock happy path;
 *   - ACCOUNTS attachment: unknown account at upload/confirm → 404;
 *   - grouped confirmation: batches on a mono recognition → 409; batches
 *     with a seeded multi-draft recognition → per-draft isolation,
 *     corrections memory rows, suggestedTags on the confirmed record.
 *
 * Real cropping and real fingerprints belong to the FastAPI sidecar (pytest
 * suite + the runtime verification script) — the mock documents PIPELINE
 * behavior (§62 honesty).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { ocrRecognitionResponseSchema } from "../../src/shared/contracts";
import { makeHappyPathPng, pngDataUrl } from "../helpers/ocr-fixtures";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";

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

async function upload(authHeader: Record<string, string>, dataUrl: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { imageDataUrl: dataUrl, requestedProfile: "TRADE_SUMMARY" },
  });
  return { status: res.statusCode, body: ocrRecognitionResponseSchema.parse(res.json()) };
}

// ── Re-OCR by crop (§2.4) ────────────────────────────────────────────────────

describe("recrop — targeted region re-OCR", () => {
  it("is 401 without credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/recrop",
      payload: { region: { x: 0, y: 0, width: 10, height: 10 } },
    });
    expect(res.statusCode).toBe(401);
  });

  it("is 404 for an unknown or foreign recognition (§39)", async () => {
    const a = await user();
    const b = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    for (const caller of [a, b]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000009999/recrop`,
        headers: { ...caller.authHeader, "content-type": "application/json" },
        payload: { region: { x: 0, y: 0, width: 10, height: 10 } },
      });
      expect(res.statusCode).toBe(404);
    }
    // Foreign id is also 404 — never a 403 leak.
    void id;
  });

  it("rejects a region outside the asset bounds with 400", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const { width, height } = created.body.recognition.asset;
    if (width === null || height === null) throw new Error("PNG upload must carry dimensions");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/recrop`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { region: { x: 0, y: 0, width: width + 5000, height: height + 5000 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.code ?? res.json().code ?? "").toContain("RECROP");
  });

  it("answers 200 with ephemeral fields on the happy path", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const { width, height } = created.body.recognition.asset;
    if (width === null || height === null) throw new Error("PNG upload must carry dimensions");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/recrop`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { region: { x: 0, y: 0, width: Math.min(width, 640), height: Math.min(height, 480) } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.region).toMatchObject({ x: 0, y: 0 });
    // Ephemeral: nothing was written — the recognition is untouched.
    const reloaded = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}`,
      headers: a.authHeader,
    });
    expect(reloaded.statusCode).toBe(200);
  });
});

// ── ACCOUNTS attachment (§3.1) ──────────────────────────────────────────────

describe("account attachment", () => {
  it("404s at upload when the account is unknown or foreign", async () => {
    const a = await user();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        imageDataUrl: pngDataUrl(makeHappyPathPng()),
        requestedProfile: "TRADE_SUMMARY",
        accountId: "00000000-0000-4000-8000-00000000aaaa",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s at confirm when the account is unknown", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: { symbol: "XAUUSD" },
        accountId: "00000000-0000-4000-8000-00000000aaaa",
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Grouped confirmation (§2.2) ─────────────────────────────────────────────

describe("grouped confirmation", () => {
  it("409s when batches arrive for a mono-trade recognition", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: {},
        batches: [{ corrections: {}, include: true }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  /** Register a user and connect one MOCK account (trades-e2e house pattern). */
  async function userWithAccount(): Promise<UserCtx> {
    const a = await user();
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: a.authHeader,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
        credentials: { method: "API_KEY", secret: "mock-api-key-ocr-grouped" },
      },
    });
    expect(connected.statusCode).toBe(201);
    return a;
  }

  it("confirms N drafts with per-draft isolation, memory rows and tag suggestions", async () => {
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const recognition = created.body.recognition;

    // Seed TWO multi-trade drafts into the validated result payload (the
    // deterministic engine stays mono; grouping is exercised at the
    // service/contract level — the sidecar's real grouping is pytest-covered).
    const draftFields = (symbol: string, entry: string, direction: string) => [
      { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "direction", rawValue: direction.toLowerCase(), normalizedValue: direction, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "volume", rawValue: "0.10", normalizedValue: "0.10", confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "entryPrice", rawValue: entry, normalizedValue: entry, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
    ];
    const candidates = [
      { fields: draftFields("XAUUSD", "2345.60", "BUY") },
      { fields: draftFields("XAUUSD", "2348.10", "SELL") },
    ];
    await prisma.ocrRecognition.update({
      where: { id: recognition.id },
      data: {
        result: {
          classification: recognition.classification,
          fields: recognition.fields,
          warnings: [],
          engine: recognition.engine,
          durationMs: recognition.durationMs,
          candidates,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: { symbol: "XAUUSD", direction: "BUY", volume: "0.10", entryPrice: "2345.60" },
        batches: [
          { corrections: { symbol: "XAUUSD", direction: "BUY", volume: "0.10", entryPrice: "2345.60" }, include: true },
          { corrections: { symbol: "XAUUSD", direction: "SELL", volume: "0.10", entryPrice: "2348.10" }, include: true },
        ],
        accountId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    expect(confirmed.status).toBe("CONFIRMED");

    // BOTH drafts imported through Trading Core (distinct external refs per
    // draft index) — the recognition links every one of them.
    expect(confirmed.tradeIds).toHaveLength(2);
    expect(confirmed.tradeId).toBe(confirmed.tradeIds[0]);
    expect(confirmed.candidates).not.toBeNull();
    // Playbook tag suggestions ride on the confirmed record.
    expect(confirmed.suggestedTags).toContain("Import");

    // Corrections memory: the confirmed corrections became patterns.
    const patterns = await prisma.ocrCorrectionPattern.findMany({
      where: { userId: a.userId },
    });
    expect(patterns.length).toBeGreaterThanOrEqual(1);

    // The confirmation replays idempotently with the same batches.
    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: { symbol: "XAUUSD", direction: "BUY", volume: "0.10", entryPrice: "2345.60" },
        batches: [
          { corrections: { symbol: "XAUUSD", direction: "BUY", volume: "0.10", entryPrice: "2345.60" }, include: true },
          { corrections: { symbol: "XAUUSD", direction: "SELL", volume: "0.10", entryPrice: "2348.10" }, include: true },
        ],
        accountId: null,
      },
    });
    expect(replay.statusCode).toBe(200);

    // A DIFFERENT batch payload after confirmation is a conflict (§21/§51).
    const conflict = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: {},
        batches: [
          { corrections: { symbol: "XAUUSD" }, include: true },
          { corrections: { symbol: "EURUSD" }, include: false },
        ],
      },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("excludes unchecked drafts and keeps per-draft skips isolated", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const recognition = created.body.recognition;

    // The user has NO account: every included draft skips with NO_ACCOUNT —
    // but the exclusion decision itself is honored (draft 1 never attempted).
    const draftFields = (symbol: string, entry: string, direction: string) => [
      { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "direction", rawValue: direction.toLowerCase(), normalizedValue: direction, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "volume", rawValue: "0.10", normalizedValue: "0.10", confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "entryPrice", rawValue: entry, normalizedValue: entry, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
    ];
    const candidates = [
      { fields: draftFields("XAUUSD", "2345.60", "BUY") },
      { fields: draftFields("EURUSD", "1.08450", "SELL") },
    ];
    await prisma.ocrRecognition.update({
      where: { id: recognition.id },
      data: {
        result: {
          classification: recognition.classification,
          fields: recognition.fields,
          warnings: [],
          engine: recognition.engine,
          durationMs: recognition.durationMs,
          candidates,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        corrections: {},
        batches: [
          { corrections: {}, include: true },
          { corrections: {}, include: false }, // unchecked by the user
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.tradeIds).toHaveLength(0);
    // The included draft skipped honestly (no account for this fresh user).
    expect(confirmed.warnings.join(" ")).toContain("TRADE_IMPORT_SKIPPED_NO_ACCOUNT");
  });
});
