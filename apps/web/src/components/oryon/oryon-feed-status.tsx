"use client";

import * as React from "react";

import { useFeedStatus, STALE_MS } from "@/lib/realtime/market";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Oryon feed status — a LEAF component on purpose: it subscribes to the
 * quote store and runs the 1-second staleness ticker, so the workspace never
 * re-renders for feed state. The phase machine is the market layer's own
 * (connecting / live / reconnecting / offline); a live feed older than
 * STALE_MS renders STALE honestly — a frozen feed must never read "live".
 */
export function OryonFeedStatus() {
  const dict = useDict();
  const S = dict.oryon.feed;
  const { phase, lastTickAt } = useFeedStatus();

  // 1 Hz local ticker — recomputes the staleness verdict without touching
  // the quote store (which would multiply emissions across consumers).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const stale = phase === "live" && lastTickAt > 0 && now - lastTickAt > STALE_MS;
  const ageSeconds = lastTickAt > 0 ? Math.max(0, Math.floor((now - lastTickAt) / 1000)) : null;

  const view = stale
    ? { label: S.stale, tone: "warning" as const, testid: "oryon-feed-stale" }
    : phase === "live"
      ? { label: S.live, tone: "accent" as const, testid: "oryon-feed-live" }
      : phase === "reconnecting"
        ? { label: S.reconnecting, tone: "warning" as const, testid: "oryon-feed-reconnecting" }
        : phase === "connecting"
          ? { label: S.connecting, tone: "muted" as const, testid: "oryon-feed-connecting" }
          : { label: S.offline, tone: "muted" as const, testid: "oryon-feed-offline" };

  return (
    <span
      data-testid="oryon-feed-status"
      data-phase={stale ? "stale" : phase}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
        view.tone === "accent" && "border-border bg-surface-raised text-foreground",
        view.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        view.tone === "muted" && "border-border bg-surface text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          view.tone === "accent" && "bg-primary",
          view.tone === "warning" && "bg-warning",
          view.tone === "muted" && "bg-muted-foreground/60",
        )}
      />
      {view.label}
      {ageSeconds !== null && stale ? (
        <span className="font-mono text-muted-foreground">
          {S.staleAgo.replace("{s}", String(ageSeconds))}
        </span>
      ) : null}
    </span>
  );
}
