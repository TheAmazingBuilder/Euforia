/**
 * Oryon drawing history — multi-level undo/redo (RF-04: ≥ 50 levels).
 *
 * Snapshot-based: a drawing collection is tiny (≤ 500 objects of a few
 * dozen bytes), so immutable full snapshots are simpler and safer than
 * inverse patches — undo/redo can never drift into an invalid state.
 *
 * Batch discipline (spec §12): a pointer drag records ONE entry. The
 * interaction controller opens a batch before the first mutation and
 * commits it on pointer-up; intermediate states never touch the stack.
 */

const HISTORY_LIMIT = 50;

export class DrawingHistory<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  /** Called when a mutation happens OUTSIDE a batch (single-step op). */
  push(snapshot: T): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = []; // New mutations clear the obsolete redo branch.
  }

  /** Opens a batch — capture the pre-mutation snapshot. */
  beginBatch(preState: T): void {
    this.batchPreState = preState;
    this.batchDepth += 1;
  }

  /**
   * Closes a batch — records the pre-state as one undo entry only when the
   * state actually changed (reference compare by the caller's own means:
   * the store passes its immutable array reference, so changed content
   * always means a different reference).
   */
  endBatch(postState: T): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth > 0) return; // Nested batch — outermost one commits.
    if (this.batchPreState === null) return;
    if (this.batchPreState !== postState) this.push(this.batchPreState);
    this.batchPreState = null;
  }

  /** Aborts a batch (pointer cancel) — drops the pre-state, no history. */
  abortBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    this.batchPreState = null;
  }

  undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(current);
    return previous;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batchPreState = null;
    this.batchDepth = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get depth(): number {
    return this.undoStack.length;
  }

  private batchPreState: T | null = null;
  private batchDepth = 0;
}
