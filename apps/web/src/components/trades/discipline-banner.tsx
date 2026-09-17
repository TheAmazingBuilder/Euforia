"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { formatPercent, type RuleStatusLimit, type RulesStatusResponse } from "@cosmoz/shared";

import { useRulesStatus } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Discipline banner (trade-entry-ux.md §4): thin live-updating strip —
 * "Today: 2/3 trades · 0.8%/2% risk budget · 1 loss". Segments turn amber
 * as thresholds approach, red when a threshold is hit. A violated
 * LOCK-severity rule also turns the submit button amber (in the form) —
 * never a silent block.
 */

const AMBER_RATIO = 0.66;

function ratioOf(limitValue: string, currentValue: string): number | null {
  const limit = Number(limitValue);
  const current = Number(currentValue);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return current / limit;
}

function findLimit(status: RulesStatusResponse, type: RuleStatusLimit["type"]): RuleStatusLimit | null {
  return status.limits.find((limit) => limit.type === type) ?? null;
}

type Level = "calm" | "amber" | "red";

function levelForRatio(ratio: number | null): Level {
  if (ratio === null) return "calm";
  if (ratio >= 1) return "red";
  if (ratio >= AMBER_RATIO) return "amber";
  return "calm";
}

function Segment({
  label,
  value,
  limit,
  ratio,
}: {
  label: string;
  value: string;
  limit: string | null;
  ratio: number | null;
}) {
  const level = levelForRatio(ratio);
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono tabular-nums",
        level === "calm" && "text-muted-foreground",
        level === "amber" && "text-warning",
        level === "red" && "text-destructive",
      )}
    >
      {value}
      {limit !== null ? `/${limit}` : ""} {label}
    </span>
  );
}

export function DisciplineBanner({ className }: { className?: string }) {
  const { data } = useRulesStatus(null);

  if (!data) {
    return <div className={cn("h-9 animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
  }

  const tradesRule = findLimit(data, "MAX_TRADES_PER_DAY");
  const lossesRule = findLimit(data, "MAX_LOSSES_PER_DAY");
  const riskRule = findLimit(data, "MAX_RISK_PCT_PER_TRADE");
  // The daily risk budget reference = the % risk rule's configured limit.
  const riskSpent = formatPercent(Number(data.riskBudgetSpentPct) / 100, 1);
  const riskLimitValue = riskRule !== null ? Number(riskRule.limit).toString() : null;
  const riskRatio = riskLimitValue !== null ? ratioOf(riskLimitValue, data.riskBudgetSpentPct) : null;
  const tradesRatio = tradesRule !== null ? ratioOf(tradesRule.limit, tradesRule.current) : null;
  const lossesRatio = lossesRule !== null ? ratioOf(lossesRule.limit, lossesRule.current) : null;

  const worst = Math.max(tradesRatio ?? 0, lossesRatio ?? 0, riskRatio ?? 0);
  const overall: Level = worst >= 1 ? "red" : worst >= AMBER_RATIO ? "amber" : "calm";

  const guardLabel =
    overall === "calm" ? "Discipline guard" : overall === "amber" ? "Approaching limit" : "Limit hit";

  return (
    <div
      role="status"
      aria-label="Discipline status for today"
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs",
        overall === "calm" && "border-border bg-surface text-muted-foreground",
        overall === "amber" && "border-warning/40 bg-warning/10",
        overall === "red" && "border-destructive/40 bg-destructive/10",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        <span className="shrink-0 font-sans font-medium uppercase tracking-wide text-muted-foreground">
          Today:
        </span>
        <Segment
          label="trades"
          value={String(data.tradesToday)}
          limit={tradesRule !== null ? tradesRule.limit : null}
          ratio={tradesRatio}
        />
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <Segment
          label="risk budget"
          value={`${riskSpent}/${riskLimitValue !== null ? `${riskLimitValue}%` : "—"}`}
          limit={null}
          ratio={riskRatio}
        />
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <Segment
          label="losses"
          value={String(data.lossesToday)}
          limit={lossesRule !== null ? lossesRule.limit : null}
          ratio={lossesRatio}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-sans">
        {overall === "calm" ? (
          <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ShieldAlert
            className={cn("size-3.5", overall === "amber" ? "text-warning" : "text-destructive")}
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            "font-medium",
            overall === "amber" && "text-warning",
            overall === "red" && "text-destructive",
          )}
        >
          {guardLabel}
        </span>
      </div>
    </div>
  );
}
