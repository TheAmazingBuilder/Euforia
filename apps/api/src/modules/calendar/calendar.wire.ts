/**
 * Calendar wire types (Phase 13) — the exact response shapes the
 * frontend contract already speaks (packages/shared eco-event +
 * calendar blocks/view schemas). Explicitly typed here so the controller
 * surface stays self-documenting; the shared schemas remain the runtime
 * contract (services render these objects directly — no Prisma leak).
 */

/** Wire shape of `/eco-events` (shared ecoEventSchema). */
export interface CalendarWireEvent {
  id: string;
  title: string;
  /** ISO 4217 code — string(3) on the wire (shared ecoEventSchema). */
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  /** ISO-8601 UTC with Z suffix. */
  scheduledAt: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

/** GET /eco-events — `{ events: EcoEvent[] }` (shared ecoEventsResponseSchema). */
export interface CalendarWireEvents {
  events: CalendarWireEvent[];
}
