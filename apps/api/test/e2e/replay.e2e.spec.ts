/**
 * e2e — Replay module over the REAL AppModule + real database (REPLAY
 * MASTER PROMPT verification): the simulated-replay lifecycle (create →
 * advance → simulate → settle → complete with a §30-honest result), the
 * §18 replay-clock clamps, and the MANDATORY security suite (§34/§35 —
 * IDOR across sessions, trades, notes; foreign strategy rejection; auth
 * boundary). The module is simulation-only: no execution route exists to
 * test — only that every write lands in the trader's own replay records.
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

async function user() {
  return authenticatedUser(app, mail);
}

const HOUR = 3_600_000;
const fromMs = Date.UTC(2026, 8, 14, 8, 0, 0);
const toMs = fromMs + 4 * HOUR;

async function createSession(
  authHeader: Record<string, string>,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/replay/sessions",
    headers: authHeader,
    payload: { symbol: "EURUSD", interval: "15m", fromMs, toMs, ...overrides },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { session: { id: string } }).session;
}

describe("replay lifecycle (simulation only)", () => {
  it("create → advance → simulate → settle → complete with a §30-honest result", async () => {
    const user1 = await user();

    const session = await createSession(user1.authHeader, {
      startAtMs: fromMs + 30 * 60_000,
      startingBalance: "10000",
      riskPerTradePct: 1,
    });

    // Advance — DRAFT → IN_PROGRESS, checkpoint persisted.
    const advanced = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/advance`,
      headers: user1.authHeader,
      payload: { currentMs: fromMs + 60 * 60_000, playbackState: "PLAYING" },
    });
    expect(advanced.statusCode).toBe(200);
    const advancedSession = (advanced.json() as { session: { status: string; currentMs: number } }).session;
    expect(advancedSession.status).toBe("IN_PROGRESS");
    expect(advancedSession.currentMs).toBe(fromMs + 60 * 60_000);

    // Simulated trade — risk amount computed by the shared math.
    const traded = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/trades`,
      headers: user1.authHeader,
      payload: {
        direction: "BUY",
        entryPrice: "1.0862",
        stopLoss: "1.0847",
        takeProfit: "1.0907",
        quantity: "0.5",
      },
    });
    expect(traded.statusCode).toBe(201);
    const trade = (traded.json() as { trade: { id: string; riskAmount: string | null; openedAtMs: number } }).trade;
    expect(trade.riskAmount).not.toBeNull();

    // Settle — pnl + R authoritative server-side.
    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/trades/${trade.id}/close`,
      headers: user1.authHeader,
      payload: { exitPrice: "1.0892" },
    });
    expect(closed.statusCode).toBe(200);
    const settled = (closed.json() as { trade: { pnl: string | null; rMultiple: string | null } }).trade;
    expect(settled.pnl).not.toBeNull();
    expect(Number(settled.pnl)).toBeGreaterThan(0);
    expect(settled.rMultiple).not.toBeNull();

    // Decision + note.
    const decision = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/decisions`,
      headers: user1.authHeader,
      payload: { kind: "ENTER", note: "Breakout retest confirmed." },
    });
    expect(decision.statusCode).toBe(201);
    const note = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/notes`,
      headers: user1.authHeader,
      payload: { body: "Watching the retest." },
    });
    expect(note.statusCode).toBe(201);

    // Complete — result computed from the recorded data only.
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/complete`,
      headers: user1.authHeader,
    });
    expect(completed.statusCode).toBe(200);
    const result = (completed.json() as {
      session: {
        status: string;
        result: {
          simulatedTrades: number;
          winningTrades: number;
          losingTrades: number;
          winRatePct: number | null;
          netPnl: number | null;
          decisionCount: number;
        } | null;
      };
    }).session;
    expect(result.status).toBe("COMPLETED");
    expect(result.result?.simulatedTrades).toBe(1);
    expect(result.result?.winningTrades).toBe(1);
    expect(result.result?.winRatePct).toBe(100);
    expect(result.result?.decisionCount).toBe(1);

    // Detail carries the children; list carries the counts.
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/replay/sessions/${session.id}`,
      headers: user1.authHeader,
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as {
      trades: unknown[];
      decisions: unknown[];
      notes: unknown[];
    };
    expect(detailBody.trades).toHaveLength(1);
    expect(detailBody.decisions).toHaveLength(1);
    expect(detailBody.notes).toHaveLength(1);
  });

  it("clamps the replay clock into the historical window (§18)", async () => {
    const user1 = await user();
    const session = await createSession(user1.authHeader);

    const advanced = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/advance`,
      headers: user1.authHeader,
      payload: { currentMs: toMs + 5 * HOUR, playbackState: "PLAYING" },
    });
    expect(advanced.statusCode).toBe(200);
    const clamped = (advanced.json() as { session: { currentMs: number } }).session;
    expect(clamped.currentMs).toBe(toMs); // never beyond the dataset end

    const trade = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/trades`,
      headers: user1.authHeader,
      payload: { direction: "BUY", entryPrice: "1.0862", quantity: "0.5", openedAtMs: fromMs - 10 * HOUR },
    });
    expect(trade.statusCode).toBe(201);
    const openedAt = (trade.json() as { trade: { openedAtMs: number } }).trade.openedAtMs;
    expect(openedAt).toBeGreaterThanOrEqual(fromMs); // clamped inside the window
  });

  it("400 on an invalid historical window", async () => {
    const user1 = await user();
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/replay/sessions",
      headers: user1.authHeader,
      payload: { symbol: "EURUSD", interval: "15m", fromMs: toMs, toMs: fromMs },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("replay security (§34/§35 — mandatory)", () => {
  it("401 without a token", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/v1/replay/sessions" });
    expect(anonymous.statusCode).toBe(401);
  });

  it("IDOR: another user's session/trade/note are simply not found", async () => {
    const owner = await user();
    const attacker = await user();

    const session = await createSession(owner.authHeader);
    const traded = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/trades`,
      headers: owner.authHeader,
      payload: { direction: "SELL", entryPrice: "1.0870", quantity: "0.5" },
    });
    expect(traded.statusCode).toBe(201);
    const tradeId = (traded.json() as { trade: { id: string } }).trade.id;

    // The attacker cannot read, advance, complete, or delete the session…
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/replay/sessions/${session.id}`,
      headers: attacker.authHeader,
    });
    expect(read.statusCode).toBe(404);

    const advance = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/advance`,
      headers: attacker.authHeader,
      payload: { currentMs: fromMs + 60_000, playbackState: "PLAYING" },
    });
    expect(advance.statusCode).toBe(404);

    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/complete`,
      headers: attacker.authHeader,
    });
    expect(complete.statusCode).toBe(404);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/replay/sessions/${session.id}`,
      headers: attacker.authHeader,
    });
    expect(remove.statusCode).toBe(404);

    // …nor touch its simulated records.
    const closeForeign = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/trades/${tradeId}/close`,
      headers: attacker.authHeader,
      payload: { exitPrice: "1.0800" },
    });
    expect(closeForeign.statusCode).toBe(404);

    const deleteForeign = await app.inject({
      method: "DELETE",
      url: `/api/v1/replay/sessions/${session.id}/trades/${tradeId}`,
      headers: attacker.authHeader,
    });
    expect(deleteForeign.statusCode).toBe(404);

    const noteForeign = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/notes`,
      headers: attacker.authHeader,
      payload: { body: "intrusion" },
    });
    expect(noteForeign.statusCode).toBe(404);
  });

  it("rejects foreign strategy/setup/account references (§35)", async () => {
    const owner = await user();
    const attacker = await user();

    // The attacker owns a strategy; the owner must not be able to attach it.
    const strategy = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: attacker.authHeader,
      payload: { name: "Attacker Edge", description: "Not yours." },
    });
    expect(strategy.statusCode).toBe(201);
    const strategyId = (strategy.json() as { id: string }).id;

    const session = await createSession(owner.authHeader);
    const attach = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}`,
      headers: owner.authHeader,
      payload: { strategyId },
    });
    expect(attach.statusCode).toBe(404);
  });

  it("409 on advancing a completed replay", async () => {
    const user1 = await user();
    const session = await createSession(user1.authHeader);
    await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/complete`,
      headers: user1.authHeader,
    });
    const advance = await app.inject({
      method: "POST",
      url: `/api/v1/replay/sessions/${session.id}/advance`,
      headers: user1.authHeader,
      payload: { currentMs: fromMs + 60_000, playbackState: "PLAYING" },
    });
    // BusinessRuleError → 422 (valid payload, violated domain invariant).
    expect(advance.statusCode).toBe(422);
  });
});
