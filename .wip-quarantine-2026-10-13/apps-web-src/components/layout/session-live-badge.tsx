"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import * as React from "react";

import { useTrades } from "@/lib/api/queries";

/**
 * "Session live" badge — appears in the topbar only while positions are
 * open. The dot pulses (CSS animation) so the open risk reads at a glance;
 * the count links to the Session Live runner.
 */
export function SessionLiveBadge() {
  const { data } = useTrades({ status: "OPEN" });
  const queryClient = useQueryClient();
  const count = data?.total ?? 0;

  // Keep the badge honest: refetch open positions on focus and every 30s.
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["trades", { status: "OPEN" }] });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [queryClient]);

  if (count === 0) return null;

  return (
    <Link
      href="/session"
      data-testid="session-live-badge"
      aria-label={`${count} open position${count === 1 ? "" : "s"} — session live`}
      title={`${count} open position${count === 1 ? "" : "s"}`}
      className="mr-1 flex h-8 items-center gap-1.5 rounded-full border border-profit/40 bg-profit/10 px-2.5 text-xs font-medium text-profit transition-colors hover:bg-profit/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-profit opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-profit" />
      </span>
      <Radio className="size-3.5" aria-hidden="true" />
      <span className="font-mono font-semibold tabular-nums">{count}</span>
      <span className="hidden sm:inline">live</span>
    </Link>
  );
}
