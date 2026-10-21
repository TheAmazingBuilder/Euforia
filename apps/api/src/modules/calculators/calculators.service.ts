/**
 * Calculators application service (Phase 18) — thin orchestration over the
 * pure domain calculations (§32): Controller → Application → Domain Calc →
 * Result. No formulas here (§33), no DB (§34), no persistence (§53) — the
 * service exists so future consumers (Trade Planner sizing at write time,
 * account-aware defaults per §35/§36) integrate through an application
 * layer instead of reaching into the logic module.
 *
 * Calculations are USER-INDEPENDENT and STATELESS: the same input always
 * produces the same output for every authenticated caller. The global
 * JwtAuthGuard + ThrottlerGuard apply (§45) — the endpoints are never
 * anonymous and never carry per-user state (§46 has no cross-user surface
 * to reach: no account/instrument identifiers are accepted).
 */
import { Injectable } from "@nestjs/common";
import type {
  CompoundingCalculatorInput,
  CompoundingCalculatorResult,
  LotSizeCalculatorInput,
  LotSizeCalculatorResult,
} from "../../shared/contracts";
import { computeLotSize } from "./lot-size.logic";
import { computeCompounding } from "./compounding.logic";

@Injectable()
export class CalculatorsService {
  computeLotSize(input: LotSizeCalculatorInput): LotSizeCalculatorResult {
    return computeLotSize(input);
  }

  computeCompounding(input: CompoundingCalculatorInput): CompoundingCalculatorResult {
    return computeCompounding(input);
  }
}
