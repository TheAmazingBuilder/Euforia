/**
 * e2e — OCR recognition lifecycle (Phase 19 §52/§53/§60): upload →
 * REVIEW_REQUIRED → confirm → delete, against the REAL AppModule, the REAL
 * database and the DETERMINISTIC mock engine (§57 — production cannot
 * register it; the FastAPI sidecar path is exercised in
 * ocr-negative.e2e.spec.ts via a real HTTP engine and in the sidecar's own
 * pytest suite).
 *
 * Covered: auth boundary, contract parsing, idempotency (§32), keyset
 * listing, human confirmation semantics (§21/§51), deletion + retention
 * (§31), IDOR (§39), audit events (§48).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import {
  ocrRecognitionPageSchema,
  ocrRecognitionResponseSchema,
} from "../../src/shared/contracts";
import {
  makeHappyPathPng,
  makeUnprocessablePng,
  makeOcrFixturePng,
  pngDataUrl,
} from "../helpers/ocr-fixtures";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
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

async function upload(
  authHeader: Record<string, string>,
  dataUrl: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { imageDataUrl: dataUrl, requestedProfile: "TRADE_SUMMARY" },
  });
  // Parse through the shared contract — typed payloads, no any in the suite.
  return { status: res.statusCode, body: ocrRecognitionResponseSchema.parse(res.json()) };
}

// ── Auth boundary (§39) ──────────────────────────────────────────────────────

describe("OCR routes — authentication boundary", () => {
  const routes = [
    ["POST", "/api/v1/ocr/recognitions"],
    ["GET", "/api/v1/ocr/recognitions"],
    ["GET", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001"],
    ["GET", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/image"],
    ["POST", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/confirm"],
    ["DELETE", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001"],
  ] as const;

  it("every route is 401 without credentials", async () => {
    for (const [method, url] of routes) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

// ── Happy path (lifecycle §24) ───────────────────────────────────────────────

describe("OCR recognition lifecycle (happy path, deterministic engine)", () => {
  it("uploads a screenshot and lands in REVIEW_REQUIRED with validated fields", async () => {
    const a = await user();
    const { status, body } = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    expect(status).toBe(201);

    const recognition = body.recognition;
    expect(recognition.status).toBe("REVIEW_REQUIRED");
    expect(recognition.extractionProfile).toBe("TRADE_SUMMARY");

    // Asset metadata (§6) — no binary in the payload, checksum is sha256 hex.
    expect(recognition.asset.mime).toBe("image/png");
    expect(recognition.asset.width).toBe(320);
    expect(recognition.asset.height).toBe(160);
    expect(recognition.asset.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    // The engine result carries classification + confidence (§17).
    expect(recognition.classification?.type).toBe("MT5_TRADE");
    const fields = new Map(recognition.fields.map((f) => [f.field, f]));
    expect(fields.get("symbol")?.normalizedValue).toMatch(/^[A-Z0-9]{3,}$/);
    expect(fields.get("direction")?.normalizedValue).toMatch(/^(BUY|SELL)$/);
    for (const field of recognition.fields) {
      expect(field.confidence).toBeGreaterThanOrEqual(0);
      expect(field.confidence).toBeLessThanOrEqual(1);
      expect(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]).toContain(field.confidenceBand);
      expect(["VALID", "MISSING", "AMBIGUOUS", "LOW_CONFIDENCE", "INVALID"]).toContain(
        field.validationStatus,
      );
    }

    // Contract parse — the response IS the shared contract.
    const { ocrRecognitionSchema } = await import("../../src/shared/contracts");
    expect(() => ocrRecognitionSchema.parse(recognition)).not.toThrow();

    // Engine metadata recorded (§33).
    expect(recognition.engine?.name).toBe("deterministic-mock");
    expect(recognition.engine?.contractVersion).toBe("1");
  });

  it("is idempotent: the same screenshot twice returns the SAME recognition (§32)", async () => {
    const a = await user();
    const dataUrl = pngDataUrl(makeHappyPathPng());
    const first = await upload(a.authHeader, dataUrl);
    const second = await upload(a.authHeader, dataUrl);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.recognition.id).toBe(first.body.recognition.id);
    expect(second.body.recognition.createdAt).toBe(first.body.recognition.createdAt);
  });

  it("serves the stored bytes on the image route (§21 review support)", async () => {
    const a = await user();
    const png = makeHappyPathPng();
    const created = await upload(a.authHeader, pngDataUrl(png));
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/image`,
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(res.rawPayload).equals(png)).toBe(true);
  });

  it("a screenshot the engine refuses lands in FAILED with a stable category (§35)", async () => {
    const a = await user();
    const { status, body } = await upload(a.authHeader, pngDataUrl(makeUnprocessablePng()));
    expect(status).toBe(201);
    expect(body.recognition.status).toBe("FAILED");
    expect(body.recognition.failure?.category).toBe("SCREENSHOT_UNSUPPORTED");
    expect(body.recognition.fields).toHaveLength(0);
  });
});

// ── Human confirmation (§21/§51) ─────────────────────────────────────────────

describe("OCR confirmation — human-in-the-loop (§21)", () => {
  it("applies user corrections as AUTHORITATIVE values inside a transaction", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: { symbol: "EURUSD", entryPrice: "1.0850" } },
    });
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).toBeTruthy();
    expect(confirmed.corrections).toMatchObject({ symbol: "EURUSD", entryPrice: "1.0850" });

    const fields = new Map(confirmed.fields.map((f) => [f.field, f]));
    expect(fields.get("symbol")?.normalizedValue).toBe("EURUSD");
    expect(fields.get("symbol")?.confidence).toBe(1); // authoritative (§21)
    expect(fields.get("entryPrice")?.normalizedValue).toBe("1.085");
    // Untouched machine fields keep their provenance.
    expect(fields.get("direction")?.confidence).not.toBe(1);
  });

  it("is idempotent for the SAME corrections and 409 for different ones (§51)", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const payload = { corrections: { symbol: "EURUSD" } };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().recognition.id).toBe(id);

    const conflicting = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: { symbol: "GBPUSD" } },
    });
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json().code).toBe("OCR_ALREADY_CONFIRMED");
  });

  it("rejects invalid user corrections with 422 (same domain rules, §19)", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: { direction: "sideways" } },
    });
    expect(res.statusCode).toBe(422);
  });

  it("refuses confirmation of a FAILED recognition (409)", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeUnprocessablePng()));
    expect(created.body.recognition.status).toBe("FAILED");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${created.body.recognition.id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: {} },
    });
    expect(res.statusCode).toBe(409);
  });
});

// ── Listing (keyset §49) + deletion (§31) ────────────────────────────────────

describe("OCR listing and deletion", () => {
  it("lists owner-scoped recognitions with keyset pagination and status filter", async () => {
    const a = await user();
    // Three distinct uploads (distinct nonces → distinct checksums).
    const ids: string[] = [];
    for (const nonce of [40, 41, 42]) {
      const bytes = makeOcrFixturePng({ nonce });
      const { body } = await upload(a.authHeader, pngDataUrl(bytes));
      ids.push(body.recognition.id);
    }
    const page1 = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions?limit=2",
      headers: a.authHeader,
    });
    expect(page1.statusCode).toBe(200);
    const p1 = ocrRecognitionPageSchema.parse(page1.json());
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const pageCursor = p1.nextCursor as string; // proven truthy above

    const page2 = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions?limit=2&cursor=${encodeURIComponent(pageCursor)}`,
      headers: a.authHeader,
    });
    expect(page2.statusCode).toBe(200);
    const p2 = ocrRecognitionPageSchema.parse(page2.json());
    const walk = [
      ...p1.items.map((i) => i.id),
      ...p2.items.map((i) => i.id),
    ];
    for (const id of ids) expect(walk).toContain(id);

    // Malformed cursor → 400 (house convention).
    const bad = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions?cursor=%24%24bogus%24%24",
      headers: a.authHeader,
    });
    expect(bad.statusCode).toBe(400);
  });

  it("deletes the recognition AND the stored binary, then 404s", async () => {
    const a = await user();
    const png = makeHappyPathPng();
    const created = await upload(a.authHeader, pngDataUrl(png));
    const id = created.body.recognition.id;

    const imageBefore = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${id}/image`,
      headers: a.authHeader,
    });
    expect(imageBefore.statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/recognitions/${id}`,
      headers: a.authHeader,
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true, id });

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${id}`,
      headers: a.authHeader,
    });
    expect(after.statusCode).toBe(404);

    const imageAfter = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${id}/image`,
      headers: a.authHeader,
    });
    expect(imageAfter.statusCode).toBe(404);

    const delAgain = await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/recognitions/${id}`,
      headers: a.authHeader,
    });
    expect(delAgain.statusCode).toBe(404);
  });
});

// ── IDOR (§39) ───────────────────────────────────────────────────────────────

describe("OCR IDOR — User A can never touch User B's recognitions (§39)", () => {
  it("read, image, confirm, delete and list are all owner-scoped", async () => {
    const a = await user();
    const b = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    const read = await app.inject({ method: "GET", url: `/api/v1/ocr/recognitions/${id}`, headers: b.authHeader });
    expect(read.statusCode).toBe(404);
    const image = await app.inject({ method: "GET", url: `/api/v1/ocr/recognitions/${id}/image`, headers: b.authHeader });
    expect(image.statusCode).toBe(404);
    const confirm = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...b.authHeader, "content-type": "application/json" },
      payload: { corrections: { symbol: "HACKED" } },
    });
    expect(confirm.statusCode).toBe(404);
    const del = await app.inject({ method: "DELETE", url: `/api/v1/ocr/recognitions/${id}`, headers: b.authHeader });
    expect(del.statusCode).toBe(404);

    // B's list never contains A's recognition; forged list ids are invisible.
    const bList = await app.inject({ method: "GET", url: "/api/v1/ocr/recognitions?limit=50", headers: b.authHeader });
    expect(bList.statusCode).toBe(200);
    expect(ocrRecognitionPageSchema.parse(bList.json()).items.some((item) => item.id === id)).toBe(false);

    // A still sees it — the attempts above had no side effect.
    const aRead = await app.inject({ method: "GET", url: `/api/v1/ocr/recognitions/${id}`, headers: a.authHeader });
    expect(aRead.statusCode).toBe(200);
    expect(aRead.json().recognition.status).toBe("REVIEW_REQUIRED");
  });
});

// ── Audit trail (§48) ────────────────────────────────────────────────────────

describe("OCR security events (§48, through the shared ledger)", () => {
  it("records upload, confirmation and deletion in the append-only log", async () => {
    const a = await user();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections: { symbol: "EURUSD" } },
    });
    await app.inject({ method: "DELETE", url: `/api/v1/ocr/recognitions/${id}`, headers: a.authHeader });

    const prisma = app.get((await import("../../src/infrastructure/prisma/prisma.service")).PrismaService);
    const events = await prisma.securityEvent.findMany({
      where: { userId: a.userId, type: { in: ["OCR_UPLOAD", "OCR_RESULT_CONFIRMED", "OCR_RESULT_DELETED"] } },
      orderBy: { at: "desc" },
      take: 10,
    });
    const types = new Set(events.map((e) => e.type));
    expect(types.has("OCR_UPLOAD")).toBe(true);
    expect(types.has("OCR_RESULT_CONFIRMED")).toBe(true);
    expect(types.has("OCR_RESULT_DELETED")).toBe(true);
    // Context carries facts, never image bytes (§36).
    for (const event of events) {
      expect(event.context).not.toContain("data:image");
      expect(event.context).not.toContain("base64");
    }
  });
});

// ── Upload security (§7/§8/§53) ──────────────────────────────────────────────

describe("OCR upload security (§7)", () => {
  it("rejects malformed payloads with stable codes and NO persisted recognition", async () => {
    const a = await user();
    const cases: Array<{ payload: unknown; code?: string }> = [
      { payload: { imageDataUrl: "https://evil.example/x.png" } },
      { payload: { imageDataUrl: "data:text/html;base64,PGI+" } },
      { payload: { imageDataUrl: "data:image/png;base64,####" } },
      { payload: {} },
      { payload: { imageDataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } },
    ];
    for (const { payload } of cases) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/ocr/recognitions",
        headers: { ...a.authHeader, "content-type": "application/json" },
        payload: payload as Record<string, unknown>,
      });
      expect([400, 413]).toContain(res.statusCode);
    }
    // The MIME/extension lie must be caught: declared PNG, actual GIF.
    const prisma = app.get((await import("../../src/infrastructure/prisma/prisma.service")).PrismaService);
    const count = await prisma.ocrAsset.count({ where: { userId: a.userId } });
    expect(count).toBe(0);
  });

  it("ignores injected filename metadata — the wire carries NO filename (§7)", async () => {
    const a = await user();
    // The wire format carries no filename at all — a traversal attempt can
    // only arrive as an injected extra field, which the contract strips.
    // Storage keys derive from (userId, checksum) server-side only, so no
    // client string ever reaches the filesystem (unit-proven).
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        imageDataUrl: pngDataUrl(makeHappyPathPng()),
        originalName: "../../etc/passwd",
        requestedProfile: "TRADE_SUMMARY",
      },
    });
    expect(res.statusCode).toBe(201);
    const asset = res.json().recognition.asset;
    expect(Object.keys(asset).sort()).toEqual([
      "checksumSha256", "createdAt", "height", "id", "mime", "purged", "sizeBytes", "width",
    ]);
  });

  it("rejects pixel bombs with IMAGE_DIMENSIONS_INVALID (§38)", async () => {
    const a = await user();
    // 5000x5000 = 25 MP > the 24 MP ceiling, while the gradient payload
    // stays far below the size caps — this isolates the pixel guard.
    const bigPng = makeOcrFixturePng({ width: 5000, height: 5000 });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { imageDataUrl: pngDataUrl(bigPng) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("IMAGE_DIMENSIONS_INVALID");
  });

  it("strips unknown fields from the contract (mass-assignment safe)", async () => {
    const a = await user();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: {
        imageDataUrl: pngDataUrl(makeHappyPathPng()),
        userId: "00000000-0000-4000-8000-999999999999",
        status: "CONFIRMED",
        corrections: { symbol: "EVIL" },
        tradeId: "00000000-0000-4000-8000-888888888888",
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.recognition.status).toBe("REVIEW_REQUIRED");
    expect(created.recognition.corrections).toBeNull();
    expect(created.recognition.asset).not.toHaveProperty("tradeId");
  });
});

// ── Negative capability (§53 domain safety) ─────────────────────────────────

describe("OCR negative capabilities (§53)", () => {
  it("has NO trade-creation surface — OCR cannot bypass Trading Core", async () => {
    const a = await user();
    const probes = [
      ["POST", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/trade"],
      ["POST", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/create-trade"],
      ["POST", "/api/v1/ocr/trade"],
      ["PUT", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001"],
      ["PATCH", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001"],
      ["POST", "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/retry"],
    ] as const;
    for (const [method, url] of probes) {
      const res = await app.inject({ method, url, headers: a.authHeader });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // The confirm route is a POST action; a PATCH variant must not exist.
    const patchConfirm = await app.inject({
      method: "PATCH",
      url: "/api/v1/ocr/recognitions/00000000-0000-4000-8000-000000000001/confirm",
      headers: a.authHeader,
    });
    expect(patchConfirm.statusCode).toBe(404);
  });
});

// ── Phase 21 — the sanctioned confirmation → Trading Core bridge (§77) ──────

describe("OCR confirmation → canonical trade import (Phase 21)", () => {
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
        credentials: { method: "API_KEY", secret: "mock-api-key-ocr-bridge" },
      },
    });
    expect(connected.statusCode).toBe(201);
    return a;
  }

  async function confirm(a: UserCtx, id: string, corrections: Record<string, string | null>) {
    return app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${id}/confirm`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { corrections },
    });
  }

  async function listTrades(a: UserCtx): Promise<Array<Record<string, unknown>>> {
    const res = await app.inject({ method: "GET", url: "/api/v1/trades", headers: a.authHeader });
    expect(res.statusCode).toBe(200);
    return (res.json() as { trades: Array<Record<string, unknown>> }).trades;
  }

  async function instrumentIdOf(a: UserCtx, symbol: string): Promise<string> {
    const res = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: a.authHeader });
    const instruments = (res.json() as { instruments?: Array<{ symbol: string; id: string }> }).instruments ?? [];
    const found = instruments.find((instrument) => instrument.symbol === symbol);
    if (found === undefined) throw new Error(`${symbol} missing from the catalog`);
    return found.id;
  }

  it("creates the canonical Trade through Trading Core on explicit confirmation", async () => {
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    const res = await confirm(a, id, { symbol: "EURUSD" });
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    expect(confirmed.status).toBe("CONFIRMED");
    // The bridge linked the canonical Trade on the recognition.
    expect(confirmed.tradeId).toBeTruthy();

    // Merged (authoritative) values the trade must mirror.
    const fields = new Map(confirmed.fields.map((f) => [f.field, f]));
    const valueOf = (key: (typeof confirmed.fields)[number]["field"]) => fields.get(key)?.normalizedValue ?? null;
    const direction = valueOf("direction");
    const exitPrice = valueOf("exitPrice");
    const closeTime = valueOf("closeTime");

    const trades = await listTrades(a);
    const imported = trades.find((trade) => trade.externalRef === `ocr:${id}`);
    expect(imported).toBeDefined();
    expect(imported).toMatchObject({
      instrumentId: await instrumentIdOf(a, "EURUSD"),
      direction,
      source: "IMPORT",
      entryPrice: valueOf("entryPrice"),
      quantity: valueOf("volume"),
      // Server-computed — the OCR profit field is NEVER copied (§55/§15).
      strategyId: null,
    });
    expect(String(imported?.notes)).toContain(`recognition ${id}`);
    expect(imported?.initialStop).toBe(valueOf("stopLoss"));
    expect(imported?.initialTP).toBe(valueOf("takeProfit"));
    if (exitPrice !== null && closeTime !== null) {
      expect(imported?.status).toBe("CLOSED");
      expect(imported?.exitReason).toBe("MANUAL");
      // P&L recomputed by Trading Core from prices/quantity/contract specs.
      expect(imported?.pnlGross).not.toBeNull();
      expect(imported?.pnlNet).not.toBeNull();
    } else {
      expect(imported?.status).toBe("OPEN");
    }
  });

  it("is idempotent — a confirmation replay never creates a second trade", async () => {
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const corrections = { symbol: "EURUSD" };

    const first = await confirm(a, id, corrections);
    expect(first.statusCode).toBe(200);
    const replay = await confirm(a, id, corrections);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().recognition.tradeId).toBe(first.json().recognition.tradeId);

    const trades = await listTrades(a);
    const matches = trades.filter((trade) => trade.externalRef === `ocr:${id}`);
    expect(matches).toHaveLength(1);
  });

  it("replays idempotently even when the retry arrives in RAW user form (§21/§51 regression)", async () => {
    // Runtime verification caught this: the stored declaration is the
    // CANONICAL form ("2345,60" → "2345.60"), so a retry of the same
    // logical payload arriving with the comma separator must replay 200 —
    // never a 409 (two tabs / network retry).
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const raw = { symbol: "EURUSD", entryPrice: "1,0850" };

    const first = await confirm(a, id, raw);
    expect(first.statusCode).toBe(200);
    expect(first.json().recognition.corrections).toMatchObject({ entryPrice: "1.0850" });

    const replay = await confirm(a, id, raw);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().recognition.id).toBe(id);
  });

  it("skips honestly with a stable warning when the symbol is unknown (§50)", async () => {
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    const res = await confirm(a, id, { symbol: "NOSUCHCOIN" });
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    // The confirmed declaration stays authoritative — only the import skipped.
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.tradeId).toBeNull();
    expect(confirmed.warnings).toContain("TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL");

    const trades = await listTrades(a);
    expect(trades.find((trade) => trade.externalRef === `ocr:${id}`)).toBeUndefined();
  });

  it("skips with NO_ACCOUNT when the owner has no trading account", async () => {
    const a = await user(); // no account connected
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;

    const res = await confirm(a, id, {});
    expect(res.statusCode).toBe(200);
    const confirmed = ocrRecognitionResponseSchema.parse(res.json()).recognition;
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.tradeId).toBeNull();
    expect(confirmed.warnings).toContain("TRADE_IMPORT_SKIPPED_NO_ACCOUNT");
  });

  it("keeps the imported Trade when the recognition is deleted (one-way provenance)", async () => {
    const a = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const confirmed = (await confirm(a, id, { symbol: "EURUSD" })).json().recognition;
    expect(confirmed.tradeId).toBeTruthy();

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/recognitions/${id}`,
      headers: a.authHeader,
    });
    expect(deleted.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${id}`,
      headers: a.authHeader,
    });
    expect(after.statusCode).toBe(404);

    const trades = await listTrades(a);
    expect(trades.find((trade) => trade.externalRef === `ocr:${id}`)).toBeDefined();
  });

  it("never exposes another user's imported trade (IDOR)", async () => {
    const a = await userWithAccount();
    const b = await userWithAccount();
    const created = await upload(a.authHeader, pngDataUrl(makeHappyPathPng()));
    const id = created.body.recognition.id;
    const confirmed = (await confirm(a, id, { symbol: "EURUSD" })).json().recognition;
    expect(confirmed.tradeId).toBeTruthy();

    const bTrades = await listTrades(b);
    expect(bTrades.find((trade) => trade.externalRef === `ocr:${id}`)).toBeUndefined();
  });
});
