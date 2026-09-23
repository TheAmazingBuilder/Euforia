"use client";

import { useSyncExternalStore } from "react";

/**
 * Global shortcuts-overlay state ("?" hotkey) — tiny external store so the
 * TradeModalHost hotkey and the command palette action share one instance.
 */

/** Frozen closed snapshot — stable server reference, no hydration loops. */
const CLOSED_SNAPSHOT: ShortcutsOverlayState = Object.freeze({ open: false });

export interface ShortcutsOverlayState {
  open: boolean;
}

let state: ShortcutsOverlayState = CLOSED_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: ShortcutsOverlayState): void {
  state = next;
  emit();
}

/** Open the shortcuts overlay. */
export function openShortcutsOverlay(): void {
  setState({ open: true });
}

/** Close the shortcuts overlay. */
export function closeShortcutsOverlay(): void {
  setState(CLOSED_SNAPSHOT);
}

/** Toggle the shortcuts overlay ("?" hotkey semantics). */
export function toggleShortcutsOverlay(): void {
  setState({ open: state.open ? false : true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side of the shortcuts-overlay store. */
export function useShortcutsOverlayState(): ShortcutsOverlayState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Server + hydration snapshot: closed (stable reference — see above).
    () => CLOSED_SNAPSHOT,
  );
}
