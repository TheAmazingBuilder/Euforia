import { z } from "zod";
import { isoDateTimeSchema } from "./primitives";

/**
 * Security & activity log — audit-trail read model. The V1 mock derives
 * events from the seeded journal (captures, grades, exports, sign-ins);
 * the real API will append rows on the corresponding mutations.
 */
export const securityEventTypeSchema = z.enum([
  "trade",
  "grade",
  "security",
  "system",
]);
export type SecurityEventType = z.infer<typeof securityEventTypeSchema>;

export const securityEventSchema = z.object({
  id: z.string(),
  type: securityEventTypeSchema,
  /** Short human headline, e.g. "Trade captured — EURUSD". */
  label: z.string(),
  /** Optional second line (instrument, counts, device…). */
  detail: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;

/** GET /security/log — the activity feed (trades, grades, security, system). */
export const securityLogResponseSchema = z.object({
  events: z.array(securityEventSchema),
});
export type SecurityLogResponse = z.infer<typeof securityLogResponseSchema>;
