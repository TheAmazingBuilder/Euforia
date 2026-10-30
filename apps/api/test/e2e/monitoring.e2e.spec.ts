/**
 * e2e - Monitoring API (Phase 17 §48/§49/§50): access control, contract
 * shape, per-user isolation, threshold persistence, observational-only
 * mutation surface, and secret/stack-trace non-exposure - against the real
 * AppModule, real PostgreSQL and the real telemetry hook.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { monitoringOverviewResponseSchema } from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

type MonitoringBody = z.infer<typeof monitoringOverviewResponseSchema>;

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

async function administrator() {
  const user = await authenticatedUser(app, mail);
  await app.get(PrismaService).user.update({ where: { id: user.userId }, data: { role: "ADMIN" } });
  return user;
}

// Wire material that must NEVER appear in monitoring responses (§17/§44).
const SECRET_PATTERN =
  /credentialsEnc|credentialsHint|"secret"|cz_live_|argon2|passwordHash|refreshTokenHash|postgres:\/\/|DATABASE_URL|JWT_SECRET|at .+node_modules/;

async function get(auth: Record<string, string>, url: string): Promise<{ status: number; body: MonitoringBody }> {
  const res = await app.inject({ method: "GET", url, headers: auth });
  return { status: res.statusCode, body: monitoringOverviewResponseSchema.parse(res.json()) };
}

describe("monitoring access control (§33/§49)", () => {
  it("rejects anonymous and authenticated non-admin access on every monitoring route", async () => {
    const overview = await app.inject({ method: "GET", url: "/api/v1/monitoring/overview" });
    const thresholds = await app.inject({
      method: "PATCH",
      url: "/api/v1/monitoring/thresholds",
      payload: {},
    });
    const jobRun = await app.inject({ method: "POST", url: "/api/v1/monitoring/jobs/trading-sync/run" });
    expect(overview.statusCode).toBe(401);
    expect(thresholds.statusCode).toBe(401);
    expect(jobRun.statusCode).toBe(401);

    const trader = await authenticatedUser(app, mail);
    for (const [method, url] of [
      ["GET", "/api/v1/monitoring/overview"],
      ["PATCH", "/api/v1/monitoring/thresholds"],
      ["POST", "/api/v1/monitoring/jobs/trading-sync/run"],
    ] as const) {
      const denied = await app.inject({ method, url, headers: trader.authHeader, payload: {} });
      expect(denied.statusCode, `${method} ${url}`).toBe(403);
      expect(denied.json().code).toBe("ADMIN_REQUIRED");
    }
  });
});

describe("GET /monitoring/overview (§48)", () => {
  it("returns the full aggregate conforming to the shared contract", async () => {
    const user = await administrator();
    // The telemetry hook records a request AFTER its response - the first
    // authenticated call becomes visible to the SECOND overview read.
    await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: user.authHeader });
    await get(user.authHeader, "/api/v1/monitoring/overview");
    const { status, body } = await get(user.authHeader, "/api/v1/monitoring/overview");
    expect(status).toBe(200);

    // Status board: the 8 fixed components, each WITH evidence.
    expect(body.overview.components).toHaveLength(8);
    for (const component of body.overview.components) {
      expect(component.evidence.length).toBeGreaterThan(0);
      expect(["engine", "client-observed"]).toContain(component.source);
    }
    expect(body.overview.counts.operational + body.overview.counts.degraded + body.overview.counts.down + body.overview.counts.unknown).toBe(8);
    // market-data / websocket are honest client-observed rows.
    const market = body.overview.components.find((c) => c.id === "market-data");
    expect(market?.source).toBe("client-observed");
    expect(market?.status).toBe("UNKNOWN");

    // Health rows: the 8 fixed rows incl. honest UNKNOWN infrastructure.
    expect(body.health.rows.map((row) => row.id)).toEqual([
      "api", "database", "cache", "storage", "workers", "scheduler", "queue", "websocket",
    ]);
    const cache = body.health.rows.find((row) => row.id === "cache");
    expect(cache?.status).toBe("UNKNOWN");
    expect(body.health.sessionUptimeMs).toBeGreaterThanOrEqual(0);

    // API telemetry: the caller's OWN authenticated requests only.
    expect(body.api.totalRequests).toBeGreaterThanOrEqual(2);
    expect(body.api.buckets).toHaveLength(30);
    expect(body.api.endpoints.some((endpoint) => endpoint.key.includes("monitoring"))).toBe(true);

    // Database: real kind, real user-scoped entity counts.
    expect(body.database.kind).toBe("PostgreSQL");
    expect(body.database.status).toBe("OPERATIONAL");
    const sessions = body.database.entities.find((entity) => entity.label === "Sessions");
    expect(sessions?.count).toBeGreaterThanOrEqual(1);

    // Jobs: observed work only, none manual-runnable, nothing fabricated.
    expect(body.jobs.map((job) => job.id)).toEqual(["trading-sync", "email-dispatch"]);
    for (const job of body.jobs) {
      expect(job.manualRunnable).toBe(false);
      expect(job.description).toBeTruthy();
    }
    // The user's registration flow produced a verification email (captured):
    // the email-dispatch job observed it.
    const emailJob = body.jobs.find((job) => job.id === "email-dispatch");
    expect(emailJob?.successCount).toBeGreaterThanOrEqual(1);

    // Notifications: honest channel states, data-minimal deliveries.
    const channels = Object.fromEntries(body.notifications.channels.map((c) => [c.channel, c] as const));
    expect(channels.IN_APP?.status).toBe("UNKNOWN");
    expect(channels.EMAIL?.status).toBe("OPERATIONAL");
    expect(channels.PUSH?.status).toBe("UNKNOWN");
    expect(body.notifications.recent.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body.notifications.recent)).not.toContain(user.email);

    // Integrations: honestly empty (backend context not implemented).
    expect(body.integrations).toEqual([]);
    expect(body.integrationEvents).toEqual([]);

    // Thresholds: the 8 contract rules with defaults.
    expect(body.thresholds.rules).toHaveLength(8);
    expect(body.thresholds.freshness).toEqual({ liveMaxMs: 2000, delayedMaxMs: 10000 });

    // Alert/episode machinery: no fabricated alerts for a healthy session.
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(Array.isArray(body.incidents)).toBe(true);
    expect(body.overview.openAlerts).toBe(0);

    // No secret material anywhere in the payload (§17/§44).
    expect(SECRET_PATTERN.test(JSON.stringify(body))).toBe(false);
  });
});

describe("PATCH /monitoring/thresholds", () => {
  it("persists the user's knobs across reads (the mock's gap, fixed)", async () => {
    const user = await administrator();
    const patched = await app.inject({
      method: "PATCH",
      url: "/api/v1/monitoring/thresholds",
      headers: user.authHeader,
      payload: {
        freshness: { liveMaxMs: 4_000 },
        rules: [{ id: "API_LATENCY", thresholdValue: 2_500 }, { id: "SYNC_FAILURES", enabled: false }],
      },
    });
    expect(patched.statusCode).toBe(200);
    const thresholds = patched.json().thresholds;
    expect(thresholds.freshness.liveMaxMs).toBe(4_000);
    const latency = thresholds.rules.find((rule: { id: string }) => rule.id === "API_LATENCY");
    expect(latency?.thresholdValue).toBe(2_500);
    expect(latency?.thresholdLabel).toContain("2 500");
    const sync = thresholds.rules.find((rule: { id: string }) => rule.id === "SYNC_FAILURES");
    expect(sync?.enabled).toBe(false);

    // Persistence: a fresh read (and the CONFIG_CHANGE event) proves it stuck.
    const reread = await get(user.authHeader, "/api/v1/monitoring/overview");
    expect(reread.body.thresholds.freshness.liveMaxMs).toBe(4_000);
    expect(reread.body.thresholds.rules.find((rule: { id: string }) => rule.id === "API_LATENCY")?.thresholdValue).toBe(2_500);
    const configChange = reread.body.events.find(
      (event: { type: string }) => event.type === "CONFIG_CHANGE",
    );
    expect(configChange).toBeDefined();
  });

  it("validates input (unknown rule id, out-of-range freshness → 400)", async () => {
    const user = await administrator();
    const badRule = await app.inject({
      method: "PATCH",
      url: "/api/v1/monitoring/thresholds",
      headers: user.authHeader,
      payload: { rules: [{ id: "NOT_A_RULE", enabled: true }] },
    });
    expect(badRule.statusCode).toBe(400);
    const badFreshness = await app.inject({
      method: "PATCH",
      url: "/api/v1/monitoring/thresholds",
      headers: user.authHeader,
      payload: { freshness: { liveMaxMs: 0 } },
    });
    expect(badFreshness.statusCode).toBe(400);
  });

  it("keeps thresholds per-user - User B never sees User A's tuning (§34)", async () => {
    const a = await administrator();
    const b = await administrator();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/monitoring/thresholds",
      headers: a.authHeader,
      payload: { rules: [{ id: "API_DEGRADED", thresholdValue: 42 }] },
    });
    const bView = await get(b.authHeader, "/api/v1/monitoring/overview");
    const degraded = bView.body.thresholds.rules.find((rule) => rule.id === "API_DEGRADED");
    expect(degraded?.thresholdValue).toBe(10); // default - A's knob is A's own
    const aView = await get(a.authHeader, "/api/v1/monitoring/overview");
    expect(aView.body.thresholds.rules.find((rule: { id: string }) => rule.id === "API_DEGRADED")?.thresholdValue).toBe(42);
  });
});

describe("POST /monitoring/jobs/:jobId/run - observational only (§50)", () => {
  it("never fabricates a run: known and unknown jobs are refused with 409", async () => {
    const user = await administrator();
    const known = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/jobs/trading-sync/run",
      headers: user.authHeader,
    });
    expect(known.statusCode).toBe(409);
    expect(known.json()).toEqual({
      accepted: false,
      run: null,
      message: expect.stringContaining("app-driven"),
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/jobs/analytics-aggregation/run",
      headers: user.authHeader,
    });
    expect(unknown.statusCode).toBe(409);
    expect(unknown.json().accepted).toBe(false);
  });
});

describe("per-user isolation (§34/§49)", () => {
  it("never exposes another user's operational data", async () => {
    const a = await administrator();
    const b = await administrator();

    const aView = await get(a.authHeader, "/api/v1/monitoring/overview");
    const raw = JSON.stringify(aView.body);
    expect(raw).not.toContain(b.email);
    // B's broker accounts (none) and events cannot leak through A's view:
    expect(aView.body.brokers.every((broker) => broker.accountIdentifier !== "")).toBe(true);

    // Database entity counts are scoped: A's session count equals A's rows.
    const sessions = aView.body.database.entities.find((entity) => entity.label === "Sessions");
    expect(sessions?.count).toBeGreaterThanOrEqual(1);
  });
});

describe("negative capability - Monitoring cannot act (§50)", () => {
  it("has no mutation surface beyond its own thresholds", async () => {
    const user = await administrator();
    for (const [method, url] of [
      ["POST", "/api/v1/monitoring/overview"],
      ["DELETE", "/api/v1/monitoring/overview"],
      ["POST", "/api/v1/monitoring/events"],
      ["PATCH", "/api/v1/monitoring/events/e1"],
      ["POST", "/api/v1/monitoring/alerts"],
      ["POST", "/api/v1/monitoring/brokers"],
      ["PATCH", "/api/v1/monitoring/brokers/acc-1"],
      ["POST", "/api/v1/monitoring/services"],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: user.authHeader,
        payload: {},
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // It can neither place orders nor touch security state via its routes:
    for (const url of ["/api/v1/monitoring/orders", "/api/v1/monitoring/security-events"]) {
      const res = await app.inject({ method: "GET", url, headers: user.authHeader });
      expect(res.statusCode).toBe(404);
    }
  });
});
