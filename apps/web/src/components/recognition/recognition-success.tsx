"use client";

import Link from "next/link";
import { BadgeCheck, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionSuccess — post-confirmation state (PROMPT 3 §29 + engine
 * quality §2.2/§3.3). The toast carries the immediate feedback; this panel
 * offers the next actions: open the journal (the canonical trade list) or
 * import another screenshot. For grouped confirmations it reports how many
 * trades landed, and the deterministic playbook tag suggestions surface as
 * informational chips (they are hints — applying them happens in the
 * journal, §21: nothing automated touches the journal).
 */
export function RecognitionSuccess({
  dict,
  onImportAnother,
  importedCount = 1,
  suggestedTags = [],
}: {
  dict: RecognitionDict;
  onImportAnother: () => void;
  /** Trades created by the confirmation (grouped confirmation N>1). */
  importedCount?: number;
  /** Deterministic playbook tag hints (engine quality §3.3). */
  suggestedTags?: string[];
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
        {importedCount > 1 ? (
          <p className="font-mono text-sm tabular-nums text-foreground" data-testid="recognition-imported-count">
            {importedCount} {dict.success.importedCount}
          </p>
        ) : null}
      </div>

      {suggestedTags.length > 0 ? (
        <div className="flex max-w-md flex-col items-center gap-2" data-testid="recognition-suggested-tags">
          <p className="ledger-label flex items-center gap-1.5">
            <Tag className="size-3.5" aria-hidden="true" />
            {dict.tags.title}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {suggestedTags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/80">{dict.tags.hint}</p>
        </div>
      ) : null}

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
