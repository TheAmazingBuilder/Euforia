"use client";

import * as React from "react";

import type { MarketInterval } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { ORYON_INTERVALS } from "@/lib/charting/oryon-intervals";

/**
 * Oryon timeframe selector - renders EXACTLY the shared MarketInterval enum
 * (the contract the market service validates). Every selectable timeframe is
 * therefore servable: nothing is displayed as operational if the service
 * could not return it.
 */
export function OryonTimeframeSelector({
  value,
  onChange,
  /** Optional testid namespace - panel headers use `oryon-panel-{index}`
   *  so their controls never collide with the toolbar's canonical ids. */
  idPrefix = "oryon",
}: {
  value: MarketInterval;
  onChange: (interval: MarketInterval) => void;
  idPrefix?: string;
}) {
  const dict = useDict();
  const label = dict.oryon.toolbar.timeframes;

  return (
    <div
      role="group"
      aria-label={label}
      data-testid={`${idPrefix}-timeframes`}
      className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
    >
      {ORYON_INTERVALS.map((interval) => {
        const active = interval === value;
        return (
          <button
            key={interval}
            type="button"
            aria-pressed={active}
            aria-label={`${label} ${interval}`}
            data-testid={`${idPrefix}-tf-${interval}`}
            onClick={() => onChange(interval)}
            className={cn(
              "min-w-8 rounded-sm px-1.5 py-1 font-mono text-[11px] font-semibold leading-none transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            {interval}
          </button>
        );
      })}
    </div>
  );
}
