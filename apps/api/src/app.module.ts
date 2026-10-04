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
import { SettingsModule } from "./modules/settings/settings.module";
import { TradesModule } from "./modules/trades/trades.module";
import { SecurityEventModule } from "./modules/security/security-event.module";
import { SecurityModule } from "./modules/security/security.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { CalculatorsModule } from "./modules/calculators/calculators.module";
import { OcrModule } from "./modules/ocr/ocr.module";

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
    // Settings — user preferences & display configuration (Phase 15): the
    // 9-domain doc. Reuses User.preferences via Identity's narrow contract
    // (§28 evolve-not-duplicate); owns NO identity/auth/account data (§42),
    // holds only a validated default-account reference (§21).
    SettingsModule,
    // Trading Core — the canonical journal domain (Phase 4): Cosmoz Trade
    // ≠ broker position ≠ broker deal (§1). Consumes the Accounts module's
    // narrow read contract for reconstruction (§26); owns the trade
    // lifecycle, the decision gate and ONE authoritative P&L implementation
    // (§46). No execution capability, no analytics (§59/§60/§68).
    TradesModule,
    // Security center — posture, activity, visibility (Phase 16). Orchestrates
    // identity capabilities; owns NO authentication/session/MFA logic (§3).
    SecurityModule,
    // Monitoring — thin operational observability (Phase 17): health,
    // metrics, jobs, providers. Consumes Accounts/Identity state; owns NO
    // domain semantics and NO security events (§3/§56).
    MonitoringModule,
    // Calculators — deterministic quantitative utilities (Phase 18): lot
    // size + compounding. Pure Request → Result, NO persistence, NO DB, NO
    // account/instrument ownership (§3/§34/§53); the authoritative sizing
    // implementation future contexts must reuse (§37).
    CalculatorsModule,
    // OCR / Screenshot Recognition (Phase 19): upload → validate → store →
    // recognize (FastAPI sidecar) → review → confirm. Owns its own aggregate
    // (OcrAsset/OcrRecognition); NEVER touches a Trade (§22/§42); records
    // into the shared SecurityEvent ledger (§48); engine resolved by factory
    // (sidecar → mock → explicit unavailable, §57).
    OcrModule,
    // modules/reference … — added by their own phases.
  ],
  providers: [globalExceptionFilterProvider],
})
export class AppModule {}
