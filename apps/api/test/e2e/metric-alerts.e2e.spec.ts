/**
 * e2e — Metric alert rules (Dashboard Customization Phase 07) over the REAL
 * AppModule + real database: rule CRUD + validation + ownership, the
 * deterministic evaluation engine (transitions, duplicate suppression,
 * scopes, NO_DATA), goal integration (the authoritative goal engine), event
 * history + read/dismiss delivery state, and the `trade.closed` trigger.
 * Responses validated against the SHARED contracts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

// Post-write evaluation debounce — short but non-zero so the e2e exercises
// the real debounced path (default is 1000ms).
process.env.METRIC_ALERTS_DEBOUNCE_MS = "200";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Register a user, connect one MOCK account, return ids + auth. */
async function userWithAccount() {
  const user = await authenticatedUser(app, mail);
  const connected = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: user.authHeader,
    payload: {
      providerId: "MOCK",
      environment: "DEMO",
      externalAccountId: `88${Math.random().toString(36).slice(2, 8)}`,
      credentials: { method: "API_KEY", secret: "mock-api-key-metric-alerts" },
    },
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;

  const list = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader });
  const instrument = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
    .instruments.find((i) => i.symbol === "EURUSD")!;
  return { ...user, accountId, instrumentId: instrument.id };
}

/** Capture → close a BUY trade TODAY. Profit by default (TP). The close
 * response hides stored results (decision-gate §13) — the alert payload
 * carries the observed value instead. */
async function closedTrade(
  user: { authHeader: Record<string, string>; accountId: string; instrumentId: string },
  overrides: Record<string, unknown> = {},
): Promise<{ tradeId: string }> {
  const entryAt = new Date(Date.now() - 60 * 60_000).toISOString();
  const exitAt = new Date(Date.now() - 30 * 60_000).toISOString();
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
      entryAt,
      size: { mode: "quantity", quantity: "0.10" },
      initialStop: "1.0800",
      outOfPlaybook: true,
      ...overrides,
    },
  });
  expect(created.statusCode).toBe(201);
  const tradeId = (created.json() as { id: string }).id;
  const closed = await app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/close`,
    headers: user.authHeader,
    payload: {
      mode: "single",
      exitPrice: "1.0900",
      exitAt,
      exitReason: "TP",
      ...(overrides.close ?? {}),
    },
  });
  expect(closed.statusCode).toBe(200);
  return { tradeId };
}

type ThresholdInput = {
  kind: "THRESHOLD";
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  period: string;
  accountId?: string | null;
  strategyId?: string | null;
  enabled?: boolean;
  cooldownMinutes?: number;
};

function thresholdInput(overrides: Partial<ThresholdInput> = {}): ThresholdInput {
  return {
    kind: "THRESHOLD",
    name: "Monthly profit target",
    metric: "NET_PNL",
    condition: "GREATER_THAN_OR_EQUAL",
    threshold: 10,
    period: "THIS_MONTH",
    ...overrides,
  };
}

async function createRule(
  user: { authHeader: Record<string, string> },
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/alert-rules",
    headers: user.authHeader,
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function listAlerts(user: { authHeader: Record<string, string> }) {
  const res = await app.inject({ method: "GET", url: "/api/v1/alerts", headers: user.authHeader });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    alerts: Array<{
      id: string;
      type: string;
      severity: string;
      title: string;
      message: string;
      payload: Record<string, unknown> | null;
      readAt: string | null;
      dismissedAt: string | null;
      createdAt: string;
    }>;
    unreadCount: number;
  };
}

// ── CRUD + validation + ownership ─────────────────────────────────────────────

describe("alert rule CRUD, validation and authorization", () => {
  it("rejects unauthenticated access", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/alert-rules" });
    expect(res.statusCode).toBe(401);
  });

  it("creates, lists, updates, disables and deletes a rule", async () => {
    const user = await userWithAccount();
    const created = await createRule(user, thresholdInput());
    expect(created.statusCode).toBe(201);
    const rule = created.body as unknown as {
      id: string;
      kind: string;
      enabled: boolean;
      cooldownMinutes: number;
      state: { lastConditionMet: string | null; triggerCount: number; lastObservation: string };
    };
    expect(rule.kind).toBe("THRESHOLD");
    expect(rule.enabled).toBe(true);
    expect(rule.cooldownMinutes).toBe(0);
    expect(rule.state.lastConditionMet).toBeNull();
    expect(rule.state.triggerCount).toBe(0);

    const listed = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: user.authHeader });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { rules: unknown[] }).rules).toHaveLength(1);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/alert-rules/${rule.id}`,
      headers: user.authHeader,
      payload: { name: "Renamed rule", enabled: false, cooldownMinutes: 30 },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = patched.json() as { name: string; enabled: boolean; cooldownMinutes: number };
    expect(patchedBody.name).toBe("Renamed rule");
    expect(patchedBody.enabled).toBe(false);
    expect(patchedBody.cooldownMinutes).toBe(30);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/alert-rules/${rule.id}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(200);
    const empty = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: user.authHeader });
    expect((empty.json() as { rules: unknown[] }).rules).toHaveLength(0);
  });

  it("rejects exact duplicates with 409 but allows an escalation ladder", async () => {
    const user = await userWithAccount();
    const first = await createRule(user, thresholdInput());
    expect(first.statusCode).toBe(201);
    const duplicate = await createRule(user, thresholdInput());
    expect(duplicate.statusCode).toBe(409);
    // Near duplicate (different threshold) — a deliberate ladder, allowed.
    const ladder = await createRule(user, thresholdInput({ threshold: 100 }));
    expect(ladder.statusCode).toBe(201);
  });

  it("rejects invalid metrics, periods, conditions and unit mismatches (400)", async () => {
    const user = await userWithAccount();
    expect(
      (await createRule(user, thresholdInput({ metric: "SHARPE_RATIO" }))).statusCode,
    ).toBe(400);
    expect((await createRule(user, thresholdInput({ period: "FOREVER" }))).statusCode).toBe(400);
    expect(
      (await createRule(user, thresholdInput({ metric: "WIN_RATE", condition: "EQUAL", threshold: 50 }))).statusCode,
    ).toBe(400); // EQUAL is only meaningful for counts (semantic check)
    // A percentage threshold out of 0..100 — currency/percent unit discipline.
    expect(
      (await createRule(user, thresholdInput({ metric: "WIN_RATE", threshold: 150 }))).statusCode,
    ).toBe(400);
    expect(
      (await createRule(user, thresholdInput({ metric: "WIN_RATE", threshold: -5 }))).statusCode,
    ).toBe(400);
    expect(
      (await createRule(user, thresholdInput({ metric: "TRADE_COUNT", threshold: 1.5 }))).statusCode,
    ).toBe(400);
    expect((await createRule(user, thresholdInput({ threshold: Number.NaN }))).statusCode).toBe(400);
    expect(
      (await createRule(user, thresholdInput({ name: "" }))).statusCode,
    ).toBe(400);
  });

  it("rejects account, strategy and goal references outside the owner's scope (404)", async () => {
    const [userA, userB] = [await userWithAccount(), await userWithAccount()];
    expect(
      (await createRule(userA, thresholdInput({ accountId: userB.accountId }))).statusCode,
    ).toBe(404);

    const strategy = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/strategies",
      headers: userB.authHeader,
      payload: { name: "B strategy", description: "", entryRules: [], exitRules: [], riskRules: [] },
    });
    const strategyId =
      strategy.statusCode === 201
        ? (strategy.json() as { id: string }).id
        : null;
    if (strategyId !== null) {
      expect(
        (await createRule(userA, thresholdInput({ strategyId }))).statusCode,
      ).toBe(404);
    }
    // "none" (out-of-playbook) IS a valid scope.
    expect(
      (await createRule(userA, thresholdInput({ strategyId: "none" }))).statusCode,
    ).toBe(201);

    // Goal ownership.
    const goalRes = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: userB.authHeader,
      payload: { title: "B goal", metric: "WIN_RATE", target: 10, period: "MONTH", color: "CYAN" },
    });
    expect(goalRes.statusCode).toBe(201);
    const goalId = (goalRes.json() as { goal: { id: string } }).goal.id;
    expect(
      (
        await createRule(userA, {
          kind: "GOAL",
          name: "B goal alert",
          goalId,
          goalCondition: "ACHIEVED",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("enforces per-user isolation on every rule route (IDOR → 404)", async () => {
    const [userA, userB] = [await userWithAccount(), await userWithAccount()];
    const created = await createRule(userA, thresholdInput());
    expect(created.statusCode).toBe(201);
    const ruleId = (created.body as unknown as { id: string }).id;

    expect(
      (await app.inject({ method: "GET", url: `/api/v1/alert-rules/${ruleId}/events`, headers: userB.authHeader })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/alert-rules/${ruleId}`,
          headers: userB.authHeader,
          payload: { name: "hijacked" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/v1/alert-rules/${ruleId}`, headers: userB.authHeader })).statusCode,
    ).toBe(404);

    // userB's evaluation must not touch userA's rules either.
    const evalB = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: userB.authHeader,
    });
    expect(evalB.statusCode).toBe(200);
    expect(evalB.json() as { evaluatedRules: number }).toEqual({
      evaluatedRules: 0,
      triggeredEvents: 0,
      skippedNoData: 0,
      failedScopes: 0,
      evaluatedAt: expect.any(String),
    });

    // userA's rule list still shows exactly their own rule.
    const listA = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: userA.authHeader });
    expect((listA.json() as { rules: Array<{ id: string }> }).rules.map((r) => r.id)).toEqual([ruleId]);
  });
});

// ── Evaluation engine ─────────────────────────────────────────────────────────

describe("threshold evaluation — transitions, dedup, scopes", () => {
  it("fires once, never duplicates, and records the frozen payload", async () => {
    const user = await userWithAccount();
    const win1 = await closedTrade(user);
    const win2 = await closedTrade(user);
    expect(win1.tradeId).not.toBe(win2.tradeId);

    const created = await createRule(user, thresholdInput({ threshold: 10 }));
    expect(created.statusCode).toBe(201);
    const ruleId = (created.body as unknown as { id: string }).id;

    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect(evaluate.statusCode).toBe(200);
    const first = evaluate.json() as {
      evaluatedRules: number;
      triggeredEvents: number;
      skippedNoData: number;
      failedScopes: number;
    };
    expect(first).toMatchObject({ evaluatedRules: 1, triggeredEvents: 1, failedScopes: 0 });

    const inbox = await listAlerts(user);
    const events = inbox.alerts.filter((alert) => alert.type === "METRIC_THRESHOLD");
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.severity).toBe("NOTIFY");
    expect(event.readAt).toBeNull();
    const payload = event.payload as Record<string, unknown>;
    expect(payload.ruleId).toBe(ruleId);
    expect(payload.metric).toBe("NET_PNL");
    expect(payload.threshold).toBe(10);
    expect(typeof payload.observedValue).toBe("number");
    expect((payload.observedValue as number)).toBeGreaterThan(0);
    expect(payload.period).toBe("THIS_MONTH");
    expect(payload.evaluationKey).toBe("t1");

    // Repeated evaluation — the condition stays true → NO duplicate event.
    const again = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((again.json() as { triggeredEvents: number }).triggeredEvents).toBe(0);
    const inbox2 = await listAlerts(user);
    expect(inbox2.alerts.filter((a) => a.type === "METRIC_THRESHOLD")).toHaveLength(1);

    // Drop below → then recover: a genuine false→true fires again with t2.
    await app.inject({
      method: "PATCH",
      url: `/api/v1/alert-rules/${ruleId}`,
      headers: user.authHeader,
      payload: { threshold: 100_000_000 }, // certainly above two demo winners
    });
    const drop = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((drop.json() as { triggeredEvents: number }).triggeredEvents).toBe(0);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/alert-rules/${ruleId}`,
      headers: user.authHeader,
      payload: { threshold: 10 },
    });
    const recover = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((recover.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
    const inbox3 = await listAlerts(user);
    const events3 = inbox3.alerts.filter((a) => a.type === "METRIC_THRESHOLD");
    expect(events3).toHaveLength(2);
    expect((events3[0]!.payload as Record<string, unknown>).evaluationKey).toBe("t2");
  });

  it("does not evaluate disabled rules and freezes their state", async () => {
    const user = await userWithAccount();
    await closedTrade(user);
    const created = await createRule(user, thresholdInput({ enabled: false }));
    const ruleId = (created.body as unknown as { id: string }).id;

    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect(evaluate.json() as { evaluatedRules: number }).toMatchObject({ evaluatedRules: 0 });
    const inbox = await listAlerts(user);
    expect(inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD")).toHaveLength(0);

    const listed = await app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: user.authHeader });
    const rule = (listed.json() as { rules: Array<{ id: string; state: { triggerCount: number; lastEvaluationAt: string | null } }> }).rules.find((r) => r.id === ruleId)!;
    expect(rule.state.triggerCount).toBe(0);
    expect(rule.state.lastEvaluationAt).toBeNull();
  });

  it("scopes evaluations by account and reports empty samples as NO_DATA", async () => {
    const user = await userWithAccount();
    await closedTrade(user); // trades live on the FIRST account

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: user.authHeader,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId: `99${Math.random().toString(36).slice(2, 8)}`,
        credentials: { method: "API_KEY", secret: "mock-api-key-metric-alerts-2" },
      },
    });
    expect(second.statusCode).toBe(201);
    const accountB = (second.json() as { account: { id: string } }).account.id;

    // Trade-count ≥ 1 scoped to account B: 0 closed trades there → false.
    const scopedB = await createRule(
      user,
      thresholdInput({ name: "B activity", metric: "TRADE_COUNT", condition: "GREATER_THAN_OR_EQUAL", threshold: 1, accountId: accountB }),
    );
    expect(scopedB.statusCode).toBe(201);
    // Same rule scoped to ALL accounts → the condition is met.
    const allAccounts = await createRule(
      user,
      thresholdInput({ name: "Any activity", metric: "TRADE_COUNT", condition: "GREATER_THAN_OR_EQUAL", threshold: 1 }),
    );
    expect(allAccounts.statusCode).toBe(201);
    // WIN_RATE on the empty account B sample → NO_DATA (never a fake rate).
    const emptyRate = await createRule(
      user,
      thresholdInput({ name: "B win rate", metric: "WIN_RATE", condition: "GREATER_THAN_OR_EQUAL", threshold: 50, accountId: accountB }),
    );
    expect(emptyRate.statusCode).toBe(201);

    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    const result = evaluate.json() as {
      evaluatedRules: number;
      triggeredEvents: number;
      skippedNoData: number;
    };
    expect(result.evaluatedRules).toBe(3);
    expect(result.triggeredEvents).toBe(1); // only the all-accounts count rule
    expect(result.skippedNoData).toBe(1); // the empty-sample win rate

    const inbox = await listAlerts(user);
    const events = inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD");
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as Record<string, unknown>).ruleId).toBe(
      (allAccounts.body as unknown as { id: string }).id,
    );
  });

  it("respects strategy scope 'none' (out-of-playbook trades)", async () => {
    const user = await userWithAccount();
    await closedTrade(user); // outOfPlaybook: true → strategyId null
    const created = await createRule(
      user,
      thresholdInput({ name: "Out of playbook count", metric: "TRADE_COUNT", condition: "GREATER_THAN_OR_EQUAL", threshold: 1, strategyId: "none" }),
    );
    expect(created.statusCode).toBe(201);
    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((evaluate.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
  });
});

// ── Goal integration (the authoritative goal engine) ─────────────────────────

describe("goal-rule integration", () => {
  it("fires ACHIEVED from real goal progress and handles a deleted goal safely", async () => {
    const user = await userWithAccount();
    await closedTrade(user); // one winner → WIN_RATE 100% for MONTH

    const goalRes = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: user.authHeader,
      payload: { title: "Keep win rate", metric: "WIN_RATE", target: 10, period: "MONTH", color: "CYAN" },
    });
    expect(goalRes.statusCode).toBe(201);
    const goalId = (goalRes.json() as { goal: { id: string } }).goal.id;

    const created = await createRule(user, {
      kind: "GOAL",
      name: "Win rate goal alert",
      goalId,
      goalCondition: "ACHIEVED",
    });
    expect(created.statusCode).toBe(201);

    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((evaluate.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
    const inbox = await listAlerts(user);
    const events = inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD");
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toContain("Goal achieved");
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload.goalId).toBe(goalId);
    expect(payload.goalCondition).toBe("ACHIEVED");

    // Deleting the goal degrades the rule to NO_DATA — no crash, no fake event.
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/goals/${goalId}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(200);
    const reEval = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    const reResult = reEval.json() as { evaluatedRules: number; skippedNoData: number; triggeredEvents: number };
    expect(reResult).toMatchObject({ evaluatedRules: 1, skippedNoData: 1, triggeredEvents: 0 });
  });

  it("fires PROGRESS_BELOW when progress slips under the configured percent", async () => {
    const user = await userWithAccount();
    // The goal engine marks an EMPTY sample PENDING (progressPct null) —
    // the alert rule honestly degrades that to NO_DATA instead of faking a
    // "slipped" status (spec §10: never fabricate goal status). Progress
    // exists as soon as the period has one closed trade.
    await closedTrade(user);
    const goalRes = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: user.authHeader,
      payload: { title: "Huge R month", metric: "R_EARNED", target: 1000000, period: "MONTH", color: "VIOLET" },
    });
    expect(goalRes.statusCode).toBe(201);
    const goalId = (goalRes.json() as { goal: { id: string } }).goal.id;
    const created = await createRule(user, {
      kind: "GOAL",
      name: "R goal off pace",
      goalId,
      goalCondition: "PROGRESS_BELOW",
      thresholdPct: 50,
    });
    expect(created.statusCode).toBe(201);
    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((evaluate.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
    const inbox = await listAlerts(user);
    const events = inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD");
    expect(events[0]!.title).toContain("off pace");
    expect((events[0]!.payload as Record<string, unknown>).goalCondition).toBe("PROGRESS_BELOW");
  });
});

// ── Delivery state + event history ────────────────────────────────────────────

describe("event history, read and dismiss", () => {
  async function ruleWithEvent() {
    const user = await userWithAccount();
    await closedTrade(user);
    const created = await createRule(user, thresholdInput({ threshold: 1 }));
    const ruleId = (created.body as unknown as { id: string }).id;
    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect((evaluate.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
    return { user, ruleId };
  }

  it("lists a rule's events scoped to that rule (newest first)", async () => {
    const { user, ruleId } = await ruleWithEvent();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/alert-rules/${ruleId}/events`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ id: string; type: string; payload: Record<string, unknown> }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.type).toBe("METRIC_THRESHOLD");
    expect(body.events[0]!.payload.ruleId).toBe(ruleId);
  });

  it("marks read, dismisses without deleting, and keeps the audit history", async () => {
    const { user, ruleId } = await ruleWithEvent();
    const inbox = await listAlerts(user);
    const event = inbox.alerts.find((a) => a.type === "METRIC_THRESHOLD")!;
    expect(inbox.unreadCount).toBeGreaterThan(0);

    // Read.
    const read = await app.inject({
      method: "PATCH",
      url: `/api/v1/alerts/${event.id}/read`,
      headers: user.authHeader,
    });
    expect(read.statusCode).toBe(200);
    expect((read.json() as { readAt: string | null }).readAt).not.toBeNull();

    // Dismiss — the row SURVIVES with dismissedAt set (audit history).
    const dismiss = await app.inject({
      method: "PATCH",
      url: `/api/v1/alerts/${event.id}/dismiss`,
      headers: user.authHeader,
    });
    expect(dismiss.statusCode).toBe(200);
    expect((dismiss.json() as { dismissedAt: string | null }).dismissedAt).not.toBeNull();

    const after = await listAlerts(user);
    const stillThere = after.alerts.find((a) => a.id === event.id);
    expect(stillThere).toBeDefined();
    expect(stillThere!.dismissedAt).not.toBeNull();
    expect(after.unreadCount).toBe(0);

    // Rule events endpoint still returns the dismissed event (history).
    const ruleEvents = await app.inject({
      method: "GET",
      url: `/api/v1/alert-rules/${ruleId}/events`,
      headers: user.authHeader,
    });
    expect((ruleEvents.json() as { events: unknown[] }).events).toHaveLength(1);
  });

  it("keeps events reachable after rule deletion (frozen payload)", async () => {
    const { user, ruleId } = await ruleWithEvent();
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/alert-rules/${ruleId}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(200);
    // The rule endpoint is gone…
    const gone = await app.inject({
      method: "GET",
      url: `/api/v1/alert-rules/${ruleId}/events`,
      headers: user.authHeader,
    });
    expect(gone.statusCode).toBe(404);
    // …but the inbox history persists with the frozen rule context.
    const inbox = await listAlerts(user);
    const events = inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD");
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload.ruleId).toBe(ruleId);
    expect(payload.ruleName).toBe("Monthly profit target");
    expect(payload.metric).toBe("NET_PNL");
  });

  it("rejects cross-user dismiss (IDOR → 404)", async () => {
    const { user } = await ruleWithEvent();
    const stranger = await userWithAccount();
    const inbox = await listAlerts(user);
    const event = inbox.alerts.find((a) => a.type === "METRIC_THRESHOLD")!;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/alerts/${event.id}/dismiss`,
      headers: stranger.authHeader,
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Triggers + decoupling ─────────────────────────────────────────────────────

describe("evaluation triggers and workspace decoupling", () => {
  it("evaluates automatically after a closed-trade write (debounced)", async () => {
    const user = await userWithAccount();
    const created = await createRule(user, thresholdInput({ threshold: 1 }));
    expect(created.statusCode).toBe(201);

    // No manual evaluate — the trade.closed domain event drives it.
    await closedTrade(user);
    const deadline = Date.now() + 8_000;
    let seen = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const inbox = await listAlerts(user);
      seen = inbox.alerts.filter((a) => a.type === "METRIC_THRESHOLD").length;
      if (seen > 0) break;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("keeps rules valid across dashboard preference changes (no layout coupling)", async () => {
    const user = await userWithAccount();
    await closedTrade(user);
    const created = await createRule(user, thresholdInput({ threshold: 1 }));
    expect(created.statusCode).toBe(201);

    // Exercise the preferences API the workspaces/layouts use — rules are
    // NOT coupled to layouts, so a dashboard-domain PATCH must not disturb
    // them.
    const prefs = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
      headers: user.authHeader,
    });
    expect(prefs.statusCode).toBe(200);
    const dashboard = (prefs.json() as { dashboard: Record<string, unknown> }).dashboard;
    const patched = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences/dashboard",
      headers: user.authHeader,
      payload: dashboard,
    });
    expect(patched.statusCode).toBe(200);

    const evaluate = await app.inject({
      method: "POST",
      url: "/api/v1/alert-rules/evaluate",
      headers: user.authHeader,
    });
    expect(evaluate.statusCode).toBe(200);
    expect((evaluate.json() as { triggeredEvents: number }).triggeredEvents).toBe(1);
  });
});
