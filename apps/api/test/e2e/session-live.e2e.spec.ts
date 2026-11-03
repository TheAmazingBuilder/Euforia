/**
 * e2e - Session Live (B9) over the REAL AppModule + real database: the
 * trading-session lifecycle (start → update → end with an honest §43
 * summary / cancel), saved analyses and key levels. Also asserts the
 * single-active-session rule (409) and the auth boundary.
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

describe("session live lifecycle (B9)", () => {
  it("start → update → end with a §43-honest summary", async () => {
    const user1 = await user();

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
      payload: {
        primarySymbol: "EURUSD",
        primaryTimeframe: "5m",
        tradingWindow: "LONDON",
        sessionObjective: "Two clean A+ setups, no revenge.",
        riskPerTradePct: 0.5,
      },
    });
    expect(started.statusCode).toBe(201);
    const { session } = started.json() as {
      session: { id: string; status: string; events: Array<{ kind: string }>; marketBias: string };
    };
    expect(session.status).toBe("ACTIVE");
    expect(session.events.some((event) => event.kind === "SESSION_STARTED")).toBe(true);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/session-live/sessions/${session.id}`,
      headers: user1.authHeader,
      payload: { marketBias: "BULLISH", notes: "London open sweep cleared the range." },
    });
    expect(updated.statusCode).toBe(200);
    const updatedSession = updated.json() as {
      session: { marketBias: string; events: Array<{ kind: string }> };
    };
    expect(updatedSession.session.marketBias).toBe("BULLISH");
    expect(updatedSession.session.events.some((event) => event.kind === "BIAS_CHANGED")).toBe(true);

    const ended = await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${session.id}/end`,
      headers: user1.authHeader,
      payload: { notes: "Stopped after the objective was met." },
    });
    expect(ended.statusCode).toBe(200);
    const endedBody = ended.json() as {
      session: { status: string; endedAt: string | null };
      summary: {
        durationMinutes: number;
        tradeCount: number;
        netPnl: number | null;
        violationsCount: number;
        notesCount: number;
        analysesCount: number;
      };
    };
    expect(endedBody.session.status).toBe("COMPLETED");
    expect(endedBody.session.endedAt).not.toBeNull();
    expect(endedBody.summary.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(endedBody.summary.tradeCount).toBe(0); // no journal trades in window
    expect(endedBody.summary.netPnl).toBeNull(); // honest null - none closed

    // State: the ended session moved to history (newest first).
    const state = (await app.inject({
      method: "GET",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
    })).json() as { active: object | null; history: Array<{ id: string; status: string }> };
    expect(state.active).toBeNull();
    expect(state.history.some((item) => item.id === session.id)).toBe(true);
  });

  it("409 on a second active session, 409 on updating an ended session", async () => {
    const user1 = await user();
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
      payload: { primarySymbol: "XAUUSD" },
    });
    expect(first.statusCode).toBe(201);
    const { session } = first.json() as { session: { id: string } };

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
      payload: {},
    });
    expect(second.statusCode).toBe(409);

    await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${session.id}/cancel`,
      headers: user1.authHeader,
    });
    const updateEnded = await app.inject({
      method: "PATCH",
      url: `/api/v1/session-live/sessions/${session.id}`,
      headers: user1.authHeader,
      payload: { notes: "too late" },
    });
    expect(updateEnded.statusCode).toBe(409);
  });
});

describe("saved analyses + key levels (B9)", () => {
  it("analysis round-trip with the session event push", async () => {
    const user1 = await user();
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
      payload: { primarySymbol: "EURUSD" },
    });
    const { session } = started.json() as { session: { id: string } };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/analyses",
      headers: user1.authHeader,
      payload: {
        sessionId: session.id,
        symbol: "EURUSD",
        timeframe: "15m",
        bias: "BULLISH",
        bullishScenario: "Reclaim of the Asian high → continuation.",
        bearishScenario: "Loss of the London low → range floor.",
        indicators: [{ id: "ema20", kind: "EMA", params: { length: 20 } }],
      },
    });
    expect(created.statusCode).toBe(201);
    const { analysis } = created.json() as { analysis: { id: string; symbol: string } };
    expect(analysis.symbol).toBe("EURUSD");

    const list = (await app.inject({
      method: "GET",
      url: "/api/v1/session-live/analyses",
      headers: user1.authHeader,
    })).json() as { analyses: Array<{ id: string }> };
    expect(list.analyses.some((item) => item.id === analysis.id)).toBe(true);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/session-live/analyses/${analysis.id}`,
      headers: user1.authHeader,
    });
    expect(removed.json()).toEqual({ ok: true });

    // Cancel the session for isolation.
    await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${session.id}/cancel`,
      headers: user1.authHeader,
    });
  });

  it("key levels: create, filter by symbol, update, delete; LEVEL_ADDED event rides the session", async () => {
    const user1 = await user();
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
      payload: { primarySymbol: "XAUUSD" },
    });
    const { session } = started.json() as { session: { id: string } };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/session-live/levels",
      headers: user1.authHeader,
      payload: { symbol: "XAUUSD", kind: "SUPPORT", price: 2315.5, note: "Weekly open + OB." },
    });
    expect(created.statusCode).toBe(201);
    const { level } = created.json() as { level: { id: string; symbol: string; price: number } };
    expect(level.price).toBe(2315.5);

    const filtered = (await app.inject({
      method: "GET",
      url: "/api/v1/session-live/levels?symbol=XAUUSD",
      headers: user1.authHeader,
    })).json() as { levels: Array<{ id: string }> };
    expect(filtered.levels.some((item) => item.id === level.id)).toBe(true);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/session-live/levels/${level.id}`,
      headers: user1.authHeader,
      payload: { note: "Held twice - stronger now." },
    });
    expect(patched.json()).toMatchObject({ level: { note: "Held twice - stronger now." } });

    // The active session recorded the LEVEL_ADDED event.
    const state = (await app.inject({
      method: "GET",
      url: "/api/v1/session-live/sessions",
      headers: user1.authHeader,
    })).json() as { active: { events: Array<{ kind: string }> } | null };
    expect(state.active?.events.some((event) => event.kind === "LEVEL_ADDED")).toBe(true);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/session-live/levels/${level.id}`,
      headers: user1.authHeader,
    });
    expect(removed.json()).toEqual({ ok: true });

    await app.inject({
      method: "POST",
      url: `/api/v1/session-live/sessions/${session.id}/cancel`,
      headers: user1.authHeader,
    });
  });

  it("401 without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/session-live/sessions" });
    expect(response.statusCode).toBe(401);
  });
});
