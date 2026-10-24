/**
 * Ghost Trades controller (B6) - the Registre des Regrets HTTP surface.
 * Global JwtAuthGuard (no @Public), ZodValidationPipe on every body,
 * @CurrentUser principal, uuid-validated params. Mirrors
 * `mocks/handlers/ghosts.ts` exactly (3 routes).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import {
  createSkippedTradeInputSchema,
  settleSkippedTradeInputSchema,
  skippedTradesResponseSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { GhostsService } from "./ghosts.service";

@Controller("skipped-trades")
export class GhostsController {
  constructor(private readonly ghosts: GhostsService) {}

  /** GET /skipped-trades - the regret feed (most recent first). */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.ghosts.listSkippedTrades(principal.userId);
    return skippedTradesResponseSchema.parse(response);
  }

  /** POST /skipped-trades - 10-second ghost capture. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSkippedTradeInputSchema))
    payload: z.infer<typeof createSkippedTradeInputSchema>,
  ) {
    return this.ghosts.createSkippedTrade(principal.userId, payload);
  }

  /** PATCH /skipped-trades/:id/settle - would have won / lost / unknown (+R). */
  @Patch(":skippedId/settle")
  async settle(
    @CurrentUser() principal: AuthPrincipal,
    @Param("skippedId") skippedId: string,
    @Body(new ZodValidationPipe(settleSkippedTradeInputSchema))
    payload: z.infer<typeof settleSkippedTradeInputSchema>,
  ) {
    const id = uuidSchema.parse(skippedId);
    return this.ghosts.settleSkippedTrade(principal.userId, id, payload);
  }
}
