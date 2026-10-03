/**
 * COSMOZ API — application error taxonomy (Foundation).
 *
 * These are the ONLY error types bounded contexts are expected to throw.
 * The global exception filter maps them 1:1 to stable HTTP responses with
 * the API error envelope: `{ error, code?, message?, issues?, requestId? }`.
 *
 * The envelope follows the convention already established by the frontend
 * client (`{error[, code]}`) and the MSW contract (ValidationError + issues).
 * Error messages thrown here are, by construction, safe to expose to clients.
 * Internal/unknown errors are NEVER forwarded — the filter replaces them.
 */

export type ErrorCategory =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "BusinessRule"
  | "RateLimited"
  | "ExternalProvider"
  | "Infrastructure"
  | "InternalError";

export class AppError extends Error {
  constructor(
    /** Public error token — the `error` field of the response envelope. */
    readonly category: ErrorCategory,
    /** HTTP status the filter maps this error to. */
    readonly status: number,
    message: string,
    /** Optional stable machine code for client-side copy selection (e.g. auth codes). */
    readonly code?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — input failed schema validation. Carries Zod issue list. */
export class ValidationError extends AppError {
  constructor(
    message = "The request payload is invalid.",
    readonly issues?: ReadonlyArray<{ path: string; message: string }>,
    code?: string,
  ) {
    super("ValidationError", 400, message, code);
  }
}

/** 401 — missing/invalid credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.", code?: string) {
    super("Unauthorized", 401, message, code);
  }
}

/** 403 — authenticated but not allowed (also the IDOR response). */
export class ForbiddenError extends AppError {
  constructor(message = "You are not allowed to perform this action.", code?: string) {
    super("Forbidden", 403, message, code);
  }
}

/** 404 — resource does not exist (or is owned by someone else). */
export class NotFoundError extends AppError {
  constructor(message = "The requested resource does not exist.", code?: string) {
    super("NotFound", 404, message, code);
  }
}

/** 409 — uniqueness/state conflicts (duplicate import ref, stale revision…). */
export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state.", code?: string) {
    super("Conflict", 409, message, code);
  }
}

/** 422 — valid payload, violated business invariant (domain layer). */
export class BusinessRuleError extends AppError {
  constructor(message: string, code?: string) {
    super("BusinessRule", 422, message, code);
  }
}

/** 429 — rate limit exceeded. */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please slow down.", code?: string) {
    super("RateLimited", 429, message, code);
  }
}

/** 502 — upstream provider (broker/market/email/OCR) failed. Never leaks provider internals. */
export class ExternalProviderError extends AppError {
  constructor(message = "An external service is currently unavailable.", code?: string) {
    super("ExternalProvider", 502, message, code);
  }
}

/** 500 — infrastructure failure (DB unreachable, queue down…). */
export class InfrastructureError extends AppError {
  constructor(message = "An infrastructure error occurred.", code?: string) {
    super("Infrastructure", 500, message, code);
  }
}
