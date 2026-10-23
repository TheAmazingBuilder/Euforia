"use client";

import { formatNumber, formatR, type MistakeLedgerResponse } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Mistake Ledger panel (Phase 8): each mistake with its frequency bar and
 * R cost, computed server-side from trade_mistakes over the rolling
 * window — e.g. "Stop moved against you: 3 times, −4.1R".
 */

const CATEGORY_LABELS: Record<string, string> = {
  ENTRY: "Entry",
  EXIT: "Exit",
  MANAGEMENT: "Management",
  BEHAVIOR: "Behavior",
};

export function MistakeLedger({ entries }: { entries: MistakeLedgerResponse["entries"] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No mistakes tagged in this window - either a clean month or an unlabeled one.
      </p>
    );
  }

  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const cost = Number(entry.rCost);
        return (
          <li key={entry.mistakeId} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-foreground">{entry.label}</span>
                <span className="rounded border border-border bg-surface-raised px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
              </div>
              <span className="font-mono text-xs tabular-nums">
                <span className="text-foreground">
                  {formatNumber(String(entry.count), 0)}×
                </span>{" "}
                <span className="text-muted-foreground">·</span>{" "}
                <span className={cn(cost < 0 ? "text-loss" : "text-profit")}>
                  {formatR(entry.rCost)}
                </span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-surface-raised"
              role="img"
              aria-label={`${entry.label}: ${entry.count} occurrences, cost ${formatR(entry.rCost)}`}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  cost < 0 ? "bg-loss/70" : "bg-warning/70",
                )}
                style={{ width: `${Math.max(6, (entry.count / maxCount) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
