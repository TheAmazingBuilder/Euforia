"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionSuccess — post-confirmation state (PROMPT 3 §29). The toast
 * carries the immediate feedback; this panel offers the next actions:
 * open the journal (the canonical trade list) or import another screenshot.
 */
export function RecognitionSuccess({
  dict,
  onImportAnother,
}: {
  dict: RecognitionDict;
  onImportAnother: () => void;
}) {
  return (
    <div
      className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center"
      data-testid="recognition-success"
    >
      <BadgeCheck className="size-8 text-profit" strokeWidth={1.5} aria-hidden="true" />
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-heading text-xl font-semibold">{dict.success.title}</h2>
        <p className="text-sm text-muted-foreground">{dict.success.body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button type="button" variant="outline" asChild data-testid="recognition-view-journal">
          <Link href="/trades">{dict.success.viewTrades}</Link>
        </Button>
        <Button type="button" onClick={onImportAnother} data-testid="recognition-import-another">
          {dict.success.importAnother}
        </Button>
      </div>
    </div>
  );
}
