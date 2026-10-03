/**
 * Prisma infrastructure (Foundation).
 *
 * Prisma is INFRASTRUCTURE ONLY (Phase 1 mandate §10):
 *   - it never crosses a bounded-context boundary,
 *   - its generated types never become the domain model,
 *   - future contexts depend on repository interfaces; this service is the
 *     transactional/technical driver behind those adapters.
 *
 * Responsibilities here: client lifecycle (connect on init, disconnect on
 * shutdown), health ping, and development-only query diagnostics.
 */
import { Global, Module, type Provider } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { ROOT_LOGGER } from "../logging/logger.factory";
import { PRISMA_LOGGER_OPTIONS, type PrismaLoggerOptions } from "./prisma.constants";
import { PrismaService } from "./prisma.service";

const prismaLoggerOptionsProvider: Provider = {
  provide: PRISMA_LOGGER_OPTIONS,
  useFactory: (
    config: AppConfig,
    rootLogger?: { debug: (obj: object, msg?: string) => void },
  ): PrismaLoggerOptions => ({
    // Query diagnostics in development/test only — never in production logs.
    log:
      config.isDevelopment || config.env === "test"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ],
    logger: rootLogger,
  }),
  inject: [APP_CONFIG, { token: ROOT_LOGGER, optional: true }],
};

@Global()
@Module({
  providers: [prismaLoggerOptionsProvider, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
