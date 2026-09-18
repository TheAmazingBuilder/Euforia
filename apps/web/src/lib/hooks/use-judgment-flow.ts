"use client";

import { useSyncExternalStore } from "react";
import type { Grade } from "@cosmoz/shared";

/**
 * Global judgment-flow state (Acts 2 & 3 — trade-entry-ux.md §5/§6): the
 * Gate → Reveal → Reflect sequence. A tiny external store, same pattern as
 * use-trade-modal, so the capture form, the to-grade queue and any future
 * caller can open the flow from anywhere without prop drilling.
 */

export type JudgmentStage = "gate" | "reveal" | "reflect";

/** The decision captured at the gate — the reveal badge reuses it. */
export interface GateDecision {
  grade: Grade;
  followedPlan: boolean;
}

export interface JudgmentFlowState {
  open: boolean;
  stage: JudgmentStage;
  /** The trade being judged / revealed / reflected on. */
  tradeId: string | null;
  /** Set once the gate is submitted (kept for the reveal header). */
  decision: GateDecision | null;
}

let state: JudgmentFlowState = {
  open: false,
  stage: "gate",
  tradeId: null,
  decision: null,
};
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: JudgmentFlowState): void {
  state = next;
  emit();
}

/** Act 2 entry — open the Gate for a saved closed trade. */
export function openGate(tradeId: string): void {
  setState({ open: true, stage: "gate", tradeId, decision: null });
}

/** Gate submitted — advance to the Reveal with the decision in hand. */
export function gateSubmitted(tradeId: string, decision: GateDecision): void {
  setState({ open: true, stage: "reveal", tradeId, decision });
}

/** Reveal finished (Finish ⏎) — advance to the optional Reflect screen. */
export function revealFinished(): void {
  setState({ ...state, stage: "reflect" });
}

/** Close the whole flow (Finish / Esc / skip-later). */
export function closeJudgmentFlow(): void {
  setState({ open: false, stage: "gate", tradeId: null, decision: null });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side of the judgment-flow store. */
export function useJudgmentFlow(): JudgmentFlowState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Server + hydration snapshot: closed.
    (): JudgmentFlowState => ({ open: false, stage: "gate", tradeId: null, decision: null }),
  );
}
