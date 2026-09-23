import { z } from "zod";
import { isoDateTimeSchema } from "./primitives";
import { tradeSchema } from "./trade";
import { strategySchema } from "./strategy";
import { tagSchema } from "./tag";

/**
 * Backup payload — Priorité 3, feature 12. A plain JSON snapshot of the
 * user's authored data (trades, strategies, tags) for device-local backup
 * and later re-import. `schemaVersion` lets future imports migrate safely.
 */
export const backupPayloadSchema = z.object({
  app: z.literal("cosmoz"),
  schemaVersion: z.literal(1),
  exportedAt: isoDateTimeSchema,
  trades: z.array(tradeSchema),
  strategies: z.array(strategySchema),
  tags: z.array(tagSchema),
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
