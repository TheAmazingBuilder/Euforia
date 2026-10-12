/**
 * Calendar bounded context (B7) — the trading-calendar overlay: eco events
 * (deterministic synthetic macro source, §68-honest), marked blocks
 * (day offs / news pauses) and the server-computed view with per-day
 * journal + discipline aggregates.
 *
 * Dependency graph (acyclic):
 *   CalendarModule → CalendarRepository (own Prisma boundary — block rows)
 *                  → TradesModule (journal facts per day)
 *                  → DisciplineModule (daily scores + violations per day)
 *                  → SettingsModule (risk guard-line: dailyLossLimitPct)
 *                  → AccountsModule (account currency)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { IdentityModule } from "../identity/identity.module";
import { SettingsModule } from "../settings/settings.module";
import { TradesModule } from "../trades/trades.module";
import { CalendarBlocksController, CalendarViewController, EcoEventsController } from "./calendar.controller";
import { CalendarRepository } from "./calendar.repository";
import { CalendarRepository as NormalizedCalendarRepository } from "./infrastructure/calendar.repository";
import { CalendarQueriesService } from "./calendar-queries.service";
import { CalendarService } from "./calendar.service";

@Module({
  imports: [PrismaModule, TradesModule, DisciplineModule, SettingsModule, AccountsModule, IdentityModule],
  controllers: [EcoEventsController, CalendarBlocksController, CalendarViewController],
  // The normalized read repository + Phase-13 query service serve the
  // cross-context READ port (analytics phases, session-live counts, nofy refs);
  // the wired write side stays the row-store generation.
  providers: [CalendarRepository, CalendarService, NormalizedCalendarRepository, CalendarQueriesService],
  exports: [CalendarQueriesService],
})
export class CalendarModule {}
