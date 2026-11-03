import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PRISMA_LOGGER_OPTIONS, type PrismaLoggerOptions } from "./prisma.constants";

/**
 * The single Prisma client of the monolith (infrastructure capability).
 *
 * Bounded contexts (Phase 2+) MUST NOT import this type in their public
 * interfaces - they define repository interfaces and receive an
 * implementation injected from infrastructure. See apps/api README,
 * section "Prisma boundary".
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(PRISMA_LOGGER_OPTIONS)
    @Optional()
    loggerOptions?: PrismaLoggerOptions,
  ) {
    super({
      log: loggerOptions?.log ?? [{ emit: "event", level: "error" }],
    });
    if (loggerOptions?.logger) {
      this.wireDiagnostics(loggerOptions.logger);
    }
  }

  async onModuleInit(): Promise<void> {
    // Fail the bootstrap when the database is unreachable: a running API
    // without its database is never a healthy state.
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Cheap connectivity probe for health/readiness.
   * Returns a boolean instead of throwing - the health layer decides how to
   * expose failure (never leaking the raw error to clients).
   */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Route Prisma events into the structured logger.
   * `$on` typing depends on the log configuration passed to the constructor;
   * the cast keeps the wiring honest without loosening the rest of the class.
   */
  private wireDiagnostics(logger: { debug: (obj: object, msg?: string) => void }): void {
    const emitter = this as unknown as {
      $on(event: "query", listener: (event: Prisma.QueryEvent) => void): void;
      $on(event: "warning", listener: (event: Prisma.LogEvent) => void): void;
      $on(event: "error", listener: (event: Prisma.LogEvent) => void): void;
    };
    try {
      emitter.$on("query", (event) => {
        logger.debug(
          { query: event.query, durationMs: event.duration, params: "[Redacted]" },
          "prisma query",
        );
      });
      emitter.$on("warning", (event) => logger.debug({ message: event.message }, "prisma warning"));
      emitter.$on("error", (event) => logger.debug({ message: event.message }, "prisma error"));
    } catch {
      // Diagnostics wiring must never break the application.
    }
  }
}
