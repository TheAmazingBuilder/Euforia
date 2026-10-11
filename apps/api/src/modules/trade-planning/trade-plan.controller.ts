/**
 * Trade Planning controller (Phase 5 §36) — thin HTTP boundary over the
 * trade-planning application service. Validation → authentication (global
 * guard) → application use case → response. No domain logic, no Prisma, no
 * risk math here.
 *
 * All routes require authentication (global JwtAuthGuard — no @Public here).
 * Ownership is enforced inside the service: the userId always comes from the
 * auth principal, never from the client (§28/§44). No execution capability
 * exists anywhere in this API (§30 red line — plans never become orders).
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  commitTradePlanInputSchema,
  createTradePlanInputSchema,
  listTradePlansQuerySchema,
  updateTradePlanInputSchema,
  uuidSchema,
  type CommitTradePlanInput,
  type CreateTradePlanInput,
  type ListTradePlansQuery,
  type TradePlanDetail,
  type TradePlansResponse,
  type UpdateTradePlanInput,
  type ValidateTradePlanResponse,
} from "../../shared/contracts";
import { TradePlanningService } from "./trade-plan.service";

@Controller("trade-plans")
export class TradePlanController {
  constructor(private readonly planning: TradePlanningService) {}

  /** List plans — filters + server-side sorting + pagination (§55). */
  @Get()
  list(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(listTradePlansQuerySchema)) query: ListTradePlansQuery,
  ): Promise<TradePlansResponse> {
    return this.planning.list(principal.userId, query);
  }

  /** Create a plan — DRAFT by default, PLANNED with commitNow (§7/§37). */
  @Post()
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createTradePlanInputSchema)) payload: CreateTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const result = await this.planning.create(principal.userId, payload);
    return result;
  }

  @Get(":planId")
  async details(@CurrentUser() principal: AuthPrincipal, @Param("planId") planId: string) {
    const id = uuidSchema.parse(planId);
    return this.planning.get(principal.userId, id);
  }

  /** Edit a DRAFT/PLANNED plan; every edit recomputes risk server-side (§38/§39). */
  @Patch(":planId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(updateTradePlanInputSchema)) payload: UpdateTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const id = uuidSchema.parse(planId);
    return this.planning.update(principal.userId, id, payload);
  }

  /** Commit: DRAFT → PLANNED (§7). Idempotent on an already-committed plan. */
  @Post(":planId/commit")
  @HttpCode(HttpStatus.OK)
  async commit(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
    @Body(new ZodValidationPipe(commitTradePlanInputSchema)) payload: CommitTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const id = uuidSchema.parse(planId);
    return this.planning.commit(principal.userId, id, payload);
  }

  /** Pre-trade validation battery (§21) — structured findings, never "invalid". */
  @Post(":planId/validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<ValidateTradePlanResponse> {
    const id = uuidSchema.parse(planId);
    return this.planning.validate(principal.userId, id);
  }

  /** PLANNED/VALIDATED → CANCELLED. Idempotent on an already-cancelled plan. */
  @Post(":planId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const id = uuidSchema.parse(planId);
    return this.planning.cancel(principal.userId, id);
  }

  /** DRAFT/PLANNED → ABANDONED. Idempotent on an already-abandoned plan. */
  @Post(":planId/abandon")
  @HttpCode(HttpStatus.OK)
  async abandon(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const id = uuidSchema.parse(planId);
    return this.planning.abandon(principal.userId, id);
  }

  /** Re-run the risk engine over fresh environment inputs (§39). */
  @Post(":planId/recalculate")
  @HttpCode(HttpStatus.OK)
  async recalculate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("planId") planId: string,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const id = uuidSchema.parse(planId);
    return this.planning.recalculate(principal.userId, id);
  }
}
