/**
 * Trade Review lifecycle (Phase 6 §10/§32).
 *
 * Only states the product actually exercises:
 *   COMPLETED — the review exists and is active (workspace row "REVIEWED").
 *   ARCHIVED  — the soft-undo behind DELETE /reviews/:tradeId; the row is
 *               preserved for audit/future Analytics but invisible to the
 *               workspace (the trade returns to PENDING).
 *
 * No DRAFT state: the product's upsert flow creates completed reviews
 * directly (§10 — "only implement states that are actually justified").
 * No arbitrary mutation: every change of status goes through the explicit
 * transition table below, enforced with conditional updates in the
 * repository (optimistic lifecycle guard, §44).
 *
 * Domain module: imports NO framework code (§75).
 */

export const REVIEW_STATUS = {
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

/**
 * Explicit transition table:
 *   COMPLETED → ARCHIVED  (archive / undo review)
 *   ARCHIVED  → COMPLETED (re-review after undo — a fresh PUT)
 * Everything else is invalid; same-status self-transitions are NOT lifecycle
 * moves (editing a COMPLETED review keeps it COMPLETED — an update, not a
 * transition).
 */
const TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: ["COMPLETED"],
};

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The upsert flow (PUT) is the ONLY path that may land on a review in any
 * state: missing → COMPLETED (create), COMPLETED → COMPLETED (edit),
 * ARCHIVED → COMPLETED (reactivate). This pure predicate decides whether an
 * observed state accepts the upsert; the service maps the false branch to a
 * 409 (a state it lost a race against, §44).
 */
export function upsertAcceptsState(state: ReviewStatus): boolean {
  return state === REVIEW_STATUS.COMPLETED || state === REVIEW_STATUS.ARCHIVED;
}

/**
 * Editing (PATCH) is allowed on COMPLETED reviews only (§32 — the product
 * edits completed reviews freely; archived rows are invisible, therefore a
 * PATCH against one is an honest 404 upstream, never a silent resurrection).
 */
export function patchAcceptsState(state: ReviewStatus): boolean {
  return state === REVIEW_STATUS.COMPLETED;
}

/**
 * Archiving (DELETE) is allowed on COMPLETED reviews only; archiving an
 * already-archived row is a 404 upstream (idempotent-honest semantics).
 */
export function archiveAcceptsState(state: ReviewStatus): boolean {
  return state === REVIEW_STATUS.COMPLETED;
}
