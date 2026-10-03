/**
 * COSMOZ API — error mapping (pure functions, unit-testable without HTTP).
 *
 * Maps ANY thrown value to a stable API response:
 *   `{ error: <category>, code?, message?, issues?, requestId? }`
 *
 * Safety rules (Phase 1 mandate §13/§14):
 *   - Known application errors (AppError) → their own status + safe message.
 *   - ZodError → 400 ValidationError with issues (frontend-rendered shape).
 *   - Nest HttpException with status < 500 → preserved, message forwarded.
 *   - Nest HttpException with status ≥ 500 → message hidden outside
 *     development (may contain internals).
 *   - Fastify framework errors (body too large, bad JSON…) → mapped by status.
 *   - Prisma known errors → Conflict/NotFound; everything else → generic 500.
 *   - Anything unknown → 500 InternalError; the original error is only logged,
 *     never returned (no stack, no DB internals, no secrets).
 */
import { HttpException, HttpStatus } from "@nestjs/common";
import { AppError, ValidationError } from "../errors/app-error";
import type { ErrorCategory } from "../errors/app-error";

/** Minimal structural types — avoids coupling this module to fastify/prisma. */
interface ErrLike {
  message?: unknown;
  stack?: string;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

export interface MappedError {
  status: number;
  body: {
    error: ErrorCategory;
    code?: string;
    message?: string;
    issues?: ReadonlyArray<{ path: string; message: string }>;
    requestId?: string;
  };
  /** true when the filter had to substitute a safe message (5xx / unknown). */
  sanitized: boolean;
}

const STATUS_TO_CATEGORY: Record<number, ErrorCategory> = {
  [HttpStatus.BAD_REQUEST]: "ValidationError",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "NotFound",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "BusinessRule",
  [HttpStatus.TOO_MANY_REQUESTS]: "RateLimited",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "ValidationError",
  [HttpStatus.BAD_GATEWAY]: "ExternalProvider",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "InternalError",
};

function asStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined;
}

function safeMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    ? value
    : undefined;
}

/** True for values that are clearly Zod validation failures. */
export function isZodErrorLike(err: unknown): err is {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
} {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as ErrLike & { issues?: unknown }).issues)
  );
}

function fromZodError(err: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }): MappedError {
  const validation = new ValidationError(
    "The request payload is invalid.",
    err.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    })),
  );
  return {
    status: validation.status,
    body: { error: validation.category, issues: validation.issues },
    sanitized: false,
  };
}

function fromAppError(err: AppError): MappedError {
  const body: MappedError["body"] = { error: err.category, message: err.message };
  if (err.code !== undefined) body.code = err.code;
  if (err instanceof ValidationError && err.issues !== undefined) {
    body.issues = err.issues;
  }
  return { status: err.status, body, sanitized: false };
}

function fromHttpException(err: HttpException, isDevelopment: boolean): MappedError {
  const status = err.getStatus();
  const category = STATUS_TO_CATEGORY[status] ?? "InternalError";
  const response = err.getResponse();
  const responseMessage =
    typeof response === "string"
      ? response
      : safeMessage((response as { message?: unknown })?.message) ?? err.message;

  const body: MappedError["body"] = { error: category };
  if (status < 500) {
    body.message = responseMessage;
  } else if (isDevelopment) {
    body.message = responseMessage;
  } else {
    body.message = "An unexpected error occurred.";
  }
  return { status, body, sanitized: status >= 500 && !isDevelopment };
}

/** Fastify framework errors: FST_ERR_* (bad JSON, body too large, …). */
function fromFrameworkError(err: ErrLike): MappedError | undefined {
  const code = typeof err.code === "string" ? err.code : undefined;
  if (!code || !code.startsWith("FST_ERR_")) return undefined;
  const status = asStatus(err.statusCode) ?? asStatus(err.status) ?? 500;
  const category = STATUS_TO_CATEGORY[status] ?? "InternalError";
  const body: MappedError["body"] = { error: category, code };
  const message = safeMessage(err.message);
  if (status < 500 && message) body.message = message;
  return { status, body, sanitized: false };
}

/** Prisma known request errors — mapped conservatively, never leaking SQL. */
function fromPrismaError(err: ErrLike): MappedError | undefined {
  const code = typeof err.code === "string" ? err.code : undefined;
  if (!code || !/^P\d{4}$/.test(code)) return undefined;
  if (code === "P2002") {
    return {
      status: 409,
      body: { error: "Conflict", message: "The request conflicts with the current state." },
      sanitized: true,
    };
  }
  if (code === "P2025") {
    return {
      status: 404,
      body: { error: "NotFound", message: "The requested resource does not exist." },
      sanitized: true,
    };
  }
  return {
    status: 500,
    body: { error: "Infrastructure", message: "A database error occurred." },
    sanitized: true,
  };
}

function fromUnknown(err: ErrLike, isDevelopment: boolean): MappedError {
  void isDevelopment; // parity of signature with other mappers
  const fallbackStatus = asStatus(err.status) ?? asStatus(err.statusCode);
  const status = fallbackStatus ?? 500;
  const category = STATUS_TO_CATEGORY[status] ?? "InternalError";
  const body: MappedError["body"] = { error: category };
  // Unknown thrower — the original message may contain internals (stack,
  // SQL, provider payloads) and is NEVER forwarded.
  body.message = "An unexpected error occurred.";
  return { status, body, sanitized: status >= 500 };
}

export function mapErrorToResponse(err: unknown, options: { isDevelopment: boolean }): MappedError {
  if (isZodErrorLike(err)) return fromZodError(err);
  if (err instanceof AppError) return fromAppError(err);
  if (err instanceof HttpException) return fromHttpException(err, options.isDevelopment);

  const errLike: ErrLike = (typeof err === "object" && err !== null ? err : {}) as ErrLike;
  return (
    fromFrameworkError(errLike) ??
    fromPrismaError(errLike) ??
    fromUnknown(errLike, options.isDevelopment)
  );
}

/** Severity used for logging: 5xx and unknown = error, 4xx = warn. */
export function logSeverityFor(status: number, sanitized: boolean): "warn" | "error" {
  return status >= 500 || sanitized ? "error" : "warn";
}
