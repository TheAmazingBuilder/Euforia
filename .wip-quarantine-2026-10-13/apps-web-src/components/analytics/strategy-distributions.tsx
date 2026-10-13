import type { StrategyDistribution } from "@cosmoz/shared";
import { formatNumber, formatR } from "@cosmoz/shared";

import { GradeBadge } from "@/components/playbook/strategy-card";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * Per-strategy R distributions (Phase 9 small multiples): each setup's
 * closed trades as a barcode of thin R bars around a shared baseline —
 * wins up in emerald, losses down in carmine, one column per trade in
 * chronological order. The strategy color lives only in the header dot,
 * never as decoration (same rule as the playbook cards).
 */

function DistributionCard({ distribution }: { distribution: StrategyDistribution }) {
  const values = distribution.rValues.map((value) => Number(value));
  const wins = values.filter((value) => value > 0).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  const avg = values.length > 0 ? total / values.length : 0;
  const maxAbs = Math.max(0.5, ...values.map((value) => Math.abs(value)));
  const dotColor = distribution.color ?? getThemeToken("--accent");

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-surface-raised/40 p-3.5" data-testid="strategy-distribution">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="truncate text-sm font-medium">{distribution.name}</span>
        </span>
        <GradeBadge grade={distribution.grade} />
      </div>

      <div
        className="relative flex h-16 items-center gap-px overflow-hidden rounded-md bg-surface-raised/50 px-1"
        role="img"
        aria-label={`${distribution.name}: ${values.length} trades, ${wins} wins, total ${formatR(total)}`}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {values.map((value, index) => {
          const heightPct = Math.max(3, (Math.abs(value) / maxAbs) * 48);
          return (
            <span key={index} className="relative h-full min-w-[2px] flex-1">
              {value >= 0 ? (
                <span
                  className="absolute bottom-1/2 w-full rounded-t-[2px] bg-profit/75"
                  style={{ height: `${heightPct}%` }}
                />
              ) : (
                <span
                  className="absolute top-1/2 w-full rounded-b-[2px] bg-loss/75"
                  style={{ height: `${heightPct}%` }}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="font-mono tabular-nums">{values.length} trades</span>
        <span className="font-mono tabular-nums text-profit">{wins}W</span>
        <span className="font-mono tabular-nums text-loss">{values.length - wins}L</span>
        <span className={cn("ml-auto font-mono font-semibold tabular-nums", total >= 0 ? "text-profit" : "text-loss")}>
          {formatR(total)} total · {formatR(avg)} avg
        </span>
      </div>
      <p className="sr-only">{formatNumber(values.length, 0)} closed trades for {distribution.name}</p>
    </div>
  );
}

export function StrategyDistributions({ distributions }: { distributions: StrategyDistribution[] }) {
  if (distributions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No strategy has closed trades yet — link executions to a playbook setup and each setup
        grows its own barcode here.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {distributions.map((distribution) => (
        <DistributionCard key={distribution.strategyId} distribution={distribution} />
      ))}
    </div>
  );
}
