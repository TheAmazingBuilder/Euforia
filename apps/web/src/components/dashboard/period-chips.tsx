"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/** Canonical period filter values - persisted in the URL (?range=7|30|90). */
export type RangeDays = 7 | 30 | 90;

const RANGE_VALUES: RangeDays[] = [7, 30, 90];

const RANGE_LABELS: Record<RangeDays, string> = {
  7: "7d",
  30: "30d",
  90: "90d",
};

function parseRange(raw: string | null): RangeDays {
  const parsed = Number(raw);
  return (RANGE_VALUES as number[]).includes(parsed) ? (parsed as RangeDays) : 30;
}

/**
 * Shared period filter state via the URL. Both P&L cards mount their own
 * chip group; they stay in sync because the single source of truth is the
 * `range` query param (router.replace - no history spam).
 */
export function useRangeParam(): [RangeDays, (range: RangeDays) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();

  const range = parseRange(searchParams.get("range"));
  const setRange = React.useCallback(
    (next: RangeDays) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 30) params.delete("range");
      else params.set("range", String(next));
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  return [range, setRange];
}

export function PeriodChips({
  range,
  onRangeChange,
  className,
}: {
  range: RangeDays;
  onRangeChange: (range: RangeDays) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Period filter"
      data-testid="period-chips"
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5", className)}
    >
      {RANGE_VALUES.map((value) => {
        const active = value === range;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`period-chip-${value}`}
            onClick={() => onRangeChange(value)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[value]}
          </button>
        );
      })}
    </div>
  );
}
