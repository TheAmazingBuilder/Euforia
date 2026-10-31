"use client";

import * as React from "react";
import { Globe2, TrendingUp } from "lucide-react";

import { EcoCalendarView } from "@/components/calendar/eco-calendar";
import { TradingCalendarView } from "@/components/calendar/trading-calendar";
import { cn } from "@/lib/utils";

/**
 * Calendar module shell - two tabs fed by the same top-level design: the
 * TRADING calendar (P&L + discipline overlay, days off, semester targets)
 * and the ECONOMIC calendar (macro releases with impact tiers).
 */
export function CalendarModuleView() {
  const [tab, setTab] = React.useState<"trading" | "eco">("trading");

  return (
    <div className="space-y-5">
      <div className="flex rounded-lg border border-border bg-surface p-1" role="tablist" aria-label="Calendar module" data-testid="calendar-tabs">
        {(
          [
            { id: "trading", label: "Trading", icon: TrendingUp },
            { id: "eco", label: "Economic", icon: Globe2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`calendar-tab-${id}`}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              tab === id ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "trading" ? <TradingCalendarView /> : <EcoCalendarView />}
    </div>
  );
}
