"use client";

import * as React from "react";
import { Columns2 } from "lucide-react";
import type { AnalyticsStrategyRow, AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MethodNote } from "@/components/analytics/metric-card";
import { cn } from "@/lib/utils";

/**
 * A/B strategy comparator (module upgrade). Side-by-side, FACTUAL read-out of
 * two rows of the SAME server dataset — the module never crowns a "winner",
 * it exposes the deltas with sample-size honesty and lets the trader judge.
 */

type Suite = AnalyticsSuiteResponse;

interface ComparatorMetric {
  key: string;
  label: string;
  render: (row: AnalyticsStrategyRow, currency: AnalyticsSuiteResponse["currency"]) => string;
  /** Higher-is-better (default) or lower-is-better — drives the highlight. */
  better: "high" | "low";
  /** Null value can't be compared (insufficient data). */
  value: (row: AnalyticsStrategyRow) => number | null;
  /** Delta column shown (false for counts/holding times). */
  delta?: boolean;
}

const METRICS: ComparatorMetric[] = [
  {
    key: "trades",
    label: "Trades",
    render: (row) => String(row.trades),
    better: "high",
    value: (row) => row.trades,
    delta: false,
  },
  {
    key: "winRate",
    label: "Win rate",
    render: (row) => (row.winRate === null ? "—" : formatPercent(row.winRate, 0)),
    better: "high",
    value: (row) => (row.winRate === null ? null : Number(row.winRate)),
    delta: true,
  },
  {
    key: "profitFactor",
    label: "Profit factor",
    render: (row) => (row.profitFactor === null ? "—" : formatNumber(row.profitFactor, 2)),
    better: "high",
    value: (row) => (row.profitFactor === null ? null : Number(row.profitFactor)),
    delta: true,
  },
  {
    key: "expectancyR",
    label: "Expectancy (R)",
    render: (row) => (row.expectancyR === null ? "—" : formatR(row.expectancyR)),
    better: "high",
    value: (row) => (row.expectancyR === null ? null : Number(row.expectancyR)),
    delta: true,
  },
  {
    key: "avgWinR",
    label: "Avg win (R)",
    render: (row) => (row.avgWinR === null ? "—" : formatR(row.avgWinR)),
    better: "high",
    value: (row) => (row.avgWinR === null ? null : Number(row.avgWinR)),
    delta: true,
  },
  {
    key: "avgLossR",
    label: "Avg loss (R)",
    render: (row) => (row.avgLossR === null ? "—" : formatR(row.avgLossR)),
    better: "low",
    value: (row) => (row.avgLossR === null ? null : Number(row.avgLossR)),
    delta: true,
  },
  {
    key: "maxDrawdownR",
    label: "Max DD (R)",
    render: (row) => formatR(row.maxDrawdownR),
    better: "high", // closer to zero (less negative) is the shallower hole
    value: (row) => Number(row.maxDrawdownR),
    delta: true,
  },
  {
    key: "netPnl",
    label: "Net P&L",
    render: (row, currency) =>
      row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, currency),
    better: "high",
    value: (row) => (row.netPnl === null ? null : Number(row.netPnl)),
    delta: true,
  },
  {
    key: "avgDurationMin",
    label: "Avg hold",
    render: (row) =>
      row.avgDurationMin === null ? "—" : row.avgDurationMin < 60 ? `${row.avgDurationMin}m` : `${Math.round(row.avgDurationMin / 60)}h`,
    better: "high",
    value: (row) => row.avgDurationMin,
    delta: false,
  },
  {
    key: "followedPlanPct",
    label: "Plan followed",
    render: (row) => (row.followedPlanPct === null ? "—" : formatPercent(row.followedPlanPct, 0)),
    better: "high",
    value: (row) => (row.followedPlanPct === null ? null : Number(row.followedPlanPct)),
    delta: true,
  },
];

export function AbComparator({ suite }: { suite: Suite }) {
  const rows = suite.strategies;

  const [idAState, setIdA] = React.useState<string>("");
  const [idBState, setIdB] = React.useState<string>("");

  // Default A/B = the two most-traded rows — derived at render (no effect):
  // an explicit selection sticks, an empty/invalid one falls back. "none"
  // is the select's canonical value for the Out-of-playbook bucket
  // (strategyId null) — the same ?? convention the SelectItems use.
  const sorted = React.useMemo(() => [...rows].sort((a, b) => b.trades - a.trades), [rows]);
  const resolveId = (current: string, fallbackIndex: number): string => {
    if (current !== "" && rows.some((row) => row.strategyId === current)) return current;
    const fallback = sorted[fallbackIndex]?.strategyId;
    return fallback ?? "none";
  };
  const idA = resolveId(idAState, 0);
  const idB = resolveId(idBState, 1);

  const rowA = rows.find((row) => row.strategyId === (idA === "none" ? null : idA));
  const rowB = rows.find((row) => row.strategyId === (idB === "none" ? null : idB));

  if (rows.length < 2) {
    return (
      <Card className="bg-surface" data-testid="ab-comparator">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Columns2 className="size-4 text-muted-foreground" aria-hidden="true" />
            A/B comparator
          </CardTitle>
          <CardDescription className="text-xs">
            Side-by-side comparison needs at least two strategy rows in the dataset.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const options = [...rows].sort((a, b) => b.trades - a.trades);

  return (
    <Card className="bg-surface" data-testid="ab-comparator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Columns2 className="size-4 text-muted-foreground" aria-hidden="true" />
          A/B comparator
        </CardTitle>
        <CardDescription className="text-xs">
          Pick two strategy rows from the SAME filtered dataset — the deltas are factual, not a recommendation.
          Highlight marks the stronger side per metric; sample sizes stay visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Strategy A</p>
            <Select value={idA} onValueChange={setIdA}>
              <SelectTrigger className="h-8 text-xs" data-testid="ab-strategy-a" aria-label="Strategy A">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((row) => (
                  <SelectItem key={row.strategyId ?? "none"} value={row.strategyId ?? "none"}>
                    {row.name} ({row.trades})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Strategy B</p>
            <Select value={idB} onValueChange={setIdB}>
              <SelectTrigger className="h-8 text-xs" data-testid="ab-strategy-b" aria-label="Strategy B">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((row) => (
                  <SelectItem key={row.strategyId ?? "none"} value={row.strategyId ?? "none"}>
                    {row.name} ({row.trades})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {rowA !== undefined && rowB !== undefined && (
          <div className="overflow-x-auto" data-testid="ab-comparator-table">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  <th className="py-2 pr-3 font-medium">{rowA.name}</th>
                  <th className="py-2 pr-3 font-medium">{rowB.name}</th>
                  <th className="py-2 font-medium">Δ (A − B)</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => {
                  const rawA = metric.value(rowA);
                  const rawB = metric.value(rowB);
                  const aWins =
                    rawA !== null && rawB !== null
                      ? metric.better === "high"
                        ? rawA > rawB
                        : rawA < rawB
                      : false;
                  const bWins =
                    rawA !== null && rawB !== null
                      ? metric.better === "high"
                        ? rawB > rawA
                        : rawB < rawA
                      : false;
                  const comparable = rawA !== null && rawB !== null;
                  const delta = comparable && metric.delta !== false ? rawA - rawB : null;
                  return (
                    <tr key={metric.key} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{metric.label}</td>
                      <td
                        className={cn(
                          "py-2 pr-3 font-mono text-xs tabular-nums",
                          aWins && "font-semibold text-foreground",
                          metric.key === "netPnl" && rawA !== null && rawA >= 0 && "text-profit",
                          metric.key === "netPnl" && rawA !== null && rawA < 0 && "text-loss",
                        )}
                      >
                        {metric.render(rowA, suite.currency)}
                        {aWins && <span aria-hidden="true" className="ml-1 text-accent">●</span>}
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 font-mono text-xs tabular-nums",
                          bWins && "font-semibold text-foreground",
                          metric.key === "netPnl" && rawB !== null && rawB >= 0 && "text-profit",
                          metric.key === "netPnl" && rawB !== null && rawB < 0 && "text-loss",
                        )}
                      >
                        {metric.render(rowB, suite.currency)}
                        {bWins && <span aria-hidden="true" className="ml-1 text-accent">●</span>}
                      </td>
                      <td className="py-2 font-mono text-xs tabular-nums text-muted-foreground">
                        {delta === null ? "—" : formatNumber(delta, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <MethodNote>
          ● marks the stronger side per metric (Avg loss (R): lower is stronger; Max DD (R): closer to zero is stronger).
          Deltas carry no significance test — with small samples the honest read is “different”, not “better”.
        </MethodNote>
      </CardContent>
    </Card>
  );
}
