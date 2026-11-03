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

describe("personal Events board", () => {
  it("starts empty, persists the owner's board, and isolates it from other users", async () => {
    const owner = await authenticatedUser(app, mail);
    const anotherUser = await authenticatedUser(app, mail);

    const empty = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: owner.authHeader,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ state: null });

    const state = {
      calendars: [
        { id: "cal-personal", name: "Personal", color: "blue", group: "mine", visible: true },
      ],
      events: [
        {
          id: "event-review",
          title: "Review trading plan",
          calendarId: "cal-personal",
          date: "2026-11-02",
          allDay: false,
          time: "09:30",
        },
      ],
    };
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/events",
      headers: owner.authHeader,
      payload: state,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ state });

    const reloaded = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: owner.authHeader,
    });
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json()).toMatchObject({ state });

    const isolated = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: anotherUser.authHeader,
    });
    expect(isolated.statusCode).toBe(200);
    expect(isolated.json()).toEqual({ state: null });
  });

  it("rejects an event that references a missing calendar", async () => {
    const user = await authenticatedUser(app, mail);
    const invalid = await app.inject({
      method: "PUT",
      url: "/api/v1/events",
      headers: user.authHeader,
      payload: {
        calendars: [],
        events: [
          {
            id: "event-orphan",
            title: "Orphan event",
            calendarId: "missing-calendar",
            date: "2026-11-02",
            allDay: true,
          },
        ],
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/events" });
    expect(response.statusCode).toBe(401);
  });
});
