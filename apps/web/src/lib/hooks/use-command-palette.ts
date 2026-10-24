"use client";

import { useSyncExternalStore } from "react";

/**
 * Global command-palette state - same tiny external-store pattern as the
 * trade modal, so the topbar search button, the ⌘K / Ctrl+K hotkey and any
 * future entry point share one instance without prop drilling.
 */

/** Frozen closed snapshot - stable server reference, no hydration loops. */
const CLOSED_SNAPSHOT: CommandPaletteState = Object.freeze({ open: false });

export interface CommandPaletteState {
  open: boolean;
}

let state: CommandPaletteState = CLOSED_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: CommandPaletteState): void {
  state = next;
  emit();
}

/** Open the command palette. */
export function openCommandPalette(): void {
  setState({ open: true });
}

/** Close the command palette. */
export function closeCommandPalette(): void {
  setState(CLOSED_SNAPSHOT);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side of the palette store. */
export function useCommandPaletteState(): CommandPaletteState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Server + hydration snapshot: closed (stable reference - see above).
    () => CLOSED_SNAPSHOT,
  );
}
