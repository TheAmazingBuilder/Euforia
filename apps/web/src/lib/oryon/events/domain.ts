import type { EcoEvent } from "@cosmoz/shared";

/**
 * Oryon economic-event domain (Phase 8 spec §6, §10) — PURE helpers over
 * the EXISTING shared EcoEvent contract (reuse, not a second model — the
 * audit found the full calendar surface: GET /eco-events via useEcoEvents).
 *
 * The wire contract provides: id, title, currency, impact, scheduledAt
 * (ISO UTC), actual/forecast/previous (nullable). Fields the source does
 * NOT provide (country/region beyond currency, source timezone, revision
 * metadata, provider key) are treated as UNAVAILABLE — nothing is invented
 * (spec §6.1). The lifecycle status is DERIVED, mirroring the API domain's
 * rule: an event whose actual became available is RELEASED, never a second
 * event (spec §6.3 / API domain §12).
 */

/** Derived lifecycle (same rule as the API's deriveStatus). */
export type OryonEventStatus = "SCHEDULED" | "RELEASED";

/** RELEASED once an actual value exists and the schedule instant has passed. */
export function eventStatus(event: EcoEvent, nowMs: number): OryonEventStatus {
  if (event.actual !== null && new Date(event.scheduledAt).getTime() <= nowMs) {
    return "RELEASED";
  }
  return "SCHEDULED";
}

const IMPORTANCE_RANK: Record<EcoEvent["impact"], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/** True when the event meets a panel's minimum-importance marker rule. */
export function eventMeetsImportance(
  event: EcoEvent,
  minImportance: EcoEvent["impact"],
): boolean {
  return IMPORTANCE_RANK[event.impact] >= IMPORTANCE_RANK[minImportance];
}

/**
 * Events whose schedule instant falls in the HALF-OPEN UTC span
 * [fromMs, toMs) — explicit boundary semantics (spec §10: correct
 * inclusion/exclusion at interval boundaries, midnight included in the
 * day it belongs to, no duplicates across adjacent ranges).
 */
export function eventsInUtcSpan(events: readonly EcoEvent[], fromMs: number, toMs: number): EcoEvent[] {
  if (fromMs > toMs) return [];
  const result: EcoEvent[] = [];
  for (const event of events) {
    const atMs = new Date(event.scheduledAt).getTime();
    if (Number.isNaN(atMs)) continue; // unparsable timestamp — skip, never render
    if (atMs >= fromMs && atMs < toMs) result.push(event);
  }
  return result;
}

/**
 * Defensive id-dedupe (spec §8: no duplicated event records when multiple
 * panels/queries meet). First occurrence wins; input order is stable.
 */
export function dedupeEventsById(events: readonly EcoEvent[]): EcoEvent[] {
  const seen = new Set<string>();
  const result: EcoEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

/** Currency filter — exact ISO code match, case-insensitive, never a
 *  substring of a symbol (spec §10 "no false match"). Empty/null = all. */
export function eventMatchesCurrency(event: EcoEvent, currency: string | null): boolean {
  if (currency === null || currency === "") return true;
  return event.currency.toUpperCase() === currency.toUpperCase();
}

/**
 * Events relevant to a chart's loaded candle span — the marker input
 * (spec §8): markers appear only within the displayed time range, so the
 * span is the candle domain padded by one bucket on each side. The caller
 * still applies its importance/currency rules; relevance to an INSTRUMENT
 * beyond the time span is deliberately NOT inferred (spec §10: no verified
 * symbol→exposure mapping exists in the catalog — users browse all events
 * and filter explicitly, a symbol prefix is never a match criterion).
 */
export function eventsForChartSpan(
  events: readonly EcoEvent[],
  firstCandleMs: number,
  lastCandleMs: number,
  intervalMs: number,
): EcoEvent[] {
  if (!Number.isFinite(firstCandleMs) || !Number.isFinite(lastCandleMs)) return [];
  const step = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000;
  return eventsInUtcSpan(events, firstCandleMs - step, lastCandleMs + step);
}
