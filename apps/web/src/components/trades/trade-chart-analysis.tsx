"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Link2Off, Trash2 } from "lucide-react";

import type { Trade } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { oryonAnalyses } from "@/lib/oryon/journal/analyses";
import { cn } from "@/lib/utils";

/**
 * Trade-detail "Chart analyses" section (Phase 10 — Trade Journal bridge).
 *
 * Lists the Oryon chart analyses LINKED to this trade (the analysis record
 * carries the trade's canonical id — the journal trade itself is never
 * copied or mutated). Per record: open the reconstructed view in Oryon
 * (deep link `/oryon?analysis=<id>`), unlink the association, or delete
 * the analysis (journal screenshot attachments are NOT touched — they are
 * the journal's own records).
 *
 * Honesty: analyses live in the browser that created them (the documented
 * Oryon persistence scope); the note says so in plain copy. Snapshot
 * images attached to the trade appear in the journal's OWN screenshots
 * gallery — this section never duplicates that storage.
 */
export function TradeChartAnalysisSection({ trade, open }: { trade: Trade; open: boolean }) {
  const { dict } = useI18n();
  const T = dict.trades.detail.chartAnalysis;
  const router = useRouter();
  const snapshot = React.useSyncExternalStore(oryonAnalyses.subscribe, oryonAnalyses.getSnapshot);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // The store lazily loads from localStorage on first read — only read it
  // while the drawer is actually open (no boot cost for every page).
  const analyses = open ? snapshot.analyses.filter((a) => a.tradeId === trade.id) : [];

  return (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {T.heading} ({analyses.length})
      </p>
      {analyses.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid="trade-chart-analysis-empty"
        >
          {T.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="trade-chart-analyses">
          {analyses.map((analysis) => (
            <li
              key={analysis.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-raised/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{analysis.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-mono">
                    {analysis.symbol} · {analysis.interval}
                  </span>
                  <span>·</span>
                  <span>{new Date(analysis.createdAt).toISOString().slice(0, 10)}</span>
                  {analysis.snapshot !== null ? (
                    <span className="rounded-sm bg-surface-raised px-1 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
                      {T.snapshotBadge}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {confirmDeleteId === analysis.id ? (
                  <>
                    <span className="text-[10px] text-warning">{T.deleteConfirm}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-loss hover:text-loss"
                      data-testid={`trade-chart-analysis-delete-confirm-${analysis.id}`}
                      onClick={() => {
                        oryonAnalyses.remove(analysis.id);
                        oryonAnalyses.saveNow();
                        setConfirmDeleteId(null);
                        toast.success(T.deletedToast);
                      }}
                    >
                      {T.delete}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      {dict.common.cancel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-accent"
                      data-testid={`trade-chart-analysis-open-${analysis.id}`}
                      onClick={() => router.push(`/oryon?analysis=${analysis.id}`)}
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                      {T.openInOryon}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                      title={T.unlink}
                      aria-label={T.unlink}
                      data-testid={`trade-chart-analysis-unlink-${analysis.id}`}
                      onClick={() => {
                        oryonAnalyses.update(analysis.id, { tradeId: null });
                        oryonAnalyses.saveNow();
                        toast.success(T.unlinkToast);
                      }}
                    >
                      <Link2Off className="size-3" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-7 w-7 px-0 text-muted-foreground hover:text-loss")}
                      aria-label={T.delete}
                      data-testid={`trade-chart-analysis-delete-${analysis.id}`}
                      onClick={() => setConfirmDeleteId(analysis.id)}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{T.localNote}</p>
    </section>
  );
}
