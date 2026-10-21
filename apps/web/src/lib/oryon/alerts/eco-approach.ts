import type { EcoEvent } from "@cosmoz/shared";

/**
 * Oryon eco-approach engine — PURE domain (the alerts engine's pattern,
 * same folder, same discipline): workspace facts + calendar facts in,
 * CONFIRMED approach notices out through a callback. Zero React, zero DOM,
 * zero transport. The caller (bridge leaf) owns the queries and the toast
 * surface — this file owns the POLICY.
 *
 * Contract (the user's request): notify the APPROACH of a HIGH-impact
 * economic event for the instruments actually displayed by the workspace
 * panels. Matching is currency-based and CONSERVATIVE: an event matters to
 * an instrument when its currency equals the instrument's quote currency,
 * OR sits on the other side of a 6-letter FX pair (EURUSD ↔ EUR/USD) —
 * anything else (indices, metals) matches only by exact quote currency.
 *
 * Notice policy:
 *   - HIGH impact only (the user's scope);
 *   - milestones at T-30 / T-10 / T-2 minutes — each (event, milestone)
 *     fires ONCE per workspace session (in-memory dedupe; a reload may
 *     re-fire an approaching milestone, which is honest: the page was
 *     closed, nothing claimed delivery in between);
 *   - an event already in the past never fires; an event whose milestone
 *     window was crossed while the page was dark fires on the NEXT tick
 *     (marked "imminent" wording) — never silently skipped;
 *   - engine only runs while the workspace is open (the bridge mounts with
 *     the providers) — nothing here promises background delivery.
 */

/** Approaching milestones (minutes before the release). */
export const ECO_APPROACH_MILESTONES = [30, 10, 2] as const;

/** The events this engine evaluates (projection of the eco surface). */
export interface EcoApproachEventInput {
  id: string;
  title: string;
  currency: string;
  impact: EcoEvent["impact"];
  /** UTC epoch ms of the scheduled release. */
  scheduledAtMs: number;
}

/** The instruments the workspace actually displays. */
export interface EcoApproachInstrumentInput {
  symbol: string;
  quoteCurrency: string;
}

/** A CONFIRMED approach notice — the caller formats + notifies. */
export interface EcoApproachNotice {
  event: EcoApproachEventInput;
  /** The milestone that fired (minutes before the release). */
  milestoneMinutes: number;
  /** Instruments of the workspace the event applies to. */
  symbols: string[];
  /** True when the milestone window was crossed while the page was dark. */
  overdue: boolean;
  at: number;
}

export type EcoApproachHandler = (notice: EcoApproachNotice) => void;

/**
 * Currency match: exact quote-currency equality, or the event currency is
 * one of the two legs of a 6-letter FX pair (base|quote).
 */
export function ecoEventMatchesInstrument(
  eventCurrency: string,
  instrument: EcoApproachInstrumentInput,
): boolean {
  const currency = eventCurrency.trim().toUpperCase();
  const quote = instrument.quoteCurrency.trim().toUpperCase();
  const symbol = instrument.symbol.trim().toUpperCase();
  if (currency === "") return false;
  if (currency === quote) return true;
  return symbol.length === 6 && (symbol.startsWith(currency) || symbol.endsWith(currency));
}

interface EventRuntime {
  /** (milestone → already fired) — one-shot per workspace session. */
  fired: Set<number>;
}

export class OryonEcoApproachEngine {
  private events: readonly EcoApproachEventInput[] = [];
  private instruments: readonly EcoApproachInstrumentInput[] = [];
  private runtimes = new Map<string, EventRuntime>();
  private handler: EcoApproachHandler | null = null;
  /** Last tick processed — an empty interval re-evaluated must not re-fire. */
  private lastTickMs: number | null = null;

  setHandler(handler: EcoApproachHandler | null): void {
    this.handler = handler;
  }

  /** Replaces the event set (eco query commit) — fired-state survives. */
  setEvents(events: readonly EcoApproachEventInput[]): void {
    this.events = events;
    const live = new Set(events.map((event) => event.id));
    for (const id of [...this.runtimes.keys()]) {
      if (!live.has(id)) this.runtimes.delete(id);
    }
  }

  /** Replaces the workspace instrument set (panel layout commits). */
  setInstruments(instruments: readonly EcoApproachInstrumentInput[]): void {
    this.instruments = instruments;
  }

  /** Test/dev introspection: whether a milestone already fired. */
  hasFired(eventId: string, milestone: number): boolean {
    return this.runtimes.get(eventId)?.fired.has(milestone) ?? false;
  }

  /**
   * Advances the clock to `nowMs` and returns the CONFIRMED notices whose
   * milestone fell inside (lastTick, now]. Cheap: O(events × milestones).
   */
  tick(nowMs: number): EcoApproachNotice[] {
    const previous = this.lastTickMs;
    this.lastTickMs = nowMs;
    if (previous === null || nowMs <= previous) return [];
    const notices: EcoApproachNotice[] = [];
    for (const event of this.events) {
      if (event.impact !== "HIGH") continue;
      if (!Number.isFinite(event.scheduledAtMs) || event.scheduledAtMs <= nowMs) continue;
      const symbols = this.instruments
        .filter((instrument) => ecoEventMatchesInstrument(event.currency, instrument))
        .map((instrument) => instrument.symbol);
      if (symbols.length === 0) continue;
      const runtime = this.runtimeFor(event.id);
      const minutesLeft = (event.scheduledAtMs - nowMs) / 60_000;
      for (const milestone of ECO_APPROACH_MILESTONES) {
        if (runtime.fired.has(milestone)) continue;
        const due = minutesLeft <= milestone;
        if (!due) continue;
        runtime.fired.add(milestone);
        // Overdue = the milestone passed while dark (first tick after the
        // window) — the copy may say "imminent" instead of "in N min".
        const milestoneMs = event.scheduledAtMs - milestone * 60_000;
        const overdue = milestoneMs <= previous;
        notices.push({ event, milestoneMinutes: milestone, symbols, overdue, at: nowMs });
      }
    }
    if (notices.length > 0) {
      for (const notice of notices) this.handler?.(notice);
    }
    return notices;
  }

  private runtimeFor(eventId: string): EventRuntime {
    let runtime = this.runtimes.get(eventId);
    if (runtime === undefined) {
      runtime = { fired: new Set() };
      this.runtimes.set(eventId, runtime);
    }
    return runtime;
  }
}
