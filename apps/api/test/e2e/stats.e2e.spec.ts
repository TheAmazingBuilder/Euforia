/**
 * e2e — Stats/Analytics (B1) over the REAL AppModule + real database:
 * the three read-only routes over an EMPTY journal (honest zeros/nulls)
 * and over a real closed trade (aggregates react to the journal). The
 * analytics-suite filter schema, warnings and Monte Carlo bands are
 * validated against the SHARED contract the frontend consumes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

function auth(user: { authHeader: Record<string, string> }) {
  return user.authHeader;
}

describe("stats module (B1)", () => {
  it("401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/stats/overview" });
    expect(res.statusCode).toBe(401);
  });

  it("empty journal serves honest zeros, nulls and 30-day trend bands", async () => {
    const user = await authenticatedUser(app, mail);
    const overview = (
      await app.inject({ method: "GET", url: "/api/v1/stats/overview", headers: auth(user) })
    ).json() as {
      currency: string;
      netPnl: string;
      winRate: string;
      profitFactor: string | null;
      disciplineScore: string | null;
      equityCurve: unknown[];
      dailyPnl: unknown[];
      equityPeak: string;
      maxDrawdownPct: string;
      deltas: Record<string, { value: string | null; direction: string }>;
      deltaWindowDays: number;
      sparklines: Record<string, string[]>;
      ghostTrend: Array<{ date: string; fear: number; discipline: number }>;
      weeklyCompare: { thisWeek: { days: unknown[] }; prevWeek: { days: unknown[] }; deltaPnlPct: string | null };
    };
    expect(overview.netPnl).toBe("0.0");
    expect(overview.winRate).toBe("0.0");
    expect(overview.profitFactor).toBeNull();
    expect(overview.disciplineScore).toBeNull();
    expect(overview.equityCurve).toEqual([]);
    expect(overview.ghostTrend).toHaveLength(30);
    expect(overview.weeklyCompare.thisWeek.days).toHaveLength(7);
    expect(overview.weeklyCompare.prevWeek.days).toHaveLength(7);
    expect(overview.deltaWindowDays).toBe(7);
    expect(Object.keys(overview.deltas)).toEqual(
      expect.arrayContaining(["netPnl", "winRate", "profitFactor", "expectancy", "disciplineScore"]),
    );

    const analytics = (
      await app.inject({ method: "GET", url: "/api/v1/stats/analytics", headers: auth(user) })
    ).json() as {
      cards: { sampleTrades: number; profitFactor: string | null };
      heatmap: Array<{ weekday: number; hourBucket: number }>;
      hourBuckets: unknown[];
      weekdayBuckets: unknown[];
      sessionBuckets: unknown[];
      mistakes: unknown[];
      strategyDistributions: unknown[];
      sleepScatter: unknown[];
    };
    expect(analytics.cards.sampleTrades).toBe(0);
    expect(analytics.heatmap).toHaveLength(42); // 7 weekdays × 6 hour buckets
    expect(analytics.hourBuckets).toHaveLength(6);
    expect(analytics.weekdayBuckets).toHaveLength(7);
    expect(analytics.sessionBuckets).toHaveLength(3);
    expect(analytics.mistakes).toEqual([]);
    expect(analytics.strategyDistributions).toEqual([]);
    expect(analytics.sleepScatter).toEqual([]); // no daily-stat storage yet — honest
  });

  it("analytics-suite on an empty dataset: meta, warnings and seeded Monte Carlo", async () => {
    const user = await authenticatedUser(app, mail);
    const suite = (
      await app.inject({ method: "GET", url: "/api/v1/stats/analytics-suite", headers: auth(user) })
    ).json() as {
      meta: { resolvedFrom: string; resolvedTo: string; closedTrades: number; openTradesExcluded: number; warnings: string[]; descriptor: string; singleCurrency: boolean };
      currency: string;
      summary: { trades: number; winRate: string | null; sharpeNote: string };
      monteCarlo: { simulations: number; bands: unknown[]; finalR: { p05: string; p50: string; p95: string }; methodology: string };
      risk: { maxConcurrentPositions: number; plannedVsRealized: Array<{ bucket: string }> };
      quality: { excursionAvailable: boolean; planFollowed: { followed: number; violated: number; unknown: number } };
      events: { calendarCoverage: { from: string | null; to: string | null } };
    };
    expect(suite.meta.closedTrades).toBe(0);
    expect(suite.meta.openTradesExcluded).toBe(0);
    expect(suite.meta.warnings).toContain("No closed trades match the current filters.");
    expect(suite.summary.trades).toBe(0);
    expect(suite.monteCarlo.simulations).toBe(400);
    expect(suite.monteCarlo.bands.length).toBe(0); // no trades → no path buckets
    expect(suite.risk.maxConcurrentPositions).toBe(0);
    expect(suite.risk.plannedVsRealized.some((row) => row.bucket === "No plan")).toBe(true);
    expect(suite.quality.excursionAvailable).toBe(false);
    expect(suite.events.calendarCoverage.from).not.toBeNull();

    // A deterministically seeded bootstrap is stable across calls.
    const again = (
      await app.inject({ method: "GET", url: "/api/v1/stats/analytics-suite", headers: auth(user) })
    ).json() as { monteCarlo: { finalR: { p50: string } } };
    expect(again.monteCarlo.finalR.p50).toBe(suite.monteCarlo.finalR.p50);

    // Invalid filter value → 400 (the shared schema is the single truth).
    const badPeriod = await app.inject({
      method: "GET",
      url: "/api/v1/stats/analytics-suite?period=NEVER",
      headers: auth(user),
    });
    expect(badPeriod.statusCode).toBe(400);
    const badSims = await app.inject({
      method: "GET",
      url: "/api/v1/stats/analytics-suite?sims=abc",
      headers: auth(user),
    });
    expect(badSims.statusCode).toBe(400);
  });

  it("a real closed trade flows through overview, analytics and the suite", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: auth(user),
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
        credentials: { method: "API_KEY", secret: "mock-api-key-stats" },
      },
    });
    const accountId = (connected.json() as { account: { id: string } }).account.id;
    const instruments = (
      await app.inject({ method: "GET", url: "/api/v1/instruments", headers: auth(user) })
    ).json() as { instruments: Array<{ id: string; symbol: string }> };
    const instrument = instruments.instruments.find((i) => i.symbol === "EURUSD")!;

    // Long 0.10 @1.0850, stop 1.0800, exit @1.0900 (TP) → +50 net, +1R.
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: auth(user),
      payload: {
        variant: "closed",
        accountId,
        instrumentId: instrument.id,
        direction: "BUY",
        entryPrice: "1.0850",
        entryAt: "2026-01-05T09:30:00.000Z",
        size: { mode: "quantity", quantity: "0.10" },
        initialStop: "1.0800",
        outOfPlaybook: true,
        exitPrice: "1.0900",
        exitAt: "2026-01-05T11:00:00.000Z",
        exitReason: "TP",
      },
    });
    expect(created.statusCode).toBe(201);

    const overview = (
      await app.inject({ method: "GET", url: "/api/v1/stats/overview", headers: auth(user) })
    ).json() as {
      netPnl: string;
      winRate: string;
      equityCurve: Array<{ date: string; equity: string }>;
      dailyPnl: Array<{ date: string; pnlNet: string; tradesCount: number }>;
      equityPeak: string;
      maxDrawdownPct: string;
      weeklyCompare: { deltaPnlPct: string | null };
    };
    expect(Number(overview.netPnl)).toBeCloseTo(50, 1);
    expect(overview.winRate).toBe("1.0"); // 1/1 win → ratio 1
    expect(overview.equityCurve).toHaveLength(1);
    expect(overview.equityCurve[0]!.date).toBe("2026-01-05");
    expect(Number(overview.equityCurve[0]!.equity)).toBeGreaterThan(0);
    expect(overview.dailyPnl[0]!.tradesCount).toBe(1);
    expect(Number(overview.maxDrawdownPct)).toBeLessThanOrEqual(0);

    const analytics = (
      await app.inject({ method: "GET", url: "/api/v1/stats/analytics", headers: auth(user) })
    ).json() as {
      cards: { sampleTrades: number; winRate: string; maxDrawdownR: string };
      heatmap: Array<{ trades: number }>;
      sessionBuckets: Array<{ key: string; trades: number }>;
    };
    expect(analytics.cards.sampleTrades).toBe(1);
    expect(analytics.heatmap.reduce((sum, cell) => sum + cell.trades, 0)).toBe(1);
    expect(analytics.sessionBuckets.find((b) => b.key === "LONDON")!.trades).toBe(1); // 09:30 UTC

    const suite = (
      await app.inject({
        method: "GET",
        url: "/api/v1/stats/analytics-suite?period=ALL",
        headers: auth(user),
      })
    ).json() as {
      meta: { closedTrades: number; resolvedFrom: string };
      summary: { trades: number; winRate: string; expectancyR: string; maxDrawdownR: string };
      monteCarlo: { simulations: number; bands: Array<{ index: number; p50: string }>; finalR: { p50: string } };
      cumulativeR: Array<{ index: number; cumR: string }>;
    };
    expect(suite.meta.closedTrades).toBe(1);
    expect(suite.summary.trades).toBe(1);
    expect(suite.summary.winRate).toBe("1.0");
    expect(suite.summary.expectancyR).toBe("1.0"); // +1R on the only trade
    expect(suite.monteCarlo.simulations).toBe(400);
    expect(suite.monteCarlo.bands.length).toBe(1); // one trade → one path bucket
    expect(suite.cumulativeR[0]!.cumR).toBe("1.0");

    // The filter system narrows the dataset: a non-matching emotion empties it.
    const filtered = (
      await app.inject({
        method: "GET",
        url: "/api/v1/stats/analytics-suite?period=ALL&emotion=CALM",
        headers: auth(user),
      })
    ).json() as { meta: { closedTrades: number }; summary: { trades: number } };
    expect(filtered.meta.closedTrades).toBe(0);
    expect(filtered.summary.trades).toBe(0);
  });
});
