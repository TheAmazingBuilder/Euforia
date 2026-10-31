"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Direction } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

export interface DirectionSegmentedProps {
  value: Direction;
  onChange: (direction: Direction) => void;
  /** id for the label[for] linkage. */
  id?: string;
}

const OPTIONS: readonly Direction[] = ["BUY", "SELL"];

/**
 * Direction segmented control (spec §4): BUY / SELL, pre-selected by the
 * caller from the last trade. ←/→ arrow-key support with roving focus.
 * Direction communicates trade intent: BUY uses the bullish ink and SELL the bearish ink.
 */
export function DirectionSegmented({ value, onChange, id }: DirectionSegmentedProps) {
  const { dict } = useI18n();
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const index = OPTIONS.indexOf(value);
      const next = OPTIONS[(index + (event.key === "ArrowRight" ? 1 : OPTIONS.length - 1)) % OPTIONS.length];
      onChange(next ?? "BUY");
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const nextIndex = OPTIONS.indexOf(next ?? "BUY");
      buttons[nextIndex]?.focus();
    }
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={dict.trades.form.direction}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1"
    >
      {OPTIONS.map((option) => {
        const selected = option === value;
        const Icon = option === "BUY" ? ArrowUpRight : ArrowDownRight;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-sm border text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? option === "BUY"
                  ? "border border-direction-buy/40 bg-direction-buy/10 text-direction-buy"
                  : "border border-direction-sell/40 bg-direction-sell/10 text-direction-sell"
                : "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {option}
          </button>
        );
      })}
    </div>
  );
}
