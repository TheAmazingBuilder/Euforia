"use client";

import { cn } from "@/lib/utils";
import { confidenceStamp } from "@/components/recognition/recognition-model";
import type { OcrConfidenceBand } from "@cosmoz/shared";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * ConfidenceBadge — the recognition-confidence marker (PROMPT 3 §18).
 *
 * Terminology is load-bearing: this is "recognition confidence", a heuristic
 * signal — never a guarantee of correctness (§18). Numeric confidence is
 * mono/tabular; the band renders as a stamp (Le Registre #6).
 */
export function ConfidenceBadge({
  band,
  confidence,
  dict,
  compact = false,
  className,
}: {
  band: OcrConfidenceBand;
  /** 0..1 — displayed as an integer percentage. */
  confidence: number;
  dict: RecognitionDict;
  compact?: boolean;
  className?: string;
}) {
  const { tone, labelKey } = confidenceStamp(band);
  const percent = Math.round(confidence * 100);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="font-mono text-xs tabular-nums text-muted-foreground"
        title={dict.result.confidence}
        data-testid="recognition-confidence"
      >
        {percent}%
      </span>
      {!compact ? (
        <span className={cn("stamp px-1.5", `stamp-${tone}`, "text-[0.6875rem]")}>
          {dict.result.bands[labelKey]}
        </span>
      ) : null}
    </span>
  );
}
