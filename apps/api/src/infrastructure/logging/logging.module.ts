/**
 * Logging module — provides the process-wide structured logger (pino) and
 * the pino-http request-logging options (request correlation + redaction).
 *
 * The module is @Global so any future bounded context can inject the
 * {@link ROOT_LOGGER} without re-import plumbing. The pino-http plugin
 * itself is registered by `configureApp` (app.setup.ts) using the SAME
 * memoized logger instance — request logs and application logs share
 * format, level and redaction rules.
 */
import { Global, Module } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type { Options as PinoHttpOptions } from "pino-http";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { REQUEST_ID_HEADER, resolveRequestId } from "../../shared/http/request-id";
import {
  NestPinoLogger,
  ROOT_LOGGER,
  getOrCreateRootLogger,
  type RootLogger,
} from "./logger.factory";

/** Build pino-http options (used by configureApp). */
export function buildPinoHttpOptions(logger: RootLogger): PinoHttpOptions {
  return {
    logger,
    genReqId: (req: IncomingMessage) =>
      resolveRequestId(req.headers[REQUEST_ID_HEADER]),
    // Health probes would flood logs in production — skip auto-logging them.
    // Failures on health paths still surface via the exception filter.
    autoLogging: {
      ignore: (req: IncomingMessage) =>
        typeof req.url === "string" && req.url.startsWith("/health"),
    },
    // Top-level requestId for grep-ability (pino-http also binds req.id).
    customProps: (req: IncomingMessage) => ({ requestId: String((req as { id?: string }).id) }),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: ROOT_LOGGER,
      useFactory: (config: AppConfig) => getOrCreateRootLogger(config),
      inject: [APP_CONFIG],
    },
    {
      provide: NestPinoLogger,
      useFactory: (logger: ReturnType<typeof getOrCreateRootLogger>) => new NestPinoLogger(logger),
      inject: [ROOT_LOGGER],
    },
  ],
  exports: [ROOT_LOGGER, NestPinoLogger],
})
export class LoggingModule {}
