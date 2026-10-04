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
import { IdentityModule } from "./modules/identity/identity.module";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { SecurityEventModule } from "./modules/security/security-event.module";
import { SecurityModule } from "./modules/security/security.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";

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
    // ── bounded contexts ────────────────────────────────────────────────────
    // SecurityEventModule FIRST: the shared append-only ledger port that
    // Identity and Accounts record into (Phase 16 §34).
    SecurityEventModule,
    IdentityModule,
    AccountsModule,
    // Security center — posture, activity, visibility (Phase 16). Orchestrates
    // identity capabilities; owns NO authentication/session/MFA logic (§3).
    SecurityModule,
    // Monitoring — thin operational observability (Phase 17): health,
    // metrics, jobs, providers. Consumes Accounts/Identity state; owns NO
    // domain semantics and NO security events (§3/§56).
    MonitoringModule,
    // modules/reference … — added by their own phases.
  ],
  providers: [globalExceptionFilterProvider],
})
export class AppModule {}
