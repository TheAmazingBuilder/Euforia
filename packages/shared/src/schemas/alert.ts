import { z } from "zod";
import { alertTypeSchema, severitySchema } from "../enums";
import { isoDateTimeSchema, jsonValueSchema, uuidSchema } from "./primitives";

/**
 * Alert — data-model.md "Domaine 7". Produced by the discipline engine
 * (rule violations, tilt warnings, risk budget, streaks...).
 * Read state: `readAt` set = read; `dismissedAt` set = dismissed.
 */
export const alertSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  type: alertTypeSchema,
  severity: severitySchema,
  title: z.string().min(1),
  message: z.string().min(1),
  /** Optional machine-readable extras (per-type shape, API-owned). */
  payload: jsonValueSchema.nullable(),
  tradeId: uuidSchema.nullable(),
  readAt: isoDateTimeSchema.nullable(),
  dismissedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type Alert = z.infer<typeof alertSchema>;
