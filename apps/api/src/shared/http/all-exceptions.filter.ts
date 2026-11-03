/**
 * Global exception filter - the SINGLE exit point for every error the API
 * emits (Phase 1 mandate §14).
 *
 * Responsibilities:
 *   1. Map any thrown value to a stable, safe response (error-mapper.ts).
 *   2. Preserve the correlation id (request id) in the payload.
 *   3. Log: 5xx/unknown with stack at `error`, 4xx at `warn` - request-scoped
 *      when pino-http context is available.
 *   4. Never leak secrets, stacks, SQL or infrastructure internals.
 */
import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { RateLimitError } from "../errors/app-error";
import {
  logSeverityFor,
  mapErrorToResponse,
} from "./error-mapper";

type RequestWithLog = FastifyRequest;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly isDevelopment: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithLog>();
    const reply = ctx.getResponse<FastifyReply>();

    const { status, body, sanitized } = mapErrorToResponse(exception, {
      isDevelopment: this.isDevelopment,
    });

    const requestId = request?.id !== undefined ? String(request.id) : undefined;
    const payload = requestId !== undefined ? { ...body, requestId } : body;

    // Rate-limit responses carry Retry-After (whole seconds) - the frontend
    // uses it for countdown copy (mock-parity contract).
    if (exception instanceof RateLimitError && exception.retryAfterSeconds !== undefined) {
      void reply.header("retry-after", String(Math.max(1, exception.retryAfterSeconds)));
    }

    this.log(exception, request, status, sanitized);

    if (!reply.sent) {
      void reply.status(status).send(payload);
    }
  }

  private log(
    exception: unknown,
    request: RequestWithLog | undefined,
    status: number,
    sanitized: boolean,
  ): void {
    const severity = logSeverityFor(status, sanitized);
    const base = {
      status,
      method: request?.method,
      url: request?.url,
      requestId: request?.id !== undefined ? String(request.id) : undefined,
    };

    // 5xx / unknown → include the error + stack for diagnostics.
    // 4xx known → warn without stack (client fault, not a defect).
    const details =
      severity === "error"
        ? {
            ...base,
            err: {
              name: exception instanceof Error ? exception.name : typeof exception,
              message: exception instanceof Error ? exception.message : String(exception),
              stack: exception instanceof Error ? exception.stack : undefined,
            },
          }
        : { ...base, errMessage: exception instanceof Error ? exception.message : undefined };

    const logger = request?.log as
      | { warn: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void }
      | undefined;
    if (logger) {
      logger[severity](details, "request failed");
    } else if (severity === "error") {
       
      console.error("[unhandled]", details);
    } else {
       
      console.warn("[request failed]", details);
    }
  }
}
