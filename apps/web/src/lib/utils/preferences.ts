"use client";

import { useSyncExternalStore } from "react";

/**
 * Local display preferences (spec trade-entry-ux.md §5: the reveal animation
 * is "disable-able in settings"). V1 keeps them in localStorage - a real
 * user-settings API will replace this later without changing the hook API.
 */

const STORAGE_KEY = "cosmoz:preferences:v1";

export interface Preferences {
  /** Reveal star animation - spec: ≤ 500 ms, skippable, disable-able. */
  revealAnimation: boolean;
}

const DEFAULTS: Preferences = { revealAnimation: true };

let cached: Preferences | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): Preferences {
  if (cached !== null) return cached;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    parsed = null;
  }
  cached =
    parsed !== null && typeof parsed === "object" && "revealAnimation" in (parsed as Record<string, unknown>)
      ? { ...DEFAULTS, ...(parsed as Partial<Preferences>) }
      : { ...DEFAULTS };
  return cached;
}

function writeToStorage(next: Preferences): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota - preferences stay in memory for this session.
  }
  for (const listener of listeners) listener();
}

/** Imperative setter (components call this on toggle). */
export function setRevealAnimation(enabled: boolean): void {
  writeToStorage({ ...readFromStorage(), revealAnimation: enabled });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read-side - defaults to true until the client hydrates. */
export function useRevealAnimation(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readFromStorage().revealAnimation,
    // Server + hydration snapshot: animation enabled (spec default).
    () => true,
  );
}
