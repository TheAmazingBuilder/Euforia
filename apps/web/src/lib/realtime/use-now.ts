"use client";

import * as React from "react";

/**
 * 1 Hz "now" ticker for freshness copy and stale-data gating (mission §17).
 *
 * Time reads (Date.now) are impure - the react-hooks purity rule forbids
 * them during render, so this hook moves them into an interval effect,
 * exactly like the existing LiveDuration ticker. Returns null until the
 * first tick (SSR/hydration-safe); consumers render a neutral placeholder
 * for that first second.
 */
export function useNowMs(intervalMs = 1000): number | null {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    // setState inside the interval callback (external system ticking) -
    // never synchronously in the effect body.
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowMs;
}
