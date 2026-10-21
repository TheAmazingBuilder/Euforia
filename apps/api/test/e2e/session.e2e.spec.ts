/**
 * e2e — Session (B5): the server-assembled trading day over the REAL
 * AppModule + real database. Covers the timeline (entry/exit events from
 * the journal), the logbook round-trip (add → list → delete), shared
 * contract validation, ownership (IDOR → 404) and the auth boundary.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { sessionNotesResponseSchema, sessionTimelineResponseSchema } from "../../src/shared/contracts";
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
      credentials: { method: "API_KEY", secret: "mock-api-key-session" },
    },
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;
  const list = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader });
  const instrument = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
    .instruments.find((i) => i.symbol === "EURUSD")!;
  return { ...user, accountId, instrumentId: instrument.id };
}

describe("session timeline (B5)", () => {
  it("assembles today's ENTRY/EXIT events server-side from the journal", async () => {
    const user = await userWithAccount();

    // Empty day: honest empty payload with the SERVER-resolved date.
    const before = sessionTimelineResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/session/timeline",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(before.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(before.events).toHaveLength(0);

    // One full lifecycle today (recent timestamps, mood taps included).
    // Date-string anchors INSIDE today (00:01/00:02 UTC) — immune to the
    // midnight boundary that once emptied the "today" timeline mid-run.
    const today = new Date().toISOString().slice(0, 10);
    const entryAt = `${today}T00:01:00.000Z`;
    const exitAt = `${today}T00:02:00.000Z`;
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
        emotionBefore: "CALM",
        outOfPlaybook: true,
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
      },
    });
    expect(closed.statusCode).toBe(200);

    // The AFTER tap is a separate in-trade quick-log (psychology endpoint),
    // exactly what the capture screen does.
    const tapped = await app.inject({
      method: "PATCH",
      url: `/api/v1/trades/${tradeId}/psychology`,
      headers: user.authHeader,
      payload: { emotionAfter: "CONFIDENT" },
    });
    expect(tapped.statusCode).toBe(200);

    const timeline = sessionTimelineResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/session/timeline",
          headers: user.authHeader,
        })
      ).json(),
    );
    const kinds = timeline.events.map((event) => event.kind);
    expect(kinds).toContain("ENTRY");
    expect(kinds).toContain("EXIT");
    const entry = timeline.events.find((event) => event.kind === "ENTRY")!;
    expect(entry.label).toContain("EURUSD");
    // Decimal trailing zeros normalize in the detail line (contract-safe).
    expect(entry.detail).toContain("1.085");

    // Mood strip: BEFORE tap rides the entry, AFTER tap rides the exit.
    expect(timeline.moods).toHaveLength(2);
    expect(timeline.moods[0]).toMatchObject({ emotion: "CALM", phase: "BEFORE", tradeId });
    expect(timeline.moods[1]).toMatchObject({ emotion: "CONFIDENT", phase: "AFTER", tradeId });
  });

  it("401 without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/session/timeline" });
    expect(response.statusCode).toBe(401);
  });
});

describe("session logbook (B5)", () => {
  it("add → list → delete round-trip, server stamps date + clock", async () => {
    const user = await userWithAccount();
    const added = await app.inject({
      method: "POST",
      url: "/api/v1/session/notes",
      headers: user.authHeader,
      payload: { text: "  Hesitated on the London sweep — waited for the reclaim.  " },
    });
    expect(added.statusCode).toBe(201);
    const note = added.json() as { id: string; date: string; at: string; text: string };
    expect(note.text).toBe("Hesitated on the London sweep — waited for the reclaim."); // trimmed
    expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(note.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const list = sessionNotesResponseSchema.parse(
      (
        await app.inject({ method: "GET", url: "/api/v1/session/notes", headers: user.authHeader })
      ).json(),
    );
    expect(list.notes.some((candidate) => candidate.id === note.id)).toBe(true);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/session/notes/${note.id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true });

    const after = sessionNotesResponseSchema.parse(
      (
        await app.inject({ method: "GET", url: "/api/v1/session/notes", headers: user.authHeader })
      ).json(),
    );
    expect(after.notes.some((candidate) => candidate.id === note.id)).toBe(false);
  });

  it("400 on an empty note, 404 on a foreign note (IDOR)", async () => {
    const [userA, userB] = await Promise.all([
      authenticatedUser(app, mail),
      authenticatedUser(app, mail),
    ]);

    const empty = await app.inject({
      method: "POST",
      url: "/api/v1/session/notes",
      headers: userA.authHeader,
      payload: { text: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/session/notes",
      headers: userA.authHeader,
      payload: { text: "User A's private note" },
    });
    const noteId = (created.json() as { id: string }).id;

    const foreign = await app.inject({
      method: "DELETE",
      url: `/api/v1/session/notes/${noteId}`,
      headers: userB.authHeader,
    });
    expect(foreign.statusCode).toBe(404);
  });
});
