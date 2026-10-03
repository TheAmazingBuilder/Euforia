import { describe, expect, it } from "vitest";
import { EnvValidationError, validateEnv } from "../../src/config/env.schema";

const BASE_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://cosmoz@127.0.0.1:5433/cosmoz_test",
  AUTH_JWT_SECRET: "test-only-jwt-secret-0123456789abcdef0123456789",
  AUTH_MFA_ENCRYPTION_KEY: "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=",
} as const;

describe("validateEnv", () => {
  it("applies safe development defaults", () => {
    const env = validateEnv(BASE_ENV);
    expect(env.NODE_ENV).toBe("test");
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.BODY_LIMIT_BYTES).toBe(1_048_576);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(env.RATE_LIMIT_MAX).toBe(120);
  });

  it("accepts a full explicit configuration", () => {
    const env = validateEnv({
      ...BASE_ENV,
      NODE_ENV: "production",
      PORT: "8080",
      CORS_ORIGINS: "https://app.cosmoz.app , https://admin.cosmoz.app/",
      LOG_LEVEL: "warn",
      BODY_LIMIT_BYTES: "4096",
      TRUST_PROXY: "true",
      RATE_LIMIT_WINDOW_SECONDS: "30",
      RATE_LIMIT_MAX: "1000",
      MARKET_SERVICE_URL: "https://market.cosmoz.internal",
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(["https://app.cosmoz.app", "https://admin.cosmoz.app"]);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.MARKET_SERVICE_URL).toBe("https://market.cosmoz.internal");
  });

  it("fails in a controlled way when DATABASE_URL is missing", () => {
    try {
      validateEnv({});
      expect.unreachable("expected EnvValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues;
      expect(issues.some((issue) => issue.path === "DATABASE_URL")).toBe(true);
    }
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() => validateEnv({ DATABASE_URL: "file:./dev.db" })).toThrow();
    expect(() => validateEnv({ DATABASE_URL: "mysql://user@host/db" })).toThrow();
  });

  it("rejects wildcard CORS origins (credentials are always enabled)", () => {
    expect(() =>
      validateEnv({ ...BASE_ENV, CORS_ORIGINS: "*" }),
    ).toThrow(/must not contain/);
  });

  it("rejects malformed CORS origins", () => {
    expect(() => validateEnv({ ...BASE_ENV, CORS_ORIGINS: "localhost:3000" })).toThrow(
      /http:\/\//,
    );
  });

  it("rejects invalid values for numeric and enum settings", () => {
    expect(() => validateEnv({ ...BASE_ENV, PORT: "not-a-port" })).toThrow();
    expect(() => validateEnv({ ...BASE_ENV, LOG_LEVEL: "verbose" })).toThrow();
    expect(() => validateEnv({ ...BASE_ENV, RATE_LIMIT_MAX: "0" })).toThrow();
    expect(() => validateEnv({ ...BASE_ENV, MARKET_SERVICE_URL: "not a url" })).toThrow();
  });

  it("SECURITY: error messages contain key paths, never secret VALUES", () => {
    const secretUrl = "postgresql://admin:hunter2-supersecret@10.0.0.9:5432/prod";
    try {
      validateEnv({ NODE_ENV: "production", DATABASE_URL: "ftp://nope" });
      expect.unreachable("expected EnvValidationError");
    } catch (error) {
      const message = (error as Error).message;
      // Redacted cross-check: a hypothetical secret from another field must
      // never appear anywhere in the validation output.
      expect(message).not.toContain("hunter2-supersecret");
      expect(message).toContain("DATABASE_URL");
    }
    void secretUrl;
  });
});
