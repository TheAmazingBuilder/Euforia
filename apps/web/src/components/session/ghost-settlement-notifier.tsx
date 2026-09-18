"use client";

import * as React from "react";
import { toast } from "sonner";
import type { SkippedTrade } from "@cosmoz/shared";

import { useInstruments } from "@/lib/api/queries";

/**
 * Soft settlement reminders (spec §8): when the session view mounts with
 * due-for-settlement ghost trades (already resolved server-side — the alerts
 * feed carries the same SYSTEM reminders), fire one sonner toast per ghost
 * (capped at 2 per page load) pointing to the settlement card.
 */

const MAX_TOASTS = 2;

export function GhostSettlementNotifier({ ghosts }: { ghosts: SkippedTrade[] }) {
  const { data: instrumentsData } = useInstruments();
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current || ghosts.length === 0) return;
    firedRef.current = true;

    for (const ghost of ghosts.slice(0, MAX_TOASTS)) {
      const symbol =
        instrumentsData?.instruments.find((instrument) => instrument.id === ghost.instrumentId)?.symbol ??
        "your setup";
      const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(ghost.seenAt));
      toast.info("Ghost check-in", {
        description: `Your ${weekday} ${symbol} — how did it play out?`,
        action: {
          label: "Settle",
          onClick: () =>
            document.getElementById("ghost-settlements")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        },
        duration: 12_000,
      });
    }
  }, [ghosts, instrumentsData]);

  return null;
}
