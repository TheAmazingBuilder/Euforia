"use client";

import * as React from "react";

/**
 * Topbar clock — local date + live time (1s tick) in the register's mono
 * voice: date on lg+, time from sm up, phones stay clean (the topbar right
 * cluster is dense at 390 and the breadcrumb must keep its room). Renders
 * an empty reserve on the server pass and typeset itself only after mount —
 * a clock is inherently client-side, and the layout must not lie about it.
 * No icon, no border: pure type between the breadcrumb and the search
 * affordance, as quiet as a margin annotation in a ledger.
 */
/** Ticks once a second; the snapshot only changes when the second flips. */
function subscribe(onStoreChange: () => void): () => void {
  const timer = window.setInterval(onStoreChange, 1000);
  return () => window.clearInterval(timer);
}

function getSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot(): number | null {
  return null;
}

export function TopbarClock() {
  // An external system (the wall clock) read the idiomatic way:
  // useSyncExternalStore keeps the subscribe/snapshot contract explicit and
  // hydration honest — the server pass simply has no time to show.
  const seconds = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (seconds === null) {
    // Pre-hydration reserve keeps the right cluster from jumping.
    return <div className="hidden h-4 w-40 lg:block" aria-hidden="true" />;
  }

  const now = new Date(seconds * 1000);
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const tz =
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "";

  return (
    <time
      dateTime={now.toISOString()}
      data-testid="topbar-clock"
      title="Local time"
      className="hidden items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground sm:flex"
    >
      <span className="hidden lg:inline">{date}</span>
      <span
        className="hidden text-muted-foreground/50 lg:inline"
        aria-hidden="true"
      >
        ·
      </span>
      <span className="font-semibold text-foreground/80">{time}</span>
      <span className="hidden text-muted-foreground/60 xl:inline">{tz}</span>
    </time>
  );
}
