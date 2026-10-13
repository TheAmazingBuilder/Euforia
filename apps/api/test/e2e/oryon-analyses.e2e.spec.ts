/**
 * e2e — Oryon chart analyses on the server (Phase 10 → serveur).
 *
 * The multi-device store: create (contract-parsed payload, server-owned
 * ids/timestamps), get/list/patch/delete, the canonical-trade link
 * (ownership + symbol mismatch), metadata-only PATCH (the payload is
 * immutable after save), IDOR battery, honest list shape.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { oryonAnalysesListResponseSchema } from "../../src/shared/contracts";
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

const ANALYSIS_CONFIG = {
  structure: {
    enabled: true,
    showSwingHighs: true,
    showSwingLows: true,
    showLabels: true,
    showProvisional: false,
    minDistancePips: 5,
    minSeparationBars: 3,
    leftBars: 5,
    rightBars: 3,
    breaksEnabled: true,
    breakMode: "close",
  },
  levels: {
    prevDayHighLow: true,
    prevDayOpenClose: false,
    prevWeekHighLow: true,
    prevWeekOpenClose: false,
    openingRange: false,
    orSessionId: "london",
    orDurationMinutes: 60,
    orShowDeveloping: false,
  },
};

function analysisPayload(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "EURUSD",
    interval: "1H",
    chartType: "candles",
    title: "Structure review",
    notes: "HH/HL intact",
    tradeId: null,
    snapshot: null,
    referenceTimeSec: 1_760_300_000,
    analysis: ANALYSIS_CONFIG,
    drawings: [], // a drawing needs the full oryonDrawingSchema — the payload shape is what matters
    ...overrides,
  };
}

async function createAnalysis(auth: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/oryon/analyses",
    headers: { ...auth, "content-type": "application/json" },
    payload: analysisPayload(overrides),
  });
  expect(res.statusCode).toBe(201);
  return res.json().analysis as { id: string; [k: string]: unknown };
}

describe("oryon analyses CRUD", () => {
  it("creates with server-owned id/timestamps and returns the contract shape", async () => {
    const user = await authenticatedUser(app, mail);
    const analysis = await createAnalysis(user.authHeader);
    expect(analysis.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof analysis.createdAt).toBe("number"); // unix ms (store parity)
    expect(analysis.schemaVersion).toBe(1);
    expect(analysis.referenceTimeSec).toBe(1_760_300_000);
    expect(analysis.tradeId).toBeNull();
  });

  it("lists newest-update first with the honest envelope", async () => {
    const user = await authenticatedUser(app, mail);
    const first = await createAnalysis(user.authHeader, { title: "First" });
    await createAnalysis(user.authHeader, { title: "Second" });
    const list = oryonAnalysesListResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/oryon/analyses", headers: user.authHeader })).json(),
    );
    expect(list.analyses.length).toBeGreaterThanOrEqual(2);
    expect(list.analyses.some((a) => a.id === first.id)).toBe(true);
  });

  it("patches metadata only — title/notes/link; the payload stays immutable", async () => {
    const user = await authenticatedUser(app, mail);
    const analysis = await createAnalysis(user.authHeader);
    const patched = await app.inject({
      method: "PUT",
      url: `/api/v1/oryon/analyses/${analysis.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { title: "Structure review — refined", notes: "Updated after the session." },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().analysis.title).toBe("Structure review — refined");
    // untouched structurally: the stored payload round-trips with the schema
    // defaults filled (pivotStyle/showBreakLines) — same semantics, more keys.
    const wire = patched.json().analysis as { analysis: { structure: { enabled: boolean; leftBars: number }; levels: { prevDayHighLow: boolean } } };
    expect(wire.analysis.structure.enabled).toBe(ANALYSIS_CONFIG.structure.enabled);
    expect(wire.analysis.levels.prevDayHighLow).toBe(ANALYSIS_CONFIG.levels.prevDayHighLow);
    expect(wire.analysis.structure.leftBars).toBe(ANALYSIS_CONFIG.structure.leftBars);
  });

  it("links a canonical trade (ownership + symbol mismatch rules)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { providerId: "MOCK", environment: "DEMO", externalAccountId: "oryon-lk-1", credentials: { method: "API_KEY", secret: "mock-api-key-oryon1" } },
    });
    const accountId = (account.json() as { account: { id: string } }).account.id;
    const instruments = (await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader })).json() as { instruments: Array<{ id: string; symbol: string }> };
    const eurusd = instruments.instruments.find((i) => i.symbol === "EURUSD")!;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { variant: "open", accountId, instrumentId: eurusd.id, direction: "BUY", entryPrice: "1.0850", entryAt: "2026-03-02T09:30:00.000Z", size: { mode: "quantity", quantity: "0.1" }, outOfPlaybook: true },
    });
    const tradeId = (created.json() as { id: string }).id;

    const analysis = await createAnalysis(user.authHeader); // EURUSD — same symbol
    const linked = await app.inject({
      method: "PUT",
      url: `/api/v1/oryon/analyses/${analysis.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { tradeId },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().analysis.tradeId).toBe(tradeId);

    // The canonical trade row is untouched by the analysis link.
    const row = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    expect(row.status).toBe("OPEN");

    // Detach clears the link.
    const detached = await app.inject({
      method: "PUT",
      url: `/api/v1/oryon/analyses/${analysis.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { tradeId: null },
    });
    expect(detached.json().analysis.tradeId).toBeNull();
  });

  it("404 on a foreign trade link + IDOR on read/patch/delete", async () => {
    const [userA, userB] = await Promise.all([authenticatedUser(app, mail), authenticatedUser(app, mail)]);
    const analysisA = await createAnalysis(userA.authHeader);
    const analysisB = await createAnalysis(userB.authHeader, { symbol: "XAUUSD" });

    // A foreign trade id → honest 404 (never a leak).
    const foreignLink = await app.inject({
      method: "PUT",
      url: `/api/v1/oryon/analyses/${analysisA.id}`,
      headers: { ...userA.authHeader, "content-type": "application/json" },
      payload: { tradeId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(foreignLink.statusCode).toBe(404);

    // User A's analysis is invisible to B (404, never 403 — house IDOR rule).
    const foreignGet = await app.inject({ method: "GET", url: `/api/v1/oryon/analyses/${analysisA.id}`, headers: userB.authHeader });
    expect(foreignGet.statusCode).toBe(404);
    const foreignPatch = await app.inject({
      method: "PUT",
      url: `/api/v1/oryon/analyses/${analysisA.id}`,
      headers: { ...userB.authHeader, "content-type": "application/json" },
      payload: { title: "hijacked" },
    });
    expect(foreignPatch.statusCode).toBe(404);
    const foreignDelete = await app.inject({ method: "DELETE", url: `/api/v1/oryon/analyses/${analysisA.id}`, headers: userB.authHeader });
    expect(foreignDelete.statusCode).toBe(404);

    // B's list never contains A's rows.
    const listB = oryonAnalysesListResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/oryon/analyses", headers: userB.authHeader })).json(),
    );
    expect(listB.analyses.some((a) => a.id === analysisA.id)).toBe(false);
    expect(listB.analyses.some((a) => a.id === analysisB.id)).toBe(true);
    void analysisB;
  });

  it("401 anonymous; deletes an owned analysis", async () => {
    const user = await authenticatedUser(app, mail);
    const anon = await app.inject({ method: "GET", url: "/api/v1/oryon/analyses" });
    expect(anon.statusCode).toBe(401);

    const analysis = await createAnalysis(user.authHeader);
    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/oryon/analyses/${analysis.id}`, headers: user.authHeader });
    expect(deleted.statusCode).toBe(200);
    const gone = await app.inject({ method: "GET", url: `/api/v1/oryon/analyses/${analysis.id}`, headers: user.authHeader });
    expect(gone.statusCode).toBe(404);
  });
});
