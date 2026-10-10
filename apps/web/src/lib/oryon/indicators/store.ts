import {
  oryonIndicatorSchema,
  type OryonIndicatorInstance,
} from "@cosmoz/shared";

import { indicatorRuleError, type IndicatorRuleError } from "./validation";

/**
 * Oryon indicator store — single source of truth for the active indicator
 * instances (Phase 3 spec §4D, §9).
 *
 * Mirrors the drawing store discipline:
 *  - NO external state library — one class per workspace, shared through a
 *    React context, leaves subscribe with useSyncExternalStore;
 *  - immutable updates (new array reference per mutation);
 *  - invariants enforced HERE: every mutation re-parses through the shared
 *    Zod schema AND re-checks the business rules — an invalid configuration
 *    is REJECTED and the previous state is retained (spec §9);
 *  - instances are independent: updating one never touches another
 *    (verified by unit tests).
 *
 * No undo/redo at this layer — Phase 3 scope keeps history for drawings
 * only; indicator mutations are discrete config actions (add/remove/edit).
 */

export interface IndicatorStoreSnapshot {
  indicators: readonly OryonIndicatorInstance[];
  /** Bumped on every commit — cheap reactivity signal for subscribers. */
  version: number;
}

export type IndicatorMutationResult =
  | { ok: true }
  | { ok: false; error: IndicatorRuleError | "schema" | "capacity" };

const MAX_INSTANCES = 50;

function now(): number {
  return Date.now();
}

function validateInstance(instance: OryonIndicatorInstance): IndicatorMutationResult {
  if (!oryonIndicatorSchema.safeParse(instance).success) return { ok: false, error: "schema" };
  const rule = indicatorRuleError(instance);
  return rule !== null ? { ok: false, error: rule } : { ok: true };
}

export class OryonIndicatorStore {
  private state: IndicatorStoreSnapshot = { indicators: [], version: 0 };
  private listeners = new Set<() => void>();

  // ── React external store contract ─────────────────────────────────────────

  getSnapshot = (): IndicatorStoreSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get indicators(): readonly OryonIndicatorInstance[] {
    return this.state.indicators;
  }

  get version(): number {
    return this.state.version;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /** Adds a validated instance. Duplicate ids are rejected. */
  add(instance: OryonIndicatorInstance): IndicatorMutationResult {
    const check = validateInstance(instance);
    if (!check.ok) return check;
    if (this.state.indicators.length >= MAX_INSTANCES) {
      return { ok: false, error: "capacity" };
    }
    if (this.state.indicators.some((i) => i.id === instance.id)) {
      return { ok: false, error: "schema" };
    }
    this.commit([...this.state.indicators, instance]);
    return { ok: true };
  }

  /** Removes one instance. Unknown ids are a no-op. */
  remove(id: string): void {
    if (!this.state.indicators.some((i) => i.id === id)) return;
    this.commit(this.state.indicators.filter((i) => i.id !== id));
  }

  /**
   * Whole-instance replacement (config + style + visibility). The replacement
   * MUST keep the same id. On validation failure NOTHING changes — the last
   * valid configuration is retained (Phase 3 spec §9).
   */
  replace(next: OryonIndicatorInstance): IndicatorMutationResult {
    const current = this.state.indicators.find((i) => i.id === next.id);
    if (current === undefined) return { ok: false, error: "schema" };
    const check = validateInstance(next);
    if (!check.ok) return check;
    this.commit(this.state.indicators.map((i) => (i.id === next.id ? next : i)));
    return { ok: true };
  }

  toggleVisible(id: string): void {
    const target = this.state.indicators.find((i) => i.id === id);
    if (target === undefined) return;
    const next = { ...target, visible: !target.visible, updatedAt: now() } as OryonIndicatorInstance;
    const check = validateInstance(next);
    if (!check.ok) return;
    this.commit(this.state.indicators.map((i) => (i.id === id ? next : i)));
  }

  /**
   * Replaces the whole collection (validated persistence load / template
   * seeding). Already-validated input is trusted here — the persistence
   * loader and the seeding path are the only callers.
   */
  loadAll(instances: readonly OryonIndicatorInstance[]): void {
    this.state = { indicators: [...instances], version: this.state.version + 1 };
    this.emit();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private commit(next: readonly OryonIndicatorInstance[]): void {
    this.state = { indicators: next, version: this.state.version + 1 };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
