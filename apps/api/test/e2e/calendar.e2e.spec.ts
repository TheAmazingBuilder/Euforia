/**
 * e2e — Calendar (B7) over the REAL AppModule + real database: the eco
 * events source (deterministic synthetic macro schedule), block CRUD
 * (day offs / news pauses), the import-eco flow and the trading-calendar
 * view (OFF days excluded server-side from every aggregate).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  calendarBlocksResponseSchema,
  calendarViewResponseSchema,
  ecoEventsResponseSchema,
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

async function user() {
  return authenticatedUser(app, mail);
}

const todayKey = (): string => new Date().toISOString().slice(0, 10);
const dayKey = (offset: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

describe("eco events (B7)", () => {
  it("serves a deterministic synthetic macro schedule spanning ±2 weeks", async () => {
    const user1 = await user();
    const first = ecoEventsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/eco-events", headers: user1.authHeader })).json(),
    );
    expect(first.events.length).toBeGreaterThanOrEqual(1);
    // Deterministic: same day → same schedule.
    const second = ecoEventsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/eco-events", headers: user1.authHeader })).json(),
    );
    expect(second).toEqual(first);
    // Window: nothing older than 3 days back or further than 14 ahead.
    const oldest = first.events[0]!.scheduledAt.slice(0, 10);
    expect(oldest >= dayKey(-3)).toBe(true);
    const newest = first.events[first.events.length - 1]!.scheduledAt.slice(0, 10);
    expect(newest <= dayKey(14)).toBe(true);
  });
});

describe("calendar blocks (B7)", () => {
  it("marks a day OFF, unmarks it, and the import-eco flow reports honestly", async () => {
    const user1 = await user();
    const empty = calendarBlocksResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/calendar-blocks", headers: user1.authHeader })).json(),
    );
    expect(empty.blocks).toHaveLength(0);

    const marked = await app.inject({
      method: "PUT",
      url: "/api/v1/calendar-blocks",
      headers: user1.authHeader,
      payload: { date: dayKey(3), kind: "OFF" },
    });
    expect(marked.statusCode).toBe(200);
    expect(marked.json()).toMatchObject({
      block: { date: dayKey(3), kind: "OFF", note: "Planned day off" },
    });

    const list = calendarBlocksResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/calendar-blocks", headers: user1.authHeader })).json(),
    );
    expect(list.blocks).toHaveLength(1);

    // Import-eco: honest shape; imported days land as NEWS blocks.
    const imported = (await app.inject({
      method: "POST",
      url: "/api/v1/calendar-blocks/import-eco",
      headers: user1.authHeader,
    })).json() as { imported: number; dates: string[]; message: string };
    expect(imported.imported).toBeGreaterThanOrEqual(0);
    expect(imported.message).toMatch(/imported|clear/u);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/calendar-blocks/${dayKey(3)}`,
      headers: user1.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ deleted: true, block: { date: dayKey(3) } });
  });

  it("422 on an invalid date key", async () => {
    const user1 = await user();
    const bad = await app.inject({
      method: "DELETE",
      url: "/api/v1/calendar-blocks/not-a-date",
      headers: user1.authHeader,
    });
    expect(bad.statusCode).toBe(422);
  });
});

describe("calendar view (B7)", () => {
  it("computes day rows + aggregates, excluding OFF days server-side", async () => {
    const user1 = await user();

    // Mark today OFF → today must drop out of the aggregates.
    await app.inject({
      method: "PUT",
      url: "/api/v1/calendar-blocks",
      headers: user1.authHeader,
      payload: { date: todayKey(), kind: "OFF", note: "Probe rest day" },
    });

    const from = dayKey(-2);
    const to = dayKey(2);
    const view = calendarViewResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/calendar-view?from=${from}&to=${to}`,
          headers: user1.authHeader,
        })
      ).json(),
    );
    expect(view.days).toHaveLength(5);
    expect(view.summary.from).toBe(from);
    expect(view.summary.to).toBe(to);
    expect(view.summary.daysOff).toBe(1);
    // The OFF day carries the block and is flagged.
    const todayRow = view.days.find((day) => day.date === todayKey())!;
    expect(todayRow.excludedFromStats).toBe(true);
    expect(todayRow.block?.kind).toBe("OFF");
    // Guard-line + currency ride along.
    expect(view.dailyLossLimitPct).toBeGreaterThanOrEqual(0);
    expect(view.currency.length).toBe(3);
  });

  it("422 on an invalid from/to range", async () => {
    const user1 = await user();
    const bad = await app.inject({
      method: "GET",
      url: "/api/v1/calendar-view?from=2026-13-99&to=nope",
      headers: user1.authHeader,
    });
    expect(bad.statusCode).toBe(422);
  });

  it("401 without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/calendar-view?from=2026-01-01&to=2026-01-02" });
    expect(response.statusCode).toBe(401);
  });
});
