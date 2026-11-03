import type { OryonAlert, OryonAlertCondition } from "@cosmoz/shared";

/**
 * Oryon alert store - single source of truth for the browser-local alert
 * records (Phase 5). Same discipline as the drawing store: NO external state
 * library, immutable updates (every mutation produces a new array reference),
 * useSyncExternalStore-ready, and the consumer wires persistence to the
 * subscription (the store itself knows nothing about localStorage).
 *
 * Scope note (documented product decision): alerts are a WORKSPACE-level
 * list (like the indicator stack), not per-symbol documents - one file, one
 * store. The chart overlay filters by the DISPLAYED instrument downstream.
 *
 * Validation happens at the boundaries: creation goes through the caller's
 * form validation + this factory; loading goes through the Zod-validated
 * persistence adapter. The store never mutates a record into an invalid
 * shape - status transitions are the only in-place changes and they preserve
 * every schema constraint.
 */

export interface AlertStoreSnapshot {
  alerts: readonly OryonAlert[];
  /** Bumped on every commit - cheap reactivity signal for subscribers. */
  version: number;
}

export interface AlertCreateInput {
  symbol: string;
  targetPrice: number;
  condition: OryonAlertCondition;
  label: string | null;
}

export function newAlertId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Test/SSR fallback - never a silent collision source.
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OryonAlertStore {
  private state: AlertStoreSnapshot = { alerts: [], version: 0 };
  private listeners = new Set<() => void>();

  // ── React external store contract ─────────────────────────────────────────

  getSnapshot = (): AlertStoreSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // ── Reads ─────────────────────────────────────────────────────────────────

  get alerts(): readonly OryonAlert[] {
    return this.state.alerts;
  }

  getById(id: string): OryonAlert | null {
    return this.state.alerts.find((alert) => alert.id === id) ?? null;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /** Adds one alert (status active). Caller validated the inputs. */
  add(input: AlertCreateInput): OryonAlert | null {
    const symbol = input.symbol.trim().toUpperCase();
    if (symbol.length === 0 || !Number.isFinite(input.targetPrice)) return null;
    if (this.state.alerts.length >= 100) return null; // envelope cap (shared contract)
    const now = Date.now();
    const alert: OryonAlert = {
      id: newAlertId(),
      symbol,
      targetPrice: input.targetPrice,
      condition: input.condition,
      label: input.label === null ? null : input.label.slice(0, 64),
      status: "active",
      createdAt: now,
      updatedAt: now,
      triggeredAt: null,
    };
    this.commit((current) => [...current, alert]);
    return alert;
  }

  remove(id: string): void {
    if (!this.state.alerts.some((alert) => alert.id === id)) return;
    this.commit((current) => current.filter((alert) => alert.id !== id));
  }

  /** Enable/disable toggle (active ↔ disabled). Triggered rows stay put. */
  toggleEnabled(id: string): void {
    const target = this.getById(id);
    if (target === null) return;
    const status = target.status === "active" ? "disabled" : "active";
    this.patch(id, { status });
  }

  /** Re-arms a triggered (or disabled) alert → active, clearing the stamp. */
  rearm(id: string): void {
    const target = this.getById(id);
    if (target === null) return;
    this.patch(id, { status: "active", triggeredAt: null });
  }

  /** Applies a CONFIRMED trigger (engine event) - idempotent per status. */
  markTriggered(id: string, at: number): void {
    const target = this.getById(id);
    if (target === null || target.status !== "active") return;
    this.patch(id, { status: "triggered", triggeredAt: at });
  }

  /** Replaces the whole collection (persistence load). */
  loadAll(alerts: readonly OryonAlert[]): void {
    this.state = { alerts: [...alerts], version: this.state.version + 1 };
    this.emit();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private patch(id: string, changes: Partial<Pick<OryonAlert, "status" | "triggeredAt">>): void {
    this.commit((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, ...changes, updatedAt: Date.now() } : alert,
      ),
    );
  }

  private commit(next: (current: readonly OryonAlert[]) => readonly OryonAlert[]): void {
    const after = next(this.state.alerts);
    if (after === this.state.alerts) return;
    this.state = { alerts: after, version: this.state.version + 1 };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
