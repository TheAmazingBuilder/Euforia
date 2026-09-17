import { z } from "zod";
import { strategyGradeSchema, strategyStatusSchema } from "../enums";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Strategy (playbook entry) — data-model.md "Domaine 4".
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
});

export type Strategy = z.infer<typeof strategySchema>;
