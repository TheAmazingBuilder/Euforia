/**
 * Trade Plan controller (Phase 11) — /plans.
 *
 * House conventions: global JwtAuthGuard, ZodValidationPipe on bodies/queries,
 * ownership from the authenticated principal only, thin adapter (no lifecycle
 * logic here — the service owns the transition table).
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  completePlanInputSchema,
  createAnalysisPlanInputSchema,
  invalidatePlanInputSchema,
  linkPlanTradeInputSchema,
  listPlansQuerySchema,
  updateAnalysisPlanInputSchema,
  uuidSchema,
  type AnalysisPlanDetailResponse,
  type AnalysisPlanMutatedResponse,
  type AnalysisPlansResponse,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { PlanService } from "./plan.service";

@Controller("plans")
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @Get()
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(listPlansQuerySchema)) query: unknown,
  ): Promise<AnalysisPlansResponse> {
    return this.plans.list(principal.userId, query as never);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createAnalysisPlanInputSchema)) input: unknown,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.create(principal.userId, input as never);
  }

  @Get(":planId")
  async detail(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<AnalysisPlanDetailResponse> {
    return this.plans.getDetail(principal.userId, uuidSchema.parse(planId));
  }

  @Patch(":planId")
  async patch(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(updateAnalysisPlanInputSchema)) input: unknown,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.patch(principal.userId, uuidSchema.parse(planId), input as never);
  }

  @Post(":planId/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.activate(principal.userId, uuidSchema.parse(planId));
  }

  @Post(":planId/invalidate")
  @HttpCode(HttpStatus.OK)
  async invalidate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(invalidatePlanInputSchema)) input: unknown,
  ): Promise<AnalysisPlanMutatedResponse> {
    const { reason } = input as { reason: string };
    return this.plans.invalidate(principal.userId, uuidSchema.parse(planId), reason);
  }

  @Post(":planId/complete")
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(completePlanInputSchema)) input: unknown,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.complete(principal.userId, uuidSchema.parse(planId), input as never);
  }

  @Post(":planId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.archive(principal.userId, uuidSchema.parse(planId));
  }

  @Post(":planId/link-trade")
  @HttpCode(HttpStatus.OK)
  async linkTrade(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(linkPlanTradeInputSchema)) input: unknown,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.linkTrade(principal.userId, uuidSchema.parse(planId), input as never);
  }

  @Delete(":planId/link-trade")
  @HttpCode(HttpStatus.OK)
  async detachTrade(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<AnalysisPlanMutatedResponse> {
    return this.plans.detachTrade(principal.userId, uuidSchema.parse(planId));
  }

  @Delete(":planId")
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<{ ok: true }> {
    return this.plans.delete(principal.userId, uuidSchema.parse(planId));
  }
}
