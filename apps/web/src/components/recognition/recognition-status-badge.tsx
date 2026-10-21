"use client";

import { cn } from "@/lib/utils";
import { statusStamp } from "@/components/recognition/recognition-model";
import type { OcrRecognitionStatus } from "@cosmoz/shared";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionStatusBadge — the rubber-stamp of a recognition lifecycle
 * (Le Registre #6: outcomes get stamped — bordered uppercase mono, ±2°
 * rotation for the struck-by-hand feel).
 */
export function RecognitionStatusBadge({
  status,
  dict,
  className,
}: {
  status: OcrRecognitionStatus;
  dict: RecognitionDict;
  className?: string;
}) {
  const { tone, labelKey } = statusStamp(status);
  return (
    <span className={cn("stamp", `stamp-${tone}`, "-rotate-1", className)} data-testid="recognition-status" data-status={status}>
      {dict.statuses[labelKey]}
    </span>
  );
}
