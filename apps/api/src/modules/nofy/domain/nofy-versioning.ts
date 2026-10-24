/**
 * Nofy versioning policy (Phase 12 §20/§21) - PURE decision logic.
 *
 * Versions are IMMUTABLE historical snapshots created by the service right
 * before a content-bearing update mutates a note (never written again).
 * The retention policy mirrors the mock engine (the parity reference):
 *   - at most one snapshot per note per VERSION_MIN_INTERVAL_MS (autosave
 *     generates frequent saves - snapshots are throttled, not 1:1);
 *   - newest-first list capped at VERSION_CAP entries (bounded storage).
 *
 * Deliberate scope: this is the ONLY history mechanism Nofy ships. No
 * collaborative editing, no CRDT, no revision graph - the frontend's
 * Version history dialog consumes exactly this list/restore surface.
 */
export const VERSION_MIN_INTERVAL_MS = 3 * 60_000;
export const VERSION_CAP = 12;

/** Milliseconds elapsed between two Date objects. */
function elapsedMs(from: Date, to: Date): number {
  return to.getTime() - from.getTime();
}

/**
 * Decide whether a snapshot must be taken before a mutation. `newestSavedAt`
 * is the savedAt of the most recent snapshot (null when the note has none).
 */
export function shouldSnapshot(newestSavedAt: Date | null, now: Date): boolean {
  if (newestSavedAt === null) return true;
  return elapsedMs(newestSavedAt, now) >= VERSION_MIN_INTERVAL_MS;
}

/**
 * Truncate a snapshot list to the retention cap. Input is newest-first
 * (the repository's ordering) - the returned slice drops the OLDEST tail.
 */
export function applyRetention(newestFirstCount: number): number {
  return Math.min(newestFirstCount, VERSION_CAP);
}
