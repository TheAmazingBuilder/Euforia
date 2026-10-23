"use client";

import * as React from "react";
import { formatPercent, formatR, type Strategy, type StrategyGrade, type StrategyStat } from "@cosmoz/shared";

import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/dashboard/sparkline";
import { useI18n } from "@/i18n/i18n-provider";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * Playbook strategy card (Phase 8): grade badge (A+ in accent, others muted),
 * status dot, mono stats row (trades, win rate, avg R, expectancy —
 * server-computed) and a tiny cumulative-R equity sparkline. The strategy
 * color lives ONLY in the data sparkline, never as a decorative edge.
 * Clicking opens the detail dialog with the full rules.
 */

/** Grade symbols (A+/A/B/C) — language-neutral, kept out of the dict. */
export const GRADE_LABELS: Record<StrategyGrade, string> = {
  A_PLUS: "A+",
  A: "A",
  B: "B",
  C: "C",
};

/** Status → token class. Status is process state, NOT P&L — no profit/loss here. */
const STATUS_DOT: Record<Strategy["status"], string> = {
  ACTIVE: "bg-accent",
  DRAFT: "bg-muted-foreground/60",
  PAUSED: "bg-warning",
  RETIRED: "bg-muted-foreground/40",
};

export function GradeBadge({ grade, className }: { grade: StrategyGrade | null; className?: string }) {
  const { dict } = useI18n();
  if (grade === null) {
    return (
      <span className={cn("rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
        {dict.playbook.card.ungraded}
      </span>
    );
  }
  const isTop = grade === "A_PLUS";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
        isTop
          ? "bg-accent text-white shadow-sm"
          : "border border-border bg-surface-raised text-muted-foreground",
        className,
      )}
      aria-label={`${dict.playbook.card.gradeAriaPrefix} ${GRADE_LABELS[grade]}`}
    >
      {GRADE_LABELS[grade]}
    </span>
  );
}

interface StrategyCardProps {
  strategy: Strategy;
  stat: StrategyStat | undefined;
  onOpen: (strategy: Strategy) => void;
}

export function StrategyCard({ strategy, stat, onOpen }: StrategyCardProps) {
  const { dict } = useI18n();
  const V = dict.playbook.card;
  const edgeColor = strategy.color ?? getThemeToken("--accent");
  const avgR = stat ? Number(stat.avgR) : null;

  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-surface transition-shadow hover:shadow-md",
        strategy.status !== "ACTIVE" && "opacity-90",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(strategy)}
        aria-haspopup="dialog"
        className="flex w-full flex-col gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <GradeBadge grade={strategy.grade} />
          <h3 className="min-w-0 flex-1 truncate font-heading text-base font-semibold text-foreground">
            {strategy.name}
          </h3>
          <span
            className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground")}
          >
            <span className={cn("size-1.5 rounded-full", STATUS_DOT[strategy.status])} aria-hidden="true" />
            {V.status[strategy.status]}
          </span>
        </div>

        {strategy.description !== null && strategy.description !== "" ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {strategy.description}
          </p>
        ) : null}

        <div className="grid grid-cols-4 gap-2 font-mono text-xs tabular-nums">
          <div>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statTrades}</span>
            <span className="text-foreground">{stat ? String(stat.trades) : "-"}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statWinRate}</span>
            <span className="text-foreground">{stat ? formatPercent(stat.winRate, 0) : "-"}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statAvgR}</span>
            <span className={cn(avgR === null ? "text-foreground" : avgR >= 0 ? "text-profit" : "text-loss")}>
              {stat ? formatR(stat.avgR) : "-"}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statExpectancy}</span>
            <span className={cn(avgR === null ? "text-foreground" : avgR >= 0 ? "text-profit" : "text-loss")}>
              {stat ? formatR(stat.last20Expectancy ?? stat.avgR) : "-"}
            </span>
          </div>
        </div>

        {stat !== undefined && stat.sparkline.length > 1 ? (
          <Sparkline
            points={stat.sparkline}
            color={edgeColor}
            className="h-7 w-full"
            ariaLabel={`${V.sparklineAriaPrefix} ${strategy.name}`}
          />
        ) : (
          <div className="flex h-7 items-center text-[11px] italic text-muted-foreground">
            {V.noTradesYet}
          </div>
        )}
      </button>
    </Card>
  );
}
