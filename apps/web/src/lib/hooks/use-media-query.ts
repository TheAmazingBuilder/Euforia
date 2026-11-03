"use client";

import * as React from "react";

/**
 * SSR-safe media query hook via useSyncExternalStore: the server snapshot is
 * null (unknown), the client snapshot live-updates on viewport changes.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => mediaQueryList.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/** Tailwind `lg` breakpoint - desktop modal vs mobile sheet switch. */
export function useIsDesktop(): boolean | null {
  return useMediaQuery("(min-width: 1024px)");
}
