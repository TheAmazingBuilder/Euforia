"use client";

import type { Emotion } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Emotion-before chips (spec §4): optional, single tap - never a form.
 * Labels resolve through the active dictionary (dict.trades.emotions);
 * EMOTION_OPTIONS stays the structural iteration order (raw enum values).
 */

export const EMOTION_OPTIONS: readonly Emotion[] = [
  "CALM",
  "CONFIDENT",
  "ANXIOUS",
  "FOMO",
  "TIRED",
  "FRUSTRATED",
  "REVENGE",
  "EUPHORIC",
  "RELIEVED",
  "BORED",
];

export interface EmotionPickerProps {
  value: Emotion | null;
  onChange: (emotion: Emotion | null) => void;
  /** Accessible group label override (context-dependent: entry vs in-trade). */
  ariaLabel?: string;
}

export function EmotionPicker({ value, onChange, ariaLabel }: EmotionPickerProps) {
  const { dict } = useI18n();
  const groupAria = ariaLabel ?? dict.trades.emotionPicker.emotionBeforeAria;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label={groupAria}
    >
      {EMOTION_OPTIONS.map((emotion) => {
        const selected = emotion === value;
        return (
          <button
            key={emotion}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? null : emotion)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {dict.trades.emotions[emotion]}
          </button>
        );
      })}
    </div>
  );
}
