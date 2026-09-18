"use client";

import { useSyncExternalStore } from "react";
import type { Direction, Emotion } from "@cosmoz/shared";

/**
 * Global trade-capture modal state — a tiny external store so the sidebar
 * button, the mobile FAB and the N hotkey can all open the same modal
 * from anywhere without prop drilling (spec trade-entry-ux.md §3).
 */

/** Fast-loop prefill captured at submit time (spec §7). */
export interface TradeContextSeed {
  /** null when the entry point doesn't know the instrument yet — the
   * playbook's "Trade this setup" leaves the choice to the user. */
  instrumentId: string | null;
  direction: Direction;
  /** null = out of playbook. */
  strategyId: string | null;
  outOfPlaybook: boolean;
  /** Default emotion for the next capture. */
  emotionBefore: Emotion | null;
  /** Next entry time defaults to the previous trade's exit time (ISO). */
  entryAtISO: string;
}

export interface TradeModalState {
  open: boolean;
  /** Fast-loop context, consumed by the form on mount. null = fresh form. */
  seed: TradeContextSeed | null;
}

let state: TradeModalState = { open: false, seed: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: TradeModalState): void {
  state = next;
  emit();
}

/** Open the capture modal; optionally seed it with fast-loop context. */
export function openTradeModal(seed: TradeContextSeed | null = null): void {
  setState({ open: true, seed });
}

/** Close the capture modal and drop any unconsumed seed. */
export function closeTradeModal(): void {
  setState({ open: false, seed: null });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side of the modal store. */
export function useTradeModalState(): TradeModalState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Server + hydration snapshot: closed.
    (): TradeModalState => ({ open: false, seed: null }),
  );
}
