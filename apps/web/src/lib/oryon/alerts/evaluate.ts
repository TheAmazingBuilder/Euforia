import type { OryonAlert } from "@cosmoz/shared";

/**
 * Oryon alert evaluation - PURE domain (Phase 5 spec §6.2, §10). Zero React,
 * zero DOM, zero transport: observations go in, CONFIRMED trigger events come
 * out through a callback. The caller (context layer) owns the store, the
 * persistence and the notification surface - this file owns the POLICY.
 *
 * Reference price (documented product decision): the market feed's quote
 * price - the SAME value the chart merges into the forming candle. The feed
 * contract carries exactly one price per symbol, so bid/ask/last/close mixing
 * cannot occur by construction.
 *
 * Crossing policy (spec §6.2 exact semantics):
 *   cross-above fires when the previous eligible price is AT OR BELOW the
 *   threshold and the current eligible price is strictly ABOVE it; cross-below
 *   mirrors it. Equality with the threshold is part of the "from" side, never
 *   the "to" side - a price sitting exactly at the threshold has NOT crossed.
 *
 * Deduplication & integrity rules (spec §10):
 *   - a fresh, unprimed alert NEVER triggers on its first observation - an
 *     initial snapshot already beyond the threshold is not a crossing;
 *   - repeated/equal updates cannot re-trigger (strict side change required);
 *   - an observation older than the last processed one (out-of-order replay,
 *     stale snapshot) is IGNORED per symbol;
 *   - a feed loss re-primes every alert: after a reconnect the first
 *     observation re-anchors without triggering, so a gap-crossing that may
 *     have happened while dark is never claimed by the client;
 *   - a triggered alert leaves the evaluation set (one-shot lifecycle, until
 *     the user re-arms - documented product decision).
 *
 * Background honesty: evaluation runs ONLY while the workspace is open and
 * the feed is live - nothing here promises server-side monitoring.
 */

/** One feed observation handed to the engine (quote-store projection). */
export interface AlertObservation {
  symbol: string;
  price: number;
  /** Observation timestamp (epoch ms) - staleness/ordering input. */
  ts: number;
}

/** A CONFIRMED trigger - the caller applies it to the store + notifies. */
export interface AlertTriggerEvent {
  alert: OryonAlert;
  /** Observed price that completed the crossing. */
  price: number;
  /** Client epoch ms of the evaluation (becomes the record's triggeredAt). */
  at: number;
}

/**
 * Pure crossing decision (spec §6.2). prev = previous eligible observation,
 * current = the new one. Non-finite inputs can never cross.
 */
export function isCrossing(
  condition: "crosses_above" | "crosses_below",
  targetPrice: number,
  prev: number,
  current: number,
): boolean {
  if (!Number.isFinite(targetPrice) || !Number.isFinite(prev) || !Number.isFinite(current)) {
    return false;
  }
  if (condition === "crosses_above") {
    return prev <= targetPrice && current > targetPrice;
  }
  return prev >= targetPrice && current < targetPrice;
}

interface AlertRuntime {
  /** False until the first eligible observation after (re)arming. */
  primed: boolean;
  prevPrice: number | null;
  /** Last processed observation ts (per alert) - ordering guard. */
  lastTs: number | null;
}

export type AlertTriggerHandler = (event: AlertTriggerEvent) => void;

export class OryonAlertEngine {
  private alerts: readonly OryonAlert[] = [];
  private runtimes = new Map<string, AlertRuntime>();
  private feedLive = false;
  /** Installed by the context AFTER mount (external-system wiring). */
  private triggerHandler: AlertTriggerHandler | null = null;

  /** Registers/unregisters the CONFIRMED-trigger callback (context wiring). */
  setTriggerHandler(handler: AlertTriggerHandler | null): void {
    this.triggerHandler = handler;
  }

  /**
   * Replaces the evaluated set (store commit). Runtime priming survives for
   * kept ids - a re-render must not re-arm live alerts; removed ids are
   * forgotten. Only ACTIVE alerts are evaluated (triggered/disabled never
   * fire again until re-armed/enabled, and re-arming re-primes them).
   */
  setAlerts(alerts: readonly OryonAlert[]): void {
    this.alerts = alerts;
    const live = new Set(alerts.map((alert) => alert.id));
    for (const id of [...this.runtimes.keys()]) {
      if (!live.has(id)) this.runtimes.delete(id);
    }
  }

  /**
   * Feed phase gate (spec §10 - disconnect/reconnect handling). Leaving the
   * live phase re-primes everything: the next live observation re-anchors
   * without triggering. Nothing is evaluated while not live.
   */
  setFeedLive(live: boolean): void {
    if (this.feedLive && !live) {
      for (const runtime of this.runtimes.values()) {
        runtime.primed = false;
        runtime.prevPrice = null;
      }
    }
    this.feedLive = live;
  }

  /**
   * Feeds one broadcast of observations. Cheap by design: O(observations ×
   * alerts-of-that-symbol) with a per-alert runtime lookup - no per-alert
   * connections, no per-alert timers (ONE shared feed store upstream).
   */
  observe(observations: readonly AlertObservation[]): void {
    if (!this.feedLive || observations.length === 0) return;
    for (const observation of observations) {
      if (!Number.isFinite(observation.price)) continue;
      for (const alert of this.activeAlertsFor(observation.symbol)) {
        const runtime = this.runtimeFor(alert.id);
        // Out-of-order / replayed snapshot - never evaluate as a new tick.
        if (runtime.lastTs !== null && observation.ts < runtime.lastTs) continue;
        runtime.lastTs = observation.ts;
        if (!runtime.primed || runtime.prevPrice === null) {
          // First eligible observation: anchor WITHOUT triggering (spec §10 -
          // "already beyond the threshold" on arrival is not a crossing).
          runtime.primed = true;
          runtime.prevPrice = observation.price;
          continue;
        }
        const prev = runtime.prevPrice;
        runtime.prevPrice = observation.price;
        if (isCrossing(alert.condition, alert.targetPrice, prev, observation.price)) {
          this.triggerHandler?.({ alert, price: observation.price, at: Date.now() });
        }
      }
    }
  }

  /** Re-arms one alert's runtime (user action) - primes again from scratch. */
  rearm(alertId: string): void {
    this.runtimes.delete(alertId);
  }

  /** Test/dev introspection: whether the runtime is primed for an alert. */
  isPrimed(alertId: string): boolean {
    return this.runtimes.get(alertId)?.primed ?? false;
  }

  private activeAlertsFor(symbol: string): OryonAlert[] {
    const upper = symbol.trim().toUpperCase();
    return this.alerts.filter(
      (alert) =>
        alert.status === "active" &&
        alert.symbol.trim().toUpperCase() === upper &&
        Number.isFinite(alert.targetPrice),
    );
  }

  private runtimeFor(alertId: string): AlertRuntime {
    let runtime = this.runtimes.get(alertId);
    if (runtime === undefined) {
      runtime = { primed: false, prevPrice: null, lastTs: null };
      this.runtimes.set(alertId, runtime);
    }
    return runtime;
  }
}
