/**
 * e2e — Performance snapshots (Dashboard Customization Phase 08) over the
 * REAL AppModule + real database.
 *
 * Proven here:
 *   - FINANCIAL CORRECTNESS: a snapshot capture freezes the authoritative
 *     suite's summary; the frozen metrics are checked against INDEPENDENTLY
 *     computed expected values from a deterministic canonical journal
 *     (sum of pnlNet, win count/total, mean R — arithmetic done in the test,
 *     never reusing app code).
 *   - IMMUTABILITY (§9): captured values do NOT change when the underlying
 *     trade rows change afterwards — a NEW capture sees the new data
 *     (captured vs recalculated distinction), the OLD snapshot stays frozen.
 *   - Metadata-only patch: unknown/metric-like fields are stripped by the
 *     shared contract; name/notes change, metrics never.
 *   - Unique-name product rule (case-insensitive → 409 SNAPSHOT_NAME_TAKEN).
 *   - Ownership: every read/write is user-scoped; cross-user access is 404
 *     (foreign = not found), including a foreign accountId reference at
 *     capture time (spec §11 reference validation).
 *   - Deletion conventions + auth (401) + validation (400) + determinism.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
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

// ── fixtures ──────────────────────────────────────────────────────────────────

let usdInstrumentId: string | null = null;
async function instrumentId(): Promise<string> {
  if (usdInstrumentId === null) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { symbol: "EURUSD" } });
    usdInstrumentId = instrument.id;
  }
  return usdInstrumentId;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** MOCK accounts derive their currency deterministically from the external
 * id (same mechanics as the analytics e2e) — walk ids until one yields USD. */
async function usdAccount(auth: Record<string, string>): Promise<{ id: string; currency: string }> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const externalAccountId = `77${attempt.toString(36).padStart(4, "0")}`;
    if (fnv1a(externalAccountId) % 3 !== 0) continue;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: auth,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId,
        credentials: { method: "API_KEY", secret: "mock-api-key-snapshots" },
      },
    });
    if (created.statusCode !== 201) continue;
    const account = (created.json() as { account: { id: string; currency: string } }).account;
    if (account.currency !== "USD") continue;
    return account;
  }
  throw new Error("no deterministic USD external id found");
}

interface TradeSpec {
  day: string;
  pnlNet: string;
  rMultiple: string;
  exitReason?: string;
}

/** Canonical CLOSED trade row (provider-journal truth — pre-computed P&L/R). */
async function seedTrade(userId: string, accountId: string, spec: TradeSpec): Promise<{ id: string }> {
  return prisma.trade.create({
    data: {
      userId,
      accountId,
      status: "CLOSED",
      instrumentId: await instrumentId(),
      direction: "BUY",
      source: "EXTERNAL_SYNC",
      symbol: "EURUSD",
      currency: "USD",
      quantity: "1",
      closedQuantity: "1",
      entryPrice: "1.08500",
      exitPrice: spec.rMultiple.startsWith("-") ? "1.08000" : "1.09000",
      entryAt: new Date(`${spec.day}T09:30:00.000Z`),
      exitAt: new Date(`${spec.day}T12:00:00.000Z`),
      exitReason: spec.exitReason ?? (spec.rMultiple.startsWith("-") ? "SL" : "TP"),
      fees: "0",
      swap: "0",
      pnlGross: spec.pnlNet,
      pnlNet: spec.pnlNet,
      riskAmount: "100",
      rMultiple: spec.rMultiple,
      tradingDate: new Date(`${spec.day}T00:00:00.000Z`),
    },
    select: { id: true },
  });
}

/** The reference journal: +500 (R=+5) then −300 (R=−3), both on fixed days.
 * Independent expectations: netPnl = 500−300 = 200; trades = 2; wins = 1 →
 * winRate = 0.5; avgR = (5 + (−3)) / 2 = 1; grossProfit = 500; grossLoss = 300. */
function referenceSpecs(): TradeSpec[] {
  return [
    { day: "2026-03-02", pnlNet: "500", rMultiple: "5" },
    { day: "2026-03-03", pnlNet: "-300", rMultiple: "-3" },
  ];
}

async function capture(
  auth: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/snapshots",
    headers: auth,
    payload,
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

type SnapshotDoc = {
  id: string;
  name: string;
  notes: string;
  capturedAt: string;
  period: string;
  periodFrom: string;
  periodTo: string;
  descriptor: string;
  currency: string | null;
  singleCurrency: boolean;
  schemaVersion: number;
  metrics: {
    netPnl: string | null;
    winRate: string | null;
    profitFactor: string | null;
    trades: number;
    avgR: string | null;
    expectancyR: string;
    maxDrawdownR: string;
    maxDrawdownPct: string | null;
  };
};

// ── tests ──────────────────────────────────────────────────────────────────────

describe("snapshot capture — financial correctness against independent expectations", () => {
  it("freezes the authoritative summary EXACTLY (independently computed)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    for (const spec of referenceSpecs()) {
      const seeded = await seedTrade(user.userId, account.id, spec);
      expect(seeded.id).toBeTruthy();
    }

    const created = await capture(user.authHeader, {
      name: "March reference",
      notes: "baseline",
      filters: { period: "ALL" },
    });
    expect(created.statusCode).toBe(201);
    const snapshot = created.body as unknown as SnapshotDoc;

    // Context is explicit (spec §3): window, scope echo, currency, version.
    // For the ALL preset the suite resolves the window to the DATASET's real
    // extent (first/last closed trading day) — independently known here.
    expect(snapshot.periodFrom).toBe("2026-03-02");
    expect(snapshot.periodTo).toBe("2026-03-03");
    expect(snapshot.period).toBe("ALL");
    expect(snapshot.descriptor.length).toBeGreaterThan(0);
    expect(snapshot.currency).toBe("USD");
    expect(snapshot.singleCurrency).toBe(true);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.notes).toBe("baseline");

    // The frozen metrics — every expected value computed IN THIS TEST.
    expect(snapshot.metrics.trades).toBe(2);
    expect(snapshot.metrics.netPnl).toBe("200"); // 500 + (−300)
    expect(snapshot.metrics.winRate).toBe("0.5"); // 1 win / 2 trades
    expect(snapshot.metrics.avgR).toBe("1"); // (5 + (−3)) / 2
    expect(snapshot.metrics.expectancyR).toBe("1");
    expect(Number(snapshot.metrics.profitFactor)).toBeCloseTo(500 / 300, 2);
    expect(Number(snapshot.metrics.maxDrawdownR)).toBeLessThanOrEqual(0);
  });

  it("is deterministic — same scope, different name → identical metrics", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    for (const spec of referenceSpecs()) {
      await seedTrade(user.userId, account.id, spec);
    }
    const first = await capture(user.authHeader, { name: "run A", filters: { period: "ALL" } });
    const second = await capture(user.authHeader, { name: "run B", filters: { period: "ALL" } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const a = first.body as unknown as SnapshotDoc;
    const b = second.body as unknown as SnapshotDoc;
    expect(b.metrics).toEqual(a.metrics);
    expect(b.id).not.toBe(a.id);
  });

  it("list is newest-first and honors the capture order", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    await seedTrade(user.userId, account.id, referenceSpecs()[0]!);
    await capture(user.authHeader, { name: "older capture", filters: { period: "ALL" } });
    await capture(user.authHeader, { name: "newer capture", filters: { period: "ALL" } });
    const list = await app.inject({ method: "GET", url: "/api/v1/snapshots", headers: user.authHeader });
    expect(list.statusCode).toBe(200);
    const snapshots = (list.json() as { snapshots: SnapshotDoc[] }).snapshots;
    const names = snapshots.map((snapshot) => snapshot.name);
    expect(names.indexOf("newer capture")).toBeLessThan(names.indexOf("older capture"));
  });
});

describe("snapshot consistency — captured values never move (§9)", () => {
  it("a source-data change after capture leaves the frozen snapshot untouched; a NEW capture sees the new data", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    for (const spec of referenceSpecs()) {
      await seedTrade(user.userId, account.id, spec);
    }
    const before = await capture(user.authHeader, { name: "frozen", filters: { period: "ALL" } });
    expect(before.statusCode).toBe(201);
    const frozen = (before.body as unknown as SnapshotDoc).metrics;
    expect(frozen.netPnl).toBe("200");

    // Mutate the source data (+700 trade).
    await seedTrade(user.userId, account.id, { day: "2026-03-04", pnlNet: "700", rMultiple: "7" });

    // The OLD snapshot still reports the captured truth.
    const reRead = await app.inject({
      method: "GET",
      url: `/api/v1/snapshots/${(before.body as unknown as SnapshotDoc).id}`,
      headers: user.authHeader,
    });
    expect(reRead.statusCode).toBe(200);
    expect((reRead.json() as unknown as SnapshotDoc).metrics).toEqual(frozen);

    // A NEW capture recalculates: netPnl = 500 − 300 + 700 = 900.
    const after = await capture(user.authHeader, { name: "after mutation", filters: { period: "ALL" } });
    expect(after.statusCode).toBe(201);
    expect((after.body as unknown as SnapshotDoc).metrics.netPnl).toBe("900");
  });

  it("PATCH is metadata-only — metric-like fields are stripped by the contract", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    await seedTrade(user.userId, account.id, referenceSpecs()[0]!);
    const created = await capture(user.authHeader, { name: "to rename", filters: { period: "ALL" } });
    const id = (created.body as unknown as SnapshotDoc).id;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/snapshots/${id}`,
      headers: user.authHeader,
      payload: {
        name: "renamed capture",
        notes: "metadata only",
        // An attempted metrics rewrite — NOT part of the update contract;
        // zod strips unknown keys, so this can never touch captured values.
        netPnl: "999999",
        metrics: { netPnl: "999999" },
      },
    });
    expect(patched.statusCode).toBe(200);
    const updated = patched.json() as unknown as SnapshotDoc;
    expect(updated.name).toBe("renamed capture");
    expect(updated.notes).toBe("metadata only");
    expect(updated.metrics.netPnl).not.toBe("999999");
    expect(updated.metrics.netPnl).toBe("500");

    // An empty patch violates the refine (at least one field) → 400.
    const empty = await app.inject({
      method: "PATCH",
      url: `/api/v1/snapshots/${id}`,
      headers: user.authHeader,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });
});

describe("snapshot names, validation, auth", () => {
  it("rejects duplicate names case-insensitively (409 SNAPSHOT_NAME_TAKEN)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    await seedTrade(user.userId, account.id, referenceSpecs()[0]!);
    const first = await capture(user.authHeader, { name: "Quarter review", filters: { period: "ALL" } });
    expect(first.statusCode).toBe(201);
    const duplicate = await capture(user.authHeader, { name: "quarter REVIEW", filters: { period: "ALL" } });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.body as { code?: string }).code).toBe("SNAPSHOT_NAME_TAKEN");
  });

  it("rejects invalid captures (400)", async () => {
    const user = await authenticatedUser(app, mail);
    const empty = await capture(user.authHeader, {});
    expect(empty.statusCode).toBe(400);
    const blankName = await capture(user.authHeader, { name: "   ", filters: { period: "ALL" } });
    expect(blankName.statusCode).toBe(400);
    const longName = await capture(user.authHeader, { name: "x".repeat(81), filters: { period: "ALL" } });
    expect(longName.statusCode).toBe(400);
    const badPeriod = await capture(user.authHeader, { name: "ok", filters: { period: "FOREVER" } });
    expect(badPeriod.statusCode).toBe(400);
  });

  it("requires authentication (401)", async () => {
    const unauth = await app.inject({ method: "GET", url: "/api/v1/snapshots" });
    expect(unauth.statusCode).toBe(401);
    const unauthPost = await app.inject({
      method: "POST",
      url: "/api/v1/snapshots",
      payload: { name: "x", filters: { period: "ALL" } },
    });
    expect(unauthPost.statusCode).toBe(401);
  });

  it("validates uuid params (400) and validates scope references against the user (404)", async () => {
    const user = await authenticatedUser(app, mail);
    const badParam = await app.inject({
      method: "GET",
      url: "/api/v1/snapshots/not-a-uuid",
      headers: user.authHeader,
    });
    expect(badParam.statusCode).toBe(400);

    // A capture referencing an account the user does NOT own → 404 (spec §11).
    const other = await authenticatedUser(app, mail);
    const otherAccount = await usdAccount(other.authHeader);
    const foreign = await capture(user.authHeader, {
      name: "foreign scope",
      filters: { period: "ALL", accountId: otherAccount.id },
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("ownership — cross-user access is 404 (foreign = not found)", () => {
  it("another user cannot read, rename or delete a snapshot", async () => {
    const owner = await authenticatedUser(app, mail);
    const account = await usdAccount(owner.authHeader);
    await seedTrade(owner.userId, account.id, referenceSpecs()[0]!);
    const created = await capture(owner.authHeader, { name: "private", filters: { period: "ALL" } });
    const id = (created.body as unknown as SnapshotDoc).id;

    const stranger = await authenticatedUser(app, mail);
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/snapshots/${id}`,
      headers: stranger.authHeader,
    });
    expect(read.statusCode).toBe(404);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/snapshots/${id}`,
      headers: stranger.authHeader,
      payload: { name: "hijacked" },
    });
    expect(patch.statusCode).toBe(404);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/snapshots/${id}`,
      headers: stranger.authHeader,
    });
    expect(del.statusCode).toBe(404);

    // The stranger's list never contains the owner's snapshot.
    const strangerList = await app.inject({
      method: "GET",
      url: "/api/v1/snapshots",
      headers: stranger.authHeader,
    });
    const names = (strangerList.json() as { snapshots: SnapshotDoc[] }).snapshots.map((s) => s.name);
    expect(names).not.toContain("private");
  });
});

describe("deletion conventions", () => {
  it("deletes (204), then 404 on re-read, and the list shrinks", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await usdAccount(user.authHeader);
    await seedTrade(user.userId, account.id, referenceSpecs()[0]!);
    const created = await capture(user.authHeader, { name: "doomed", filters: { period: "ALL" } });
    const id = (created.body as unknown as SnapshotDoc).id;

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/snapshots/${id}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(204);

    const reRead = await app.inject({
      method: "GET",
      url: `/api/v1/snapshots/${id}`,
      headers: user.authHeader,
    });
    expect(reRead.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/api/v1/snapshots", headers: user.authHeader });
    const names = (list.json() as { snapshots: SnapshotDoc[] }).snapshots.map((s) => s.name);
    expect(names).not.toContain("doomed");
  });
});
