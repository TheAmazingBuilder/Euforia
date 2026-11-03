/**
 * Playbook controllers (B10) - strategies (with versioning), setups,
 * checklist templates, operating rules, templates library and the module
 * aggregates. Mirrors `mocks/handlers/playbook.ts` + the catalogs
 * GET /strategies route (23 routes).
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
import {
  createChecklistInputSchema,
  createPlaybookRuleInputSchema,
  createSetupInputSchema,
  createStrategyInputSchema,
  instantiateTemplateInputSchema,
  updateChecklistInputSchema,
  updatePlaybookRuleInputSchema,
  updateSetupInputSchema,
  updateStrategyInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { PlaybookService } from "./playbook.service";

@Controller("playbook")
export class PlaybookMetaController {
  constructor(private readonly playbook: PlaybookService) {}

  /** GET /playbook/overview - counts, recency, performance, health. */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.overview(principal.userId);
  }

  /** GET /playbook/templates - starting-point library (no perf claims). */
  @Get("templates")
  async templates() {
    return this.playbook.listTemplates();
  }

  /** POST /playbook/templates/instantiate - DRAFT strategy from a template. */
  @Post("templates/instantiate")
  @HttpCode(HttpStatus.CREATED)
  async instantiate(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(instantiateTemplateInputSchema))
    payload: z.infer<typeof instantiateTemplateInputSchema>,
  ) {
    return this.playbook.instantiateTemplate(principal.userId, payload);
  }
}

@Controller("strategies")
export class StrategiesController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get("stats")
  async stats(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.strategyStats(principal.userId);
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.listStrategies(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createStrategyInputSchema))
    payload: z.infer<typeof createStrategyInputSchema>,
  ) {
    return this.playbook.createStrategy(principal.userId, payload);
  }

  @Post(":strategyId/duplicate")
  @HttpCode(HttpStatus.CREATED)
  async duplicate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
  ) {
    const id = uuidSchema.parse(strategyId);
    return this.playbook.duplicateStrategy(principal.userId, id);
  }

  @Get(":strategyId/versions")
  async versions(@CurrentUser() principal: AuthPrincipal, @Param("strategyId") strategyId: string) {
    const id = uuidSchema.parse(strategyId);
    return this.playbook.listStrategyVersions(principal.userId, id);
  }

  @Patch(":strategyId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("strategyId") strategyId: string,
    @Body(new ZodValidationPipe(updateStrategyInputSchema))
    payload: z.infer<typeof updateStrategyInputSchema>,
  ) {
    const id = uuidSchema.parse(strategyId);
    return this.playbook.updateStrategy(principal.userId, id, payload);
  }

  @Delete(":strategyId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("strategyId") strategyId: string) {
    const id = uuidSchema.parse(strategyId);
    return this.playbook.deleteStrategy(principal.userId, id);
  }
}

@Controller("setups")
export class SetupsController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get("insights")
  async insights(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.setupInsights(principal.userId);
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.listSetups(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSetupInputSchema))
    payload: z.infer<typeof createSetupInputSchema>,
  ) {
    return this.playbook.createSetup(principal.userId, payload);
  }

  @Patch(":setupId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("setupId") setupId: string,
    @Body(new ZodValidationPipe(updateSetupInputSchema))
    payload: z.infer<typeof updateSetupInputSchema>,
  ) {
    const id = uuidSchema.parse(setupId);
    return this.playbook.updateSetup(principal.userId, id, payload);
  }

  @Delete(":setupId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("setupId") setupId: string) {
    const id = uuidSchema.parse(setupId);
    return this.playbook.deleteSetup(principal.userId, id);
  }
}

@Controller("checklists")
export class ChecklistsController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.listChecklists(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createChecklistInputSchema))
    payload: z.infer<typeof createChecklistInputSchema>,
  ) {
    return this.playbook.createChecklist(principal.userId, payload);
  }

  @Patch(":checklistId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("checklistId") checklistId: string,
    @Body(new ZodValidationPipe(updateChecklistInputSchema))
    payload: z.infer<typeof updateChecklistInputSchema>,
  ) {
    const id = uuidSchema.parse(checklistId);
    return this.playbook.updateChecklist(principal.userId, id, payload);
  }

  @Delete(":checklistId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("checklistId") checklistId: string) {
    const id = uuidSchema.parse(checklistId);
    return this.playbook.deleteChecklist(principal.userId, id);
  }
}

@Controller("playbook/rules")
export class PlaybookRulesController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.playbook.listPlaybookRules(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createPlaybookRuleInputSchema))
    payload: z.infer<typeof createPlaybookRuleInputSchema>,
  ) {
    return this.playbook.createPlaybookRule(principal.userId, payload);
  }

  @Patch(":ruleId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(updatePlaybookRuleInputSchema))
    payload: z.infer<typeof updatePlaybookRuleInputSchema>,
  ) {
    const id = uuidSchema.parse(ruleId);
    return this.playbook.updatePlaybookRule(principal.userId, id, payload);
  }

  @Delete(":ruleId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("ruleId") ruleId: string) {
    const id = uuidSchema.parse(ruleId);
    return this.playbook.deletePlaybookRule(principal.userId, id);
  }
}
