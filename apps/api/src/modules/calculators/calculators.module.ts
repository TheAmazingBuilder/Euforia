/**
 * Calculators bounded context (Phase 18) - deterministic quantitative
 * utility layer (§2/§3).
 *
 * What Calculators is NOT (§63 - architecture review):
 *   - not a second risk engine (one authoritative lot-size implementation,
 *     consumed here and exportable to Trade Planner / Session Live later)
 *   - not a P&L or analytics engine (historical analysis stays Analytics')
 *   - not an owner of financial truth (Accounts owns balances - the
 *     calculator only receives a balance as explicit input, §34/§36)
 *   - not a broker/instrument spec database (specs are per-request inputs;
 *     a canonical server-side instrument source remains a future concern,
 *     §10/§41)
 *
 * Dependency graph (acyclic, minimal):
 *   CalculatorsModule → (nothing but its own files)
 *   Shared infrastructure: global JwtAuthGuard + ThrottlerGuard, Zod
 *   validation pipe, shared contracts barrel.
 *   NO Prisma module: the context performs ZERO persistence (§53) - a
 *   calculation is a pure Request → Result transform (§7).
 */
import { Module } from "@nestjs/common";
import { CalculatorsController } from "./calculators.controller";
import { CalculatorsService } from "./calculators.service";

@Module({
  controllers: [CalculatorsController],
  providers: [CalculatorsService],
})
export class CalculatorsModule {}
