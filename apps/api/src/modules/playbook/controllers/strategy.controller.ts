/**
 * Strategy controller (Phase 7) - thin HTTP boundary over the playbook
 * application service. All routes require authentication (global
 * JwtAuthGuard - no @Public); ownership is enforced inside the service from
 * the auth principal, never from the client (§68). Responses follow the
 * product contract: entities are returned DIRECTLY (no envelope), POSTs
 * answer 201, deletes answer { ok: true }.
 *
 * Route order matters: static paths (/stats) are declared BEFORE the
 * parameterized /:strategyId routes.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ZodValidationPipe } from "../../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../../shared/auth/current-user.decorator";
import {
  createStrategyInputSchema,
  updateStrategyInputSchema,
  uuidSchema,
  type CreateStrategyInput,
  type Strategy,
  type StrategyVersionsResponse,
  type StrategiesStatsResponse,
  type UpdateStrategyInput,
} from "../../../shared/contracts";
import { PlaybookService } from "../playbook.service";

@Controller("strategies")
export class StrategyController {
  constructor(private readonly playbook: PlaybookService) {}

  /** Per-strategy aggregates - computed server-side (product contract). */
  @Get("stats")
  stats(@CurrentUser() principal: AuthPrincipal): Promise<StrategiesStatsResponse> {
    return this.playbook.strategyStats(principal.userId);
  }

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): Promise<{ strategies: Strategy[] }> {
    return this.playbook.listStrategies(principal.userId);
  }

  @Post()
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createStrategyInputSchema)) payload: CreateStrategyInput,
  ): Promise<Strategy> {
    return this.playbook.createStrategy(principal.userId, payload);
  }

  @Patch(":strategyId")
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
    @Body(new ZodValidationPipe(updateStrategyInputSchema)) payload: UpdateStrategyInput,
  ): Promise<Strategy> {
    return this.playbook.updateStrategy(principal.userId, uuidSchema.parse(strategyId), payload);
  }

  @Delete(":strategyId")
  delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
  ): Promise<{ ok: true }> {
    return this.playbook.deleteStrategy(principal.userId, uuidSchema.parse(strategyId));
  }

  /** Fresh DRAFT copy - definition follows, history does not (§35/§58). */
  @Post(":strategyId/duplicate")
  duplicate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
  ): Promise<Strategy> {
    return this.playbook.duplicateStrategy(principal.userId, uuidSchema.parse(strategyId));
  }

  /** Immutable definition snapshots, newest first (§17/§70). */
  @Get(":strategyId/versions")
  versions(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
  ): Promise<StrategyVersionsResponse> {
    return this.playbook.listStrategyVersions(principal.userId, uuidSchema.parse(strategyId));
  }
}
