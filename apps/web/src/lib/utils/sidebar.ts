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

/**
 * Session-only marker: the current collapse was performed automatically FOR
 * the Oryon workspace (never persisted - a reload mid-Oryon keeps the stored
 * value, which is already "1"). Cleared by any manual toggle so the user's
 * explicit choice always wins.
 */
let autoCollapsedForRoute = false;

/**
 * Route-driven collapse: entering the Oryon workspace maximises chart real
 * estate by switching the desktop sidebar to icon mode. No-op when the user
 * already collapsed it themselves.
 */
export function collapseSidebarForRoute(): void {
  if (!isSidebarCollapsed()) {
    autoCollapsedForRoute = true;
    setSidebarCollapsed(true);
  }
}

/**
 * Leaving Oryon restores the pre-Oryon width, but only when the collapse was
 * the automatic one - a manual toggle during the session is respected.
 */
export function restoreSidebarAfterRoute(): void {
  if (autoCollapsedForRoute) {
    autoCollapsedForRoute = false;
    setSidebarCollapsed(false);
  }
}

export function toggleSidebarCollapsed(): void {
  autoCollapsedForRoute = false;
  setSidebarCollapsed(!isSidebarCollapsed());
}
