/**
 * e2e - application infrastructure (health, routing conventions, validation,
 * error envelope, security headers, CORS, request correlation).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app?.close();
});

describe("health endpoints (unversioned infrastructure)", () => {
  it("GET /health → app status without sensitive fields", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("cosmoz-api");
    expect(typeof body.version).toBe("string");
    expect(body.env).toBe("test");
    expect(typeof body.uptimeSeconds).toBe("number");
    // Never leak configuration.
    expect(JSON.stringify(body)).not.toContain("postgresql://");
  });

  it("GET /health/live → liveness", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /health/ready → readiness including the database", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { database: "up" } });
  });

  it("health endpoints are NOT behind /api/v1 (infrastructure namespace)", async () => {
    const versioned = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(versioned.statusCode).toBe(404);
  });
});

describe("routing conventions", () => {
  it("unknown /api/v1 route → 404 with the error envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/definitely-missing" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("NotFound");
    expect(typeof body.message).toBe("string");
    expect(typeof body.requestId).toBe("string");
  });

  it("unknown root route → same envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/definitely-missing" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NotFound");
  });
});

describe("request validation (Zod pipe over contracts)", () => {
  it("valid payload passes and is returned parsed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/probe/validate",
      payload: { name: "cosmoz", count: 3 },
    });
    // 201 = Nest's documented POST default; Phase 2+ endpoints set explicit
    // codes per contract. The envelope matters here, not the success code.
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ name: "cosmoz", count: 3 });
  });

  it("invalid payload → 400 { error: 'ValidationError', issues } (contract envelope)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/probe/validate",
      payload: { name: "c", count: -1 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("ValidationError");
    const paths = body.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toContain("name");
    expect(paths).toContain("count");
    expect(typeof body.requestId).toBe("string");
  });

  it("malformed JSON → 400 with the error envelope (not a stack leak)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/probe/validate",
      payload: "{not-json",
      headers: { "content-type": "application/json" },
    });
    expect([400, 422]).toContain(res.statusCode);
    const body = res.json();
    expect(typeof body.error).toBe("string");
    expect(JSON.stringify(body)).not.toContain("at ");
  });
});

describe("error taxonomy through the global filter", () => {
  const cases: Array<[string, number, string]> = [
    ["validation", 400, "ValidationError"],
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["notFound", 404, "NotFound"],
    ["conflict", 409, "Conflict"],
    ["business", 422, "BusinessRule"],
    ["rateLimited", 429, "RateLimited"],
    ["external", 502, "ExternalProvider"],
  ];

  for (const [kind, status, category] of cases) {
    it(`kind=${kind} → ${status}/${category}`, async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/probe/error?kind=${kind}`,
      });
      expect(res.statusCode).toBe(status);
      expect(res.json().error).toBe(category);
    });
  }

  it("kind=boom → sanitized 500 InternalError, internals never leaked", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/probe/error?kind=boom",
    });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe("InternalError");
    // The raw error message contains a fake secret connection string that
    // must never appear in the response.
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });
});

describe("security baseline", () => {
  it("helmet headers are present on responses", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBeDefined();
    // Server fingerprinting avoided.
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("CORS: allowed origin receives CORS headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("CORS: disallowed origin receives NO CORS headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.example" },
    });
    // Without an allowlist match, no ACAO header is emitted - browsers then
    // block the response regardless of other CORS headers.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("request correlation: well-formed client id is reused and echoed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "e2e-request-id-0001" },
    });
    expect(res.headers["x-request-id"]).toBe("e2e-request-id-0001");
  });

  it("request correlation: unsafe client values are replaced", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "bad id\r\nX-Evil: 1" },
    });
    const echoed = res.headers["x-request-id"] as string | undefined;
    expect(echoed).toBeDefined();
    expect(echoed).not.toContain("X-Evil");
    expect(echoed).not.toBe("bad id");
  });
});
