/**
 * TradePlan lifecycle state machine (Phase 5 §7/§38/§41).
 *
 * Explicit transition table — the lifecycle is NOT inferred from status
 * comparisons scattered across services. States reflect the product TODAY:
 *
 *   DRAFT ──→ PLANNED ──→ VALIDATED ──→ (EXECUTED, reserved — future link)
 *     │          │             │
 *     │          │             └──→ CANCELLED
 *     │          └──→ CANCELLED / ABANDONED
 *     └──→ ABANDONED
 *
 * Semantics:
 *   - commit   (DRAFT → PLANNED): the plan becomes a declared intention.
 *   - validate (PLANNED → VALIDATED): passed the pre-trade battery (§21).
 *   - cancel   (PLANNED/VALIDATED → CANCELLED): deliberately called off.
 *   - abandon  (DRAFT/PLANNED → ABANDONED): the setup never materialized.
 *   - EXECUTED is reserved vocabulary (mirrors TradeStatus.PLANNED precedent):
 *     no phase-5 path produces it — a future phase will link a canonical
 *     Trade to the plan (§62) and own that transition.
 *   - EXPIRED / PARTIALLY_EXECUTED are deferred (no scheduler / no execution
 *     linkage in the product yet, §63).
 *
 * Mutation policy (§38): only DRAFT and PLANNED are editable — VALIDATED
 * (and beyond) preserves the original planning snapshot.
 *
 * This file is DOMAIN: pure functions, no framework imports.
 */
import type { TradePlanStatus } from "../../../shared/contracts";

const TRANSITIONS: Readonly<Record<TradePlanStatus, readonly TradePlanStatus[]>> = {
  DRAFT: ["PLANNED", "ABANDONED"],
  PLANNED: ["VALIDATED", "CANCELLED", "ABANDONED"],
  VALIDATED: ["CANCELLED"],
  CANCELLED: [],
  ABANDONED: [],
  EXECUTED: [],
};

/** Whether `from → to` is a legal transition. */
export function canTransition(from: TradePlanStatus, to: TradePlanStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** States the plan may still leave. */
export function isTerminal(status: TradePlanStatus): boolean {
  return (TRANSITIONS[status]?.length ?? 0) === 0;
}

/** §38 — mutation policy: only these statuses accept configuration edits. */
export function isEditable(status: TradePlanStatus): boolean {
  return status === "DRAFT" || status === "PLANNED";
}

/** §39 — recalculation policy: same mutability window as edits. */
export function isRecalculable(status: TradePlanStatus): boolean {
  return status === "DRAFT" || status === "PLANNED";
}

/** Statuses the validate operation may run on (idempotency handled upstream). */
export function isValidatable(status: TradePlanStatus): boolean {
  return status === "PLANNED";
}

/** Statuses the cancel operation may run on. */
export function isCancellable(status: TradePlanStatus): boolean {
  return status === "PLANNED" || status === "VALIDATED";
}

/** Statuses the abandon operation may run on. */
export function isAbandonable(status: TradePlanStatus): boolean {
  return status === "DRAFT" || status === "PLANNED";
}
