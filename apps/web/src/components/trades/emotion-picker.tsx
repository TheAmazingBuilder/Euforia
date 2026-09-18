"use client";

import type { Emotion } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Emotion-before chips (spec §4): optional, single tap — never a form.
 */

const EMOTION_LABELS: Record<Emotion, string> = {
  CALM: "Calm",
  CONFIDENT: "Confident",
  ANXIOUS: "Anxious",
  FOMO: "FOMO",
  TIRED: "Tired",
  FRUSTRATED: "Frustrated",
  REVENGE: "Revenge",
  EUPHORIC: "Euphoric",
  RELIEVED: "Relieved",
  BORED: "Bored",
};

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
  /** Accessible group label (context-dependent: entry vs in-trade). */
  ariaLabel?: string;
}

export function EmotionPicker({ value, onChange, ariaLabel = "Emotion before entry" }: EmotionPickerProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label={ariaLabel}
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
            {EMOTION_LABELS[emotion]}
          </button>
        );
      })}
    </div>
  );
}
