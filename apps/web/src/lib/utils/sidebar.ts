/**
 * External store for the desktop sidebar collapse state.
 * Persisted in localStorage ("1" = collapsed, "0" or absent = expanded).
 * Consumed with React.useSyncExternalStore so SSR + hydration stay consistent
 * without the (lint-forbidden) setState-in-effect pattern.
 */
const STORAGE_KEY = "cosmoz:sidebar-collapsed";

type Listener = () => void;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSidebar(listener: Listener): () => void {
  listeners.add(listener);
  // Keep multiple tabs in sync, same as the theme system.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Client snapshot. MUST only be called in the browser. */
export function isSidebarCollapsed(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setSidebarCollapsed(collapsed: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  emit();
}

export function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!isSidebarCollapsed());
}
