import { describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import {
  BusinessRuleError,
  ConflictError,
  ExternalProviderError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "../../src/shared/errors/app-error";
import {
  isZodErrorLike,
  logSeverityFor,
  mapErrorToResponse,
} from "../../src/shared/http/error-mapper";

const OPTS = { isDevelopment: false };

describe("mapErrorToResponse — AppError taxonomy", () => {
  const cases: Array<[string, Error, number, string]> = [
    ["ValidationError", new ValidationError("bad", [{ path: "a", message: "x" }]), 400, "ValidationError"],
    ["UnauthorizedError", new UnauthorizedError(), 401, "Unauthorized"],
    ["ForbiddenError", new ForbiddenError(), 403, "Forbidden"],
    ["NotFoundError", new NotFoundError(), 404, "NotFound"],
    ["ConflictError", new ConflictError(), 409, "Conflict"],
    ["BusinessRuleError", new BusinessRuleError("nope"), 422, "BusinessRule"],
    ["RateLimitError", new RateLimitError(), 429, "RateLimited"],
    ["ExternalProviderError", new ExternalProviderError(), 502, "ExternalProvider"],
    ["InfrastructureError", new InfrastructureError(), 500, "Infrastructure"],
  ];

  for (const [label, thrown, expectedStatus, expectedCategory] of cases) {
    it(`maps ${label} → ${expectedStatus}/${expectedCategory}`, () => {
      const mapped = mapErrorToResponse(thrown, OPTS);
      expect(mapped.status).toBe(expectedStatus);
      expect(mapped.body.error).toBe(expectedCategory);
      expect(mapped.sanitized).toBe(false);
    });
  }

  it("propagates issues and stable codes for ValidationError", () => {
    const mapped = mapErrorToResponse(
      new ValidationError("bad", [{ path: "name", message: "required" }], "E_NAME"),
      OPTS,
    );
    expect(mapped.body.issues).toEqual([{ path: "name", message: "required" }]);
    expect(mapped.body.code).toBe("E_NAME");
  });
});

describe("mapErrorToResponse — framework and unknown errors", () => {
  it("maps ZodError-like values to 400 ValidationError with issues", () => {
    const mapped = mapErrorToResponse(
      { name: "ZodError", issues: [{ path: ["user", "email"], message: "invalid" }] },
      OPTS,
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toBe("ValidationError");
    expect(mapped.body.issues).toEqual([{ path: "user.email", message: "invalid" }]);
  });

  it("preserves 4xx HttpExceptions (message forwarded)", () => {
    const mapped = mapErrorToResponse(
      new HttpException("Cannot GET /x", HttpStatus.NOT_FOUND),
      OPTS,
    );
    expect(mapped.status).toBe(404);
    expect(mapped.body.error).toBe("NotFound");
    expect(mapped.body.message).toBe("Cannot GET /x");
  });

  it("SANITIZES 5xx HttpExceptions outside development", () => {
    const mapped = mapErrorToResponse(
      new HttpException("db conn string postgresql://u:p@h/db", HttpStatus.SERVICE_UNAVAILABLE),
      { isDevelopment: false },
    );
    expect(mapped.status).toBe(503);
    expect(mapped.sanitized).toBe(true);
    expect(mapped.body.message).not.toContain("postgresql://");
    expect(JSON.stringify(mapped.body)).not.toContain("hunter2");
  });

  it("maps fastify payload-too-large to 413 with framework code", () => {
    const mapped = mapErrorToResponse(
      { code: "FST_ERR_CTP_BODY_TOO_LARGE", statusCode: 413, message: "Request body is too large" },
      OPTS,
    );
    expect(mapped.status).toBe(413);
    expect(mapped.body.error).toBe("ValidationError");
    expect(mapped.body.code).toBe("FST_ERR_CTP_BODY_TOO_LARGE");
  });

  it("maps prisma P2002 to 409 Conflict without leaking SQL", () => {
    const mapped = mapErrorToResponse(
      { code: "P2002", message: "Unique constraint failed on the constraint `trades_external_ref_key`" },
      OPTS,
    );
    expect(mapped.status).toBe(409);
    expect(mapped.body.error).toBe("Conflict");
    expect(mapped.sanitized).toBe(true);
    expect(JSON.stringify(mapped.body)).not.toContain("external_ref_key");
  });

  it("SANITIZES unknown errors — message and internals never reach the client", () => {
    const mapped = mapErrorToResponse(
      new Error("connect ECONNREFUSED 10.0.0.9:5432 secret=hunter2"),
      OPTS,
    );
    expect(mapped.status).toBe(500);
    expect(mapped.body.error).toBe("InternalError");
    expect(JSON.stringify(mapped.body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(mapped.body)).not.toContain("hunter2");
    expect(mapped.sanitized).toBe(true);
  });

  it("treats non-Error throwables as InternalError", () => {
    const mapped = mapErrorToResponse("a string was thrown", OPTS);
    expect(mapped.status).toBe(500);
    expect(mapped.body.error).toBe("InternalError");
  });
});

describe("logSeverityFor", () => {
  it("warns for known 4xx and errors for 5xx/sanitized", () => {
    expect(logSeverityFor(404, false)).toBe("warn");
    expect(logSeverityFor(429, false)).toBe("warn");
    expect(logSeverityFor(500, false)).toBe("error");
    expect(logSeverityFor(503, true)).toBe("error");
  });
});

describe("isZodErrorLike", () => {
  it("recognizes zod-shaped failures and rejects app errors", () => {
    expect(isZodErrorLike({ name: "ZodError", issues: [] })).toBe(true);
    // Application errors also carry an issues array but are NOT Zod errors —
    // they flow through the AppError branch (their paths are strings).
    expect(isZodErrorLike(new ValidationError("bad", [{ path: "a", message: "x" }]))).toBe(false);
    expect(isZodErrorLike({ issues: [{ path: [], message: "x" }] })).toBe(false);
    expect(isZodErrorLike("boom")).toBe(false);
    expect(isZodErrorLike(new Error("no issues"))).toBe(false);
  });
});
