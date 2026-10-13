"use client";

import * as React from "react";

import { CommandHistory } from "@/lib/oryon/oryon-commands";
import {
  DebouncedSaver,
  drawingPersistence,
} from "@/lib/oryon/drawing-persistence";
import {
  MAX_OBJECTS_PER_BOOK,
  defaultStyleFor,
} from "@/components/oryon/drawings/schema";
import type {
  DrawingKind,
  DrawingLineStyle,
  DrawingObject,
  DrawingShapeStyle,
  DrawingTextStyle,
  OryonTool,
} from "@/components/oryon/drawings/types";

/**
 * Oryon drawing store — the drawing book per instrument, following the
 * house store pattern (useSyncExternalStore + external mutable snapshot,
 * as lib/oryon/workspace-store.ts and lib/realtime/market.ts).
 *
 * Structure (PRD §8.5): immutable books keyed by canonical instrument
 * symbol; mutations flow through REPLACE-the-array commands so undo/redo
 * snapshots are array references (no deep clones). Transient interaction
 * state (in-progress draft, hover) lives in the drawing CONTROLLER, not
 * here — this store only holds committed objects and UI selection.
 *
 * Instrument identity: `Instrument.symbol` — the same canonical identity
 * the candles contract and the workspace store use, so books can never
 * mix unrelated instruments.
 */

export interface DrawingStoreState {
  /** symbol → committed objects (ascending creation order, newest last). */
  readonly books: Readonly<Record<string, readonly DrawingObject[]>>;
  /** Selected object id (session-only, never persisted). */
  readonly selectedId: string | null;
  /** Books hydrated from persistence at least once. */
  readonly loaded: Readonly<Record<string, boolean>>;
  /** Bumped on every history mutation — toolbar undo/redo re-render. */
  readonly historyRevision: number;
  /** Active rail tool (session-only). */
  readonly activeTool: OryonTool;
}

const EMPTY_BOOK: readonly DrawingObject[] = [];

let state: DrawingStoreState = {
  books: {},
  selectedId: null,
  loaded: {},
  historyRevision: 0,
  activeTool: "cursor",
};

const listeners = new Set<() => void>();
const histories = new Map<string, CommandHistory>();
const saver = new DebouncedSaver(drawingPersistence);

function notify(): void {
  for (const listener of listeners) listener();
}

function history(symbol: string): CommandHistory {
  let instance = histories.get(symbol);
  if (!instance) {
    instance = new CommandHistory();
    histories.set(symbol, instance);
  }
  return instance;
}

function book(symbol: string): readonly DrawingObject[] {
  return state.books[symbol] ?? EMPTY_BOOK;
}

/**
 * Raw book replacement — the undo/redo primitive. Schedules persistence
 * and notifies; pushes NO history (commands call this directly).
 */
function applyBook(symbol: string, objects: readonly DrawingObject[]): void {
  state = { ...state, books: { ...state.books, [symbol]: objects } };
  saver.schedule(symbol, () => book(symbol));
  notify();
}

/** Selection sanity: a selection must reference an existing object. */
function reconcileSelection(symbol: string): void {
  if (state.selectedId === null) return;
  const stillThere = book(symbol).some((object) => object.id === state.selectedId);
  if (!stillThere) state = { ...state, selectedId: null };
}

function touch(symbol: string, id: string, patch: Partial<DrawingObject>): DrawingObject | null {
  const current = book(symbol).find((object) => object.id === id);
  if (!current) return null;
  return { ...current, ...patch, updatedAt: Date.now() } as DrawingObject;
}

// ── Public mutators (event-handler entry points) ────────────────────────────

/** Append a completed drawing. Returns false when the book cap is reached. */
export function addDrawing(symbol: string, object: DrawingObject): boolean {
  const before = book(symbol);
  if (before.length >= MAX_OBJECTS_PER_BOOK) return false;
  const after = [...before, object];
  applyBook(symbol, after);
  history(symbol).push({
    label: "create",
    undo: () => {
      applyBook(symbol, before);
      reconcileSelection(symbol);
    },
    redo: () => applyBook(symbol, after),
  });
  return true;
}

/**
 * Replace one object (move result, anchor edit, style change, text edit) —
 * exactly one history entry per coherent operation.
 */
export function replaceDrawing(
  symbol: string,
  next: DrawingObject,
  label: string,
): void {
  const before = book(symbol);
  if (!before.some((object) => object.id === next.id)) return;
  const after = before.map((object) => (object.id === next.id ? next : object));
  applyBook(symbol, after);
  history(symbol).push({
    label,
    undo: () => applyBook(symbol, before),
    redo: () => applyBook(symbol, after),
  });
}

export function removeDrawing(symbol: string, id: string): void {
  const before = book(symbol);
  const target = before.find((object) => object.id === id);
  if (!target) return;
  const after = before.filter((object) => object.id !== id);
  applyBook(symbol, after);
  if (state.selectedId === id) state = { ...state, selectedId: null };
  history(symbol).push({
    label: "delete",
    undo: () => applyBook(symbol, before),
    redo: () => applyBook(symbol, after),
  });
}

/** Delete every drawing of the instrument — ONE undo step. */
export function clearDrawings(symbol: string): void {
  const before = book(symbol);
  if (before.length === 0) return;
  const after: readonly DrawingObject[] = [];
  applyBook(symbol, after);
  state = { ...state, selectedId: null };
  history(symbol).push({
    label: "clear",
    undo: () => applyBook(symbol, before),
    redo: () => applyBook(symbol, after),
  });
}

/** Style change on one object (never a global default — Phase 2 §11). */
export function setDrawingStyle(
  symbol: string,
  id: string,
  style: DrawingLineStyle | DrawingShapeStyle | DrawingTextStyle,
): void {
  const next = touch(symbol, id, { style });
  if (next) replaceDrawing(symbol, next, "style");
}

export function setDrawingText(symbol: string, id: string, text: string): void {
  const next = touch(symbol, id, { text: text.slice(0, 500) });
  if (next) replaceDrawing(symbol, next, "text");
}

export function setDrawingLabel(symbol: string, id: string, label: string): void {
  const next = touch(symbol, id, { label: label.slice(0, 200) || undefined });
  if (next) replaceDrawing(symbol, next, "label");
}

export function toggleDrawingLocked(symbol: string, id: string): void {
  const current = book(symbol).find((object) => object.id === id);
  if (!current) return;
  const next = touch(symbol, id, { locked: !current.locked });
  if (next) replaceDrawing(symbol, next, "lock");
}

export function toggleDrawingHidden(symbol: string, id: string): void {
  const current = book(symbol).find((object) => object.id === id);
  if (!current) return;
  const next = touch(symbol, id, { hidden: !current.hidden });
  if (next) replaceDrawing(symbol, next, "hide");
}

export function selectDrawing(id: string | null): void {
  if (state.selectedId === id) return;
  state = { ...state, selectedId: id };
  notify();
}

export function setActiveTool(tool: OryonTool): void {
  if (state.activeTool === tool) return;
  state = { ...state, activeTool: tool };
  notify();
}

export function undoDrawings(symbol: string): void {
  const command = history(symbol).undo();
  if (command) {
    reconcileSelection(symbol);
    state = { ...state, historyRevision: state.historyRevision + 1 };
    notify();
  }
}

export function redoDrawings(symbol: string): void {
  const command = history(symbol).redo();
  if (command) {
    reconcileSelection(symbol);
    state = { ...state, historyRevision: state.historyRevision + 1 };
    notify();
  }
}

/**
 * Hydrate the book for `symbol` from persistence ONCE per session (called
 * on instrument selection). Later switches use the in-memory book.
 */
export function ensureDrawingBook(symbol: string): void {
  if (state.loaded[symbol]) return;
  const restored = drawingPersistence.load(symbol);
  state = {
    ...state,
    books: { ...state.books, [symbol]: restored ?? book(symbol) },
    loaded: { ...state.loaded, [symbol]: true },
  };
  // Restored state is the ground truth for a fresh session — a stale
  // history stack from a previous mount must not resurrect lost objects.
  history(symbol).clear();
  state = { ...state, historyRevision: state.historyRevision + 1 };
  notify();
}

// ── Plain getters (controller / workspace Escape coordination) ─────────────

export function getDrawingBook(symbol: string): readonly DrawingObject[] {
  return book(symbol);
}

export function getSelectedDrawingId(): string | null {
  return state.selectedId;
}

export function getActiveTool(): OryonTool {
  return state.activeTool;
}

/** True when the drawing layer should consume Escape before the workspace. */
export function isDrawingEngaged(): boolean {
  return state.activeTool !== "cursor" || state.selectedId !== null;
}

export function subscribeDrawingStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Factory for new objects — the controller supplies anchors/ids. */
export function newDrawingObject(
  kind: DrawingKind,
  anchors: DrawingObject["anchors"],
): DrawingObject {
  const now = Date.now();
  const style = defaultStyleFor(kind);
  return {
    id: crypto.randomUUID(),
    kind,
    anchors,
    style,
    locked: false,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  } as DrawingObject;
}

// ── React bindings ──────────────────────────────────────────────────────────

function useDrawingStore<T>(getSnapshot: () => T): T {
  return React.useSyncExternalStore(subscribeDrawingStore, getSnapshot, getSnapshot);
}

/** Committed drawings of the instrument (stable ref until mutated). */
export function useOryonDrawings(symbol: string): readonly DrawingObject[] {
  return useDrawingStore(() => state.books[symbol] ?? EMPTY_BOOK);
}

export function useOryonDrawingSelection(): string | null {
  return useDrawingStore(() => state.selectedId);
}

export function useOryonActiveTool(): OryonTool {
  return useDrawingStore(() => state.activeTool);
}

export interface DrawingHistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo/redo availability for the toolbar (revision-driven re-render). */
export function useOryonDrawingHistory(symbol: string): DrawingHistoryStatus {
  const revision = useDrawingStore(() => state.historyRevision);
  const instance = history(symbol);
  // `revision` both re-renders this hook and orders the read after mutations.
  void revision;
  return { canUndo: instance.canUndo, canRedo: instance.canRedo };
}

/** Test-only reset — never called by production code. */
export function __resetOryonDrawingStoreForTests(): void {
  state = {
    books: {},
    selectedId: null,
    loaded: {},
    historyRevision: 0,
    activeTool: "cursor",
  };
  histories.clear();
  saver.dispose();
  notify();
}
