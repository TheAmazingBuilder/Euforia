"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCheck, List } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Trades module tabs — Ledger (/trades) and Trade Reviews (/trades/reviews).
 * Routing-based tabs (Links, not state) so each view keeps its own URL bag,
 * deep links work and the browser back button behaves. Shared by both pages
 * so the active tab always matches the pathname.
 */

export type TradesModuleTab = "ledger" | "reviews";

const TABS: ReadonlyArray<{ key: TradesModuleTab; href: string; label: string; icon: React.ElementType }> = [
  { key: "ledger", href: "/trades", label: "Ledger", icon: List },
  { key: "reviews", href: "/trades/reviews", label: "Reviews", icon: ClipboardCheck },
];

export function TradesModuleTabs({ active }: { active: TradesModuleTab }) {
  return (
    <div
      role="tablist"
      aria-label="Trades module sections"
      data-testid="trades-module-tabs"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            href={tab.href}
            data-testid={`trades-tab-${tab.key}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
