import type { OryonSyncSettings } from "@cosmoz/shared";

import { createEchoGuard, type EchoGuard, type SyncRange } from "./alignment";

/**
 * Oryon chart synchronization coordinator (Phase 7 spec §8, §9, §14).
 *
 * Coordinates TIME-SCALE and CROSSHAIR synchronization across chart-panel
 * engines. Instrument and timeframe linking are STATE concerns enforced in
 * the workspace config store — they never pass through here.
 *
 * Group model (spec §9, simpler-model clause): the workspace is ONE
 * implicit group. Membership is DERIVED from the registered engines — an
 * added/removed panel registers/unregisters, so stale member references
 * are structurally impossible, and conflicting group memberships cannot
 * exist. The four sync features are INDEPENDENT: enabling one never
 * enables another.
 *
 * Loop protection (spec §8, §14) — three independent layers:
 *  1. a programmatic apply marks the target's echo guard; the guard's
 *     suppression window (short, see alignment.ts) swallows the change
 *     event the library fires back for OUR OWN apply;
 *  2. an event carrying the exact value we just broadcast is dropped
 *     (per-adapter guard);
 *  3. targets that already match the incoming value within the range
 *     epsilon are skipped — no-op applies never enter the pipeline.
 * A user-originated change on ANY chart (including a synchronized target)
 * is a new value: it propagates symmetrically.
 */

/** The engine surface the coordinator needs — implemented (and unit-tested
 *  with fakes) independently of the chart library. */
export interface SyncEngineAdapter {
  /** Current visible time range (unix seconds), or null when no data. */
  getVisibleRange(): SyncRange | null;
  /** Programmatically sets the visible time range (unix seconds). */
  applyVisibleRange(range: SyncRange): void;
  /** Fires on every visible-range change (user pan/zoom AND programmatic). */
  onVisibleRangeChange(handler: (range: SyncRange | null) => void): () => void;
  /**
   * Moves the crosshair to the bar CONTAINING `timeSec`. False = the chart
   * cannot represent that timestamp (gap/outside span) — nothing moved.
   */
  applyCrosshairAtTime(timeSec: number): boolean;
  /** Removes the crosshair (source hover left / timestamp not representable). */
  clearCrosshair(): void;
  /** Fires with the hover time (unix seconds) or null when the crosshair left. */
  onCrosshairTime(handler: (timeSec: number | null) => void): () => void;
}

export type SyncFeatures = OryonSyncSettings;

interface AdapterEntry {
  adapter: SyncEngineAdapter;
  unsubscribe: () => void;
  rangeGuard: EchoGuard;
  crosshairGuard: EchoGuard;
}

export class OryonSyncCoordinator {
  private entries = new Map<string, AdapterEntry>();
  private features: SyncFeatures = {
    timeScale: false,
    crosshair: false,
    instrument: false,
    timeframe: false,
  };
  private disposing = false;

  /** Currently enabled features (instrument/timeframe are inert here —
   *  state-level sync lives in the workspace store). */
  setFeatures(features: SyncFeatures): void {
    this.features = { ...features };
  }

  getFeatures(): SyncFeatures {
    return { ...this.features };
  }

  /** Registers a chart engine under a stable panel id. Re-registration of
   *  the same id is a no-op (React strict-mode double effects included). */
  register(id: string, adapter: SyncEngineAdapter): void {
    if (this.disposing || this.entries.has(id)) return;
    const rangeGuard = createEchoGuard();
    const crosshairGuard = createEchoGuard();

    const unsubscribeRange = adapter.onVisibleRangeChange((range) => {
      this.handleRangeChange(id, rangeGuard, range);
    });
    const unsubscribeCrosshair = adapter.onCrosshairTime((timeSec) => {
      this.handleCrosshairChange(id, crosshairGuard, timeSec);
    });

    this.entries.set(id, {
      adapter,
      unsubscribe: () => {
        unsubscribeRange();
        unsubscribeCrosshair();
      },
      rangeGuard,
      crosshairGuard,
    });
  }

  /** Unregisters a chart engine (panel removed / chart destroyed). */
  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    entry.unsubscribe();
    this.entries.delete(id);
  }

  /** Number of currently registered engines (tests + diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  /** Tears down every subscription (workspace unmount). */
  dispose(): void {
    this.disposing = true;
    for (const entry of this.entries.values()) entry.unsubscribe();
    this.entries.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private handleRangeChange(
    sourceId: string,
    sourceGuard: EchoGuard,
    range: SyncRange | null,
  ): void {
    if (!this.features.timeScale || range === null) return;
    // Echo of OUR OWN programmatic apply on this very chart — never re-broadcast.
    if (sourceGuard.matches(range)) return;

    for (const [id, entry] of this.entries) {
      if (id === sourceId) continue;
      const current = entry.adapter.getVisibleRange();
      // Already aligned (within epsilon) — skip the no-op apply entirely.
      if (current !== null && Math.abs(current.from - range.from) <= 1 && Math.abs(current.to - range.to) <= 1) {
        continue;
      }
      entry.rangeGuard.mark(range);
      entry.adapter.applyVisibleRange({ from: range.from, to: range.to });
    }
  }

  private handleCrosshairChange(
    sourceId: string,
    sourceGuard: EchoGuard,
    timeSec: number | null,
  ): void {
    if (!this.features.crosshair) return;
    if (sourceGuard.matches(timeSec)) return;

    for (const [id, entry] of this.entries) {
      if (id === sourceId) continue;
      entry.crosshairGuard.mark(timeSec);
      if (timeSec === null) {
        entry.adapter.clearCrosshair();
      } else {
        // A target that cannot represent the timestamp keeps an honest
        // empty crosshair — no snap fabrication (spec §8.2).
        entry.adapter.applyCrosshairAtTime(timeSec);
      }
    }
  }
}
