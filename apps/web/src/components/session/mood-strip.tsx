"use client";

import type { SessionMood } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Compact mood strip — today's logged emotions (entry + in-trade quick-logs)
 * in chronological order: the live tilt biomarker at a glance (spec §9).
 */

const MOOD_LABELS: Record<SessionMood["emotion"], string> = {
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

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function MoodStrip({ moods }: { moods: SessionMood[] }) {
  if (moods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No feelings logged today — tap the Feeling button on an open trade to log one.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Today's logged emotions">
      {moods.map((mood, index) => (
        <li
          key={`${mood.tradeId ?? "ghost"}-${mood.phase}-${mood.at}-${index}`}
          title={`${MOOD_LABELS[mood.emotion]} · ${mood.phase === "BEFORE" ? "at entry" : "in trade"} · ${timeOf(mood.at)}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            mood.phase === "BEFORE"
              ? "border-border bg-surface text-muted-foreground"
              : "border-accent/40 bg-accent/10 text-accent",
          )}
        >
          {MOOD_LABELS[mood.emotion]}
          <time className="font-mono text-[10px] tabular-nums opacity-75">{timeOf(mood.at)}</time>
        </li>
      ))}
    </ul>
  );
}
