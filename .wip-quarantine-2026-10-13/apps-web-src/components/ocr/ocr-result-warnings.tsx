"use client";

import * as React from "react";

import { TriangleAlert } from "lucide-react";

import type { RecognitionWarning } from "@/lib/recognition/contract";

/**
 * Review warnings (Prompt 3 §26) — job- and field-level caution notes,
 * shared by the recognition result and the trade draft review. Warnings are
 * advisory: they never block the flow and never read as guaranteed errors.
 */
export function WarningsPanel({ warnings }: { warnings: RecognitionWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5"
      role="note"
      aria-label="Recognition warnings"
      data-testid="ocr-warnings"
    >
      <p className="ledger-label flex items-center gap-1.5 text-warning">
        <TriangleAlert className="size-3" aria-hidden />
        Review recommended
      </p>
      <ul className="space-y-1">
        {warnings.map((warning, index) => (
          <li
            key={`${warning.code}-${index}`}
            className="text-xs leading-relaxed text-warning"
          >
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
