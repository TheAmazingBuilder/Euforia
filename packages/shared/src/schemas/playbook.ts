import { z } from "zod";
import { currencySchema, strategyStatusSchema, tradingStyleSchema } from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";
import { strategySchema } from "./strategy";
import {
  confirmationSchema,
  entryConditionSchema,
  exitRuleSchema,
  managementRuleSchema,
  marketConditionSchema,
  playbookRuleCategorySchema,
  marketProfileSchema,
  strategyRiskSchema,
} from "./playbook-blocks";

// Playbook module — entities + read models (blocks live in playbook-blocks.ts).
export * from "./playbook-blocks";

// ── Strategy extensions (all nullish: existing fixtures stay valid) ─────────

/** Extended strategy — identity (§6) + market profile (§7) + structured
 *  conditions (§8/§10–§15). The original markdown rule bodies stay. */
export const extendedStrategySchema = strategySchema.extend({
  /** Bumped by the store on every content mutation (§17). */
  version: z.number().int().min(1).nullish(),
  tags: z.array(z.string().max(24)).nullish(),
  detailedDescription: z.string().max(8000).nullish(),
  marketProfile: marketProfileSchema.nullish(),
  marketConditions: z.array(marketConditionSchema).nullish(),
  entryConditions: z.array(entryConditionSchema).nullish(),
  confirmations: z.array(confirmationSchema).nullish(),
  invalidations: z.array(z.string().max(400)).nullish(),
  risk: strategyRiskSchema.nullish(),
  tradeManagement: z.array(managementRuleSchema).nullish(),
  exitPlan: z.array(exitRuleSchema).nullish(),
  updatedAt: isoDateTimeSchema.nullish(),
});
export type ExtendedStrategy = z.infer<typeof extendedStrategySchema>;

/** A frozen copy of a strategy definition, kept when the strategy evolves
 *  (§17) — trades executed under v1 must stay explainable as v1 trades. */
export const strategyVersionSnapshotSchema = z.object({
  id: uuidSchema,
  strategyId: uuidSchema,
  version: z.number().int().min(1),
  snapshot: strategySchema,
  reason: z.string().max(200).nullable(),
  createdAt: isoDateTimeSchema,
});
export type StrategyVersionSnapshot = z.infer<typeof strategyVersionSnapshotSchema>;

// ── Setup entity (§9) ────────────────────────────────────────────────────────

export const setupSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  strategyId: uuidSchema,
  name: z.string().min(1).max(120),
  status: strategyStatusSchema,
  description: z.string().max(2000).nullable(),
  /** When this setup applies (markdown). */
  context: z.string().max(4000).nullable(),
  marketCondition: marketConditionSchema.nullable(),
  trigger: z.string().max(400).nullable(),
  confirmation: z.string().max(400).nullable(),
  entryModel: z.string().max(400).nullable(),
  stopModel: z.string().max(400).nullable(),
  targetModel: z.string().max(400).nullable(),
  /** When the setup is no longer valid (§12) — critical, never optional. */
  invalidation: z.string().max(400).nullable(),
  notes: z.string().max(4000).nullable(),
  tags: z.array(z.string().max(24)),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Setup = z.infer<typeof setupSchema>;

export const createSetupInputSchema = z.object({
  strategyId: uuidSchema,
  name: z.string().min(1, "Name is required").max(120),
  status: strategyStatusSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  context: z.string().max(4000).nullable().optional(),
  marketCondition: marketConditionSchema.nullable().optional(),
  trigger: z.string().max(400).nullable().optional(),
  confirmation: z.string().max(400).nullable().optional(),
  entryModel: z.string().max(400).nullable().optional(),
  stopModel: z.string().max(400).nullable().optional(),
  targetModel: z.string().max(400).nullable().optional(),
  invalidation: z.string().max(400).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().max(24)).optional(),
});
export type CreateSetupInput = z.infer<typeof createSetupInputSchema>;

export const updateSetupInputSchema = createSetupInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one setup field" });
export type UpdateSetupInput = z.infer<typeof updateSetupInputSchema>;

// ── Checklist templates (§16) ────────────────────────────────────────────────

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  required: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** strategyId null = global template usable with any strategy. */
export const checklistTemplateSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  strategyId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  items: z.array(checklistItemSchema).max(24),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export const createChecklistInputSchema = z.object({
  strategyId: uuidSchema.nullable().optional(),
  name: z.string().min(1, "Name is required").max(120),
  items: z.array(checklistItemSchema).max(24),
});
export type CreateChecklistInput = z.infer<typeof createChecklistInputSchema>;

export const updateChecklistInputSchema = z
  .object({
    strategyId: uuidSchema.nullable().optional(),
    name: z.string().min(1).max(120).optional(),
    items: z.array(checklistItemSchema).max(24).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one checklist field" });
export type UpdateChecklistInput = z.infer<typeof updateChecklistInputSchema>;

// ── Playbook rules (§24) ─────────────────────────────────────────────────────

export const playbookRuleSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string().min(1).max(160),
  detail: z.string().max(4000),
  category: playbookRuleCategorySchema,
  /** GLOBAL = portfolio-level operating rule; STRATEGY = scoped to one. */
  scope: z.enum(["GLOBAL", "STRATEGY"]),
  strategyId: uuidSchema.nullable(),
  /** True when the Rules Engine could evaluate this against Calendar/feed. */
  evaluatable: z.boolean(),
  evaluationHint: z.string().max(200).nullable(),
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PlaybookRule = z.infer<typeof playbookRuleSchema>;

export const createPlaybookRuleInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(160),
  detail: z.string().max(4000),
  category: playbookRuleCategorySchema,
  scope: z.enum(["GLOBAL", "STRATEGY"]),
  strategyId: uuidSchema.nullable().optional(),
  evaluatable: z.boolean().optional(),
  evaluationHint: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
});
export type CreatePlaybookRuleInput = z.infer<typeof createPlaybookRuleInputSchema>;

export const updatePlaybookRuleInputSchema = createPlaybookRuleInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one rule field" });
export type UpdatePlaybookRuleInput = z.infer<typeof updatePlaybookRuleInputSchema>;

// ── Read models ──────────────────────────────────────────────────────────────

export const setupsResponseSchema = z.object({ setups: z.array(setupSchema) });
export type SetupsResponse = z.infer<typeof setupsResponseSchema>;

export const checklistsResponseSchema = z.object({ checklists: z.array(checklistTemplateSchema) });
export type ChecklistsResponse = z.infer<typeof checklistsResponseSchema>;

export const playbookRulesResponseSchema = z.object({ rules: z.array(playbookRuleSchema) });
export type PlaybookRulesResponse = z.infer<typeof playbookRulesResponseSchema>;

/** Completeness indicators (§20) — factual, never profitability judgments. */
export const strategyHealthFlagSchema = z.enum([
  "DRAFT",
  "ARCHIVED",
  "NO_RECENT_TRADES",
  "MISSING_RISK",
  "MISSING_ENTRY_CONDITIONS",
  "MISSING_INVALIDATION",
  "MISSING_CHECKLIST",
]);
export type StrategyHealthFlag = z.infer<typeof strategyHealthFlagSchema>;

export const strategyHealthSchema = z.object({
  strategyId: uuidSchema,
  flags: z.array(strategyHealthFlagSchema),
});
export type StrategyHealth = z.infer<typeof strategyHealthSchema>;

/** One endpoint = one aggregate dataset (module convention, §5). */
export const playbookOverviewResponseSchema = z.object({
  counts: z.object({
    totalStrategies: z.number().int().min(0),
    active: z.number().int().min(0),
    draft: z.number().int().min(0),
    paused: z.number().int().min(0),
    archived: z.number().int().min(0),
    totalSetups: z.number().int().min(0),
    totalRules: z.number().int().min(0),
    totalChecklists: z.number().int().min(0),
  }),
  recentlyUpdated: z.array(
    z.object({
      strategyId: uuidSchema,
      name: z.string(),
      status: strategyStatusSchema,
      color: z.string().nullable(),
      version: z.number().int().min(1),
      updatedAt: isoDateTimeSchema,
    }),
  ),
  recentlyUsed: z.array(
    z.object({
      strategyId: uuidSchema,
      name: z.string(),
      color: z.string().nullable(),
      lastTradeAt: isoDateTimeSchema.nullable(),
      tradesCount: z.number().int().min(0),
    }),
  ),
  performanceSummary: z.object({
    netPnl: decimalStringSchema,
    currency: currencySchema,
    trades: z.number().int().min(0),
    winRate: z.number().min(0).max(100).nullable(),
    expectancyR: decimalStringSchema.nullable(),
    followedPlanPct: z.number().min(0).max(100).nullable(),
  }),
  health: z.array(strategyHealthSchema),
  meta: z.object({ generatedAt: isoDateTimeSchema }),
});
export type PlaybookOverviewResponse = z.infer<typeof playbookOverviewResponseSchema>;

/** Templates are starting points, not profitability claims (§18). */
export const playbookTemplateCardSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  tradingStyle: tradingStyleSchema,
  marketConditions: z.array(marketConditionSchema),
  tags: z.array(z.string()),
});
export type PlaybookTemplateCard = z.infer<typeof playbookTemplateCardSchema>;

export const playbookTemplatesResponseSchema = z.object({
  templates: z.array(playbookTemplateCardSchema),
});
export type PlaybookTemplatesResponse = z.infer<typeof playbookTemplatesResponseSchema>;

export const instantiateTemplateInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().max(80).optional(),
});
export type InstantiateTemplateInput = z.infer<typeof instantiateTemplateInputSchema>;
