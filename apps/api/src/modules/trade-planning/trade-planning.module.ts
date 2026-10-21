/**
 * Trade Planning bounded context (Phase 5) — the planned trade, BEFORE
 * execution.
 *
 * Core domain (Phase 0 §I): flat application-service + one-repository +
 * thin-controllers discipline, matching the established contexts. The domain
 * layer (risk engine, lifecycle, validation battery, ports) imports no
 * framework code (§59); infrastructure adapters implement the ports and are
 * wired here through DI tokens.
 *
 * Reuse over reinvention (§3): error taxonomy, ZodValidationPipe, auth guard
 * + principal decorator come from the Foundation / Identity; the Accounts
 * context is consumed through its PUBLIC contract (AccountsRepository —
 * ownership-validated account rows + latest balance snapshot); the shared
 * capture size-mode vocabulary is reused verbatim. NO second lot-size engine,
 * NO second account/ownership system, NO Playbook module (§67 — plans carry
 * their own frozen checklist snapshots; strategyId is a bare reference).
 *
 * Out of scope forever in this context (§30/§65–§69): broker order execution,
 * post-trade review, behavioral analytics, backtesting, session-live
 * duplication. A plan NEVER becomes an order through this codebase.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { IdentityModule } from "../identity/identity.module";
import {
  CatalogInstrumentSpecsProvider,
  NoRiskLimitsProvider,
  PassthroughFxRateProvider,
} from "./adapters/providers";
import { TradePlanController } from "./trade-plan.controller";
import { TradePlanRepository } from "./trade-plan.repository";
import { TradePlanningService } from "./trade-plan.service";
import {
  FX_RATE_PROVIDER,
  INSTRUMENT_SPECIFICATION_PROVIDER,
  RISK_LIMIT_PROVIDER,
} from "./trade-planning.tokens";

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, IdentityModule, AccountsModule],
  controllers: [TradePlanController],
  providers: [
    TradePlanRepository,
    TradePlanningService,
    // Port bindings (§15/§16/§22) — swappable by future bounded contexts.
    { provide: INSTRUMENT_SPECIFICATION_PROVIDER, useClass: CatalogInstrumentSpecsProvider },
    { provide: FX_RATE_PROVIDER, useClass: PassthroughFxRateProvider },
    { provide: RISK_LIMIT_PROVIDER, useClass: NoRiskLimitsProvider },
  ],
  // Phase 6 (additive): the plan repository and the instrument-spec port are
  // exported as the context's public contract — downstream review contexts
  // READ plans + specs through them; plan writes stay Trade-Planning-internal.
  exports: [TradePlanRepository, INSTRUMENT_SPECIFICATION_PROVIDER],
})
export class TradePlanningModule {}
