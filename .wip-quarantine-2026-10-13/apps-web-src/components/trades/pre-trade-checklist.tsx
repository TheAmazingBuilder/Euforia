"use client";

import { Check, TriangleAlert } from "lucide-react";
import type { StrategyChecklistItem } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Pre-trade checklist panel (Priority 2 #5) — the capture-form end of the
 * Playbook ⇄ Session bridge. Extracted as its own component so the state
 * mutation stays out of TradeForm's compiler graph (react-hooks
 * preserve-manual-memoization). Required items are the guard-rail: the
 * caller blocks submission while any is unchecked.
 */

export interface PreTradeChecklistProps {
  /** Strategy the checklist belongs to (displayed for context). */
  strategyName: string;
  items: StrategyChecklistItem[];
  /** Checked state keyed by item id (missing key = unchecked). */
  checkedIds: Record<string, boolean>;
  onToggle: (itemId: string) => void;
}

export function PreTradeChecklist({ strategyName, items, checkedIds, onToggle }: PreTradeChecklistProps) {
  const done = items.filter((item) => checkedIds[item.id]).length;
  const unmetRequired = items.filter((item) => item.required && !checkedIds[item.id]);

  return (
    <section className="rounded-lg border border-border bg-surface" data-testid="pre-trade-checklist">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">Pre-trade checklist</span>
        <span className="text-[11px] text-muted-foreground">{strategyName}</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {done}/{items.length}
        </span>
      </header>
      <ul className="space-y-1 border-t border-border p-3" aria-label="Pre-trade checklist items">
        {items.map((item) => {
          const checked = checkedIds[item.id] ?? false;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={checked}
                data-testid={`checklist-item-${item.id}`}
                onClick={() => onToggle(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
                  checked
                    ? "border-accent/40 bg-accent/10 text-foreground"
                    : "border-border bg-background text-foreground/85 hover:border-accent/30"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked ? "border-accent bg-accent text-accent-foreground" : "border-border bg-transparent",
                  )}
                >
                  {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] uppercase tracking-wide",
                    item.required ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {item.required ? "required" : "optional"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {unmetRequired.length > 0 ? (
        <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {unmetRequired.length} required item{unmetRequired.length === 1 ? "" : "s"} left before the entry.
        </p>
      ) : null}
    </section>
  );
}
