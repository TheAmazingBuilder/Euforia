import { z } from "zod";
import { ruleTypeSchema, severitySchema } from "../enums";
import { isoDateTimeSchema, jsonObjectSchema, jsonValueSchema, uuidSchema } from "./primitives";

/**
 * Rule — data-model.md "Domaine 7" (Discipline Engine).
 * `params` is deliberately generic JSON to stay extensible, e.g.
 * `{ "limit": 3 }` for MAX_TRADES_PER_DAY, `{ "minutes": 30 }` for
 * COOLDOWN_AFTER_LOSSES, `{ "start": "08:00", "end": "17:00" }` for
 * TRADING_WINDOW. The API interprets params per `type`.
 */
export const ruleSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  type: ruleTypeSchema,
  params: jsonValueSchema,
  severity: severitySchema,
  /** null = global rule; otherwise scoped to one account (prop firm). */
  accountId: uuidSchema.nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
});

export type Rule = z.infer<typeof ruleSchema>;

/**
 * RuleViolation — one rule breach. `context` freezes the values at time T
 * (e.g. `{ "tradesToday": 4, "limit": 3 }`) so the "why" never changes.
 */
export const ruleViolationSchema = z.object({
  id: uuidSchema,
  ruleId: uuidSchema,
  userId: uuidSchema,
  /** null when the violation is not tied to a single trade ("3 pertes"). */
  tradeId: uuidSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  context: jsonValueSchema,
  acknowledgedAt: isoDateTimeSchema.nullable(),
  userNote: z.string().nullable(),
});

export type RuleViolation = z.infer<typeof ruleViolationSchema>;

// ── Rule CRUD + violation log (discipline screen) ────────────────────────────

/** POST /rules — create a discipline rule. */
export const createRuleInputSchema = z.object({
  type: ruleTypeSchema,
  /** Per-type object, e.g. `{ "limit": 3 }` — see ruleParamFields(). */
  params: jsonObjectSchema,
  severity: severitySchema,
  /** null/omitted = global rule. */
  accountId: uuidSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateRuleInput = z.infer<typeof createRuleInputSchema>;

/** PATCH /rules/:id — params / severity / active toggle (type is immutable). */
export const updateRuleInputSchema = z
  .object({
    params: jsonObjectSchema.optional(),
    severity: severitySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => value.params !== undefined || value.severity !== undefined || value.isActive !== undefined,
    { message: "Provide at least one rule field" },
  );

export type UpdateRuleInput = z.infer<typeof updateRuleInputSchema>;

/**
 * Violation row joined with its rule's display fields (the client renders
 * the log from one payload; the rule's CURRENT severity is shown even if
 * it was edited after the fact).
 */
export const ruleViolationViewSchema = ruleViolationSchema.extend({
  ruleType: ruleTypeSchema,
  ruleSeverity: severitySchema,
});

export type RuleViolationView = z.infer<typeof ruleViolationViewSchema>;

/** PATCH /violations/:id/acknowledge */
export const acknowledgeViolationInputSchema = z.object({
  note: z.string().max(2000).optional(),
});

export type AcknowledgeViolationInput = z.infer<typeof acknowledgeViolationInputSchema>;
