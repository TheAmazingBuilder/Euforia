/**
 * Discipline bounded context (B4 — data-model.md "Domaine 7", the
 * Discipline Engine): rules CRUD, violation log (context frozen at time T),
 * alert inbox and the server-side process aggregates (Cosmoz Discipline
 * Score, emotion → outcome matrix, mistakes ledger).
 *
 * Dependency graph (acyclic):
 *   DisciplineModule → DisciplineRepository (own Prisma boundary — RULE |
 *                      VIOLATION | ALERT rows in disciplineRow)
 *                    → TradesModule (TradesRepository — journal facts the
 *                      aggregates consume + TradeSubRow MISTAKE joins)
 *                    → AccountsModule (AccountsRepository — balances)
 *                    → IdentityModule (user timezone for trading-day keys)
 *   Rule evaluation subscribes to the `trade.closed` domain event —
 *   Trades never imports Discipline (no cycle).
 *
 * Security: routes are all authenticated (global guard), ownership is
 * enforced per use case from the auth principal (§23/§24/§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { IdentityModule } from "../identity/identity.module";
import { TradesModule } from "../trades/trades.module";
import {
  AlertsController,
  DisciplineController,
  DisciplineRulesController,
  MistakesLedgerController,
  ViolationsController,
} from "./discipline.controller";
import { DisciplineRepository } from "./discipline.repository";
import { DisciplineService } from "./discipline.service";

@Module({
  imports: [PrismaModule, TradesModule, AccountsModule, IdentityModule],
  controllers: [
    DisciplineRulesController,
    ViolationsController,
    DisciplineController,
    MistakesLedgerController,
    AlertsController,
  ],
  providers: [DisciplineRepository, DisciplineService],
  // Narrow contracts (house pattern): Session's timeline consumes the ALERT
  // rows; Calendar consumes the per-day discipline scores. They never
  // re-own discipline facts (§26/§39).
  exports: [DisciplineRepository, DisciplineService],
})
export class DisciplineModule {}
