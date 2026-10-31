/**
 * Metric alert rules controller (Dashboard Customization Phase 07).
 * All routes authenticated (global JwtAuthGuard - no @Public), userId from
 * the auth principal (never the client), ZodValidationPipe on every body,
 * uuid-validated params, shared-contract parse on read responses.
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
} from "@nestjs/common";
import { uuidSchema } from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import {
  createMetricAlertRuleInputSchema,
  evaluateMetricAlertsResponseSchema,
  metricAlertRuleEventsResponseSchema,
  metricAlertRulesResponseSchema,
  updateMetricAlertRuleInputSchema,
} from "../../shared/contracts";
import { MetricAlertsService } from "./metric-alerts.service";

@Controller("alert-rules")
export class MetricAlertsController {
  constructor(private readonly metricAlerts: MetricAlertsService) {}

  /** GET /alert-rules - the user's configured rules. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.metricAlerts.listRules(principal.userId);
    return metricAlertRulesResponseSchema.parse(response);
  }

  /**
   * POST /alert-rules/evaluate - explicit manual evaluation pass for the
   * authenticated user (diagnostics + deterministic tests + UI "Run now").
   * DECLARED BEFORE :ruleId routes so Nest does not bind "evaluate" as an
   * id (same guard as the accounts module's action routes).
   */
  @Post("evaluate")
  @HttpCode(HttpStatus.OK)
  async evaluate(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.metricAlerts.evaluateUserRules(principal.userId);
    return evaluateMetricAlertsResponseSchema.parse(response);
  }

  /** POST /alert-rules - create a rule (409 on an exact duplicate). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createMetricAlertRuleInputSchema))
    payload: z.infer<typeof createMetricAlertRuleInputSchema>,
  ) {
    return this.metricAlerts.createRule(principal.userId, payload);
  }

  /** GET /alert-rules/:ruleId/events - recent inbox events for one rule. */
  @Get(":ruleId/events")
  async events(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
  ) {
    const id = uuidSchema.parse(ruleId);
    const response = await this.metricAlerts.listRuleEvents(principal.userId, id);
    return metricAlertRuleEventsResponseSchema.parse(response);
  }

  /** PATCH /alert-rules/:ruleId - rename / retune / enable / disable. */
  @Patch(":ruleId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(updateMetricAlertRuleInputSchema))
    payload: z.infer<typeof updateMetricAlertRuleInputSchema>,
  ) {
    const id = uuidSchema.parse(ruleId);
    return this.metricAlerts.updateRule(principal.userId, id, payload);
  }

  /** DELETE /alert-rules/:ruleId - events keep their frozen payload. */
  @Delete(":ruleId")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
  ) {
    const id = uuidSchema.parse(ruleId);
    return this.metricAlerts.deleteRule(principal.userId, id);
  }
}
