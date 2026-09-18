"use client";

import * as React from "react";
import type { Strategy, StrategyStat } from "@cosmoz/shared";
import { formatPercent, formatR } from "@cosmoz/shared";

import { GradeBadge } from "@/components/playbook/strategy-card";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * By-Strategy stats table (Phase 9): the playbook aggregate rendered as a
 * sortable-by-nothing dense table — every rate ships with its trade count,
 * and the last-20 column exposes the decay window the coach watches.
 */

interface StrategyTableProps {
  stats: StrategyStat[];
  strategies: Strategy[];
}

export function StrategyTable({ stats, strategies }: StrategyTableProps) {
  const byId = new Map(strategies.map((strategy) => [strategy.id, strategy]));

  const rows = [...stats]
    .map((stat) => ({ stat, strategy: byId.get(stat.strategyId) }))
    .filter((row): row is { stat: StrategyStat; strategy: Strategy } => row.strategy !== undefined)
    .sort((a, b) => Number(b.stat.avgR) - Number(a.stat.avgR));

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No strategy has closed trades yet — capture executions linked to a playbook setup.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Per-strategy performance statistics</caption>
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Strategy</th>
            <th scope="col" className="px-3 py-2 font-medium">Grade</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Trades</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Win rate</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Avg R</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Last-20 R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ stat, strategy }) => {
            const avgR = Number(stat.avgR);
            const last20 = stat.last20Expectancy === null ? null : Number(stat.last20Expectancy);
            return (
              <tr key={stat.strategyId} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: strategy.color ?? getThemeToken("--accent") }}
                    />
                    <span className="font-medium">{strategy.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <GradeBadge grade={strategy.grade} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{stat.trades}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {formatPercent(stat.winRate, 1)}
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({Math.round(Number(stat.winRate) * stat.trades)})
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono font-medium tabular-nums",
                    avgR >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {formatR(stat.avgR)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono tabular-nums",
                    last20 === null ? "text-muted-foreground" : last20 >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {last20 === null ? "—" : formatR(stat.last20Expectancy)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Last-20 R is the coach&apos;s decay window — negative expectancy over the most recent 20
        trades surfaces as the playbook banner. Win-rate counts shown as (wins).
      </p>
    </div>
  );
}
