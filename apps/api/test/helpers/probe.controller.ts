/**
 * Test-only probe controller.
 *
 * NOT part of the application - exists solely to exercise the Foundation
 * infrastructure end-to-end (validation pipe, error taxonomy, throttling)
 * without implementing any business domain (Phase 1 mandate §37).
 */
import { Controller, Get, Post, Query, Body } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../src/shared/auth/public.decorator";
import { z } from "zod";
import { ZodValidationPipe } from "../../src/shared/http/zod-validation.pipe";
import {
  AppError,
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

const probePayloadSchema = z.object({
  name: z.string().min(2),
  count: z.number().int().nonnegative(),
});

type ProbePayload = z.infer<typeof probePayloadSchema>;

const ERROR_CASES: Record<string, () => never> = {
  validation: () => {
    throw new ValidationError("Probe validation failure.", [
      { path: "field", message: "must be present" },
    ]);
  },
  unauthorized: () => {
    throw new UnauthorizedError();
  },
  forbidden: () => {
    throw new ForbiddenError();
  },
  notFound: () => {
    throw new NotFoundError();
  },
  conflict: () => {
    throw new ConflictError();
  },
  business: () => {
    throw new BusinessRuleError("Probe business rule violation.");
  },
  rateLimited: () => {
    throw new RateLimitError();
  },
  external: () => {
    throw new ExternalProviderError();
  },
  infrastructure: () => {
    throw new InfrastructureError();
  },
  // Raw unknown error - must surface as a sanitized InternalError.
  boom: () => {
    throw new Error("internal secret: postgres://user:hunter2@db/internal");
  },
};

@Public()
@Controller("probe")
export class ProbeController {
  /** Exercises the Zod validation pipe on the request body. */
  @Post("validate")
  validate(@Body(new ZodValidationPipe(probePayloadSchema)) payload: ProbePayload): ProbePayload {
    return payload;
  }

  /** Exercises the error taxonomy through the global filter. */
  @Get("error")
  error(@Query("kind") kind: string): string {
    const factory = ERROR_CASES[kind ?? ""];
    if (!factory) {
      throw new AppError("BusinessRule", 422, `Unknown probe kind "${kind ?? ""}".`);
    }
    return factory();
  }

  /** Exercises rate limiting with a strict per-route policy. */
  @Get("throttled")
  @Throttle({ default: { limit: 2, ttl: 1_000 } })
  throttled(): { ok: boolean } {
    return { ok: true };
  }
}
