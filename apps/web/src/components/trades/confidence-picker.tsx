"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Confidence picker (1–5) - the conviction self-rating that rides the
 * trade's psychology columns. Follows the EmotionPicker pattern: structural
 * iteration over raw values, labels/aria through the active dictionary,
 * tokens-only styling, tap-to-toggle (a second tap clears).
 */

const CONFIDENCE_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

export interface ConfidencePickerProps {
  value: number | null;
  onChange: (confidence: number | null) => void;
  /** Accessible group label override (context-dependent: pre/post trade). */
  ariaLabel?: string;
}

export function ConfidencePicker({ value, onChange, ariaLabel }: ConfidencePickerProps) {
  const { dict } = useI18n();
  const groupAria = ariaLabel ?? dict.trades.confidencePicker.aria;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label={groupAria}
      data-testid="confidence-picker"
    >
      {CONFIDENCE_LEVELS.map((level) => {
        const selected = level === value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${level}`}
            data-testid={`confidence-${level}`}
            onClick={() => onChange(selected ? null : level)}
            className={cn(
              "grid size-8 place-items-center rounded-full border font-mono text-xs font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
