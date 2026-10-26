/**
 * e2e - Security audit-trail pagination (Phase 16 §28/§29) + activity
 * ownership (§32/§43) + append-only immutability (§10/§44).
 *
 * Complements security.e2e.spec.ts (Phase 2): here the PAGINATED reads
 * GET /security/events and GET /security/logins are exercised against the
 * real AppModule + real PostgreSQL: keyset walk, filters, cursor validation,
 * cross-user isolation and the absence of any mutation surface.
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

/** base64url - the server's documented cursor encoding ("<at>|<id>"). */
function encodeCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`, "utf8").toString("base64url");
}

async function getJson(authHeader: Record<string, string>, url: string) {
  const res = await app.inject({ method: "GET", url, headers: authHeader });
  return { status: res.statusCode, body: res.json() };
}

/**
 * at DESC - the wire format truncates milliseconds, so the id tie-break of
 * the server's (at DESC, id DESC) keyset is NOT observable on same-second
 * events; the walk == reference-set equality above proves keyset stability.
 */
function isSortedDesc(items: Array<{ at: string; id: string }>): boolean {
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1]!;
    const curr = items[i]!;
    if (prev.at < curr.at) return false;
  }
  return true;
}

describe("security activity pagination (Phase 16)", () => {
  it("requires authentication", async () => {
    const events = await app.inject({ method: "GET", url: "/api/v1/security/events" });
    const logins = await app.inject({ method: "GET", url: "/api/v1/security/logins" });
    expect(events.statusCode).toBe(401);
    expect(logins.statusCode).toBe(401);
  });

  it("walks the event log in stable keyset pages until exhaustion", async () => {
    const a = await authenticatedUser(app, mail);
    // Generate a deterministic set of activity: two more sign-ins + one
    // failure (the limiter allows 5 failures / 15 min - one is well within).
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: a.email, password: a.password, remember: true },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: a.email, password: a.password, remember: true },
    });
    const failed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: a.email, password: "definitely-wrong-password", remember: true },
    });
    expect(failed.statusCode).toBe(401);

    // Reference set: one bounded page holding the whole log for this user.
    const all = await getJson(a.authHeader, "/api/v1/security/events?limit=100");
    expect(all.status).toBe(200);
    expect(all.body.nextCursor).toBeNull();
    expect(all.body.items.length).toBeGreaterThanOrEqual(5);
    const referenceIds = all.body.items.map((e: { id: string }) => e.id);
    expect(new Set(referenceIds).size).toBe(referenceIds.length);

    // Walk with limit=2 - no duplicates, no gaps, stable order, null tail.
    const walked: Array<{ id: string; at: string }> = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const url = `/api/v1/security/events?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await getJson(a.authHeader, url);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      walked.push(...res.body.items);
      // The cursor always pins the LAST item of the page (keyset anchor).
      // The wire format truncates milliseconds; the opaque cursor keeps full
      // precision - compare second-precision date + the pinned row id.
      if (res.body.nextCursor !== null) {
        const last = res.body.items[res.body.items.length - 1];
        const decoded = Buffer.from(res.body.nextCursor, "base64url").toString("utf8");
        expect(decoded.startsWith(`${last.at.slice(0, 19)}`)).toBe(true);
        expect(decoded.endsWith(`|${last.id}`)).toBe(true);
      }
      cursor = res.body.nextCursor;
      if (cursor === null) break;
    }
    expect(cursor).toBeNull();
    expect(walked.map((e) => e.id)).toEqual(referenceIds);
    expect(isSortedDesc(walked)).toBe(true);
  });

  it("filters events by validated type, outcome and date range", async () => {
    const a = await authenticatedUser(app, mail);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: a.email, password: "definitely-wrong-password", remember: true },
    });

    const failedOnly = await getJson(a.authHeader, "/api/v1/security/events?type=LOGIN_FAILED");
    expect(failedOnly.status).toBe(200);
    expect(failedOnly.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of failedOnly.body.items) expect(item.type).toBe("LOGIN_FAILED");

    const failures = await getJson(a.authHeader, "/api/v1/security/events?outcome=FAILURE");
    expect(failures.status).toBe(200);
    for (const item of failures.body.items) expect(item.outcome).toBe("FAILURE");

    const future = await getJson(
      a.authHeader,
      `/api/v1/security/events?from=${encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString())}`,
    );
    expect(future.status).toBe(200);
    expect(future.body.items).toEqual([]);
    expect(future.body.nextCursor).toBeNull();

    const bogusType = await app.inject({
      method: "GET",
      url: "/api/v1/security/events?type=NOT_A_REAL_EVENT",
      headers: a.authHeader,
    });
    expect(bogusType.statusCode).toBe(400);
  });

  it("paginates login history with the success filter", async () => {
    const a = await authenticatedUser(app, mail);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: a.email, password: "definitely-wrong-password", remember: true },
    });

    const failures = await getJson(a.authHeader, "/api/v1/security/logins?success=false");
    expect(failures.status).toBe(200);
    expect(failures.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of failures.body.items) {
      expect(item.success).toBe(false);
      expect(item.reason).toBeTruthy();
    }

    const successes = await getJson(a.authHeader, "/api/v1/security/logins?success=true&limit=2");
    expect(successes.status).toBe(200);
    for (const item of successes.body.items) expect(item.success).toBe(true);
    expect(isSortedDesc(successes.body.items)).toBe(true);
  });

  it("rejects invalid pagination inputs with 400 (never 500)", async () => {
    const a = await authenticatedUser(app, mail);
    for (const url of [
      "/api/v1/security/events?limit=0",
      "/api/v1/security/events?limit=101",
      "/api/v1/security/events?limit=abc",
      "/api/v1/security/logins?limit=0",
      "/api/v1/security/events?cursor=not-a-valid-cursor",
      "/api/v1/security/logins?cursor=" + encodeURIComponent(Buffer.from("no-separator-here").toString("base64url")),
    ]) {
      const res = await app.inject({ method: "GET", url, headers: a.authHeader });
      expect(res.statusCode, url).toBe(400);
    }
    const invalidCursor = await getJson(a.authHeader, "/api/v1/security/events?cursor=not-a-valid-cursor");
    expect(invalidCursor.body.code).toBe("INVALID_CURSOR");
  });

  it("exposes no mutation surface for the append-only log (§10/§44)", async () => {
    const a = await authenticatedUser(app, mail);
    const someId = "00000000-0000-4000-8000-000000000000";
    const mutations: Array<{ method: "POST" | "PUT" | "PATCH" | "DELETE"; url: string }> = [
      { method: "POST", url: "/api/v1/security/events" },
      { method: "PUT", url: `/api/v1/security/events/${someId}` },
      { method: "PATCH", url: `/api/v1/security/events/${someId}` },
      { method: "DELETE", url: `/api/v1/security/events/${someId}` },
      { method: "DELETE", url: `/api/v1/security/logins/${someId}` },
      { method: "POST", url: "/api/v1/security/logins" },
    ];
    for (const m of mutations) {
      const res = await app.inject({
        method: m.method,
        url: m.url,
        headers: a.authHeader,
        payload: { type: "LOGIN_SUCCESS", actor: "attacker", context: "rewritten history" },
      });
      expect(res.statusCode, `${m.method} ${m.url}`).toBe(404);
    }
  });

  it("isolates activity per user - User A never sees User B's log (§32/§43)", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: b.email, password: "definitely-wrong-password", remember: true },
    });

    const bOwn = await getJson(b.authHeader, "/api/v1/security/events?limit=100");
    const bIds: string[] = bOwn.body.items.map((e: { id: string }) => e.id);
    expect(bIds.length).toBeGreaterThanOrEqual(3); // registered, verified, signed in, failed

    const aPages = await getJson(a.authHeader, "/api/v1/security/events?limit=100");
    const aIds: string[] = aPages.body.items.map((e: { id: string }) => e.id);
    for (const foreignId of bIds) {
      expect(aIds).not.toContain(foreignId);
    }
    // A's log is exclusively A's activity - B's email appears nowhere.
    expect(JSON.stringify(aPages.body)).not.toContain(b.email);

    // A cursor forged from B's LAST event pages into A's OWN log only -
    // the userId scope is server-side, never derived from the cursor.
    const bLast = bOwn.body.items[0];
    const forged = await getJson(
      a.authHeader,
      `/api/v1/security/events?limit=50&cursor=${encodeURIComponent(encodeCursor(bLast.at, bLast.id))}`,
    );
    expect(forged.status).toBe(200);
    for (const item of forged.body.items) expect(bIds).not.toContain(item.id);
  });
});
