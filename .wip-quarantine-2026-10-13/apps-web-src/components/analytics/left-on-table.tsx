import type { ExcursionPoint } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Left-on-table list (Phase 9 What-If lab): the widest MFE-vs-exit gaps
 * among winners — the exact trades the exit-rule slider replays. One
 * colored numeral per row (the missed R), warning ink: money missed is
 * not money lost.
 */
export function LeftOnTable({ points, limit = 6 }: { points: ExcursionPoint[]; limit?: number }) {
  const rows = points
    .filter((point) => Number(point.rMultiple) > 0 && point.mfeR !== null)
    .map((point) => ({
      point,
      gap: Number(point.mfeR) - Number(point.rMultiple),
    }))
    .filter((row) => row.gap > 0.05)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No meaningful gap between your peaks and your exits — winners were ridden to their
        turn. Nothing to replay.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map(({ point, gap }) => (
        <li
          key={point.tradeId}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2 last:border-0"
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{point.date}</span>
            <span className="text-sm font-medium text-foreground">
              {point.strategyName ?? "Out of playbook"}
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums">
            <span className="text-muted-foreground">exit {formatR(point.rMultiple)}</span>
            <span className="mx-1.5 text-muted-foreground">→</span>
            <span className="text-foreground">peak {formatR(point.mfeR)}</span>
            <span className={cn("ml-2 font-semibold", "text-warning")}>{formatR(gap)} missed</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
