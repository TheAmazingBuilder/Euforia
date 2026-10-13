import {
  parseDrawingBook,
  serializeDrawingBook,
} from "@/components/oryon/drawings/schema";
import type { DrawingObject } from "@/components/oryon/drawings/types";

/**
 * Local drawing persistence adapter (Phase 2 scope decision — see the final
 * delivery report).
 *
 * The PRD's CANONICAL target is server persistence per user × instrument
 * (docs/specs/oryon-prd.md §8.6/§13.2, contract proposed in §15.2). That
 * backend module does not exist yet, and inventing an undocumented endpoint
 * is out of scope for this phase — so drawings persist through a narrowly
 * scoped localStorage adapter that follows the EXACT house pattern of
 * lib/oryon/workspace-store.ts (try/catch-guarded, validated on read).
 *
 * SCOPE & LIMITATIONS (also disclosed in the objects panel UI):
 *   - local to this browser profile — NOT synced across devices/users;
 *   - keyed per canonical instrument symbol (`Instrument.symbol`, the same
 *     identity the candles API and workspace store use) → drawings can
 *     never leak across instruments;
 *   - every read passes `parseDrawingBook` (Zod, version 1) — corrupt or
 *     outdated records degrade to an empty book, never a crash;
 *   - writes are debounced per instrument and size-guarded (PRD §15.2's
 *     512 KiB book budget, enforced in schema.ts);
 *   - the `DrawingPersistence` interface is the seam a server adapter
 *     will implement later (load/save/clear — no UI change required).
 */

export interface DrawingPersistence {
  load(instrumentId: string): DrawingObject[] | null;
  save(instrumentId: string, objects: readonly DrawingObject[], updatedAt: number): void;
  clear(instrumentId: string): void;
}

const KEY_PREFIX = "cosmoz.oryon.drawings.v1";

function localStorageAdapter(): DrawingPersistence {
  return {
    load(instrumentId) {
      try {
        const raw = window.localStorage.getItem(`${KEY_PREFIX}:${instrumentId}`);
        if (raw === null) return null;
        return parseDrawingBook(raw, instrumentId);
      } catch {
        return null; // storage unavailable or unusable — start clean
      }
    },
    save(instrumentId, objects, updatedAt) {
      try {
        const json = serializeDrawingBook(instrumentId, objects, updatedAt);
        window.localStorage.setItem(`${KEY_PREFIX}:${instrumentId}`, json);
      } catch {
        // Serialization guard trip or quota exceeded — keep the session
        // state intact, skip the disk write (never corrupt a saved book
        // with a partial write).
      }
    },
    clear(instrumentId) {
      try {
        window.localStorage.removeItem(`${KEY_PREFIX}:${instrumentId}`);
      } catch {
        // Storage unavailable — nothing to clean up.
      }
    },
  };
}

/** Minimal Storage double for tests (node has no localStorage). */
export class InMemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Build an adapter over an injected Storage (tests) — same validation. */
export function createTestPersistence(storage: InMemoryStorage): DrawingPersistence {
  return {
    load(instrumentId) {
      const raw = storage.getItem(`${KEY_PREFIX}:${instrumentId}`);
      if (raw === null) return null;
      return parseDrawingBook(raw, instrumentId);
    },
    save(instrumentId, objects, updatedAt) {
      storage.setItem(
        `${KEY_PREFIX}:${instrumentId}`,
        serializeDrawingBook(instrumentId, objects, updatedAt),
      );
    },
    clear(instrumentId) {
      storage.removeItem(`${KEY_PREFIX}:${instrumentId}`);
    },
  };
}

/**
 * Debounced writer per instrument — bursts of mutations (drag commit,
 * style change) coalesce into one disk write.
 */
export class DebouncedSaver {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    private readonly persistence: DrawingPersistence,
    private readonly delayMs = 250,
  ) {}

  schedule(instrumentId: string, getObjects: () => readonly DrawingObject[]): void {
    const existing = this.timers.get(instrumentId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      instrumentId,
      setTimeout(() => {
        this.timers.delete(instrumentId);
        this.persistence.save(instrumentId, getObjects(), Date.now());
      }, this.delayMs),
    );
  }

  /** Flush a pending write immediately (module teardown / tests). */
  flush(instrumentId: string, getObjects: () => readonly DrawingObject[]): void {
    const existing = this.timers.get(instrumentId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(instrumentId);
    }
    this.persistence.save(instrumentId, getObjects(), Date.now());
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}

/** The production adapter (browser localStorage). */
export const drawingPersistence: DrawingPersistence = localStorageAdapter();
