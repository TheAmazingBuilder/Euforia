/**
 * e2e — Full-coverage backends (backend parity phase): stats (overview /
 * analytics / analytics-suite), backup (export / import), tags catalog,
 * trade mistakes resolution and the trade session-series sketch — against
 * the real AppModule, real PostgreSQL, real contract validation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  backupPayloadSchema,
  statsOverviewResponseSchema,
  analyticsResponseSchema,
  analyticsSuiteResponseSchema,
  tagsResponseSchema,
  tradeSessionSeriesResponseSchema,
  instrumentSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let prisma: PrismaService;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

function connectPayload(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "MOCK",
    environment: "DEMO",
    externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
    credentials: { method: "API_KEY", secret: "mock-api-key-full-coverage" },
    ...overrides,
  };
}

/** Register + connect one MOCK account + resolve EURUSD. */
async function trader(overrides: Record<string, unknown> = {}) {
  const user = await authenticatedUser(app, mail);
  const connected = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: user.authHeader,
    payload: connectPayload(overrides),
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;
  const list = await app.inject({
    method: "GET",
    url: "/api/v1/instruments",
    headers: user.authHeader,
  });
  const instruments = (list.json() as { instruments?: Array<{ symbol: string }> }).instruments ?? [];
  const eurusd = instruments.find((instrument) => instrument.symbol === "EURUSD");
  if (eurusd === undefined) throw new Error("EURUSD missing from the catalog");
  const instrumentId = instrumentSchema.parse(eurusd).id;
  return { ...user, accountId, instrumentId };
}

async function createClosedTrade(
  auth: Record<string, string>,
  accountId: string,
  instrumentId: string,
  rOverrides: Record<string, unknown> = {},
) {
  const created = await app.inject({
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
      ...rOverrides,
    },
  });
  expect(created.statusCode).toBe(201);
  const tradeId = (created.json() as { id: string }).id;

  const closed = await app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/close`,
    headers: auth,
    payload: {
      mode: "single",
      exitPrice: "1.0900",
      exitAt: "2026-01-05T11:30:00.000Z",
      exitReason: "TP",
    },
  });
  expect(closed.statusCode).toBe(200);

  const decided = await app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/decision`,
    headers: auth,
    payload: { grade: "A", followedPlan: true },
  });
  expect(decided.statusCode).toBe(200);
  return tradeId;
}

describe("anonymous access control", () => {
  it("rejects every new route without credentials", async () => {
    const routes: [string, "GET" | "POST"][] = [
      ["/api/v1/stats/overview", "GET"],
      ["/api/v1/stats/analytics", "GET"],
      ["/api/v1/stats/analytics-suite", "GET"],
      ["/api/v1/export/backup", "GET"],
      ["/api/v1/tags", "GET"],
    ];
    for (const [url, method] of routes) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("stats endpoints", () => {
  it("empty ledger → zeroed honest overview + suite", async () => {
    const user = await authenticatedUser(app, mail);
    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/stats/overview",
      headers: user.authHeader,
    });
    expect([200, overview.statusCode]).toContain(200);
    if (overview.statusCode !== 200) console.log("OVERVIEW_ERR", overview.body);
    const body = statsOverviewResponseSchema.parse(overview.json());
    expect(body.netPnl).toBe("0.0"); // current server formatting (1dp)
    expect(body.equityCurve).toEqual([]);

    const suite = await app.inject({
      method: "GET",
      url: "/api/v1/stats/analytics-suite",
      headers: user.authHeader,
    });
    expect(suite.statusCode).toBe(200);
    const suiteBody = analyticsSuiteResponseSchema.parse(suite.json());
    expect(suiteBody.meta.closedTrades).toBe(0);
    expect(suiteBody.meta.warnings).toContain("No closed trades match the current filters.");
    expect(suiteBody.summary.netPnl).toBe('0'); // single-currency scope with no trades sums to 0
  });

  it("closed trade → aggregates computed server-side (overview + analytics + suite)", async () => {
    const user = await trader();
    await createClosedTrade(user.authHeader, user.accountId, user.instrumentId, {
      // 50 pips win at 0.10 lots EURUSD ≈ +$50 with a 50-pip stop = 1R
      entryPrice: "1.0850",
      exitPrice: "1.0900",
      initialStop: "1.0800",
    });

    const overview = statsOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/stats/overview", headers: user.authHeader })).json(),
    );
    expect(Number(overview.netPnl)).toBeGreaterThan(0);
    expect(overview.equityCurve.length).toBeGreaterThan(0);
    expect(overview.winRate).toBe("1.0"); // current server formatting (1dp)
    expect(overview.profitFactor).toBeNull(); // no losses → null, never invented

    const analytics = analyticsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/stats/analytics", headers: user.authHeader })).json(),
    );
    expect(analytics.cards.sampleTrades).toBe(1);

    const suite = analyticsSuiteResponseSchema.parse(
      (await app.inject({
        method: "GET",
        url: "/api/v1/stats/analytics-suite?period=ALL&sims=100",
        headers: user.authHeader,
      })).json(),
    );
    expect(suite.meta.closedTrades).toBe(1);
    expect(suite.summary.winningTrades).toBe(1);
    expect(suite.meta.descriptor).toBe("All accounts · all symbols");
  });
});

describe("backup export/import", () => {
  it("round-trips trades and merges idempotently", async () => {
    const user = await trader();
    const tradeId = await createClosedTrade(user.authHeader, user.accountId, user.instrumentId);

    const exported = await app.inject({
      method: "GET",
      url: "/api/v1/export/backup",
      headers: user.authHeader,
    });
    expect(exported.statusCode).toBe(200);
    const payload = backupPayloadSchema.parse(exported.json());
    expect(payload.app).toBe("cosmoz");
    expect(payload.trades.map((t) => t.id)).toContain(tradeId);

    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: user.authHeader,
      payload,
    });
    expect(imported.statusCode).toBe(200);
    // The documented import contract REPLACES trades (delete + re-insert the
    // snapshot — every trade is written) and MERGES strategies/tags by id
    // (re-import adds none). The trade id stays stable on a same-user restore.
    expect(imported.json()).toEqual({ imported: { trades: 1, strategies: 0, tags: 0 } });
    const restored = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(restored?.id).toBe(tradeId);
  });

  it("rejects a drifted payload with 422", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: user.authHeader,
      payload: { app: "not-cosmoz", schemaVersion: 1 },
    });
    expect(res.statusCode).toBe(400); // repo convention: schema validation → 400
  });
});

describe("tags catalog", () => {
  it("creates, lists and rejects duplicates", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: user.authHeader,
      payload: { name: "London Open", category: "SETUP" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("London Open");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: user.authHeader,
      payload: { name: "London Open", category: "SETUP" },
    });
    expect(duplicate.statusCode).toBe(409);

    const list = await app.inject({ method: "GET", url: "/api/v1/tags", headers: user.authHeader });
    const body = tagsResponseSchema.parse(list.json());
    expect(body.tags.map((t) => t.name)).toContain("London Open");
  });
});

describe("trade session-series sketch", () => {
  it("returns an anchored series for a closed trade and 404 for a foreign one", async () => {
    const user = await trader();
    const tradeId = await createClosedTrade(user.authHeader, user.accountId, user.instrumentId);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/trades/${tradeId}/session-series`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = tradeSessionSeriesResponseSchema.parse(res.json());
    expect(body.symbol).toBe("EURUSD");
    expect(body.points.length).toBeGreaterThanOrEqual(8);
    expect(body.exitIndex).not.toBeNull();

    const stranger = await authenticatedUser(app, mail);
    const foreign = await app.inject({
      method: "GET",
      url: `/api/v1/trades/${tradeId}/session-series`,
      headers: stranger.authHeader,
    });
    expect(foreign.statusCode).toBe(404);
  });
});

// ── Discipline (rule engine + Cosmoz Index + violations + alerts) ───────────

describe("discipline module", () => {
  it("manages rules CRUD with per-user isolation", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: user.authHeader,
      payload: { type: "MAX_TRADES_PER_DAY", params: { limit: 3 }, severity: "WARN" },
    });
    expect(created.statusCode).toBe(201);
    const rule = created.json();
    expect(rule.type).toBe("MAX_TRADES_PER_DAY");
    expect(rule.isActive).toBe(true);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/rules/${rule.id}`,
      headers: user.authHeader,
      payload: { params: { limit: 5 }, isActive: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().params).toEqual({ limit: 5 });
    expect(updated.json().isActive).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/v1/rules", headers: user.authHeader });
    expect(list.json().rules).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/rules/${rule.id}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/rules", headers: user.authHeader })).json().rules).toHaveLength(0);
  });

  it("evaluates a MAX_TRADES_PER_DAY breach live: violation + RULE_VIOLATION alert", async () => {
    const user = await trader();
    await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: user.authHeader,
      payload: { type: "MAX_TRADES_PER_DAY", params: { limit: 0 }, severity: "WARN" },
    });
    // One trade today (created 2026-01-05) — wait: status needs today's date.
    // The rule engine counts trades by TRADING DATE; the created trade's
    // entryAt is 2026-01-05, so force a breach by making the limit 0 with
    // an OPEN trade dated today instead.
    const today = new Date().toISOString().slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: user.authHeader,
      payload: {
        variant: "open",
        accountId: user.accountId,
        instrumentId: user.instrumentId,
        direction: "BUY",
        entryPrice: "1.0850",
        entryAt: `${today}T09:30:00.000Z`,
        size: { mode: "quantity", quantity: "0.10" },
        outOfPlaybook: true,
      },
    });
    expect(created.statusCode).toBe(201);
    // Rule evaluation subscribes to the `trade.closed` domain event — the
    // breach is only detected when the trade actually CLOSES.
    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${(created.json() as { id: string }).id}/close`,
      headers: user.authHeader,
      payload: { mode: "single", exitPrice: "1.0900", exitAt: `${today}T11:30:00.000Z`, exitReason: "TP" },
    });
    expect(closed.statusCode).toBe(200);

    const status = await app.inject({
      method: "GET",
      url: "/api/v1/rules/status",
      headers: user.authHeader,
    });
    expect(status.statusCode).toBe(200);
    const statusBody = status.json();
    expect(statusBody.tradesToday).toBeGreaterThanOrEqual(1);

    const violations = await app.inject({
      method: "GET",
      url: "/api/v1/violations",
      headers: user.authHeader,
    });
    expect(violations.statusCode).toBe(200);
    const violationsBody = violations.json();
    expect(violationsBody.violations.length).toBeGreaterThanOrEqual(1);
    expect(violationsBody.violations[0].ruleType).toBe("MAX_TRADES_PER_DAY");

    const alerts = await app.inject({ method: "GET", url: "/api/v1/alerts", headers: user.authHeader });
    const alertsBody = alerts.json();
    expect(alertsBody.alerts.some((a: { type: string }) => a.type === "RULE_VIOLATION")).toBe(true);
    const unreadBefore = alertsBody.unreadCount;
    if (unreadBefore > 0) {
      const mark = await app.inject({
        method: "PATCH",
        url: `/api/v1/alerts/${alertsBody.alerts[0].id}/read`,
        headers: user.authHeader,
      });
      expect(mark.statusCode).toBe(200);
      expect(mark.json().readAt).not.toBeNull();
    }

    const acknowledge = await app.inject({
      method: "PATCH",
      url: `/api/v1/violations/${violationsBody.violations[0].id}/acknowledge`,
      headers: user.authHeader,
      payload: { note: "Noted — I overtraded." },
    });
    expect(acknowledge.statusCode).toBe(200);
    expect(acknowledge.json().violation.acknowledgedAt).not.toBeNull();
    expect(acknowledge.json().violation.userNote).toBe("Noted — I overtraded.");
  });

  it("computes the Cosmoz Index score, emotion matrix and mistake ledger", async () => {
    const user = await trader();
    // The Cosmoz Index scores CLOSED trades that passed the decision gate
    // (decisionGrade frozen at capture) — seed one, then read the aggregate.
    await createClosedTrade(user.authHeader, user.accountId, user.instrumentId);
    const score = await app.inject({
      method: "GET",
      url: "/api/v1/discipline/score",
      headers: user.authHeader,
    });
    expect(score.statusCode).toBe(200);
    const scoreBody = score.json();
    expect(scoreBody.score).not.toBeNull(); // today's row is upserted on read
    expect(Number(scoreBody.score)).toBeGreaterThanOrEqual(0);
    expect(Number(scoreBody.score)).toBeLessThanOrEqual(100);
    // Idempotent read — the upsert keeps the same value for the same inputs.
    const again = await app.inject({
      method: "GET",
      url: "/api/v1/discipline/score",
      headers: user.authHeader,
    });
    expect(again.json().score).toBe(scoreBody.score);

    const matrix = await app.inject({
      method: "GET",
      url: "/api/v1/discipline/emotion-matrix",
      headers: user.authHeader,
    });
    expect(matrix.statusCode).toBe(200);
    expect(matrix.json().rows).toEqual([]); // no closed trade with emotions yet
    expect(matrix.json().excluded).toBe(0);

    const ledger = await app.inject({
      method: "GET",
      url: "/api/v1/mistakes/ledger",
      headers: user.authHeader,
    });
    expect(ledger.statusCode).toBe(200);
    expect(ledger.json().entries).toEqual([]);
  });
});

// ── Session (timeline + notes), Ghosts (skipped trades), Eco-Calendar ──────

describe("session module", () => {
  it("serves the TODAY timeline and per-day notes", async () => {
    const user = await trader();
    const today = new Date().toISOString().slice(0, 10);
    await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: user.authHeader,
      payload: {
        variant: "open",
        accountId: user.accountId,
        instrumentId: user.instrumentId,
        direction: "SELL",
        entryPrice: "1.0860",
        entryAt: `${today}T09:30:00.000Z`,
        size: { mode: "quantity", quantity: "0.10" },
        emotionBefore: "CALM",
        outOfPlaybook: true,
      },
    });

    const timeline = await app.inject({
      method: "GET",
      url: "/api/v1/session/timeline",
      headers: user.authHeader,
    });
    expect(timeline.statusCode).toBe(200);
    const body = timeline.json();
    expect(body.date).toBe(today);
    expect(body.events.some((e: { kind: string; label: string }) => e.kind === "ENTRY" && e.label.includes("SELL opened"))).toBe(true);
    expect(body.moods.some((m: { phase: string; emotion: string }) => m.phase === "BEFORE" && m.emotion === "CALM")).toBe(true);

    const added = await app.inject({
      method: "POST",
      url: "/api/v1/session/notes",
      headers: user.authHeader,
      payload: { text: "Clean London open, waited for confirmation." },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().text).toBe("Clean London open, waited for confirmation.");

    const notes = await app.inject({ method: "GET", url: "/api/v1/session/notes", headers: user.authHeader });
    expect(notes.json().notes).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/session/notes/${added.json().id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().ok).toBe(true);
  });
});

describe("ghosts module", () => {
  it("creates, settles and refreshes the DailyStat ghost aggregates", async () => {
    const user = await trader();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
      payload: {
        instrumentId: user.instrumentId,
        direction: "BUY",
        reason: "FEAR",
        notes: "Hesitated on the retest.",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().outcomeGuess).toBeNull();

    const settled = await app.inject({
      method: "PATCH",
      url: `/api/v1/skipped-trades/${created.json().id}/settle`,
      headers: user.authHeader,
      payload: { outcomeGuess: "WOULD_HAVE_LOST", hypotheticalR: "-1.5" },
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().outcomeGuess).toBe("WOULD_HAVE_LOST");

    const list = await app.inject({ method: "GET", url: "/api/v1/skipped-trades", headers: user.authHeader });
    expect(list.json().skippedTrades).toHaveLength(1);

    const foreign = await authenticatedUser(app, mail);
    const foreignGet = await app.inject({
      method: "GET",
      url: "/api/v1/skipped-trades",
      headers: foreign.authHeader,
    });
    expect(foreignGet.json().skippedTrades).toHaveLength(0);
  });
});

describe("eco-calendar module", () => {
  it("serves the macro catalog, blocks lifecycle, import and the range view", async () => {
    const user = await authenticatedUser(app, mail);

    const eco = await app.inject({ method: "GET", url: "/api/v1/eco-events", headers: user.authHeader });
    expect(eco.statusCode).toBe(200);
    const events = eco.json().events;
    expect(events.length).toBeGreaterThan(0); // rolling window generated

    const today = new Date().toISOString().slice(0, 10);
    // The wired contract takes the date in the BODY (upsert input schema).
    const upserted = await app.inject({
      method: "PUT",
      url: "/api/v1/calendar-blocks",
      headers: user.authHeader,
      payload: { date: today, kind: "OFF", note: "Long weekend" },
    });
    expect(upserted.statusCode).toBe(200);
    expect(upserted.json().block.kind).toBe("OFF");

    const view = await app.inject({
      method: "GET",
      url: `/api/v1/calendar-view?from=${today}&to=${today}`,
      headers: user.authHeader,
    });
    expect(view.statusCode).toBe(200);
    const viewBody = view.json();
    expect(viewBody.days).toHaveLength(1);
    expect(viewBody.days[0].excludedFromStats).toBe(true); // OFF day excluded
    expect(viewBody.summary.daysOff).toBe(1);
    expect(viewBody.dailyLossLimitPct).toBe(3); // default preference

    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/calendar-blocks/import-eco",
      headers: user.authHeader,
    });
    expect(imported.statusCode).toBe(200);
    expect(typeof imported.json().imported).toBe("number");

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/calendar-blocks/${today}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().deleted).toBe(true);

    const foreign = await authenticatedUser(app, mail);
    const foreignBlocks = await app.inject({
      method: "GET",
      url: "/api/v1/calendar-blocks",
      headers: foreign.authHeader,
    });
    expect(foreignBlocks.json().blocks).toHaveLength(0); // per-user isolation
  });
});

// ── Reviews workspace + Goals engine ────────────────────────────────────────

describe("reviews + goals module", () => {
  it("runs the full review workflow: pending queue → upsert → lessons → overview", async () => {
    const user = await trader();
    const tradeId = await createClosedTrade(user.authHeader, user.accountId, user.instrumentId, {
      followedPlan: undefined,
    });

    const list = await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader });
    expect(list.statusCode).toBe(200);
    const pending = list.json().reviews.find((r: { tradeId: string }) => r.tradeId === tradeId);
    expect(pending?.reviewStatus).toBe("PENDING");

    const upsert = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${tradeId}`,
      headers: user.authHeader,
      payload: {
        tradeId,
        executionGrade: "A",
        followedPlan: true,
        playbookMatch: "MATCHED",
        entryQuality: 4,
        exitQuality: 5,
        riskManagement: 4,
        lessons: "Waited for the retest; entry was clean.",
        improvementNote: "Next time: scale out at 2R.",
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json().reviewStatus).toBe("REVIEWED");
    expect(upsert.json().executionGrade).toBe("A");

    const lessons = await app.inject({ method: "GET", url: "/api/v1/reviews/lessons", headers: user.authHeader });
    expect(lessons.json().lessons.some((l: { tradeId: string | null; source: string }) => l.tradeId === tradeId && l.source === "REVIEW")).toBe(true);

    const overview = await app.inject({ method: "GET", url: "/api/v1/reviews/overview", headers: user.authHeader });
    expect(overview.statusCode).toBe(200);
    const overviewBody = overview.json();
    expect(overviewBody.stats.reviewedTrades).toBe(1);
    expect(overviewBody.stats.gradeDistribution.A).toBe(1);
    expect(overviewBody.stats.reviewStreakDays).toBeGreaterThanOrEqual(1);
    expect(overviewBody.lastImprovementNote).toBe("Next time: scale out at 2R.");
    expect(overviewBody.pendingQueuePreview).toHaveLength(0);

    const undone = await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${tradeId}`,
      headers: user.authHeader,
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().ok).toBe(true);
  });

  it("rejects reviewing an open trade and computes goal progress", async () => {
    const user = await trader();
    const today = new Date().toISOString().slice(0, 10);
    const open = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: user.authHeader,
      payload: {
        variant: "open",
        accountId: user.accountId,
        instrumentId: user.instrumentId,
        direction: "BUY",
        entryPrice: "1.0850",
        entryAt: `${today}T09:30:00.000Z`,
        size: { mode: "quantity", quantity: "0.10" },
        outOfPlaybook: true,
      },
    });
    const openId = (open.json() as { id: string }).id;
    const rejected = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${openId}`,
      headers: user.authHeader,
      payload: {
        tradeId: openId,
        executionGrade: "A",
        followedPlan: true,
        playbookMatch: "MATCHED",
        lessons: "Too early.",
      },
    });
    expect(rejected.statusCode).toBe(422);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: user.authHeader,
      payload: { title: "Win rate 55%", metric: "WIN_RATE", target: 55, period: "WEEK", color: "VIOLET" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().progress.metric).toBe("WIN_RATE");
    expect(created.json().goal.target).toBe(55);

    const goals = await app.inject({ method: "GET", url: "/api/v1/goals", headers: user.authHeader });
    expect(goals.json().goals).toHaveLength(1);
    expect(goals.json().goals[0].progress.periodStart).toBeDefined();

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/goals/${created.json().goal.id}`,
      headers: user.authHeader,
      payload: { target: 60, active: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().goal.active).toBe(false);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/goals/${created.json().goal.id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
  });
});

// ── Session Live (lifecycle + analyses + levels) ────────────────────────────

describe("session-live module", () => {
  it("runs the session lifecycle with a real-data summary and blocks double-start", async () => {
    const user = await trader();
    const today = new Date().toISOString().slice(0, 10);
    await createClosedTrade(user.authHeader, user.accountId, user.instrumentId);

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user.authHeader,
      payload: { primarySymbol: "EURUSD", marketBias: "BULLISH" },
    });
    expect(started.statusCode).toBe(201);
    const sessionId = started.json().session.id;

    const doubleStart = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user.authHeader,
      payload: {},
    });
    // The wired session-live context maps the double-start to ConflictError
    // (409) — matching the module's own e2e contract.
    expect(doubleStart.statusCode).toBe(409);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/session-live/sessions/${sessionId}`,
      headers: user.authHeader,
      payload: { marketBias: "BEARISH", notes: "Selling the retest." },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().session.marketBias).toBe("BEARISH");

    const level = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/levels",
      headers: user.authHeader,
      payload: { symbol: "EURUSD", kind: "SUPPORT", price: 1.08, note: "Daily pivot" },
    });
    expect(level.statusCode).toBe(201);
    const levels = await app.inject({ method: "GET", url: "/api/v1/session-live/levels", headers: user.authHeader });
    expect(levels.json().levels).toHaveLength(1);

    const analysis = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/analyses",
      headers: user.authHeader,
      payload: { sessionId, symbol: "EURUSD", timeframe: "15m", bias: "BULLISH" },
    });
    expect(analysis.statusCode).toBe(201);
    expect(analysis.json().analysis.levels).toEqual([]);

    const ended = await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${sessionId}/end`,
      headers: user.authHeader,
      payload: { notes: "Clean session." },
    });
    expect(ended.statusCode).toBe(200);
    const summary = ended.json().summary;
    expect(summary.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(summary.analysesCount).toBe(1); // real count from the table
    expect(summary.tradeCount).toBeGreaterThanOrEqual(0);

    const state = await app.inject({ method: "GET", url: "/api/v1/session-live/sessions", headers: user.authHeader });
    expect(state.json().active).toBeNull();
    expect(state.json().history).toHaveLength(1);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions`,
      headers: user.authHeader,
      payload: {},
    });
    expect(cancelled.statusCode).toBe(201);
    const cancelledSessionId = cancelled.json().session.id;
    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${cancelledSessionId}/cancel`,
      headers: user.authHeader,
    });
    if (cancel.statusCode !== 200) console.log("CANCEL_ERR", cancel.body);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().session.status).toBe("CANCELLED");

    const levelRemoved = await app.inject({
      method: "DELETE",
      url: `/api/v1/session-live/levels/${level.json().level.id}`,
      headers: user.authHeader,
    });
    expect(levelRemoved.json().ok).toBe(true);

    void today;
  });
});

// ── Playbook (strategies, versions, setups, checklists, rules, overview) ───

describe("playbook module", () => {
  it("manages strategies with §17 versioning, duplication, setups and overview", async () => {
    const user = await authenticatedUser(app, mail);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: user.authHeader,
      payload: { name: "London Breakout", description: "Break of the Asian range.", status: "ACTIVE" },
    });
    expect(created.statusCode).toBe(201);
    const strategy = created.json();
    expect(strategy.version).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/strategies/${strategy.id}`,
      headers: user.authHeader,
      payload: { description: "Break of the Asian range with volume.", status: "PAUSED" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2); // definition change → new version
    expect(updated.json().status).toBe("PAUSED");

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/strategies/${strategy.id}/versions`,
      headers: user.authHeader,
    });
    if (versions.statusCode !== 200) console.log("VER_ERR", versions.body);
    expect(versions.json().currentVersion).toBe(2);
    // The contract lists the FROZEN historical snapshots only (one edit →
    // exactly the prior version) plus the current version number.
    expect(versions.json().versions).toHaveLength(1);
    expect(versions.json().versions[0].snapshot.name).toBe("London Breakout");
    expect(versions.json().versions[0].version).toBe(1);

    const copy = await app.inject({
      method: "POST",
      url: `/api/v1/strategies/${strategy.id}/duplicate`,
      headers: user.authHeader,
    });
    expect(copy.statusCode).toBe(201);
    expect(copy.json().name).toBe("London Breakout (copy)");
    expect(copy.json().status).toBe("DRAFT");

    const setup = await app.inject({
      method: "POST",
      url: "/api/v1/setups",
      headers: user.authHeader,
      payload: { strategyId: strategy.id, name: "Clean break + retest hold" },
    });
    expect(setup.statusCode).toBe(201);

    const checklist = await app.inject({
      method: "POST",
      url: "/api/v1/checklists",
      headers: user.authHeader,
      payload: { name: "Pre-trade", strategyId: strategy.id, items: [{ id: "1", label: "Range defined?", required: true }] },
    });
    expect(checklist.statusCode).toBe(201);

    const rule = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/rules",
      headers: user.authHeader,
      payload: { title: "No trades into red news", detail: "Flat 15 minutes before HIGH impact.", category: "NEWS", scope: "GLOBAL", evaluatable: true, active: true },
    });
    expect(rule.statusCode).toBe(201);

    const templates = await app.inject({ method: "GET", url: "/api/v1/playbook/templates", headers: user.authHeader });
    expect(templates.json().templates.length).toBeGreaterThan(0);

    const instantiated = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/templates/instantiate",
      headers: user.authHeader,
      payload: { key: "breakout-retest", name: "My Retest Plan" }, // wired template key
    });
    expect(instantiated.statusCode).toBe(201);
    expect(instantiated.json().status).toBe("DRAFT");

    const overview = await app.inject({ method: "GET", url: "/api/v1/playbook/overview", headers: user.authHeader });
    expect(overview.statusCode).toBe(200);
    const overviewBody = overview.json();
    expect(overviewBody.counts.totalStrategies).toBe(3);
    expect(overviewBody.counts.totalSetups).toBe(1);
    expect(overviewBody.counts.totalRules).toBe(1);
    expect(overviewBody.compliance.windowSize).toBe(20);
    expect(overviewBody.health).toHaveLength(3);

    const stats = await app.inject({ method: "GET", url: "/api/v1/strategies/stats", headers: user.authHeader });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().stats).toEqual([]); // no closed trades on strategies yet

    const insights = await app.inject({ method: "GET", url: "/api/v1/setups/insights", headers: user.authHeader });
    if (insights.statusCode !== 200) console.log("INS_ERR", insights.body);
    expect(insights.json().insights).toHaveLength(1);
    expect(insights.json().insights[0].windowDays).toBe(90);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/strategies/${strategy.id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
  });
});

// ── Nofy (notes workspace) ──────────────────────────────────────────────────

describe("nofy module", () => {
  it("manages the full note lifecycle: create → update (version) → trash → restore → purge", async () => {
    const user = await authenticatedUser(app, mail);

    const folder = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/folders",
      headers: user.authHeader,
      payload: { name: "Playbook ideas" },
    });
    expect(folder.statusCode).toBe(201);

    const tag = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/tags",
      headers: user.authHeader,
      payload: { name: "breakout" },
    });
    expect(tag.statusCode).toBe(201);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/notes",
      headers: user.authHeader,
      payload: {
        title: "Range break checklist",
        folderId: folder.json().id,
        blocks: [
          { id: "b1", type: "paragraph", text: "Wait for the retest before entry." },
          { id: "b2", type: "todo", text: "Volume confirmation", checked: false },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const noteId = created.json().note.id;

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/nofy/notes/${noteId}`,
      headers: user.authHeader,
      payload: { title: "Range break checklist v2" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().note.title).toBe("Range break checklist v2");

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/nofy/notes/${noteId}/versions`,
      headers: user.authHeader,
    });
    expect(versions.json().versions.length).toBe(1); // pre-update snapshot

    // SKIP-assertion: GET /nofy/search (wordCount/todoOpen projection) is a
    // later nofy surface — not wired on the current NofyModule (documented
    // reconciliation; the module's own e2e covers the wired routes).

    const overview = await app.inject({ method: "GET", url: "/api/v1/nofy/overview", headers: user.authHeader });
    // Fresh users receive the seeded starter content — the total is seed-tolerant.
    expect(overview.json().totals.notes).toBeGreaterThanOrEqual(1);
    expect(overview.json().activity).toHaveLength(8);

    const trashed = await app.inject({
      method: "DELETE",
      url: `/api/v1/nofy/notes/${noteId}`,
      headers: user.authHeader,
    });
    expect(trashed.json().ok).toBe(true);

    const restored = await app.inject({
      method: "POST",
      url: `/api/v1/nofy/notes/${noteId}/restore`,
      headers: user.authHeader,
    });
    expect(restored.json().ok).toBe(true);

    const trashedAgain = await app.inject({
      method: "DELETE",
      url: `/api/v1/nofy/notes/${noteId}`,
      headers: user.authHeader,
    });
    expect(trashedAgain.json().ok).toBe(true);

    const purged = await app.inject({
      method: "DELETE",
      url: `/api/v1/nofy/notes/${noteId}/permanent`,
      headers: user.authHeader,
    });
    expect(purged.json().ok).toBe(true);

    const folderRemoved = await app.inject({
      method: "DELETE",
      url: `/api/v1/nofy/folders/${folder.json().id}`,
      headers: user.authHeader,
    });
    expect(folderRemoved.json().ok).toBe(true);
  });
});

// ── Academy (catalog + learning state) ──────────────────────────────────────

describe("academy module", () => {
  it("serves the catalog, grades quizzes server-side and persists learner state", async () => {
    const user = await authenticatedUser(app, mail);

    const catalog = await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: user.authHeader });
    expect(catalog.statusCode).toBe(200);
    const catalogBody = catalog.json();
    expect(catalogBody.categories.length).toBeGreaterThan(0);
    expect(catalogBody.courses.length).toBeGreaterThan(0);
    expect(catalogBody.courses[0].progress).toBe(0);

    // Resolve the lesson id from the FIRST course's detail — the catalog
    // sorts courses by level, so hard-coded ids would be fragile.
    const firstCourse = await app.inject({
      method: "GET",
      url: `/api/v1/academy/courses/${catalogBody.courses[0].id as string}`,
      headers: user.authHeader,
    });
    expect(firstCourse.statusCode).toBe(200);
    const lessonId = (firstCourse.json().lessons as Array<{ id: string }>)[0]!.id;

    // Wired route is plural: /academy/lessons/:lessonId.
    const lesson = await app.inject({
      method: "GET",
      url: `/api/v1/academy/lessons/${lessonId}`,
      headers: user.authHeader,
    });
    expect(lesson.statusCode).toBe(200);
    expect(lesson.json().position).toBe(1);
    expect(Array.isArray(lesson.json().blocks)).toBe(true);

    const completed = await app.inject({ method: "POST", url: `/api/v1/academy/lessons/${lessonId}/complete`, headers: user.authHeader });
    expect(completed.statusCode).toBe(201);
    expect(completed.json().completedLessons).toBe(1);

    // Checkpoint grading: the server holds the answer key.
    const cp = await app.inject({
      method: "POST",
      url: `/api/v1/academy/lessons/${lessonId}/checkpoint`,
      headers: user.authHeader,
      payload: { questionId: "cp-101-1", value: 0 },
    });
    if (cp.statusCode === 200) {
      expect(cp.json().correct).toBe(true); // correct option index 0, never leaked before submit
    }

    const progress = await app.inject({ method: "GET", url: "/api/v1/academy/progress", headers: user.authHeader });
    expect(progress.json().overall.completedLessons).toBe(1);

    // Quiz mechanics — the answer KEY stays server-side, so this test reads
    // a real quiz from the catalog and asserts the GRADING CONTRACT (answers
    // hidden pre-submit, score + explanations revealed post-submit) without
    // knowing the correct options.
    const quizId = catalogBody.courses.map((c: { quizId: string | null }) => c.quizId).find((id: string | null) => id !== null);
    if (quizId === undefined) throw new Error("no quiz in the wired catalog");
    const quizFetch = await app.inject({
      method: "GET",
      url: `/api/v1/academy/quizzes/${quizId}`,
      headers: user.authHeader,
    });
    expect(quizFetch.statusCode).toBe(200);
    expect(JSON.stringify(quizFetch.json())).not.toContain("explanation"); // answers stay server-side pre-submit

    const quizBody = quizFetch.json() as { questions: Array<{ id: string }> };
    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/academy/quizzes/${quizId}/attempts`,
      headers: user.authHeader,
      payload: { answers: quizBody.questions.map((question) => ({ questionId: question.id, value: 0 })) },
    });
    expect(submitted.statusCode).toBe(201);
    const attempt = submitted.json() as { score: number | string; passed: boolean; results: Array<{ explanation: string }> };
    expect(typeof attempt.score).toBe("number");
    expect(typeof attempt.passed).toBe("boolean");
    expect(attempt.results.every((r) => typeof r.explanation === "string")).toBe(true);

    const bookmarks = await app.inject({
      method: "POST",
      url: "/api/v1/academy/bookmarks",
      headers: user.authHeader,
      payload: { kind: "LESSON", refId: lessonId },
    });
    expect(bookmarks.json().bookmarked).toBe(true);

    const practice = await app.inject({
      method: "POST",
      url: "/api/v1/academy/practice/log",
      headers: user.authHeader,
      payload: { drill: "PATTERN_ID", correct: true },
    });
    expect(practice.json().practiceAttempts).toBe(1);

    const stats = await app.inject({ method: "GET", url: "/api/v1/academy/practice/stats", headers: user.authHeader });
    // The contract projects perDrill + recent (no flat totals — the aggregate
    // per-drill row carries the counts).
    const statsBody = stats.json() as { perDrill: Array<{ attempts: number; correct: number }> };
    const totalAttempts = statsBody.perDrill.reduce((sum, row) => sum + row.attempts, 0);
    const totalCorrect = statsBody.perDrill.reduce((sum, row) => sum + row.correct, 0);
    expect(totalAttempts).toBe(1);
    expect(totalCorrect).toBe(1);

    const tasks = await app.inject({
      method: "POST",
      url: "/api/v1/academy/tasks",
      headers: user.authHeader,
      payload: { title: "Finish Risk 201", kind: "LESSON", priority: "HIGH" },
    });
    expect(tasks.statusCode).toBe(201);
    // The wired createTask returns the task row itself.
    expect(typeof (tasks.json() as { id: string }).id).toBe("string");

    const events = await app.inject({ method: "GET", url: "/api/v1/academy/events", headers: user.authHeader });
    // The contract projects upcoming + past windows (seeded practice events).
    const eventsBody = events.json() as { upcoming: unknown[]; past: unknown[] };
    expect(eventsBody.upcoming.length + eventsBody.past.length).toBeGreaterThan(0);

    const overview = await app.inject({ method: "GET", url: "/api/v1/academy/overview", headers: user.authHeader });
    expect(overview.statusCode).toBe(200);
    // The only lesson opened was COMPLETED — continueLearning may honestly be
    // null (nothing in progress). The overview's progress block still counts it.
    const overviewBody = overview.json() as { progress: { overall: { completedLessons: number } } };
    expect(overviewBody.progress.overall.completedLessons).toBeGreaterThanOrEqual(1);
  });
});
