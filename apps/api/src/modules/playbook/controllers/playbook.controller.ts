/**
 * Playbook controller (Phase 7) — the /playbook surface: module overview
 * aggregate, template library and operating rules. All routes
 * authenticated; ownership enforced in the service; static routes declared
 * before parameterized ones (/playbook/rules before /playbook/rules/:id).
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
  createPlaybookRuleInputSchema,
  instantiateTemplateInputSchema,
  updatePlaybookRuleInputSchema,
  uuidSchema,
  type CreatePlaybookRuleInput,
  type InstantiateTemplateInput,
  type PlaybookOverviewResponse,
  type PlaybookRule,
  type PlaybookRulesResponse,
  type PlaybookTemplatesResponse,
  type Strategy,
  type UpdatePlaybookRuleInput,
} from "../../../shared/contracts";
import { PlaybookService } from "../playbook.service";

@Controller("playbook")
export class PlaybookController {
  constructor(private readonly playbook: PlaybookService) {}

  /** ONE aggregate for the module (§5) — server-computed, never client-side. */
  @Get("overview")
  overview(@CurrentUser() principal: AuthPrincipal): Promise<PlaybookOverviewResponse> {
    return this.playbook.playbookOverview(principal.userId);
  }

  @Get("templates")
  templates(): Promise<PlaybookTemplatesResponse> {
    return this.playbook.listTemplates();
  }

  /** Instantiate a template → fresh DRAFT strategy (201). */
  @Post("templates/instantiate")
  instantiate(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(instantiateTemplateInputSchema)) payload: InstantiateTemplateInput,
  ): Promise<Strategy> {
    return this.playbook.instantiateTemplate(principal.userId, payload);
  }

  @Get("rules")
  rules(@CurrentUser() principal: AuthPrincipal): Promise<PlaybookRulesResponse> {
    return this.playbook.listRules(principal.userId);
  }

  @Post("rules")
  createRule(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createPlaybookRuleInputSchema)) payload: CreatePlaybookRuleInput,
  ): Promise<PlaybookRule> {
    return this.playbook.createRule(principal.userId, payload);
  }

  @Patch("rules/:ruleId")
  updateRule(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(updatePlaybookRuleInputSchema)) payload: UpdatePlaybookRuleInput,
  ): Promise<PlaybookRule> {
    return this.playbook.updateRule(principal.userId, uuidSchema.parse(ruleId), payload);
  }

  @Delete("rules/:ruleId")
  deleteRule(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
  ): Promise<{ ok: true }> {
    return this.playbook.deleteRule(principal.userId, uuidSchema.parse(ruleId));
  }
}
