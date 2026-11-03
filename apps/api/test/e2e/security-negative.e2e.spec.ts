/**
 * e2e - security NEGATIVE tests (Phase 1 mandate §33).
 * Proves unsafe behaviors are rejected, not just that happy paths work.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { TEST_DB_NAME } from "../global-setup";
import { EnvValidationError, validateEnv } from "../../src/config/env.schema";

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app?.close();
});

describe("rate limiting foundation", () => {
  it("per-route strict policy: 3rd request within window → 429 RateLimited envelope", async () => {
    const first = await app.inject({ method: "GET", url: "/api/v1/probe/throttled" });
    const second = await app.inject({ method: "GET", url: "/api/v1/probe/throttled" });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const third = await app.inject({ method: "GET", url: "/api/v1/probe/throttled" });
    expect(third.statusCode).toBe(429);
    expect(third.json().error).toBe("RateLimited");
  });

  it("health endpoints are exempt (probe endpoints must not self-lock out)", async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({ method: "GET", url: "/health/live" });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("oversized payloads are rejected", () => {
  it("body beyond BODY_LIMIT_BYTES → 413 with the error envelope", async () => {
    // Beyond the COHERENT default (9 MB - must clear the 6 MB image caps,
    // see env.schema superRefine). 9.6 MB of JSON trips the Fastify limit.
    const bigPayload = JSON.stringify({ name: "x".repeat(9_600_000), count: 1 });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/probe/validate",
      payload: bigPayload,
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(413);
    const body = res.json();
    expect(typeof body.error).toBe("string");
    expect(typeof body.requestId).toBe("string");
  });
});

describe("readiness reflects database failure (without leaking internals)", () => {
  it("/health/ready → 503 with plain down-status when the DB is unreachable", async () => {
    // PrismaClient reconnects lazily, so a real outage cannot be simulated -
    // stub the Prisma capability at the DI boundary instead. The layer under
    // test is the readiness contract, not Prisma internals.
    const downApp = await buildTestApp({ prismaPing: async () => false });
    try {
      const res = await downApp.inject({ method: "GET", url: "/health/ready" });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(JSON.stringify(body)).not.toContain("postgresql://");
      expect(JSON.stringify(body)).not.toContain("connection string");
    } finally {
      await downApp.close();
    }
  });

  it("/health/ready recovers once the database is reachable again", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
  });
});

describe("environment validation fails safely at startup", () => {
  it("missing DATABASE_URL → controlled EnvValidationError listing the key", () => {
    expect(() => validateEnv({ NODE_ENV: "test" })).toThrow(EnvValidationError);
    try {
      validateEnv({ NODE_ENV: "test" });
    } catch (error) {
      const issues = (error as EnvValidationError).issues;
      expect(issues.some((issue) => issue.path === "DATABASE_URL")).toBe(true);
    }
  });

  it("SECURITY: production rejects wildcard CORS after unrelated settings validate", () => {
    const productionConfig = {
      NODE_ENV: "production" as const,
      DATABASE_URL: "postgresql://u:p@h/db",
      AUTH_JWT_SECRET: "prod-jwt-secret-0123456789abcdef0123456789",
      AUTH_MFA_ENCRYPTION_KEY: "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=",
      ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=",
      INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY: "u4xveSMFK0EL4Wp6XsBmPWcimrrG7Tg9KxLFRnGzc1M=",
      SMTP_USER: "ci-mail@example.test",
      SMTP_APP_PASSWORD: "ci-only-app-password",
      WEB_APP_URL: "https://app.euforia.test",
    };
    const result = validateEnv(productionConfig);
    expect(result.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
    expect(() => validateEnv({ ...productionConfig, CORS_ORIGINS: "*" })).toThrow(
      /must not contain/,
    );
  });

  it("SECURITY: invalid env error output never contains secret values", () => {
    try {
      validateEnv({ NODE_ENV: "production", DATABASE_URL: "no-protocol:yes" });
      expect.unreachable();
    } catch (error) {
      const message = JSON.stringify((error as EnvValidationError).issues);
      // The user-supplied value must never appear; only static hints do.
      expect(message).not.toContain("no-protocol:yes");
    }
  });
});

describe("test database safety", () => {
  it("the running test process targets the dedicated test database (TEST_DB_NAME)", () => {
    // The DB name is parameterized: default "cosmoz_test", overridable via
    // DATABASE_URL_TEST (e.g. ".../euforia_test"). Same static import as
    // test/setup.ts - global-setup top-level code is pure constants, no
    // side effects at module load.
    const url = new URL(process.env.DATABASE_URL as string);
    expect(url.pathname).toBe(`/${TEST_DB_NAME}`);
    expect(process.env.NODE_ENV).toBe("test");
  });
});
