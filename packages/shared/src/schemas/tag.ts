import { z } from "zod";
import { tagCategorySchema } from "../enums";
import { uuidSchema } from "./primitives";

/**
 * Tag — data-model.md "Domaine 4". Free, hierarchical, user-owned
 * (contrary to Mistake/Emotion which are seeded catalogs).
 * Unique per (userId, name, category).
 */
export const tagSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1),
  category: tagCategorySchema,
  color: z.string().nullable(),
  /** Parent tag id — hierarchy. */
  parentId: uuidSchema.nullable(),
});

export type Tag = z.infer<typeof tagSchema>;

/** Join row trade ↔ tag (composite key on the API side). */
export const tradeTagSchema = z.object({
  tradeId: uuidSchema,
  tagId: uuidSchema,
});

export type TradeTag = z.infer<typeof tradeTagSchema>;
