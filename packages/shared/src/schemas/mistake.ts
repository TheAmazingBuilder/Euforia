import { z } from "zod";
import { detectorSchema, mistakeCategorySchema } from "../enums";
import { isoDateTimeSchema, jsonValueSchema, uuidSchema } from "./primitives";

/**
 * Mistake - data-model.md "Domaine 4" (Tier 1 error taxonomy).
 * System catalog (seeded, `userId: null`, `isSystem: true`) + user-defined
 * custom mistakes (`isSystem: false`).
 */
export const mistakeSchema = z.object({
  id: uuidSchema,
  /** Stable slug, e.g. "moved_stop", "revenge_trade", "oversized". */
  key: z.string().min(1),
  category: mistakeCategorySchema,
  label: z.string().min(1),
  description: z.string().nullable(),
  /** 1–5 (5 = most damaging). */
  severity: z.number().int().min(1).max(5),
  isSystem: z.boolean(),
  /** null = system catalog entry; otherwise a user-defined mistake. */
  userId: uuidSchema.nullable(),
  /** Auto-detection parameters (service-owned shape). */
  detectionHint: jsonValueSchema.nullable(),
});

export type Mistake = z.infer<typeof mistakeSchema>;

/**
 * TradeMistake - a mistake attached to a trade. Auto-detections
 * (`detectedBy: "AUTO"`) await user confirmation/contestation
 * via `userConfirmed` (null = pending review).
 */
export const tradeMistakeSchema = z.object({
  id: uuidSchema,
  tradeId: uuidSchema,
  mistakeId: uuidSchema,
  detectedBy: detectorSchema,
  /** null = auto-detection not yet reviewed. */
  userConfirmed: z.boolean().nullable(),
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export type TradeMistake = z.infer<typeof tradeMistakeSchema>;
