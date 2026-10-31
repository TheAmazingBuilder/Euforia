"use client";

import { TriangleAlert } from "lucide-react";

import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionWarnings - the review-recommended panel (PROMPT 3 §26).
 * Warnings arrive from the engine (strings over the wire) and are shown
 * verbatim in warning-ochre ink, below the recognition-level header.
 * Never a modal - inline, ruled, dismissible only by fixing the data.
 */
export function RecognitionWarnings({
  warnings,
  dict,
}: {
  warnings: readonly string[];
  dict: RecognitionDict;
}) {
  if (warnings.length === 0) return null;
  return (
    <section
      aria-label={dict.warnings.title}
      className="rounded-xl border border-warning/30 bg-warning/[0.05] px-4 py-3"
      data-testid="recognition-warnings"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-warning">
        <TriangleAlert className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {dict.warnings.title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning} className="text-sm text-warning/90">
            {warning}
          </li>
        ))}
      </ul>
    </section>
  );
}
