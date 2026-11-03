/**
 * e2e - Discipline Engine (B4, Domaine 7) over the REAL AppModule + real
 * database: rules CRUD, the `trade.closed` evaluation pipeline (violation
 * + alert with the context frozen at time T), the violation log join,
 * acknowledge, aggregates (score, emotion matrix, mistakes ledger) and the
 * alert inbox. Responses validated against the SHARED contracts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  disciplineScoreResponseSchema,
  rulesResponseSchema,
  rulesStatusResponseSchema,
  violationsResponseSchema,
} from "../../src/shared/contracts";
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
      externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
      credentials: { method: "API_KEY", secret: "mock-api-key-discipline" },
    },
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;

  const list = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader });
  const instrument = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
    .instruments.find((i) => i.symbol === "EURUSD")!;
  return { ...user, accountId, instrumentId: instrument.id };
}

/** Capture → close a BUY trade TODAY (recent timestamps), exercising the
 * full close pipeline. Loss by default (SL) so loss-counting rules fire. */
async function capturedClosedTrade(
  user: { authHeader: Record<string, string>; accountId: string; instrumentId: string },
  overrides: Record<string, unknown> = {},
) {
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
    payload: { mode: "single", exitPrice: "1.0800", exitAt, exitReason: "SL" },
  });
  expect(closed.statusCode).toBe(200);
  return tradeId;
}

/** Poll an async projection until the predicate holds (evaluation is
 * fire-and-forget after close - the client-visible effect lands moments
 * later, exactly like a second request would see it). */
async function pollUntil<T>(action: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await action();
    if (predicate(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("discipline rules CRUD (B4)", () => {
  it("creates, lists, patches, deletes rules; status reflects active limits", async () => {
    const user = await userWithAccount();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: user.authHeader,
      payload: { type: "MAX_TRADES_PER_DAY", params: { limit: 2 }, severity: "WARN" },
    });
    expect(created.statusCode).toBe(201);
    const rule = created.json() as { id: string; isActive: boolean };
    expect(rule.isActive).toBe(true); // default

    const list = rulesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/rules", headers: user.authHeader })).json(),
    );
    expect(list.rules).toHaveLength(1);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/rules/${rule.id}`,
      headers: user.authHeader,
      payload: { isActive: false, params: { limit: 5 } },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ isActive: false, params: { limit: 5 } });

    // Inactive rule → no limit line in the banner aggregate.
    const status = rulesStatusResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/rules/status",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(status.limits).toHaveLength(0);
    expect(status.violationsToday).toBe(0);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/rules/${rule.id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true });

    const after = rulesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/rules", headers: user.authHeader })).json(),
    );
    expect(after.rules).toHaveLength(0);
  });

  it("404s a foreign rule (IDOR → 404)", async () => {
    const [userA, userB] = await Promise.all([userWithAccount(), userWithAccount()]);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: userA.authHeader,
      payload: { type: "MAX_LOSSES_PER_DAY", params: { limit: 2 }, severity: "ALERT" },
    });
    const ruleId = (created.json() as { id: string }).id;
    const foreign = await app.inject({
      method: "DELETE",
      url: `/api/v1/rules/${ruleId}`,
      headers: userB.authHeader,
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("discipline evaluation pipeline (B4)", () => {
  it("closing a trade past MAX_TRADES_PER_DAY raises a violation + an inbox alert", async () => {
    const user = await userWithAccount();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: user.authHeader,
      payload: { type: "MAX_TRADES_PER_DAY", params: { limit: 1 }, severity: "ALERT" },
    });
    expect(created.statusCode).toBe(201);

    // Trade 1: fine. Trade 2: breaches the 1-trade limit (same trading day,
    // timestamps anchored on NOW so the "today" aggregate sees them).
    // Date-string anchors INSIDE today (00:01/00:02 UTC) - immune to the
    // midnight boundary that once zeroed the "today" aggregates mid-run.
    const today = new Date().toISOString().slice(0, 10);
    const dayOffsets: Array<[string, string]> = [
      [`${today}T00:01:00.000Z`, `${today}T00:05:00.000Z`],
      [`${today}T00:02:00.000Z`, `${today}T00:06:00.000Z`],
    ];
    for (const [entryAt, exitAt] of dayOffsets) {
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
          entryAt,
          size: { mode: "quantity", quantity: "0.10" },
          outOfPlaybook: true,
        },
      });
      expect(open.statusCode).toBe(201);
      const tradeId = (open.json() as { id: string }).id;
      const closed = await app.inject({
        method: "POST",
        url: `/api/v1/trades/${tradeId}/close`,
        headers: user.authHeader,
        payload: {
          mode: "single",
          exitPrice: "1.0800",
          exitAt,
          exitReason: "SL",
        },
      });
      expect(closed.statusCode).toBe(200);
    }

    const status = rulesStatusResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/rules/status",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(status.tradesToday).toBeGreaterThanOrEqual(2);
    expect(status.limits).toHaveLength(1);
    expect(status.violationsToday).toBeGreaterThanOrEqual(1);

    // Violation log join carries the frozen context.
    const log = violationsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/violations", headers: user.authHeader })).json(),
    );
    expect(log.violations.length).toBeGreaterThanOrEqual(1);
    expect(log.windowCount).toBe(log.violations.length);
    const first = log.violations[0]!;
    expect(first.ruleType).toBe("MAX_TRADES_PER_DAY");
    expect(first.context).toMatchObject({ tradesToday: 2, limit: 1 });
    expect(first.acknowledgedAt).toBeNull();

    // Alert inbox received the RULE_VIOLATION notification.
    const inbox = (await app.inject({ method: "GET", url: "/api/v1/alerts", headers: user.authHeader })).json() as {
      alerts: Array<{ id: string; type: string; readAt: string | null; tradeId: string | null }>;
      unreadCount: number;
    };
    const alert = inbox.alerts.find((a) => a.type === "RULE_VIOLATION");
    expect(alert).toBeDefined();
    expect(inbox.unreadCount).toBeGreaterThanOrEqual(1);

    // Acknowledge the violation; mark the alert read.
    const ack = await app.inject({
      method: "PATCH",
      url: `/api/v1/violations/${first.id}/acknowledge`,
      headers: user.authHeader,
      payload: { note: "Noted - overtraded after the loss." },
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json()).toMatchObject({
      violation: { acknowledgedAt: expect.any(String), userNote: "Noted - overtraded after the loss." },
    });

    const read = await app.inject({
      method: "PATCH",
      url: `/api/v1/alerts/${alert!.id}/read`,
      headers: user.authHeader,
    });
    expect(read.statusCode).toBe(200);
    const inboxAfter = (await app.inject({ method: "GET", url: "/api/v1/alerts", headers: user.authHeader })).json() as {
      alerts: Array<{ id: string; readAt: string | null }>;
    };
    expect(inboxAfter.alerts.find((a) => a.id === alert!.id)?.readAt).not.toBeNull();
  });

  it("evaluation is idempotent: re-reading never duplicates violations", async () => {
    const user = await userWithAccount();
    await app.inject({
      method: "POST",
      url: "/api/v1/rules",
      headers: user.authHeader,
      payload: { type: "MAX_LOSSES_PER_DAY", params: { limit: 1 }, severity: "WARN" },
    });
    const tradeId = await capturedClosedTrade(user);
    void tradeId;

    const read = () =>
      app.inject({ method: "GET", url: "/api/v1/alerts", headers: user.authHeader }).then(
        (r) => (r.json() as { alerts: Array<{ type: string }> }).alerts.filter((a) => a.type === "RULE_VIOLATION"),
      );
    const first = await pollUntil(read, (alerts) => alerts.length >= 1);
    const second = await read();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});

describe("discipline aggregates (B4)", () => {
  it("score, emotion matrix and mistakes ledger serve validated aggregates", async () => {
    const user = await userWithAccount();
    const tradeId = await capturedClosedTrade(user, {
      emotionBefore: "CALM",
      initialStop: undefined,
    });

    // Grade the trade: the decision gate runs the B3 mistake detection
    // (no stop → no_stop_loss) that the ledger aggregates.
    const decided = await app.inject({
      method: "POST",
      url: `/api/v1/trades/${tradeId}/decision`,
      headers: user.authHeader,
      payload: { grade: "C", followedPlan: true },
    });
    expect(decided.statusCode).toBe(200);

    const score = disciplineScoreResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/discipline/score",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(score.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(score.violationsCount).toBe(0);

    const matrix = (await app.inject({
      method: "GET",
      url: "/api/v1/discipline/emotion-matrix",
      headers: user.authHeader,
    })).json() as { windowStart: string; rows: Array<{ emotion: string; trades: number }>; excluded: number };
    expect(matrix.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]).toMatchObject({ emotion: "CALM", trades: 1 });
    expect(matrix.excluded).toBe(0);

    // The trade above carries no stop → B3 detection fired → the ledger
    // lists no_stop_loss with the trade's R cost.
    const ledger = (await app.inject({
      method: "GET",
      url: "/api/v1/mistakes/ledger",
      headers: user.authHeader,
    })).json() as { windowStart: string; entries: Array<{ key: string; count: number }> };
    expect(ledger.entries.find((entry) => entry.key === "no_stop_loss")).toMatchObject({ count: 1 });
  });

  it("401 without a token on the discipline surface", async () => {
    const status = await app.inject({ method: "GET", url: "/api/v1/rules/status" });
    expect(status.statusCode).toBe(401);
    const alerts = await app.inject({ method: "GET", url: "/api/v1/alerts" });
    expect(alerts.statusCode).toBe(401);
  });
});
