/**
 * External store for Academy lesson completion.
 * Persisted in localStorage as a JSON array of lesson ids
 * ("cosmoz:academy-progress"). Consumed with React.useSyncExternalStore so
 * SSR + hydration stay consistent: the server snapshot is a frozen empty
 * set, and the client snapshot is a cached Set that only changes identity
 * when the store actually updates (no setState-in-effect).
 */
import * as React from "react";

const STORAGE_KEY = "cosmoz:academy-progress";

type Listener = () => void;

const listeners = new Set<Listener>();

/** Stable server/hydration snapshot: nothing completed yet. */
const EMPTY_SNAPSHOT: ReadonlySet<string> = Object.freeze(new Set<string>());

let cache: ReadonlySet<string> | null = null;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Keep multiple tabs in sync, same as the theme system.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Client snapshot. MUST only be called in the browser. Returns a cached Set. */
function getSnapshot(): ReadonlySet<string> {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    cache = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY_SNAPSHOT;
}

function write(next: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Storage unavailable (private mode) — progress stays in-memory.
  }
  cache = new Set(next);
  emit();
}

export function markLessonComplete(lessonId: string, complete: boolean): void {
  const current = getSnapshot();
  const next = new Set(current);
  if (complete) {
    next.add(lessonId);
  } else {
    next.delete(lessonId);
  }
  // Only write when something actually changed (avoids re-render loops).
  if (next.size === current.size && [...next].every((id) => current.has(id))) return;
  write(next);
}

export function resetAcademyProgress(): void {
  write(new Set());
}

/**
 * Returns the set of completed lesson ids. The reference is stable between
 * store updates, so components can derive counts with useMemo safely.
 */
export function useAcademyProgress(): ReadonlySet<string> {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
