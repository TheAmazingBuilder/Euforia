/**
 * e2e — Trading Core / Trade Journal Foundation (Phase 4).
 *
 * Covers the journal lifecycle over the REAL AppModule + real database:
 * capture → close → decision gate → review → mutations → bulk → import →
 * saved views → screenshots, the EXTERNAL_SYNC reconstruction pipeline,
 * ownership (IDOR) and negative capabilities. Responses are validated
 * against the SHARED contracts — the exact schemas the frontend consumes.
 *
 * Hard product contracts under test (trade-entry-ux.md §12–§13):
 * close responses carry NO P&L; only POST /trades/:id/decision reveals it;
 * re-deciding is a 409.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ProbeMethod = "GET" | "POST" | "PATCH" | "DELETE";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  instrumentSchema,
  revealPayloadSchema,
  savedTradeViewSchema,
  tradeSchema,
  tradeScreenshotSchema,
  tradesListResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
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

// ── helpers ──────────────────────────────────────────────────────────────────

const SECRET = "mock-api-key-trades-e2e";

function connectPayload(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "MOCK",
    environment: "DEMO",
    externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
    credentials: { method: "API_KEY", secret: SECRET },
    ...overrides,
  };
}

/** Register a user, connect one MOCK account (initial sync included). */
async function userWithAccount(overrides: Record<string, unknown> = {}) {
  const user = await authenticatedUser(app, mail);
  const connected = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: user.authHeader,
    payload: connectPayload(overrides),
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;
  return { ...user, accountId };
}

/** EURUSD has contractSize 100000 — the fixtures' arithmetic anchors on it. */
async function eurInstrument(auth?: Record<string, string>) {
  const list = await app.inject({
    method: "GET",
    url: "/api/v1/instruments",
    ...(auth ? { headers: auth } : {}),
  });
  const instruments = (list.json() as { instruments?: Array<{ symbol: string }> }).instruments ?? [];
  const found = instruments.find((instrument) => instrument.symbol === "EURUSD");
  if (found === undefined) throw new Error("EURUSD missing from the catalog");
  return instrumentSchema.parse(found);
}

async function createOpenTrade(
  auth: Record<string, string>,
  accountId: string,
  instrumentId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/trades",
    headers: auth,
    payload: {
      variant: "open",
      accountId,
      instrumentId,
      direction: "BUY",
      entryPrice: "1.0850",
      entryAt: "2026-01-05T09:30:00.000Z",
      size: { mode: "quantity", quantity: "0.10" },
      initialStop: "1.0800",
      outOfPlaybook: true,
      ...overrides,
    },
  });
}

/** Minimal VALID PNG binary (signature + IHDR + IEND) as a data URL. */
function pngDataUrl(): string {
  const header = Buffer.alloc(8);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  const ihdrLength = Buffer.from([0x00, 0x00, 0x00, 0x0d]);
  const ihdrType = Buffer.from("IHDR", "latin1");
  const ihdrData = Buffer.alloc(13);
  const crc = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const iendLength = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const iendType = Buffer.from("IEND", "latin1");
  const png = Buffer.concat([header, ihdrLength, ihdrType, ihdrData, crc, iendLength, iendType, crc]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ── Auth boundary ────────────────────────────────────────────────────────────

describe("trades — authentication boundary", () => {
  it("401 on every trades route without a token", async () => {
    const tradeId = "00000000-0000-4000-8000-00000000dead";
    const routes: Array<[ProbeMethod, string]> = [
      ["GET", "/api/v1/trades"],
      ["POST", "/api/v1/trades"],
      ["POST", "/api/v1/trades/import"],
      ["POST", "/api/v1/trades/bulk"],
      ["POST", `/api/v1/trades/${tradeId}/close`],
      ["POST", `/api/v1/trades/${tradeId}/decision`],
      ["GET", `/api/v1/trades/${tradeId}/review`],
      ["PATCH", `/api/v1/trades/${tradeId}/review`],
      ["PATCH", `/api/v1/trades/${tradeId}/plan`],
      ["PATCH", `/api/v1/trades/${tradeId}/psychology`],
      ["PATCH", `/api/v1/trades/${tradeId}/notes`],
      ["PATCH", `/api/v1/trades/${tradeId}`],
      ["DELETE", `/api/v1/trades/${tradeId}`],
      ["GET", `/api/v1/trades/${tradeId}/screenshots`],
      ["GET", "/api/v1/trade-views"],
      ["GET", "/api/v1/instruments"],
    ];
    for (const [method, url] of routes) {
      const response = await app.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

// ── Instruments catalog ──────────────────────────────────────────────────────

describe("GET /instruments — catalog (Domaine 2)", () => {
  it("serves the seeded catalog validated against the shared schema", async () => {
    const user = await authenticatedUser(app, mail);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/instruments",
      headers: user.authHeader,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.instruments.length).toBeGreaterThanOrEqual(7);
    for (const instrument of body.instruments) {
      expect(instrumentSchema.parse(instrument)).toBeTruthy();
    }
    const symbols = body.instruments.map((instrument: { symbol: string }) => instrument.symbol);
    expect(symbols).toContain("EURUSD");
    expect(symbols).toContain("BOOM500");
  });
});

// ── Capture / lifecycle / decision gate ──────────────────────────────────────

describe("POST /trades + lifecycle + decision gate", () => {
  it("creates an OPEN manual trade and computes the risked amount", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const response = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    expect(response.statusCode).toBe(201);
    const trade = tradeSchema.parse(response.json());
    expect(trade.status).toBe("OPEN");
    expect(trade.source).toBe("MANUAL");
    expect(trade.riskAmount).toBe("50"); // |1.0850 − 1.0800| × 0.1 × 100000
    expect(trade.pnlNet).toBeNull();
    expect(trade.tradingDate).toBe("2026-01-05");
  });

  it("creates a CLOSED trade whose response carries NO P&L (hard contract §12)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const response = await createOpenTrade(user.authHeader, user.accountId, instrument.id, {
      variant: "closed",
      exitPrice: "1.0900",
      exitAt: "2026-01-05T11:00:00.000Z",
      exitReason: "TP",
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({ id: expect.any(String), awaitingDecision: true });
    expect(JSON.stringify(body)).not.toContain("pnlNet");
    expect(JSON.stringify(body)).not.toContain("rMultiple");
  });

  it("rejects an unknown account (404) and an unknown instrument (422)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const badAccount = await createOpenTrade(
      user.authHeader,
      "00000000-0000-4000-8000-00000000dead",
      instrument.id,
    );
    expect(badAccount.statusCode).toBe(404);
    const badInstrument = await createOpenTrade(
      user.authHeader,
      user.accountId,
      "00000000-0000-4000-8000-00000000dead",
    );
    expect(badInstrument.statusCode).toBe(422);
    expect(badInstrument.json().code).toBe("UNKNOWN_INSTRUMENT");
  });

  it("closes with the single path, stores results server-side, decision reveals once", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id, {
      initialStop: "1.0800",
    });
    const tradeId = (created.json() as { id: string }).id;

    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: {
        mode: "single",
        exitPrice: "1.0900",
        exitAt: "2026-01-05T11:00:00.000Z",
        exitReason: "TP",
        mfePrice: "1.0905",
        maePrice: "1.0840",
      },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toEqual({ id: tradeId, awaitingDecision: true });

    // Results are STORED (server-side authority) but not revealed yet — the
    // to-grade queue finds the trade via graded=false.
    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/trades?graded=false",
      headers: user.authHeader,
    });
    const queueBody = tradesListResponseSchema.parse(queue.json());
    const queued = queueBody.trades.find((candidate) => candidate.id === tradeId);
    expect(queued?.decisionGrade).toBeNull();

    const decided = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/decision`,
      headers: user.authHeader,
      payload: { grade: "A", followedPlan: true },
    });
    expect(decided.statusCode).toBe(200);
    const reveal = revealPayloadSchema.parse(decided.json());
    expect(reveal.tradeId).toBe(tradeId);
    expect(reveal.pnlNet).toBe("50"); // Δ 0.005 × 0.1 × 100000 − 0 fees
    expect(reveal.rMultiple).toBe("1"); // 50 / 50
    expect(reveal.durationSeconds).toBe(5400);
    expect(reveal.coachingKey).toBe("win_ab");
    expect(reveal.detectedMistakes).toEqual([]);

    const again = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/decision`,
      headers: user.authHeader,
      payload: { grade: "B", followedPlan: false },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("DECISION_ALREADY_SUBMITTED");
  });

  it("closes with partial legs, preserving them and aggregating the exit (§18)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id, {
      size: { mode: "quantity", quantity: "1.00" },
    });
    const tradeId = (created.json() as { id: string }).id;
    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: {
        mode: "partial",
        exits: [
          { price: "1.0900", quantity: "0.40", exitedAt: "2026-01-05T10:00:00.000Z", reason: "PARTIAL" },
          { price: "1.0950", quantity: "0.60", exitedAt: "2026-01-05T11:00:00.000Z", reason: "MANUAL" },
        ],
      },
    });
    expect(closed.statusCode).toBe(200);

    const row = await prisma.trade.findUnique({ where: { id: tradeId }, include: { exits: true } });
    expect(row?.status).toBe("CLOSED");
    // Finalization §16 — the weighted average is DECIMAL now: (1.09×0.4 +
    // 1.095×0.6)/1 = 1.093 exactly. The old float path quantized to 2dp
    // ("1.09", mock simplification) and skewed the stored P&L — the
    // precision divergence from the mock is documented in the report.
    expect(row?.exitPrice?.toFixed()).toBe("1.093");
    expect(row?.exits).toHaveLength(2);
  });

  it("409 on closing a non-open trade", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.09", exitAt: "2026-01-05T11:00:00.000Z", exitReason: "MANUAL" },
    });
    const again = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.09", exitAt: "2026-01-05T12:00:00.000Z", exitReason: "MANUAL" },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toBe("Trade is not open");
  });
});

// ── Review (Act 3) and mutations ─────────────────────────────────────────────

describe("review + open-trade mutations + edit + delete", () => {
  it("serves the review with neutral detections and persists the lesson + MFE R", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.09", exitAt: "2026-01-05T11:00:00.000Z", exitReason: "TP" },
    });

    const review = await app.inject({
      method: "GET",
      url: `/api/v1/trades/${tradeId}/review`,
      headers: user.authHeader,
    });
    expect(review.statusCode).toBe(200);
    const body = review.json();
    expect(body.detectedMistakes).toEqual([]);
    expect(body.tagIds).toEqual([]);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/review`,
      headers: user.authHeader,
      payload: { lesson: "Held to plan", mfePrice: "1.0900" },
    });
    expect(patched.statusCode).toBe(200);
    const trade = tradeSchema.parse(patched.json().trade);
    expect(trade.lessons).toBe("Held to plan");
    expect(trade.mfeR).toBe("1"); // |1.09 − 1.085| / 0.005
  });

  it("forges SL/TP modification events server-side and refuses them on sync trades", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const planned = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/plan`,
      headers: user.authHeader,
      payload: { stop: "1.082" },
    });
    expect(planned.statusCode).toBe(200);
    const body = planned.json();
    expect(body.event.type).toBe("SL_MODIFIED");
    expect(body.event.payload).toEqual({ from: "1.08", to: "1.082" });
    expect(body.event.source).toBe("USER");
    expect(body.trade.finalStop).toBe("1.082");

    const closed = await prisma.trade.findUnique({ where: { id: tradeId } });
    await prisma.trade.update({
      where: { id: tradeId },
      data: { source: "EXTERNAL_SYNC", externalPositionId: "pos-x" },
    });
    const onSync = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/plan`,
      headers: user.authHeader,
      payload: { stop: "1.0830" },
    });
    expect(onSync.statusCode).toBe(422);
    expect(onSync.json().message).toContain("Broker-derived");
    await prisma.trade.update({
      where: { id: tradeId },
      data: { source: closed?.source ?? "MANUAL", externalPositionId: null },
    });
  });

  it("edits psychology, notes and journal fields; recomputes results after edits", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const psy = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/psychology`,
      headers: user.authHeader,
      payload: { emotionBefore: "CALM", confidence: 4 },
    });
    expect(psy.statusCode).toBe(200);
    expect(psy.json().trade.emotionBefore).toBe("CALM");

    const notes = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/notes`,
      headers: user.authHeader,
      payload: { notes: "Clean breakout" },
    });
    expect(notes.json().trade.notes).toBe("Clean breakout");

    await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.09", exitAt: "2026-01-05T11:00:00.000Z", exitReason: "TP" },
    });
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}`,
      headers: user.authHeader,
      payload: { quantity: "0.20" },
    });
    expect(edited.statusCode).toBe(200);
    const trade = tradeSchema.parse(edited.json().trade);
    expect(trade.quantity).toBe("0.2");
    expect(trade.pnlNet).toBe("100"); // recomputed: Δ 0.005 × 0.2 × 100000
  });

  it("422 on exit corrections before close, 422 on exitAt ≤ entryAt", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const beforeClose = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}`,
      headers: user.authHeader,
      payload: { exitPrice: "1.09" },
    });
    expect(beforeClose.statusCode).toBe(409);
    expect(beforeClose.json().message).toBe("Trade is not closed — close it first");

    await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.09", exitAt: "2026-01-05T11:00:00.000Z", exitReason: "TP" },
    });
    const badDate = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}`,
      headers: user.authHeader,
      payload: { exitAt: "2026-01-05T09:00:00.000Z" },
    });
    expect(badDate.statusCode).toBe(422);
    expect(badDate.json().message).toBe("exitAt must be after entryAt");
  });

  it("soft-deletes a trade (§57) — gone from lists, row kept", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/trades/${tradeId}`,
      headers: user.authHeader,
    });
    expect(removed.json()).toEqual({ id: tradeId, deleted: true });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/trades",
      headers: user.authHeader,
    });
    expect(list.json().trades.some((trade: { id: string }) => trade.id === tradeId)).toBe(false);
    const row = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(row?.deletedAt).not.toBeNull();
  });
});

// ── Bulk ops + import + views ────────────────────────────────────────────────

describe("bulk operations, CSV import, saved views", () => {
  it("grades CLOSED rows in bulk, reports skipped honestly, rejects TAG (future domain)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const open = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const openId = (open.json() as { id: string }).id;
    const closedTrade = await createOpenTrade(user.authHeader, user.accountId, instrument.id, {
      variant: "closed",
      exitPrice: "1.09",
      exitAt: "2026-01-05T11:00:00.000Z",
      exitReason: "TP",
    });
    const closedId = (closedTrade.json() as { id: string }).id;

    const graded = await app.inject({
      method: "POST",
      url: "/api/v1/trades/bulk",
      headers: user.authHeader,
      payload: { op: "GRADE", tradeIds: [openId, closedId], grade: "B" },
    });
    expect(graded.statusCode).toBe(200);
    expect(graded.json()).toEqual({ op: "GRADE", affected: 1, skipped: 1 });

    const tagged = await app.inject({
      method: "POST",
      url: "/api/v1/trades/bulk",
      headers: user.authHeader,
      payload: { op: "TAG", tradeIds: [closedId], tagId: "00000000-0000-4000-8000-00000000dead", mode: "add" },
    });
    expect(tagged.statusCode).toBe(422);

    const deleted = await app.inject({
      method: "POST",
      url: "/api/v1/trades/bulk",
      headers: user.authHeader,
      payload: { op: "DELETE", tradeIds: [openId] },
    });
    expect(deleted.json()).toEqual({ op: "DELETE", affected: 1, skipped: 0 });
  });

  it("imports idempotently by broker ref with unknown-symbol reporting", async () => {
    const user = await userWithAccount();
    const payload = {
      broker: "MT5",
      rows: [
        {
          symbol: "EURUSD",
          side: "BUY",
          entryAt: "2026-02-01T09:30:00.000Z",
          entryPrice: "1.0800",
          exitAt: "2026-02-01T10:30:00.000Z",
          exitPrice: "1.0850",
          quantity: "0.5",
          fees: "2",
          pnl: "999",
        },
        {
          symbol: "NOTAREALSYMBOL",
          side: "SELL",
          entryAt: "2026-02-01T09:30:00.000Z",
          entryPrice: "1.1000",
        },
      ],
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/trades/import",
      headers: user.authHeader,
      payload,
    });
    expect(first.statusCode).toBe(201);
    const body = first.json();
    expect(body.imported).toBe(1);
    expect(body.unknownSymbols).toEqual(["NOTAREALSYMBOL"]);
    // The broker pnl reference is informational — results are recomputed.
    const row = await prisma.trade.findUnique({ where: { id: body.tradeIds[0] } });
    expect(row?.pnlNet?.toFixed()).toBe("248"); // (0.005 × 0.5 × 100000) − 2
    expect(row?.source).toBe("IMPORT");

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/trades/import",
      headers: user.authHeader,
      payload,
    });
    expect(second.json()).toEqual({
      imported: 0,
      skippedDuplicates: 1,
      unknownSymbols: ["NOTAREALSYMBOL"],
      tradeIds: [],
    });
  });

  it("manages saved views with case-insensitive name uniqueness (409)", async () => {
    const user = await userWithAccount();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/trade-views",
      headers: user.authHeader,
      payload: {
        name: "Open positions",
        scope: "TRADES",
        filters: { q: "", status: "OPEN", direction: "all", instrumentId: "", strategyId: "", outcome: "all", tagId: "", from: "", to: "" },
        columns: ["date", "instrument", "r"],
        sortKey: "date",
        sortDir: "desc",
      },
    });
    expect(created.statusCode).toBe(201);
    const view = savedTradeViewSchema.parse(created.json().view);
    expect(view.scope).toBe("TRADES");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/trade-views",
      headers: user.authHeader,
      payload: {
        name: "open POSITIONS",
        filters: { q: "", status: "all", direction: "all", instrumentId: "", strategyId: "", outcome: "all", tagId: "", from: "", to: "" },
        columns: ["date"],
        sortKey: "date",
        sortDir: "asc",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().message).toBe("A view with this name already exists");

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/trade-views/${view.id}`,
      headers: user.authHeader,
    });
    expect(removed.json()).toEqual({ id: view.id, deleted: true });
  });
});

// ── Screenshots ──────────────────────────────────────────────────────────────

describe("trade screenshots", () => {
  it("stores, re-serves and deletes a validated PNG (magic bytes)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/screenshots`,
      headers: user.authHeader,
      payload: { kind: "CHART", dataUrl: pngDataUrl(), caption: "entry zone" },
    });
    expect(added.statusCode).toBe(201);
    const screenshot = tradeScreenshotSchema.parse(added.json());
    expect(screenshot.storageKey.startsWith("data:image/png;base64,")).toBe(true);

    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/trades/${tradeId}/screenshots`,
      headers: user.authHeader,
    });
    expect(listed.json().screenshots).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/trades/${tradeId}/screenshots/${screenshot.id}`,
      headers: user.authHeader,
    });
    expect(removed.json()).toEqual({ id: screenshot.id, deleted: true });
  });

  it("422 on a disguised payload (declared PNG, content not an image)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;
    const fake = `data:image/png;base64,${Buffer.from("definitely not an image").toString("base64")}`;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/screenshots`,
      headers: user.authHeader,
      payload: { kind: "CHART", dataUrl: fake },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("INVALID_SCREENSHOT");
  });

  it("422 INVALID_SCREENSHOT (not a generic 413) on an upload beyond the size cap (§85 coherence)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;
    // Decoded size > TRADES_SCREENSHOT_MAX_BYTES (6 MB default) while the
    // base64 body (~8.4 MB) still clears the coherent BODY_LIMIT_BYTES
    // (9 MB default) — the DOMAIN validator must own the rejection.
    const oversized = Buffer.alloc(6_291_456 + 1024, 7);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/screenshots`,
      headers: user.authHeader,
      payload: {
        kind: "CHART",
        dataUrl: `data:image/png;base64,${oversized.toString("base64")}`,
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("INVALID_SCREENSHOT");
  });
});

// ── EXTERNAL_SYNC reconstruction pipeline (§17/§26/§27/§28) ──────────────────

describe("synchronization → reconstruction pipeline", () => {
  it("rebuilds journal trades from synced deals, idempotently, with explicit source", async () => {
    const user = await userWithAccount();
    // The connect above already ran the INITIAL sync — deals are in the DB.
    const first = await app.inject({
      method: "GET",
      url: "/api/v1/trades",
      headers: user.authHeader,
    });
    const firstBody = tradesListResponseSchema.parse(first.json());
    const syncTrades = firstBody.trades.filter((trade) => trade.source === "EXTERNAL_SYNC");
    expect(syncTrades.length).toBeGreaterThanOrEqual(1);
    for (const trade of syncTrades) {
      expect(trade.externalRef).toBeNull();
      expect(trade.importBatchId).toBeNull();
    }
    // Closed sync trades must carry provider-supplied results; open ones none.
    const closedSync = syncTrades.filter((trade) => trade.status === "CLOSED");
    expect(closedSync.length).toBeGreaterThanOrEqual(1);
    for (const trade of closedSync) {
      expect(trade.pnlNet).not.toBeNull();
      expect(trade.exitAt).not.toBeNull();
    }

    // Re-listing (another full reconciliation pass) must NOT duplicate (§27).
    const second = await app.inject({
      method: "GET",
      url: "/api/v1/trades",
      headers: user.authHeader,
    });
    const secondBody = tradesListResponseSchema.parse(second.json());
    expect(secondBody.total).toBe(firstBody.total);
    const syncAgain = secondBody.trades.filter((trade) => trade.source === "EXTERNAL_SYNC");
    expect(syncAgain.map((trade) => trade.id).sort()).toEqual(syncTrades.map((trade) => trade.id).sort());
  });

  it("list filters: status, graded queue, account (foreign account → 404)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    await createOpenTrade(user.authHeader, user.accountId, instrument.id, {
      variant: "closed",
      exitPrice: "1.09",
      exitAt: "2026-01-05T11:00:00.000Z",
      exitReason: "TP",
    });

    const open = await app.inject({
      method: "GET",
      url: "/api/v1/trades?status=OPEN",
      headers: user.authHeader,
    });
    expect(open.json().trades.every((trade: { status: string }) => trade.status === "OPEN")).toBe(true);

    const notGraded = await app.inject({
      method: "GET",
      url: "/api/v1/trades?graded=false",
      headers: user.authHeader,
    });
    expect(
      notGraded.json().trades.every(
        (trade: { status: string; decisionGrade: string | null }) =>
          trade.status === "CLOSED" && trade.decisionGrade === null,
      ),
    ).toBe(true);

    const foreignAccount = await app.inject({
      method: "GET",
      url: `/api/v1/trades?accountId=00000000-0000-4000-8000-00000000dead`,
      headers: user.authHeader,
    });
    expect(foreignAccount.statusCode).toBe(404);
  });
});

// ── Ownership (IDOR) ─────────────────────────────────────────────────────────

describe("ownership — User A vs User B (IDOR → 404)", () => {
  it("user B cannot reach user A's trade through ANY route", async () => {
    const a = await userWithAccount();
    const b = await userWithAccount();
    const instrument = await eurInstrument(a.authHeader);
    const created = await createOpenTrade(a.authHeader, a.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;

    const probes: Array<[ProbeMethod, string, Record<string, unknown> | undefined]> = [
      ["GET", `/api/v1/trades/${tradeId}/review`, undefined],
      ["PATCH", `/api/v1/trades/${tradeId}/review`, { lesson: "hijack" }],
      ["PATCH", `/api/v1/trades/${tradeId}/plan`, { stop: "1" }],
      ["PATCH", `/api/v1/trades/${tradeId}/psychology`, { confidence: 1 }],
      ["PATCH", `/api/v1/trades/${tradeId}/notes`, { notes: "hijack" }],
      ["PATCH", `/api/v1/trades/${tradeId}`, { quantity: "9" }],
      ["POST", `/api/v1/trades/${tradeId}/close`, { mode: "single", exitPrice: "1", exitAt: "2026-01-06T00:00:00.000Z", exitReason: "MANUAL" }],
      ["POST", `/api/v1/trades/${tradeId}/decision`, { grade: "A", followedPlan: true }],
      ["DELETE", `/api/v1/trades/${tradeId}`, undefined],
      ["GET", `/api/v1/trades/${tradeId}/screenshots`, undefined],
    ];
    for (const [method, url, payload] of probes) {
      const response = await app.inject({
        method,
        url,
        headers: b.authHeader,
        ...(payload !== undefined ? { payload } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
      expect(response.json().code).toBe("TRADE_NOT_FOUND");
    }

    // B listing trades never sees A's trade.
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/trades",
      headers: b.authHeader,
    });
    expect(list.json().trades.some((trade: { id: string }) => trade.id === tradeId)).toBe(false);

    // B cannot grade/delete A's trade in bulk either.
    const bulk = await app.inject({
      method: "POST",
      url: "/api/v1/trades/bulk",
      headers: b.authHeader,
      payload: { op: "GRADE", tradeIds: [tradeId], grade: "A" },
    });
    expect(bulk.json().affected).toBe(0);
  });

  it("user B cannot create a trade on user A's account", async () => {
    const a = await userWithAccount();
    const b = await userWithAccount();
    const instrument = await eurInstrument(a.authHeader);
    const response = await createOpenTrade(b.authHeader, a.accountId, instrument.id);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ACCOUNT_NOT_FOUND");
  });
});

// ── Out-of-scope endpoints stay honest ───────────────────────────────────────

describe("deferred capabilities", () => {
  it("session-series is NOT served (market data is out of scope §68)", async () => {
    const user = await userWithAccount();
    const instrument = await eurInstrument(user.authHeader);
    const created = await createOpenTrade(user.authHeader, user.accountId, instrument.id);
    const tradeId = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/trades/${tradeId}/session-series`,
      headers: user.authHeader,
    });
    expect(response.statusCode).toBe(404);
  });
});
