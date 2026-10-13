/**
 * Oryon command history — the shared undo/redo stack for the drawing
 * subsystem (lib/oryon/oryon-commands.ts, PRD §14: shared with indicators
 * in a later phase). 50-step cap per PRD §8.2.
 *
 * Design rules (cahier de charge Phase 2 §12):
 *   - commands are reversible closures; the drawing store snapshots by
 *     ARRAY REFERENCE (immutable books) — no deep clone per pointer move;
 *   - a drag is ONE history entry (the controller commits once, on release);
 *   - a new mutation after undo clears the obsolete redo branch;
 *   - history never touches unrelated Euforia state.
 */

export interface ReversibleCommand {
  /** Stable i18n key fragment for potential status display. */
  readonly label: string;
  undo(): void;
  redo(): void;
}

export const HISTORY_LIMIT = 50;

export class CommandHistory {
  private undoStack: ReversibleCommand[] = [];
  private redoStack: ReversibleCommand[] = [];

  /** Record a completed mutation. Clears the redo branch (fresh timeline). */
  push(command: ReversibleCommand): void {
    this.undoStack.push(command);
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift(); // drop the oldest — cap honored, order kept
    }
    this.redoStack = [];
  }

  /** Pop and apply the last undo. Returns the command, or null when empty. */
  undo(): ReversibleCommand | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.undo();
    this.redoStack.push(command);
    return command;
  }

  /** Pop and apply the last undone command. Null when nothing to redo. */
  redo(): ReversibleCommand | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.redo();
    this.undoStack.push(command);
    return command;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Drop everything (instrument switch, book replaced externally). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
