/**
 * Discipline controller (B4) — rules CRUD, violation log, aggregates and
 * the alert inbox. Global JwtAuthGuard (no @Public), ZodValidationPipe on
 * every body, @CurrentUser principal, uuid-validated params. Route
 * mirrors `mocks/handlers/discipline.ts` exactly (12 routes).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  acknowledgeViolationInputSchema,
  createRuleInputSchema,
  rulesResponseSchema,
  rulesStatusResponseSchema,
  updateRuleInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { DisciplineService } from "./discipline.service";

@Controller("rules")
export class DisciplineRulesController {
  constructor(private readonly discipline: DisciplineService) {}

  /** GET /rules/status?accountId= — today's banner aggregate. */
  @Get("status")
  async status(
    @CurrentUser() principal: AuthPrincipal,
    @Query("accountId") accountId?: string,
  ) {
    const response = await this.discipline.rulesStatus(
      principal.userId,
      accountId ?? null,
    );
    return rulesStatusResponseSchema.parse(response);
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.discipline.listRules(principal.userId);
    return rulesResponseSchema.parse(response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createRuleInputSchema))
    payload: z.infer<typeof createRuleInputSchema>,
  ) {
    return this.discipline.createRule(principal.userId, payload);
  }

  @Patch(":ruleId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(updateRuleInputSchema))
    payload: z.infer<typeof updateRuleInputSchema>,
  ) {
    const id = uuidSchema.parse(ruleId);
    return this.discipline.updateRule(principal.userId, id, payload);
  }

  @Delete(":ruleId")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
  ) {
    const id = uuidSchema.parse(ruleId);
    return this.discipline.deleteRule(principal.userId, id);
  }
}

@Controller("violations")
export class ViolationsController {
  constructor(private readonly discipline: DisciplineService) {}

  /** GET /violations — joined log, newest first, with the window aggregate. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.discipline.listViolations(principal.userId);
  }

  /** PATCH /violations/:id/acknowledge — row action. */
  @Patch(":violationId/acknowledge")
  async acknowledge(
    @CurrentUser() principal: AuthPrincipal,
    @Param("violationId") violationId: string,
    @Body(new ZodValidationPipe(acknowledgeViolationInputSchema))
    payload: z.infer<typeof acknowledgeViolationInputSchema>,
  ) {
    const id = uuidSchema.parse(violationId);
    return this.discipline.acknowledgeViolation(principal.userId, id, payload);
  }
}

@Controller("discipline")
export class DisciplineController {
  constructor(private readonly discipline: DisciplineService) {}

  /** GET /discipline/score — Euforia Discipline Score + window components. */
  @Get("score")
  async score(@CurrentUser() principal: AuthPrincipal) {
    return this.discipline.disciplineScore(principal.userId);
  }

  /** GET /discipline/emotion-matrix — emotion → outcome heatmap rows. */
  @Get("emotion-matrix")
  async emotionMatrix(@CurrentUser() principal: AuthPrincipal) {
    return this.discipline.disciplineEmotionMatrix(principal.userId);
  }
}

@Controller("mistakes")
export class MistakesLedgerController {
  constructor(private readonly discipline: DisciplineService) {}

  /** GET /mistakes/ledger — per-mistake frequency + R cost this month. */
  @Get("ledger")
  async ledger(@CurrentUser() principal: AuthPrincipal) {
    return this.discipline.mistakesLedger(principal.userId);
  }
}

@Controller("alerts")
export class AlertsController {
  constructor(private readonly discipline: DisciplineService) {}

  /** GET /alerts — inbox + unread count for the bell badge. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.discipline.listAlerts(principal.userId);
  }

  /** PATCH /alerts/:id/read — mark an alert as read (inbox row action). */
  @Patch(":alertId/read")
  async markRead(
    @CurrentUser() principal: AuthPrincipal,
    @Param("alertId") alertId: string,
  ) {
    const id = uuidSchema.parse(alertId);
    return this.discipline.markAlertRead(principal.userId, id);
  }

  /**
   * PATCH /alerts/:id/dismiss — archive an alert WITHOUT deleting it
   * (Phase 07 §8: dismissal keeps the audit history; the row remains in
   * the archive tab and in the persisted inbox).
   */
  @Patch(":alertId/dismiss")
  async dismiss(
    @CurrentUser() principal: AuthPrincipal,
    @Param("alertId") alertId: string,
  ) {
    const id = uuidSchema.parse(alertId);
    return this.discipline.dismissAlert(principal.userId, id);
  }
}
