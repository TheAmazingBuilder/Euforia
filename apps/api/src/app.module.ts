/**
 * COSMOZ API — composition root (Foundation).
 *
 * Imports (in order): configuration → logging → database → security →
 * infrastructure modules. Bounded contexts (Phase 2+) will be added under
 * `src/modules/<context>` — NOT here as services; each context brings its
 * own module and registers its own controllers/providers.
 *
 * NO business domain is wired in Foundation (Phase 1 mandate §37).
 */
import { Module } from "@nestjs/common";
import type { Provider } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { LoggingModule } from "./infrastructure/logging/logging.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { RateLimitModule } from "./infrastructure/security/rate-limit.module";
import { HealthModule } from "./infrastructure/health/health.module";
import { AllExceptionsFilter } from "./shared/http/all-exceptions.filter";
import { APP_CONFIG, type AppConfig } from "./config/app-config";

const globalExceptionFilterProvider: Provider = {
  provide: APP_FILTER,
  useFactory: (config: AppConfig) => new AllExceptionsFilter(config.isDevelopment),
  inject: [APP_CONFIG],
};

@Module({
  imports: [
    // ── infrastructure (global capabilities) ────────────────────────────────
    ConfigModule,
    LoggingModule,
    PrismaModule,
    RateLimitModule,
    // ── system ──────────────────────────────────────────────────────────────
    HealthModule,
    // ── bounded contexts (Phase 2+) ─────────────────────────────────────────
    // modules/identity … modules/system — added by their own phases.
  ],
  providers: [globalExceptionFilterProvider],
})
export class AppModule {}
