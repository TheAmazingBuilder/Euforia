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
import { GhostsModule } from "./modules/ghosts/ghosts.module";
import { DisciplineModule } from "./modules/discipline/discipline.module";
import { SessionModule } from "./modules/session/session.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { ReviewModule } from "./modules/review/review.module";
import { SessionLiveModule } from "./modules/session-live/session-live.module";
import { PlaybookModule } from "./modules/playbook/playbook.module";
import { NofyModule } from "./modules/nofy/nofy.module";
import { AcademyModule } from "./modules/academy/academy.module";
import { StatsModule } from "./modules/stats/stats.module";
import { BackupModule } from "./modules/backup/backup.module";
import { DomainEventsModule } from "./infrastructure/events/domain-events.module";
import { SecurityEventModule } from "./modules/security/security-event.module";
import { SecurityModule } from "./modules/security/security.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { CalculatorsModule } from "./modules/calculators/calculators.module";
import { OcrModule } from "./modules/ocr/ocr.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { TradingModule } from "./modules/trading/trading.module";
import { TradePlanningModule } from "./modules/trade-planning/trade-planning.module";
import { TradeReviewModule } from "./modules/trade-review/trade-review.module";
import { ReplayModule } from "./modules/replay/replay.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { OryonModule } from "./modules/oryon/oryon.module";
import { PlansModule } from "./modules/plans/plans.module";

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
    // Domain events — the in-process fact bus (`trade.closed`, …) that lets
    // contexts react to other contexts' facts without module cycles.
    DomainEventsModule,
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
    // Trading Core — the canonical journal domain (Phase 4): Euforia Trade
    // ≠ broker position ≠ broker deal (§1). Consumes the Accounts module's
    // narrow read contract for reconstruction (§26); owns the trade
    // lifecycle, the decision gate and ONE authoritative P&L implementation
    // (§46). No execution capability, no analytics (§59/§60/§68).
    TradesModule,
    // Ghost Trades (B6) — the Registre des Regrets: 10-second skipped-setup
    // capture + deferred settlement. Owns ONLY skippedTradeRow; aggregates
    // (Discipline Saved / Hesitation Cost) belong to Discipline (B4), which
    // consumes these rows — never duplicates them (§26/§46).
    GhostsModule,
    // Discipline (B4) — the Discipline Engine (Domaine 7): rules, violations
    // (context frozen at time T), alert inbox and the process aggregates
    // (score, emotion matrix, mistakes ledger). Consumes journal facts via
    // the Trades read contract; rule evaluation rides the `trade.closed`
    // domain event — NO Trades→Discipline cycle (§26/§46).
    DisciplineModule,
    // Session (B5) — the server-assembled trading day: timeline + mood strip
    // + logbook notes. Consumes journal facts and discipline alerts via the
    // owning contexts' narrow contracts; owns ONLY sessionNoteRow.
    SessionModule,
    // Calendar (B7) — the trading-calendar overlay: eco events (deterministic
    // synthetic source), day-off/news blocks, per-day aggregates (OFF days
    // excluded server-side). Consumes journal/discipline/settings facts via
    // narrow contracts; owns ONLY calendarBlockRow.
    CalendarModule,
    // Trade Review (B8) — the post-trade review workflow fused with Goal
    // setting: reviews (one per trade, upsert) + goals with server-computed
    // progress over resolved calendar periods. Owns reviewRow (REVIEW|GOAL).
    ReviewModule,
    // Session Live (B9) — trading-session lifecycle, saved analyses, key
    // levels. Documentation entities ONLY; strictly read-only vs brokers
    // (§2/§50): no execution path exists. End summary is §43-honest.
    SessionLiveModule,
    // Playbook (B10) — the Professional Playbook: strategy CRUD with
    // server-side versioning, setups, checklists, operating rules, template
    // library and the module aggregates. Owns playbookRow
    // (STRATEGY|SETUP|CHECKLIST|RULE|VERSION).
    PlaybookModule,
    // Nofy (B11) — the personal trading knowledge & notes workspace: notes
    // of ordered blocks, folders, tags, templates, version history, search,
    // entity picker. Reference blocks are relational pointers re-resolved
    // server-side at read time. Owns nofyRow (NOTE|FOLDER|TAG|TEMPLATE|VERSION).
    NofyModule,
    // Academy (B12) — the learning domain: catalog + content from the shared
    // registry, server-graded quizzes/checkpoints/exams, SRS flashcards,
    // practice drills, milestones and journal-driven suggestions. Owns
    // academyRow (STATE|TASK|EVENT_REG).
    AcademyModule,
    // Stats (B1) — the analytics lens over the journal: overview,
    // analytics aggregates and the filtered analytics-suite dataset with
    // Monte Carlo. READ-ONLY — owns NO tables (§3).
    StatsModule,
    // Backup (B2) — authored-data portability: full snapshot export and
    // validated import (replace trades, merge strategies/tags). Operates
    // over the owning contexts' stores; owns NO tables.
    BackupModule,
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
    // Integration Hub (B14) — the platform layer: provider registry with
    // connection lifecycle (connect/disconnect/test/sync §25–§27), §14
    // idempotent inbound webhook pipeline with HMAC verification, error
    // ledger + audit event log, §28 retention. Owns integrationRow
    // (PROVIDER|WEBHOOK|EVENT|ERROR|ECO|NEWS|SEEN). The registry is static
    // catalog content; rows hold per-user runtime state only.
    IntegrationsModule,
    // ── Phase 4/5/6/7/8 reconciliation (see worklog.md) ────────────────────
    // Trading Core internals (provider-only — route owner stays the wired
    // legacy TradesModule), then the planning → review → replay → analytics
    // chain that consumes its public contracts.
    TradingModule,
    TradePlanningModule,
    TradeReviewModule,
    ReplayModule,
    AnalyticsModule,
    // Phase 10 → serveur (Oryon analyses) + Phase 11 (trade plans).
    OryonModule,
    PlansModule,
    // modules/reference … — added by their own phases.
  ],
  providers: [globalExceptionFilterProvider],
})
export class AppModule {}
