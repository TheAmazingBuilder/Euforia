/**
 * Root logger factory (Foundation).
 *
 * ONE pino instance is created per process and shared by:
 *   - pino-http (request logging + `req.log` request-scoped children)
 *   - the Nest logger adapter
 *   - Prisma query diagnostics (development only)
 *
 * Production safety (Phase 1 mandate §15): secrets and credentials are
 * redacted by path; production never enables pretty transport; the raw
 * logger instance is only ever configured from validated AppConfig.
 */
import type { LoggerService } from "@nestjs/common";
import pino from "pino";
import type { AppConfig } from "../../config/app-config";

/** Header/field paths that must never reach a log line. */
export const REDACT_PATHS = [
  // Request credentials
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['x-refresh-token']",
  // Request payload secrets (auth vectors — validated contract fields)
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.refreshToken",
  "req.body.accessToken",
  "req.body.token",
  "req.body.mfaCode",
  "req.body.recoveryCode",
  "req.body.totpCode",
  "req.body.secret",
  // Nested secrets (provider credentials, integration payloads)
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.credentials",
];

const SERVICE_NAME = "cosmoz-api";

let cached: pino.Logger | undefined;

/**
 * Create (or return the memoized) root logger for this process.
 * Memoization guarantees pino-http and DI consumers share one instance.
 */
export function getOrCreateRootLogger(config: AppConfig): pino.Logger {
  if (cached) return cached;

  cached = pino({
    name: SERVICE_NAME,
    level: config.logLevel,
    base: { service: SERVICE_NAME, env: config.env },
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    // Pretty, human-readable logs in development only — production stays JSON.
    ...(config.isDevelopment
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", singleLine: true },
          },
        }
      : {}),
  });
  return cached;
}

/** Test helper — clears the memoized logger. Not used in production code. */
export function resetRootLoggerCache(): void {
  cached = undefined;
}

/** Injection token for the process-wide root pino logger. */
export const ROOT_LOGGER = Symbol("ROOT_LOGGER");
export type RootLogger = pino.Logger;

/**
 * Nest logger adapter — routes Nest's internal lifecycle logging (bootstrap,
 * shutdown, route mapping) into the structured pino logger so every line
 * shares the same format, service name and redaction.
 */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: pino.Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, this.asText(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error(
      { context, stack: trace },
      this.asText(message),
    );
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, this.asText(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, this.asText(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, this.asText(message));
  }
  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context }, this.asText(message));
  }

  private asText(message: unknown): string {
    if (typeof message === "string") return message;
    if (message instanceof Error) return message.message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
