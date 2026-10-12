/**
 * e2e — Analytics bounded context (Phase 8).
 *
 * Over the REAL AppModule + real database: the Analytics module's single
 * dataset (GET /stats/analytics-suite) and the dashboard KPI aggregation
 * (GET /stats/overview).
 *
 * Fixture strategy: canonical Trade rows (the P&L/R Trading Core computes for
 * provider-synced journals — manual journals carry no P&L by Phase 4 §29
 * semantics, which the analytics engine treats as "R = 0" honestly) are
 * seeded DIRECTLY with deterministic canonical values; the account,
 * strategy, origin plan and reviews are created through the REAL API so the
 * attribution chain (Trade → review.originTradePlanId → plan.strategyId),
 * the frozen planned-RR snapshot and every ownership rule stay exercised
 * end-to-end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  analyticsSuiteResponseSchema,
  statsOverviewResponseSchema,
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

// ── fixtures ─────────────────────────────────────────────────────────────────

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

async function connectUsdMockAccount(auth: Record<string, string>): Promise<{ id: string; currency: string; startingBalance: string }> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const externalAccountId = `77${attempt.toString(36).padStart(4, "0")}`;
    if (fnv1a(externalAccountId) % 3 !== 0) continue;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: auth,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId,
        credentials: { method: "API_KEY", secret: "mock-api-key-abcd1234" },
      },
    });
    if (res.statusCode !== 201) continue;
    const account = res.json().account as { id: string; currency: string };
    if (account.currency !== "USD") continue;
    const row = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: account.id } });
    return { ...account, startingBalance: row.startingBalance.toFixed() };
  }
  throw new Error("no deterministic USD external id found");
}

interface TradeSpec {
  entryAt: string;
  exitAt: string;
  pnlNet: string;
  rMultiple: string | null;
  direction?: "BUY" | "SELL";
  exitReason?: string | null;
  riskAmount?: string | null;
}

/** Canonical CLOSED trade row with pre-computed P&L/R (provider-journal truth). */
let seededInstrumentId: string | null = null;
async function resolveInstrumentId(): Promise<string> {
  if (seededInstrumentId === null) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { symbol: "EURUSD" } });
    seededInstrumentId = instrument.id;
  }
  return seededInstrumentId;
}

async function seedTrade(userId: string, accountId: string, spec: TradeSpec): Promise<{ id: string }> {
  return prisma.trade.create({
    data: {
      userId,
      accountId,
      status: "CLOSED",
      instrumentId: await resolveInstrumentId(),
      direction: spec.direction ?? "BUY",
      source: "EXTERNAL_SYNC",
      symbol: "EURUSD",
      currency: "USD",
      quantity: "1",
      closedQuantity: "1",
      entryPrice: "1.08500",
      exitPrice: "1.09000",
      entryAt: new Date(spec.entryAt),
      exitAt: new Date(spec.exitAt),
      exitReason: spec.exitReason ?? "TP",
      fees: "0",
      swap: "0",
      pnlGross: spec.pnlNet,
      pnlNet: spec.pnlNet,
      riskAmount: spec.riskAmount ?? "100",
      rMultiple: spec.rMultiple,
      tradingDate: new Date(`${spec.entryAt.slice(0, 10)}T00:00:00.000Z`),
    },
    select: { id: true },
  });
}

/** The Phase 8 reference journal: 6 closed canonical trades + 1 open. */
function referenceSpecs(): TradeSpec[] {
  return [
    { entryAt: "2026-03-02T09:30:00.000Z", exitAt: "2026-03-02T12:00:00.000Z", pnlNet: "500", rMultiple: "5", exitReason: "TP" },
    { entryAt: "2026-03-03T09:30:00.000Z", exitAt: "2026-03-03T12:00:00.000Z", pnlNet: "-300", rMultiple: "-3", exitReason: "SL" },
    { entryAt: "2026-03-04T09:30:00.000Z", exitAt: "2026-03-04T12:00:00.000Z", pnlNet: "0", rMultiple: "0", exitReason: "MANUAL" },
    { entryAt: "2026-03-05T09:30:00.000Z", exitAt: "2026-03-05T12:00:00.000Z", pnlNet: "500", rMultiple: "5", direction: "SELL", exitReason: "TP" },
    { entryAt: "2026-03-06T09:30:00.000Z", exitAt: "2026-03-06T12:00:00.000Z", pnlNet: "200", rMultiple: "2", exitReason: "TRAILING" },
    { entryAt: "2026-03-09T09:30:00.000Z", exitAt: "2026-03-09T12:00:00.000Z", pnlNet: "400", rMultiple: "4", exitReason: "TP" },
  ];
}

async function seedReferenceUser(auth: Record<string, string>, userId: string) {
  const account = await connectUsdMockAccount(auth);
  const trades = [];
  for (const spec of referenceSpecs()) {
    trades.push(await seedTrade(userId, account.id, spec));
  }
  // The OPEN position — counted by meta, never leaked into stats (§45).
  await prisma.trade.create({
    data: {
      userId,
      accountId: account.id,
      status: "OPEN",
      instrumentId: await resolveInstrumentId(),
      direction: "BUY",
      source: "EXTERNAL_SYNC",
      symbol: "EURUSD",
      currency: "USD",
      quantity: "1",
      entryPrice: "1.08500",
      entryAt: new Date("2026-03-09T13:00:00.000Z"),
      tradingDate: new Date("2026-03-09T00:00:00.000Z"),
    },
  });

  const strategy = (
    await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: auth,
      payload: { name: "London Breakout" },
    })
  ).json() as { id: string; name: string };
  const planRes = await app.inject({
    method: "POST",
    url: "/api/v1/trade-plans",
    headers: auth,
    payload: {
      accountId: account.id,
      symbol: "EURUSD",
      direction: "BUY",
      entryPrice: "1.08500",
      stopLoss: "1.08000",
      takeProfit: "1.09500",
      size: { mode: "risk_amount", riskAmount: "100" },
      strategyId: strategy.id,
      commitNow: true,
    },
  });
  expect(planRes.statusCode).toBe(201);
  const plan = planRes.json().tradePlan as { id: string; rrRatio: string | null };
  const putReview = async (tradeId: string, payload: Record<string, unknown>) => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${tradeId}`,
      headers: auth,
      payload: {
        tradeId,
        executionGrade: "B",
        followedPlan: true,
        playbookMatch: "MATCHED",
        lessons: "Followed the plan; entry timing could improve.",
        ...payload,
      },
    });
    expect(res.statusCode).toBe(200);
  };
  // t1 → linked to the origin plan (frozen rrRatio snapshot); t2 → review without plan.
  await putReview(trades[0]!.id, { originTradePlanId: plan.id, followedPlan: true });
  await putReview(trades[1]!.id, { followedPlan: false });
  return { account, trades, strategy, plan };
}

async function getSuite(auth?: Record<string, string>, query = "") {
  return app.inject({
    method: "GET",
    url: `/api/v1/stats/analytics-suite${query ? `?${query}` : ""}`,
    headers: auth ?? {},
  });
}

async function getOverview(auth?: Record<string, string>) {
  return app.inject({
    method: "GET",
    url: "/api/v1/stats/overview",
    headers: auth ?? {},
  });
}

// ── security (§46) ───────────────────────────────────────────────────────────

describe("security battery", () => {
  it("requires authentication on both endpoints", async () => {
    expect((await getSuite()).statusCode).toBe(401);
    expect((await getOverview()).statusCode).toBe(401);
  });

  it("isolates users: B's dataset contains no A rows; filtering by A's account narrows to empty", async () => {
    const userA = await authenticatedUser(app, mail);
    const seededA = await seedReferenceUser(userA.authHeader, userA.userId);
    const userB = await authenticatedUser(app, mail);
    const accountB = await connectUsdMockAccount(userB.authHeader);
    await seedTrade(userB.userId, accountB.id, {
      entryAt: "2026-03-02T09:30:00.000Z",
      exitAt: "2026-03-02T12:00:00.000Z",
      pnlNet: "200",
      rMultiple: "2",
    });

    // B sees exactly his own journal — never A's (userId from the principal only).
    const suiteB = (await getSuite(userB.authHeader)).json();
    expect(suiteB.meta.closedTrades).toBe(1);
    expect(suiteB.meta.descriptor).toBe("All accounts · all symbols");

    // IDOR via filter: A's accountId is just an unknown id inside B's scope.
    const filteredB = (
      await getSuite(userB.authHeader, `accountId=${seededA.account.id}`)
    ).json();
    expect(filteredB.meta.closedTrades).toBe(0);
    expect(filteredB.meta.warnings).toContain("No closed trades match the current filters.");

    // A still sees his full dataset (6 closed) — isolation is symmetric.
    const suiteA = (await getSuite(userA.authHeader)).json();
    expect(suiteA.meta.closedTrades).toBe(6);

    // Leakage scan: B's payloads never contain A's email or trade ids.
    const payload = JSON.stringify(suiteB) + JSON.stringify(filteredB);
    expect(payload).not.toContain(userA.email);
    for (const trade of seededA.trades) {
      expect(payload).not.toContain(trade.id);
    }
  });
});

// ── suite contract (§41/§55) ─────────────────────────────────────────────────

describe("analytics-suite contract", () => {
  it("returns a schema-valid suite with exact canonical metrics over the reference journal", async () => {
    const user = await authenticatedUser(app, mail);
    const { account } = await seedReferenceUser(user.authHeader, user.userId);
    const base = Number(account.startingBalance);

    const res = await getSuite(user.authHeader);
    expect(res.statusCode).toBe(200);
    const suite = analyticsSuiteResponseSchema.parse(res.json());

    // ── meta ──
    expect(suite.meta.closedTrades).toBe(6);
    expect(suite.meta.openTradesExcluded).toBe(1);
    expect(suite.meta.singleCurrency).toBe(true);
    expect(suite.meta.descriptor).toBe("All accounts · all symbols");
    expect(suite.meta.resolvedFrom).toBe("2026-03-02");
    expect(suite.meta.resolvedTo).toBe("2026-03-09");
    expect(suite.meta.anomalies).toEqual([]); // 6 trades < 10 — silent
    expect(suite.currency).toBe("USD");

    // ── summary (canonical math over +500/−300/0/+500/+200/+400, R 5/−3/0/5/2/4) ──
    const s = suite.summary;
    expect(s.trades).toBe(6);
    expect(s.winningTrades).toBe(4);
    expect(s.losingTrades).toBe(1);
    expect(s.breakevenTrades).toBe(1);
    expect(s.netPnl).toBe("1300");
    expect(s.grossProfit).toBe("1600");
    expect(s.grossLoss).toBe("300");
    expect(s.winRate).toBe("0.67");
    expect(s.lossRate).toBe("0.17");
    expect(s.profitFactor).toBe("5.33");
    expect(s.expectancyR).toBe("2.17");
    expect(s.expectancyMoney).toBe("216.67");
    expect(s.avgR).toBe("2.17");
    expect(s.medianR).toBe("3"); // sorted [−3,0,2,4,5,5] → interpolated midpoint of 2 and 4
    expect(s.bestR).toBe("5");
    expect(s.worstR).toBe("-3");
    expect(s.avgWinMoney).toBe("400");
    expect(s.avgLossMoney).toBe("-300");
    expect(s.avgWinR).toBe("4");
    expect(s.avgLossR).toBe("3");
    expect(s.payoffRatio).toBe("1.33");
    expect(s.maxDrawdownR).toBe("-3");
    expect(s.maxDrawdownPct).toBe(String(Number(((-300 / (base + 500)) * 100).toFixed(2))));
    expect(s.recoveryFactor).toBe(String(Number((1300 / 3).toFixed(2))));
    expect(s.avgDurationMin).toBe(150); // all 2.5h trades

    // ── equity (per-trade points from the account's starting balance) ──
    expect(suite.equity).toHaveLength(6);
    expect(suite.equity[0]).toEqual({
      date: "2026-03-02",
      equity: String(Number((base + 500).toFixed(2))),
      drawdownPct: "0",
    });
    expect(suite.equity[1]?.equity).toBe(String(Number((base + 200).toFixed(2))));
    expect(Number(suite.equity[1]?.drawdownPct)).toBeLessThan(0);

    // ── DATA CONSISTENCY (§63): Analytics P&L == Trading Core canonical values
    // (exact R parity asserted at the end of this test against the DB rows).
    expect(suite.summary.netPnl).toBe("1300");
    expect(suite.cumulativeR.map((p) => p.symbol)).toEqual(Array(6).fill("EURUSD"));

    // ── daily P&L ──
    expect(suite.dailyPnl).toHaveLength(6);
    expect(suite.dailyPnl[0]).toEqual({ date: "2026-03-02", pnl: "500", r: "5", trades: 1, wins: 1 });

    // ── histograms ──
    expect(suite.rHistogram).toHaveLength(12);
    expect(suite.rHistogram[0]).toEqual({ label: "≤ -2R", count: 1, center: "-1.8" });
    expect(suite.rHistogram[11]?.count).toBe(3); // R 5, 5, 4
    expect(suite.durationHistogram.map((b) => b.label)).toEqual([
      "< 5 min",
      "5–15 min",
      "15–60 min",
      "1–4 h",
      "4–12 h",
      "> 12 h",
    ]);
    expect(suite.durationHistogram[3]?.count).toBe(6);
    expect(suite.pnlHistogram.length).toBeGreaterThan(0);

    // ── drawdowns: one recovered period (peak 03-02 → trough 03-04 → 03-05 recovery) ──
    expect(suite.drawdowns).toHaveLength(1);
    const dd = suite.drawdowns[0]!;
    expect(dd.peakDate).toBe("2026-03-02");
    expect(dd.bottomDate).toBe("2026-03-04");
    expect(dd.recoveredDate).toBe("2026-03-05");
    expect(dd.drawdownMoney).toBe("-300");
    expect(dd.drawdownR).toBe("-3");
    expect(dd.durationDays).toBe(1); // ddStart (03-03) → trough (03-04)
    expect(dd.recoveryDays).toBe(2); // ddStart (03-03) → recovered (03-05)
    expect(dd.recoveryTrades).toBe(3); // index(t4) − indexAtPeak(t1) = 3 − 0

    // ── risk ──
    expect(suite.risk.tradesWithRisk).toBe(6);
    expect(suite.risk.avgRiskMoney).toBe("100");
    expect(suite.risk.riskDeviationPct).toBe("0");
    expect(suite.risk.maxConcurrentPositions).toBe(1);
    const buckets = Object.fromEntries(suite.risk.plannedVsRealized.map((b) => [b.bucket, b]));
    expect(buckets["1–2R planned"]?.trades).toBe(1); // plan rrRatio = 2, trade t1
    expect(buckets["1–2R planned"]?.avgRealizedR).toBe("5");
    expect(buckets["No plan"]?.trades).toBe(5);

    // ── strategies (attribution via review → origin plan) ──
    const byName = Object.fromEntries(suite.strategies.map((row) => [row.name, row]));
    expect(byName["London Breakout"]).toBeDefined();
    expect(byName["London Breakout"]?.trades).toBe(1);
    expect(byName["London Breakout"]?.followedPlanPct).toBe("1");
    expect(byName["Out of playbook"]?.trades).toBe(5);
    expect(byName["Out of playbook"]?.followedPlanPct).toBe("0"); // t2 reviewed, violated

    // ── symbols / asset classes / directions ──
    const spec = await prisma.instrumentSpecification.findUniqueOrThrow({ where: { symbol: "EURUSD" } });
    expect(suite.symbols).toHaveLength(1);
    expect(suite.symbols[0]).toMatchObject({
      instrumentId: spec.id,
      symbol: "EURUSD",
      assetClass: "FOREX",
      trades: 6,
      winRate: "0.67",
      profitFactor: "5.33",
      netPnl: "1300",
      avgR: "2.17",
    });
    expect(suite.assetClasses).toHaveLength(1);
    expect(suite.assetClasses[0]?.assetClass).toBe("FOREX");
    expect(suite.directions).toHaveLength(2);
    expect(suite.directions.find((d) => d.direction === "BUY")?.trades).toBe(5);
    expect(suite.directions.find((d) => d.direction === "BUY")?.netPnl).toBe("800");
    expect(suite.directions.find((d) => d.direction === "SELL")?.trades).toBe(1);

    // ── time analytics: entries all 09:30Z → LONDON, bucket 2 ──
    expect(suite.sessions.find((s2) => s2.key === "LONDON")?.trades).toBe(6);
    expect(suite.sessions.find((s2) => s2.key === "ASIA")?.trades).toBe(0);
    expect(suite.hours.find((h) => h.key === "2")?.trades).toBe(6);
    expect(suite.weekdays.find((w) => w.key === "1")?.trades).toBe(2); // Mondays 03-02, 03-09
    expect(suite.heatmap).toHaveLength(42);
    expect(suite.heatmap.find((c) => c.weekday === 1 && c.hourBucket === 2)?.trades).toBe(2);

    // ── psychology: tilt computed, emotions honest-empty ──
    expect(suite.psychology.emotionsBefore).toEqual([]);
    expect(suite.psychology.confidenceBands).toHaveLength(3);
    expect(suite.psychology.tilt.map((p) => p.priorLossStreak)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(suite.psychology.tilt.every((p) => !p.isSpike)).toBe(true);

    // ── quality / mistakes / events: honest seams + canonical calendar ──
    expect(suite.quality.planFollowed).toEqual({ followed: 1, violated: 1, unknown: 4 });
    expect(suite.quality.excursionAvailable).toBe(false);
    expect(suite.quality.scatter).toHaveLength(6);
    expect(suite.quality.scatter.every((p) => p.mfeR === null && p.maeR === null)).toBe(true);
    expect(suite.mistakes).toEqual({ entries: [], violatingTrades: 0, totalR: "0" });
    // Phase 13 — the canonical Calendar feeds the economic-event context.
    // Coverage now reflects the builtin provider's rolling window and the
    // exact phase split depends on the run date (the deterministic engine
    // contract is asserted in the unit spec) — here we assert the shape
    // and the closed-set invariant.
    const coverage = suite.events.calendarCoverage;
    expect(coverage.from === null || /^\d{4}-\d{2}-\d{2}$/.test(coverage.from)).toBe(true);
    expect(coverage.to === null || /^\d{4}-\d{2}-\d{2}$/.test(coverage.to)).toBe(true);
    expect(coverage.classifiedTrades + coverage.unclassifiedTrades).toBe(6);
    expect(suite.events.phases.map((p) => p.key)).toEqual(["BEFORE", "DURING", "AFTER", "NONE"]);
    expect(suite.events.byImpact.map((b) => b.key)).toEqual(["HIGH", "MEDIUM"]);

    // ── advanced ──
    expect(suite.advanced.r.mean).toBe("2.17");
    expect(suite.advanced.r.median).toBe("3");
    expect(suite.advanced.r.p05).not.toBeNull();
    expect(suite.advanced.streaks.longestWin).toBe(3); // t4 → t6, breakeven transparent
    expect(suite.advanced.streaks.longestLoss).toBe(1);

    // ── Monte Carlo: 400 sims, 6-trades-per-run, deterministic ──
    expect(suite.monteCarlo.simulations).toBe(400);
    expect(suite.monteCarlo.tradesPerRun).toBe(6);
    expect(suite.monteCarlo.bands).toHaveLength(6);
    expect(suite.monteCarlo.methodology).toContain("Simulation, not a prediction");

    // ── reports ──
    expect(suite.reports.daily).toHaveLength(6);
    expect(suite.reports.weekly.map((r) => r.key)).toEqual(["2026-W10", "2026-W11"]);
    expect(suite.reports.monthly.map((r) => r.key)).toEqual(["2026-03"]);
    expect(suite.reports.monthly[0]?.r).toBe("13");

    // ── data consistency (§63) against the seeded canonical journal ──
    const canonical = await prisma.trade.findMany({
      where: { userId: user.userId, status: "CLOSED" },
      orderBy: { entryAt: "asc" },
      select: { pnlNet: true, rMultiple: true },
    });
    expect(suite.cumulativeR.map((p) => p.r)).toEqual(canonical.map((t) => String(Number(t.rMultiple!.toFixed()))));
    expect(suite.summary.netPnl).toBe(String(canonical.reduce((sum, t) => sum + Number(t.pnlNet!.toFixed()), 0)));
  });

  it("is deterministic across repeated identical requests (reproducibility §52)", async () => {
    const user = await authenticatedUser(app, mail);
    await seedReferenceUser(user.authHeader, user.userId);
    const first = (await getSuite(user.authHeader)).json();
    const second = (await getSuite(user.authHeader)).json();
    expect(first).toEqual(second);
  });
});

// ── filter bag (§8: only filters backed by real domain data) ─────────────────

describe("suite filters", () => {
  it("CUSTOM period narrows inclusively; inverted bounds fall back to ALL", async () => {
    const user = await authenticatedUser(app, mail);
    await seedReferenceUser(user.authHeader, user.userId);
    const custom = (
      await getSuite(user.authHeader, "period=CUSTOM&customFrom=2026-03-05&customTo=2026-03-09")
    ).json();
    expect(custom.meta.closedTrades).toBe(3);
    expect(custom.meta.resolvedFrom).toBe("2026-03-05");
    expect(custom.meta.resolvedTo).toBe("2026-03-09");
    const inverted = (await getSuite(user.authHeader, "period=CUSTOM&customFrom=2026-03-09&customTo=2026-03-05")).json();
    expect(inverted.meta.closedTrades).toBe(6); // fallback ALL
  });

  it("TODAY/YESTERDAY resolve on the server trading-day clock", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const nowKey = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await seedTrade(user.userId, account.id, {
      entryAt: `${nowKey}T09:30:00.000Z`,
      exitAt: `${nowKey}T12:00:00.000Z`,
      pnlNet: "200",
      rMultiple: "2",
    });
    await seedTrade(user.userId, account.id, {
      entryAt: `${yesterday}T09:30:00.000Z`,
      exitAt: `${yesterday}T12:00:00.000Z`,
      pnlNet: "200",
      rMultiple: "2",
    });
    const today = (await getSuite(user.authHeader, "period=TODAY")).json();
    expect(today.meta.closedTrades).toBe(1);
    expect(today.meta.resolvedFrom).toBe(nowKey);
    const yst = (await getSuite(user.authHeader, "period=YESTERDAY")).json();
    expect(yst.meta.closedTrades).toBe(1);
    expect(yst.meta.resolvedFrom).toBe(yesterday);
  });

  it("strategyId=none / strategyId=<uuid> follow the review→plan attribution chain", async () => {
    const user = await authenticatedUser(app, mail);
    const { strategy } = await seedReferenceUser(user.authHeader, user.userId);
    const none = (await getSuite(user.authHeader, "period=ALL&strategyId=none")).json();
    expect(none.meta.closedTrades).toBe(5);
    expect(none.meta.descriptor).toContain("Out of playbook");
    const attributed = (await getSuite(user.authHeader, `period=ALL&strategyId=${strategy.id}`)).json();
    expect(attributed.meta.closedTrades).toBe(1);
    expect(attributed.strategies).toHaveLength(1);
    expect(attributed.strategies[0]?.name).toBe("London Breakout");
  });

  it("direction, session, exitReason, account, instrument and assetClass all narrow the set", async () => {
    const user = await authenticatedUser(app, mail);
    const { account } = await seedReferenceUser(user.authHeader, user.userId);
    const spec = await prisma.instrumentSpecification.findUniqueOrThrow({ where: { symbol: "EURUSD" } });
    expect((await getSuite(user.authHeader, "period=ALL&direction=SELL")).json().meta.closedTrades).toBe(1);
    expect((await getSuite(user.authHeader, "period=ALL&session=LONDON")).json().meta.closedTrades).toBe(6);
    expect((await getSuite(user.authHeader, "period=ALL&session=ASIA")).json().meta.closedTrades).toBe(0);
    expect((await getSuite(user.authHeader, "period=ALL&exitReason=TP")).json().meta.closedTrades).toBe(3);
    expect((await getSuite(user.authHeader, `period=ALL&accountId=${account.id}`)).json().meta.closedTrades).toBe(6);
    expect((await getSuite(user.authHeader, `period=ALL&instrumentId=${spec.id}`)).json().meta.closedTrades).toBe(6);
    expect((await getSuite(user.authHeader, "period=ALL&assetClass=FOREX")).json().meta.closedTrades).toBe(6);
    expect((await getSuite(user.authHeader, "period=ALL&assetClass=CRYPTO")).json().meta.closedTrades).toBe(0);
  });

  it("emotion/tag filters narrow honestly to empty (no journal data owns them yet)", async () => {
    const user = await authenticatedUser(app, mail);
    await seedReferenceUser(user.authHeader, user.userId);
    const emo = (await getSuite(user.authHeader, "period=ALL&emotion=FOMO")).json();
    expect(emo.meta.closedTrades).toBe(0);
    expect(emo.meta.warnings).toContain("No closed trades match the current filters.");
    const tag = (
      await getSuite(user.authHeader, "period=ALL&tagId=00000000-0000-4000-8000-000000000001")
    ).json();
    expect(tag.meta.closedTrades).toBe(0);
  });

  it("clamps sims and falls back to the default on unparsable values", async () => {
    const user = await authenticatedUser(app, mail);
    await seedReferenceUser(user.authHeader, user.userId);
    expect(Number((await getSuite(user.authHeader, "period=ALL&sims=50")).json().monteCarlo.simulations)).toBe(100);
    expect(Number((await getSuite(user.authHeader, "period=ALL&sims=99999")).json().monteCarlo.simulations)).toBe(2000);
    expect(Number((await getSuite(user.authHeader, "period=ALL&sims=abc")).json().monteCarlo.simulations)).toBe(400);
    expect(Number((await getSuite(user.authHeader)).json().monteCarlo.simulations)).toBe(400);
  });
});

// ── validation (§54: invalid input → clean 400, never a misleading dataset) ──

describe("suite validation", () => {
  it("rejects invalid enum values and malformed uuids with 400 ValidationError", async () => {
    const user = await authenticatedUser(app, mail);
    await seedReferenceUser(user.authHeader, user.userId);
    const badPeriod = await getSuite(user.authHeader, "period=LAST_CENTURY");
    expect(badPeriod.statusCode).toBe(400);
    expect(badPeriod.json().error).toBe("ValidationError");
    const badStrategy = await getSuite(user.authHeader, "period=ALL&strategyId=not-a-uuid");
    expect(badStrategy.statusCode).toBe(400);
    const badAccount = await getSuite(user.authHeader, "period=ALL&accountId=nope");
    expect(badAccount.statusCode).toBe(400);
    const badRange = await getSuite(user.authHeader, "period=CUSTOM&customFrom=2026-03-09&customTo=x");
    expect(badRange.statusCode).toBe(400);
  });

  it("serializes an empty journal into an honest, schema-valid dataset", async () => {
    const user = await authenticatedUser(app, mail);
    const suite = analyticsSuiteResponseSchema.parse((await getSuite(user.authHeader)).json());
    expect(suite.meta.closedTrades).toBe(0);
    expect(suite.meta.openTradesExcluded).toBe(0);
    expect(suite.meta.warnings).toContain("No closed trades match the current filters.");
    expect(suite.summary.trades).toBe(0);
    expect(suite.summary.winRate).toBeNull();
    expect(suite.summary.expectancyR).toBe("0"); // always emitted
    expect(suite.equity).toEqual([]);
    expect(suite.drawdowns).toEqual([]);
    expect(suite.risk.maxDailyRisk).toBeNull();
    expect(suite.monteCarlo.tradesPerRun).toBe(0);
  });
});

// ── overview (dashboard KPI aggregation) ─────────────────────────────────────

describe("stats overview", () => {
  it("returns a schema-valid aggregation with honest discipline/ghost blocks", async () => {
    const user = await authenticatedUser(app, mail);
    const { account } = await seedReferenceUser(user.authHeader, user.userId);
    const base = Number(account.startingBalance);

    const res = await getOverview(user.authHeader);
    expect(res.statusCode).toBe(200);
    const overview = statsOverviewResponseSchema.parse(res.json());

    expect(overview.currency).toBe("USD");
    expect(overview.netPnl).toBe("1300.0"); // Phase-8 1dp money formatting
    expect(overview.winRate).toBe("0.67"); // ratio 0–1 (unlike the weekly strips' %)
    expect(overview.profitFactor).toBe("5.33");
    expect(overview.expectancy).toBe("2.17"); // mean R
    expect(overview.disciplineScore).toBeNull(); // DailyStat domain not backend yet
    expect(overview.equityCurve).toHaveLength(6);
    expect(overview.equityCurve[0]).toEqual({
      date: "2026-03-02",
      equity: String(Number((base + 500).toFixed(2))),
    });
    // Phase-8 daily aggregates carry the 1dp money formatting.
    expect(overview.dailyPnl[0]).toEqual({ date: "2026-03-02", pnlNet: "500.0", tradesCount: 1 });
    expect(overview.equityPeak).toBe(String(Number((base + 1300).toFixed(2))));
    expect(Number(overview.maxDrawdownPct)).toBeLessThanOrEqual(0);

    // deltas: 7-day rolling windows, server-computed
    expect(overview.deltaWindowDays).toBe(7);
    expect(overview.deltas.netPnl).toBeDefined();
    expect(overview.deltas.winRate).toBeDefined();

    // sparklines: Monday-anchored weeks with data, capped at 8
    expect(overview.sparklines.netPnl.length).toBeGreaterThanOrEqual(1);
    expect(overview.sparklines.netPnl.length).toBeLessThanOrEqual(8);
    expect(overview.sparklines.netPnl.length).toBe(overview.sparklines.winRate.length);

    // weeklyCompare: 7 zero-filled day bands per side
    expect(overview.weeklyCompare.thisWeek.days).toHaveLength(7);
    expect(overview.weeklyCompare.prevWeek.days).toHaveLength(7);
    expect(overview.weeklyCompare.thisWeek.days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);

    // ghost/regret blocks: the domain is not backend — honest zeros
    expect(overview.disciplineSaved).toEqual({ rSaved: "0.0", settledCount: 0 }); // Phase-8 1dp
    expect(overview.hesitationCost).toEqual({ rCost: "0.0", settledCount: 0 }); // Phase-8 1dp
    expect(overview.ghostTrend).toHaveLength(30);
    expect(overview.ghostTrend.every((p) => p.fear === 0 && p.discipline === 0)).toBe(true);
  });
});

// ── query performance smoke (§68) ────────────────────────────────────────────

describe("query performance (§68)", () => {
  it("computes the full suite over a 300-trade journal within budget", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const perfInstrumentId = await resolveInstrumentId();
    const rows = Array.from({ length: 300 }, (_, i) => ({
      userId: user.userId,
      accountId: account.id,
      status: "CLOSED" as const,
      instrumentId: perfInstrumentId,
      direction: (i % 2 === 0 ? "BUY" : "SELL") as "BUY" | "SELL",
      source: "EXTERNAL_SYNC" as const,
      symbol: "EURUSD",
      currency: "USD",
      quantity: "1",
      closedQuantity: "1",
      entryPrice: "1.08500",
      exitPrice: "1.08700",
      entryAt: new Date(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T09:30:00.000Z`),
      exitAt: new Date(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`),
      exitReason: "TP",
      fees: "0",
      swap: "0",
      pnlGross: "200",
      pnlNet: "200",
      riskAmount: "100",
      rMultiple: "2",
      tradingDate: new Date(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    }));
    await prisma.trade.createMany({ data: rows });

    const startedAt = Date.now();
    const res = await getSuite(user.authHeader);
    const elapsed = Date.now() - startedAt;
    expect(res.statusCode).toBe(200);
    const suite = analyticsSuiteResponseSchema.parse(res.json());
    expect(suite.meta.closedTrades).toBe(300);
    expect(suite.monteCarlo.bands).toHaveLength(80); // capped band indices
    // Generous CI budget — the gate catches O(n²) blowups, not CI jitter.
    expect(elapsed).toBeLessThan(10_000);
  });
});
