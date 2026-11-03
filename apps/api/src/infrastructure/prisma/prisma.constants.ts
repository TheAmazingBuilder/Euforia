import type { Prisma } from "@prisma/client";

/** Runtime options for the Prisma client (log routing). */
export interface PrismaLoggerOptions {
  log: Prisma.LogDefinition[];
  /** Present in development/test - receives query diagnostics. */
  logger?: { debug: (obj: object, msg?: string) => void };
}

/** DI token for {@link PrismaLoggerOptions}. */
export const PRISMA_LOGGER_OPTIONS = Symbol("PRISMA_LOGGER_OPTIONS");
