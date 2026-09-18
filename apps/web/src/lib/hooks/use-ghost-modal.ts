"use client";

import { useSyncExternalStore } from "react";

/**
 * Global ghost-capture modal state ("Setup seen, not taken", spec §3/§8) —
 * same tiny external-store pattern as use-trade-modal so the sidebar button,
 * the mobile ghost button and the G hotkey all open the same modal from
 * anywhere without prop drilling.
 */

interface GhostModalState {
  open: boolean;
}

let state: GhostModalState = { open: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: GhostModalState): void {
  state = next;
  emit();
}

/** Open the ghost-capture modal (G hotkey / discreet button). */
export function openGhostModal(): void {
  setState({ open: true });
}

/** Close the ghost-capture modal. */
export function closeGhostModal(): void {
  setState({ open: false });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side of the ghost-modal store. */
export function useGhostModalState(): GhostModalState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Server + hydration snapshot: closed.
    (): GhostModalState => ({ open: false }),
  );
}
