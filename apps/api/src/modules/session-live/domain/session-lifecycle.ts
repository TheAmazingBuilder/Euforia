/**
 * Trading Session lifecycle (Phase 10 §7/§41) - pure domain rules.
 *
 * Deliberately minimal (shared tradingSessionStatusSchema - no PAUSED/DRAFT):
 *   ACTIVE → COMPLETED  (end - records endedAt, returns a summary)
 *   ACTIVE → CANCELLED  (cancel - abandons without a summary)
 *
 * HARD BOUNDARY (Phase 10 §2/§41): ending/cancelling a Cosmoz session NEVER
 * implies close trade / disconnect broker / cancel order. This module holds
 * no reference to any provider operation - by construction, not by policy.
 *
 * Exactly ONE ACTIVE session per user is the product invariant (mock 409 +
 * partial unique index in the migration); the service surfaces it as 409.
 */
/** 409 - starting requires no ACTIVE session (product copy = mock copy). */
export class SessionAlreadyActiveError extends Error {
  constructor() {
    super("A session is already active. End it before starting a new one.");
    this.name = "SessionAlreadyActiveError";
  }
}

/** 409 - mutation restricted to the ACTIVE session (product copy = mock copy). */
export class SessionNotActiveError extends Error {
  constructor(message = "Only the active session can be updated") {
    super(message);
    this.name = "SessionNotActiveError";
  }
}

export function assertStartable(active: { status: string } | null): void {
  if (active && active.status === "ACTIVE") throw new SessionAlreadyActiveError();
}

export function assertActive(session: { status: string }, message?: string): void {
  if (session.status !== "ACTIVE") throw new SessionNotActiveError(message);
}

/** End the session - COMPLETED + endedAt now (+ optional closing notes). */
export function endSession(input: {
  endedAt: Date;
  /** End-notes are merged ONLY when a non-blank string is provided (mock). */
  notes?: string | null | undefined;
  currentNotes: string | null;
}): { status: "COMPLETED"; endedAt: Date; notes: string | null } {
  const nextNotes =
    input.notes !== undefined && input.notes !== null && input.notes.trim() !== ""
      ? input.notes
      : input.currentNotes;
  return { status: "COMPLETED", endedAt: input.endedAt, notes: nextNotes };
}

/** Cancel the session - CANCELLED + endedAt now, notes untouched. */
export function cancelSession(endedAt: Date): { status: "CANCELLED"; endedAt: Date } {
  return { status: "CANCELLED", endedAt };
}
