"use client";

import { Ban } from "lucide-react";
import type { Strategy } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Playbook strategy chips (spec §4): colored chips with grade badges;
 * "Out of playbook" is a first-class 1-tap choice — never an ambiguous
 * empty field. Exactly one of: a strategy OR the off-playbook chip.
 */

const GRADE_BADGES: Record<NonNullable<Strategy["grade"]>, string> = {
  A_PLUS: "A+",
  A: "A",
  B: "B",
  C: "C",
};

export interface StrategyPickerProps {
  strategies: Strategy[];
  value: string | null;
  outOfPlaybook: boolean;
  onStrategyChange: (strategyId: string | null) => void;
  onOutOfPlaybookChange: (outOfPlaybook: boolean) => void;
}

export function StrategyPicker({
  strategies,
  value,
  outOfPlaybook,
  onStrategyChange,
  onOutOfPlaybookChange,
}: StrategyPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Strategy">
      {strategies.map((strategy) => {
        const selected = !outOfPlaybook && strategy.id === value;
        return (
          <button
            key={strategy.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onStrategyChange(strategy.id);
              onOutOfPlaybookChange(false);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {strategy.color !== null ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: strategy.color }}
              />
            ) : null}
            <span className="max-w-40 truncate">{strategy.name}</span>
            {strategy.grade !== null ? (
              <span
                className={cn(
                  "rounded-sm px-1 py-px font-mono text-[10px] font-bold leading-none",
                  selected ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {GRADE_BADGES[strategy.grade]}
              </span>
            ) : null}
          </button>
        );
      })}

      <button
        type="button"
        role="radio"
        aria-checked={outOfPlaybook}
        onClick={() => {
          onOutOfPlaybookChange(true);
          onStrategyChange(null);
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          outOfPlaybook
            ? "border-warning bg-warning/10 text-warning"
            : "border-border bg-surface text-muted-foreground hover:border-warning/50 hover:text-foreground",
        )}
      >
        <Ban className="size-3" aria-hidden="true" />
        Out of playbook
        <span
          className={cn(
            "rounded-sm px-1 py-px font-mono text-[10px] font-bold leading-none",
            outOfPlaybook ? "bg-warning text-background" : "bg-muted text-muted-foreground",
          )}
        >
          RISK
        </span>
      </button>
    </div>
  );
}
