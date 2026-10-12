"use client";

import type { OryonDrawing } from "@cosmoz/shared";

import { DrawingHistory } from "./history";

/**
 * Oryon drawing store — the single source of truth for the drawing
 * collection, selection and history (spec §4E).
 *
 * Design discipline:
 *  - NO external state library (cahier des charges §13 Q-recommandation:
 *    état local sans lib d'état). One class instance per Oryon workspace,
 *    shared through a React context; leaves subscribe with
 *    useSyncExternalStore, the canvas primitive subscribes imperatively.
 *  - Immutable updates: every mutation produces a new array reference, so
 *    snapshots are cheap and React never sees a silent in-place change.
 *  - Invariants enforced HERE (not in the UI): hidden objects cannot be
 *    selected; locked objects cannot be moved, re-anchored or restyled —
 *    only visibility/lock/delete remain available.
 *  - Draft (in-progress) geometry NEVER passes through this store — the
 *    interaction controller pushes live drag state straight into the
 *    primitive, so a drag re-paints the canvas without one React render.
 */

export interface DrawingStoreSnapshot {
  drawings: readonly OryonDrawing[];
  selectedId: string | null;
  /** Bumped on every commit — cheap reactivity signal for subscribers. */
  version: number;
}

export type DrawingPatch = Partial<
  Pick<OryonDrawing, "visible" | "locked" | "label" | "style">
>;

/** Style-anchored updates (drag/anchor edit) are type-aware full object swaps. */
export type DrawingUpdater = (drawing: OryonDrawing) => OryonDrawing;

export function newDrawingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Test/SSR fallback — never a silent collision source.
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OryonDrawingStore {
  private state: DrawingStoreSnapshot = {
    drawings: [],
    selectedId: null,
    version: 0,
  };

  private listeners = new Set<() => void>();
  private history = new DrawingHistory<readonly OryonDrawing[]>();

  // ── React external store contract ─────────────────────────────────────────

  getSnapshot = (): DrawingStoreSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // ── Reads ──────────────────────────────────────────────────────────────────

  get drawings(): readonly OryonDrawing[] {
    return this.state.drawings;
  }

  get selectedId(): string | null {
    return this.state.selectedId;
  }

  getSelected(): OryonDrawing | null {
    const id = this.state.selectedId;
    if (id === null) return null;
    return this.state.drawings.find((d) => d.id === id) ?? null;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  // ── Mutations (each commits one history entry unless batched) ─────────────

  /** Adds a completed drawing and selects it. */
  add(drawing: OryonDrawing): void {
    this.commit((current) => [...current, drawing]);
    this.select(drawing.id);
  }

  /** Removes one drawing (deselects when it was selected). */
  remove(id: string): void {
    const exists = this.state.drawings.some((d) => d.id === id);
    if (!exists) return;
    this.commit((current) => current.filter((d) => d.id !== id));
    if (this.state.selectedId === id) this.select(null);
  }

  /**
   * Generic update for STYLE-CLASS changes. Locked objects reject everything
   * except visible/locked toggles (spec §8: locked = not movable, not
   * editable — restyling is an edit).
   */
  update(id: string, patch: DrawingPatch): void {
    const target = this.state.drawings.find((d) => d.id === id);
    if (target === undefined) return;
    const touchesGeometryBeyondLock = target.locked &&
      !(
        Object.keys(patch).length === 1 &&
        ("visible" in patch || "locked" in patch)
      );
    if (touchesGeometryBeyondLock) return;
    this.commit((current) =>
      current.map((d) => (d.id === id ? this.withMeta(d, patch) : d)),
    );
  }

  /**
   * Whole-object replacement used by drags and anchor edits (type-aware).
   * A batch must be open around it (the interaction controller owns that).
   * Locked objects are refused outright.
   */
  replace(drawing: OryonDrawing): void {
    const target = this.state.drawings.find((d) => d.id === drawing.id);
    if (target === undefined || target.locked) return;
    this.commit((current) =>
      current.map((d) => (d.id === drawing.id ? this.withMeta(drawing, {}) : d)),
    );
  }

  toggleVisible(id: string): void {
    const target = this.state.drawings.find((d) => d.id === id);
    if (target === undefined) return;
    this.update(id, { visible: !target.visible });
  }

  toggleLocked(id: string): void {
    const target = this.state.drawings.find((d) => d.id === id);
    if (target === undefined) return;
    this.update(id, { locked: !target.locked });
  }

  /** Selection. Hidden objects can never become selected (spec §8). */
  select(id: string | null): void {
    if (id !== null) {
      const target = this.state.drawings.find((d) => d.id === id);
      if (target === undefined || !target.visible) return;
    }
    if (this.state.selectedId === id) return;
    this.state = { ...this.state, selectedId: id };
    this.emit();
  }

  /** Deletes every drawing after an explicit user confirmation flow. */
  clearAll(): void {
    if (this.state.drawings.length === 0) return;
    this.commit(() => []);
    this.select(null);
  }

  /**
   * Replaces the whole collection (persistence load / instrument switch).
   * History is CLEARED: undo belongs to one instrument session — a stale
   * snapshot across symbols would silently corrupt the other instrument.
   */
  loadAll(drawings: readonly OryonDrawing[]): void {
    this.state = {
      drawings: [...drawings],
      selectedId: null,
      version: this.state.version + 1,
    };
    this.history.clear();
    this.emit();
  }

  // ── Undo / redo ────────────────────────────────────────────────────────────

  /** Single-step mutation commit (one history entry — unless a batch is
   *  open, in which case the BATCH owns the entry: endBatch records the
   *  pre-batch snapshot exactly once. The unconditional push that used to
   *  live here double-recorded every batched drag (two identical entries),
   *  so one drag consumed TWO undo presses — the batch discipline in
   *  history.ts §12 exists precisely to prevent that). */
  private commit(next: (current: readonly OryonDrawing[]) => readonly OryonDrawing[]): void {
    const before = this.state.drawings;
    const after = next(before);
    if (after === before) return;
    if (!this.history.isBatchOpen) this.history.push(before);
    this.state = { ...this.state, drawings: after, version: this.state.version + 1 };
    this.emit();
  }

  /** Opens a drag batch — snapshots the collection for a single undo entry. */
  beginBatch(): void {
    this.history.beginBatch(this.state.drawings);
  }

  /** Closes a drag batch — one history entry when something changed. */
  endBatch(): void {
    this.history.endBatch(this.state.drawings);
  }

  /** Aborts a drag batch (pointer cancel) — no history entry. */
  abortBatch(): void {
    this.history.abortBatch();
  }

  undo(): void {
    const restored = this.history.undo(this.state.drawings);
    if (restored === null) return;
    this.state = {
      ...this.state,
      drawings: restored,
      // A deleted object may come back; a selected one may vanish — revalidate.
      selectedId:
        restored.find((d) => d.id === this.state.selectedId)?.id ?? null,
      version: this.state.version + 1,
    };
    this.emit();
  }

  redo(): void {
    const next = this.history.redo(this.state.drawings);
    if (next === null) return;
    this.state = {
      ...this.state,
      drawings: next,
      selectedId: next.find((d) => d.id === this.state.selectedId)?.id ?? null,
      version: this.state.version + 1,
    };
    this.emit();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Stamps modification metadata on persisted objects. */
  private withMeta(
    drawing: OryonDrawing,
    patch: DrawingPatch,
  ): OryonDrawing {
    const next = { ...drawing, ...patch } as OryonDrawing;
    next.updatedAt = Date.now();
    return next;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
