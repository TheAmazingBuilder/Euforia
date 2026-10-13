"use client";

import * as React from "react";
import type { AnalyticsResponse, Strategy, StrategyStat } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { StrategyTable } from "@/components/analytics/strategy-table";
import { GradeBadge } from "@/components/playbook/strategy-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * By-Strategy tab (Phase 9): the aggregate table (playbook stats) plus the
 * chronological R distributions as small multiples — a barcode of every
 * closed trade, so the SHAPE of each edge is visible, not just its mean.
 */

interface StrategyTabProps {
  analytics: AnalyticsResponse;
  strategies: Strategy[];
  stats: StrategyStat[];
}

function DistributionStrip({
  rValues,
}: {
  rValues: AnalyticsResponse["strategyDistributions"][number]["rValues"];
}) {
  const values = React.useMemo(() => rValues.map((value) => Number(value)), [rValues]);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0.5);

  return (
    <div className="flex h-16 items-end gap-px" aria-hidden="true">
      {values.map((value, index) => {
        const height = Math.max(6, (Math.abs(value) / maxAbs) * 100);
        if (value === 0) {
          return <span key={index} className="h-0.5 min-w-[3px] flex-1 rounded-sm bg-muted-foreground/50" />;
        }
        return (
          <span
            key={index}
            style={{ height: `${height}%` }}
            className={cn(
              "min-w-[3px] flex-1 rounded-sm",
              value > 0 ? "bg-profit/75" : "bg-loss/75",
            )}
          />
        );
      })}
    </div>
  );
}

export function StrategyTab({ analytics, strategies, stats }: StrategyTabProps) {
  const byId = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const distributions = analytics.strategyDistributions.filter(
    (distribution) => byId.has(distribution.strategyId) || distribution.name !== "",
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Playbook statistics
          </CardTitle>
          <CardDescription>
            Every rate carries its trade count; the last-20 column is the decay window
            the coach watches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StrategyTable stats={stats} strategies={strategies} />
        </CardContent>
      </Card>

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            R distribution per strategy
          </CardTitle>
          <CardDescription>
            One bar per closed trade, chronological — the shape of the edge, not just
            its average. Greens above zero, reds below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {distributions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No closed trade is linked to a strategy yet — attribute executions to
              playbook setups to see their distributions.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {distributions.map((distribution) => {
                const strategy = byId.get(distribution.strategyId);
                return (
                  <li
                    key={distribution.strategyId}
                    className="rounded-lg border border-border bg-surface-raised p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              distribution.color ?? strategy?.color ?? getThemeToken("--accent"),
                          }}
                        />
                        {distribution.name}
                      </span>
                      {distribution.grade !== null && <GradeBadge grade={distribution.grade} />}
                    </div>
                    <div className="mt-3">
                      <DistributionStrip rValues={distribution.rValues} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <span className="font-mono tabular-nums">{distribution.rValues.length}</span>{" "}
                      closed trades · net{" "}
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          distribution.rValues.reduce((sum, value) => sum + Number(value), 0) >= 0
                            ? "text-profit"
                            : "text-loss",
                        )}
                      >
                        {formatR(
                          distribution.rValues.reduce((sum, value) => sum + Number(value), 0),
                        )}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
