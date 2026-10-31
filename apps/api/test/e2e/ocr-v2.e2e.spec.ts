/**
 * e2e - OCR V2 decision layer (V2 spec §4/§15/§16/§23/§58): structured
 * issues + quality score + timeline on the DTO, content-based trade
 * duplicate detection (different screenshot, same trade), and the explicit
 * duplicate acknowledgments that gate confirmation (V2 §58 - the user
 * decides, never a silent double import, never a silent discard).
 *
 * Real AppModule + real DB + the deterministic mock engine (same discipline
 * as ocr.e2e.spec.ts; the FastAPI path is covered by ocr-negative + pytest).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { ocrRecognitionResponseSchema } from "../../src/shared/contracts";
import { makeOcrFixturePng, pngDataUrl, fixtureChecksum } from "../helpers/ocr-fixtures";
import { fnv1a32 } from "../../src/modules/ocr/ocr.logic";

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
  expect(res.statusCode).toBe(201);
  return ocrRecognitionResponseSchema.parse(res.json()).recognition;
}

async function confirm(a: UserCtx, id: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/v1/ocr/recognitions/${id}/confirm`,
    headers: { ...a.authHeader, "content-type": "application/json" },
    payload: { corrections: {}, ...payload },
  });
}

// ── V2 §15/§16/§23 - DTO derivations ─────────────────────────────────────────

describe("recognition DTO - issues, quality score, timeline", () => {
  it("surfaces quality score, issues and a real timeline for a clean recognition", async () => {
    const a = await user();
    const recognition = await upload(a.authHeader, pngDataUrl(makeOcrFixturePng({ nonce: 21 })));

    expect(recognition.qualityScore).not.toBeNull();
    expect(recognition.qualityScore!.score).toBeGreaterThan(0);
    expect(recognition.qualityScore!.components).toEqual({
      fieldConfidence: expect.any(Number),
      completeness: expect.any(Number),
      validation: expect.any(Number),
      consistency: expect.any(Number),
    });

    // The deterministic engine emits coherent values - none of the domain
    // validation issues may fire on its output.
    const codes = recognition.issues.map((issue) => issue.code);
    expect(codes).not.toContain("INVALID_PRICE_RELATIONSHIP");
    expect(codes).not.toContain("INVALID_TIMESTAMP");
    expect(codes).not.toContain("UNKNOWN_PLATFORM");
    expect(codes).not.toContain("MISSING_REQUIRED_FIELD");
    expect(codes).not.toContain("POSSIBLE_DUPLICATE");
    expect(codes).not.toContain("POSSIBLE_TRADE_DUPLICATE");

    // UNKNOWN_SYMBOL mirrors the REAL catalog: the issue fires exactly when
    // the recognized symbol is not in the instruments list (V2 §16 - the
    // derivation is honest about what the catalog resolves).
    const symbol = recognition.fields.find((f) => f.field === "symbol")?.normalizedValue;
    expect(symbol).toBeTruthy();
    const instrumentsRes = await app.inject({
      method: "GET",
      url: "/api/v1/instruments",
      headers: a.authHeader,
    });
    const instruments = instrumentsRes.json() as { instruments: Array<{ symbol: string }> };
    const known = instruments.instruments.some((i) => i.symbol === symbol);
    expect(codes.includes("UNKNOWN_SYMBOL")).toBe(!known);

    // Timeline: recognized wall-clock stamps first, then the upload instant.
    const kinds = recognition.timeline.map((entry) => entry.kind);
    expect(kinds).toContain("OPEN_TIME");
    expect(kinds).toContain("UPLOADED");
    const open = recognition.timeline.find((entry) => entry.kind === "OPEN_TIME");
    expect(open?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/); // wall clock, no tz suffix
  });
});

// ── V2 §4 - content-based trade duplicate detection ─────────────────────────

describe("trade duplicate detection - different screenshot, same trade", () => {
  it("flags a recognition whose values match an existing trade", async () => {
    const a = await user();

    // 0. Pick a fixture nonce whose deterministic-engine symbol is actually
    // tradable (the seed - and therefore the symbol - is a pure function of
    // the checksum: same math as the engine, no brute-force uploads).
    const instrumentsRes = await app.inject({
      method: "GET",
      url: "/api/v1/instruments",
      headers: a.authHeader,
    });
    const catalog = (instrumentsRes.json() as { instruments: Array<{ symbol: string }> })
      .instruments.map((i) => i.symbol);
    const ENGINE_SYMBOLS = ["XAUUSD", "EURUSD", "BTCUSD", "GBPJPY", "US30"] as const;
    let nonce = 0;
    let symbol = "";
    for (; nonce < 500; nonce += 1) {
      const checksum = fixtureChecksum(makeOcrFixturePng({ nonce }));
      const seed = fnv1a32(`${checksum}|TRADE_SUMMARY`);
      const candidate = ENGINE_SYMBOLS[seed % ENGINE_SYMBOLS.length] ?? "XAUUSD";
      if (catalog.includes(candidate)) {
        symbol = candidate;
        break;
      }
    }
    expect(symbol).not.toBe("");

    // 1. Upload once to LEARN the deterministic engine's field values.
    const bytes = makeOcrFixturePng({ nonce });
    const first = await upload(a.authHeader, pngDataUrl(bytes));
    const recognizedSymbol = first.fields.find((f) => f.field === "symbol")?.normalizedValue;
    expect(recognizedSymbol).toBe(symbol); // the seed math is the engine's math
    const direction = first.fields.find((f) => f.field === "direction")?.normalizedValue;
    const entryPrice = first.fields.find((f) => f.field === "entryPrice")?.normalizedValue;
    const openTime = first.fields.find((f) => f.field === "openTime")?.normalizedValue;
    expect(symbol).toBeTruthy();
    expect(direction === "BUY" || direction === "SELL").toBe(true);
    expect(entryPrice).toBeTruthy();

    // 2. Remove the recognition (the asset goes with it - last ref).
    await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/recognitions/${first.id}`,
      headers: a.authHeader,
    });

    // 3. Create the "existing trade" through the canonical trades API with
    // the SAME core values (one MOCK account connected first - the trades
    // e2e house pattern; the account must exist before the trade). 
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: a.authHeader,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
        credentials: { method: "API_KEY", secret: "mock-api-key-ocr-v2" },
      },
    });
    expect(connected.statusCode).toBe(201);
    const accountId = (connected.json() as { account: { id: string } }).account.id;
    const instrumentsRes2 = await app.inject({
      method: "GET",
      url: "/api/v1/instruments",
      headers: a.authHeader,
    });
    const instruments2 = instrumentsRes2.json() as { instruments: Array<{ id: string; symbol: string }> };
    const instrument = instruments2.instruments.find((i) => i.symbol === symbol);
    expect(instrument).toBeDefined();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: a.authHeader,
      payload: {
        variant: "open",
        accountId,
        instrumentId: instrument!.id,
        direction,
        entryPrice,
        entryAt:
          openTime !== undefined && openTime !== null
            ? `${openTime}Z` // wall clock read as UTC - inside the ±48h window, §16
            : "2026-01-05T09:30:00.000Z",
        size: { mode: "quantity", quantity: "0.10" },
        outOfPlaybook: true,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const trade = createRes.json() as { id: string };

    // 4. Re-upload the SAME screenshot - a fresh recognition (the previous
    // row was deleted) whose values now collide with the live trade.
    const second = await upload(a.authHeader, pngDataUrl(bytes));
    expect(second.possibleTradeDuplicate).not.toBeNull();
    expect(second.possibleTradeDuplicate!.tradeId).toBe(trade.id);
    const matchedOn = second.possibleTradeDuplicate!.matchedOn;
    expect(matchedOn).toContain("SYMBOL");
    expect(matchedOn).toContain("DIRECTION");
    expect(matchedOn).toContain("ENTRY_PRICE");
    // The issue derivation carries the same evidence.
    expect(second.issues.map((issue) => issue.code)).toContain("POSSIBLE_TRADE_DUPLICATE");

    // 5. Confirmation is BLOCKED without the explicit acknowledgment…
    const blocked = await confirm(a, second.id, {});
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { code: string }).code).toBe("OCR_TRADE_DUPLICATE_UNACKNOWLEDGED");

    // …and proceeds once the user acknowledges (V2 §58 - Import Anyway).
    const acknowledged = await confirm(a, second.id, { acknowledgeDuplicateTrade: true });
    expect(acknowledged.statusCode).toBe(200);
    expect(ocrRecognitionResponseSchema.parse(acknowledged.json()).recognition.status).toBe(
      "CONFIRMED",
    );
  });
});

// ── V2 §58 - screenshot duplicate acknowledgment ─────────────────────────────

describe("screenshot duplicate acknowledgment", () => {
  it("blocks confirmation until the near-duplicate flag is acknowledged", async () => {
    const a = await user();
    const recognition = await upload(a.authHeader, pngDataUrl(makeOcrFixturePng({ nonce: 44 })));

    // Simulate the advisory flag the pHash path stores (the deterministic
    // engine never emits a hash - the flag semantics are what is under test).
    await prisma.ocrRecognition.update({
      where: { id: recognition.id },
      data: {
        result: {
          ...(recognition as unknown as Record<string, unknown>),
          fields: (recognition as unknown as { fields: unknown[] }).fields,
          duplicateOf: {
            recognitionId: "99999999-9999-4999-8999-999999999999",
            createdAt: new Date().toISOString(),
            tradeId: null,
          },
        } as object,
      },
    });

    const blocked = await confirm(a, recognition.id, {});
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { code: string }).code).toBe("OCR_DUPLICATE_UNACKNOWLEDGED");

    const acknowledged = await confirm(a, recognition.id, {
      acknowledgeDuplicateScreenshot: true,
    });
    expect(acknowledged.statusCode).toBe(200);
  });
});
