/**
 * Calculators controller (Phase 18) — deterministic quantitative utilities.
 *
 * Access model (§45): authenticated by default (global JwtAuthGuard, no
 * @Public) and rate-limited by the existing global ThrottlerGuard — pure
 * calculations are O(1) (lot size) or O(periods ≤ 1000) (compounding), far
 * below the default budget, so no second limiter is introduced (§52).
 *
 * The result is INFORMATIONAL (§43/§56): it is never an execution
 * instruction — no order placement, no position modification, no trade or
 * plan mutation flows through these routes.
 *
 * Input validation (§30/§31): Zod contracts from the shared barrel via the
 * global ZodValidationPipe → unknown fields are stripped (repo convention —
 * mass-assignment-safe by construction), malformed values are 400 with
 * issues, domain invariants (entry == stop, budget below one step, overflow)
 * surface as 400/422 with stable codes (§44).
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import {
  compoundingCalculatorInputSchema,
  lotSizeCalculatorInputSchema,
  type CompoundingCalculatorInput,
  type LotSizeCalculatorInput,
} from "../../shared/contracts";
import { CalculatorsService } from "./calculators.service";

@Controller("calculators")
export class CalculatorsController {
  constructor(private readonly calculators: CalculatorsService) {}

  @Post("lot-size")
  @HttpCode(HttpStatus.OK) // a calculation creates NO resource — 200, not 201
  lotSize(
    @Body(new ZodValidationPipe(lotSizeCalculatorInputSchema)) input: LotSizeCalculatorInput,
  ) {
    return this.calculators.computeLotSize(input);
  }

  @Post("compounding")
  @HttpCode(HttpStatus.OK) // a calculation creates NO resource — 200, not 201
  compounding(
    @Body(new ZodValidationPipe(compoundingCalculatorInputSchema)) input: CompoundingCalculatorInput,
  ) {
    return this.calculators.computeCompounding(input);
  }
}
