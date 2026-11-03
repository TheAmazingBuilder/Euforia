import type { BrokerPosition } from "@cosmoz/shared";
import { brokerPositionSchema } from "@cosmoz/shared";

/**
 * Position record validation boundary (Phase 4 spec §6 - "validate numeric
 * inputs and handle malformed or incomplete records safely").
 *
 * The realtime store (lib/realtime/market.ts) applies wire snapshots as-is -
 * it is shared infrastructure with a single job (transport + auth). THIS
 * layer is where Oryon validates every record against the shared
 * `brokerPositionSchema` before anything reaches the panel or the chart:
 *   - a record that fails validation is DROPPED (never repaired, never
 *     defaulted - a missing stop-loss stays missing, a malformed number is
 *     not a number);
 *   - duplicates (same id) are collapsed LAST-WRITE-WINS, which also makes
 *     a replayed snapshot idempotent at this boundary;
 *   - the function never throws - one poisoned record cannot corrupt the
 *     view (spec §6 error-handling conventions).
 */

export interface SanitizeReport {
  /** Valid, deduplicated positions, ready for the panel and the chart. */
  positions: BrokerPosition[];
  /** Count of records rejected by the schema (observability, honest logs). */
  dropped: number;
}

const positionRecordSchema = brokerPositionSchema;

export function sanitizePositions(raw: readonly unknown[]): SanitizeReport {
  const byId = new Map<string, BrokerPosition>();
  let dropped = 0;

  for (const record of raw) {
    const parsed = positionRecordSchema.safeParse(record);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    byId.set(parsed.data.id, parsed.data);
  }

  return { positions: [...byId.values()], dropped };
}
