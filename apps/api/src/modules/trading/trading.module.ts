/**
 * Trading Core bounded context (Phase 4) — the canonical journal trade.
 *
 * Core domain (Phase 0 §I): flat application-service + one-repository +
 * thin-controllers discipline, matching the established contexts.
 *
 * Reuse over reinvention: error taxonomy, ZodValidationPipe, auth guard +
 * principal decorator come from the Foundation / identity; the Accounts
 * context is consumed through its PUBLIC contract (AccountsRepository —
 * already-synchronized, normalized external state) — Trading Core NEVER
 * calls provider adapters directly (§26 critical boundary).
 *
 * Out of scope forever in this context (§59–§63/§68): review scoring,
 * analytics, backtesting, playbook logic, session-live duplication, and any
 * trade EXECUTION capability. Downstream domains consume the canonical
 * aggregates produced by the authoritative aggregation implementation.
 *
 * Phase 6 (additive): TradingRepository is exported as the context's public
 * contract — downstream review contexts READ canonical trades through it;
 * write methods stay Trading-Core-internal discipline (callers never write).
 *
 * Phase 10 (additive): the context PUBLISHES `trade.created` on the shared
 * in-process domain event bus after a manual journal capture — canonical
 * events flow outward (Provider → Accounts → Trading Core → consumer);
 * Session Live subscribes (Phase 10 §17: Session Live is never the event
 * source). The bus is a Foundation leaf — no new context dependency.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { EventsModule } from "../../shared/events/events.module";
import { AccountsModule } from "../accounts/accounts.module";
import { IdentityModule } from "../identity/identity.module";
import { TradingRepository } from "./trading.repository";
import { TradingService } from "./trading.service";
import { TradingController } from "./trading.controller";

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, EventsModule, IdentityModule, AccountsModule],
  controllers: [TradingController],
  providers: [TradingRepository, TradingService],
  exports: [TradingRepository],
})
export class TradingModule {}
