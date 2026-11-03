import { z } from "zod";
import { strategyGradeSchema, strategyStatusSchema } from "../enums";
import { isoDateTimeSchema, uuidSchema } from "./primitives";
import {
  confirmationSchema,
  entryConditionSchema,
  exitRuleSchema,
  managementRuleSchema,
  marketConditionSchema,
  marketProfileSchema,
  strategyRiskSchema,
} from "./playbook-blocks";

/**
 * Strategy (playbook entry) - data-model.md "Domaine 4".
 * Setup and strategy are merged into one entity; `grade` rates setup quality.
 * Rules bodies are free markdown (entry / exit / risk).
 */
export const strategySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  /** e.g. "Breakout BOOM500 NY open". */
  name: z.string().min(1),
  description: z.string().nullable(),
  entryRules: z.string().nullable(),
  exitRules: z.string().nullable(),
  riskRules: z.string().nullable(),
  grade: strategyGradeSchema.nullable(),
  status: strategyStatusSchema,
  /** UI color hint (CSS color string owned by the client). */
  color: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  // ── Professional Playbook extensions (schemas/playbook.ts) - nullish so
  // pre-Playbook fixtures and stored snapshots stay valid. ──
  /** Bumped on every content mutation; trades freeze it at entry (§17). */
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

export type Strategy = z.infer<typeof strategySchema>;

// ── Strategy CRUD (playbook screen) ──────────────────────────────────────────

/** POST /strategies - create a playbook entry. Omitted texts stay null. */
export const createStrategyInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(2000).nullable().optional(),
  entryRules: z.string().max(8000).nullable().optional(),
  exitRules: z.string().max(8000).nullable().optional(),
  riskRules: z.string().max(8000).nullable().optional(),
  grade: strategyGradeSchema.nullable().optional(),
  status: strategyStatusSchema.optional(),
  /** Preset palette value (see PLAYBOOK_COLOR_PALETTE) or null. */
  color: z.string().max(20).nullable().optional(),
  // ── structured Playbook blocks - replaced wholesale ──
  tags: z.array(z.string().max(24)).optional(),
  detailedDescription: z.string().max(8000).nullable().optional(),
  marketProfile: marketProfileSchema.nullable().optional(),
  marketConditions: z.array(marketConditionSchema).optional(),
  entryConditions: z.array(entryConditionSchema).optional(),
  confirmations: z.array(confirmationSchema).optional(),
  invalidations: z.array(z.string().max(400)).optional(),
  risk: strategyRiskSchema.nullable().optional(),
  tradeManagement: z.array(managementRuleSchema).optional(),
  exitPlan: z.array(exitRuleSchema).optional(),
});

export type CreateStrategyInput = z.infer<typeof createStrategyInputSchema>;

/** PATCH /strategies/:id - all fields optional, at least one required. */
export const updateStrategyInputSchema = createStrategyInputSchema
  .partial()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.entryRules !== undefined ||
      value.exitRules !== undefined ||
      value.riskRules !== undefined ||
      value.grade !== undefined ||
      value.status !== undefined ||
      value.color !== undefined ||
      value.tags !== undefined ||
      value.detailedDescription !== undefined ||
      value.marketProfile !== undefined ||
      value.marketConditions !== undefined ||
      value.entryConditions !== undefined ||
      value.confirmations !== undefined ||
      value.invalidations !== undefined ||
      value.risk !== undefined ||
      value.tradeManagement !== undefined ||
      value.exitPlan !== undefined,
    { message: "Provide at least one strategy field" },
  );

export type UpdateStrategyInput = z.infer<typeof updateStrategyInputSchema>;
