"use client";

import { useSyncExternalStore } from "react";

/**
 * Global broker-CSV import dialog state — same external-store pattern as
 * use-trade-modal. The dialog is mounted ONCE (AppShell) so the palette,
 * the trades screen and any future entry point share one instance.
 */

export interface ImportDialogState {
  open: boolean;
}

let state: ImportDialogState = { open: false };
const listeners = new Set<() => void>();

/** Frozen hydration snapshot (stable reference — see use-trade-modal). */
const CLOSED_SNAPSHOT: ImportDialogState = Object.freeze({ open: false });

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: ImportDialogState): void {
  state = next;
  emit();
}

/** Open the import dialog (idempotent). */
export function openImportDialog(): void {
  setState({ open: true });
}

/** Close the import dialog. */
export function closeImportDialog(): void {
  setState({ open: false });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive read-side of the import-dialog store. */
export function useImportDialogState(): ImportDialogState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CLOSED_SNAPSHOT,
  );
}
