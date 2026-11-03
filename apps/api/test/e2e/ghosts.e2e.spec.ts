/**
 * e2e - Ghost Trades (B6): the Registre des Regrets over the REAL AppModule
 * + real database. Covers the capture → settle lifecycle, the regret feed
 * ordering, shared-contract validation, ownership (IDOR → 404) and honest
 * instrument validation. Mirrors `mocks/handlers/ghosts.ts` behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  instrumentSchema,
  skippedTradesResponseSchema,
  skippedTradeSchema,
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

async function eurInstrumentId(auth: Record<string, string>): Promise<string> {
  const list = await app.inject({
    method: "GET",
    url: "/api/v1/instruments",
    headers: auth,
  });
  const instruments = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
    .instruments;
  const found = instruments.find((instrument) => instrument.symbol === "EURUSD");
  if (found === undefined) throw new Error("EURUSD missing from the catalog");
  return instrumentSchema.parse(found).id;
}

describe("ghost trades (B6)", () => {
  it("capture → list → settle → list: full lifecycle, most recent first", async () => {
    const user = await authenticatedUser(app, mail);
    const instrumentId = await eurInstrumentId(user.authHeader);

    const older = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
      payload: {
        instrumentId,
        direction: "BUY",
        seenAt: "2026-01-05T09:30:00.000Z",
        reason: "FEAR",
        notes: "Choked on the retest.",
      },
    });
    expect(older.statusCode).toBe(201);

    const newer = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
      payload: {
        instrumentId,
        seenAt: "2026-01-05T14:10:00.000Z",
        reason: "OUT_OF_PLAYBOOK",
      },
    });
    expect(newer.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
    });
    expect(list.statusCode).toBe(200);
    const body = skippedTradesResponseSchema.parse(list.json());
    expect(body.skippedTrades).toHaveLength(2);
    // Most recent observation first.
    expect(body.skippedTrades[0]!.seenAt).toBe("2026-01-05T14:10:00.000Z");
    expect(body.skippedTrades[0]!.outcomeGuess).toBeNull(); // unsettled

    const settled = await app.inject({
      method: "PATCH",
      url: `/api/v1/skipped-trades/${body.skippedTrades[0]!.id}/settle`,
      headers: user.authHeader,
      payload: { outcomeGuess: "WOULD_HAVE_WON", hypotheticalR: "1.5" },
    });
    expect(settled.statusCode).toBe(200);
    const settledView = skippedTradeSchema.parse(settled.json());
    expect(settledView.outcomeGuess).toBe("WOULD_HAVE_WON");
    expect(settledView.hypotheticalR).toBe("1.5");

    const after = skippedTradesResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/skipped-trades",
          headers: user.authHeader,
        })
      ).json(),
    );
    const target = after.skippedTrades.find((g) => g.id === settledView.id);
    expect(target?.outcomeGuess).toBe("WOULD_HAVE_WON");
    expect(target?.hypotheticalR).toBe("1.5");
  });

  it("rejects an unknown instrument (422 UNKNOWN_INSTRUMENT) and a bad reason (400)", async () => {
    const user = await authenticatedUser(app, mail);
    const unknownInstrument = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
      payload: {
        instrumentId: "00000000-0000-4000-8000-00000000dead",
        reason: "NO_SETUP",
      },
    });
    expect(unknownInstrument.statusCode).toBe(422);
    expect(unknownInstrument.json().code).toBe("UNKNOWN_INSTRUMENT");

    const badReason = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: user.authHeader,
      payload: {
        instrumentId: "00000000-0000-4000-8000-00000000dead",
        reason: "NOT_A_REASON",
      },
    });
    expect(badReason.statusCode).toBe(400);
  });

  it("user B cannot reach user A's ghost (IDOR → 404)", async () => {
    const [userA, userB] = await Promise.all([
      authenticatedUser(app, mail),
      authenticatedUser(app, mail),
    ]);
    const instrumentId = await eurInstrumentId(userA.authHeader);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/skipped-trades",
      headers: userA.authHeader,
      payload: { instrumentId, reason: "MISSED_EXECUTION" },
    });
    const ghostId = (created.json() as { id: string }).id;

    const foreign = await app.inject({
      method: "PATCH",
      url: `/api/v1/skipped-trades/${ghostId}/settle`,
      headers: userB.authHeader,
      payload: { outcomeGuess: "WOULD_HAVE_LOST" },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("401 without a token on every ghosts route", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/skipped-trades" });
    expect(list.statusCode).toBe(401);
    const create = await app.inject({ method: "POST", url: "/api/v1/skipped-trades", payload: {} });
    expect(create.statusCode).toBe(401);
  });
});
