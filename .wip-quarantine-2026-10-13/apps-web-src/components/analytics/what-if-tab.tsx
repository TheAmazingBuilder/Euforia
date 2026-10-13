"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, RotateCcw } from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import type { Trade } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StopEfficiencyCard } from "@/components/analytics/stop-efficiency-card";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import {
  NO_FILTERS,
  WHAT_IF_FILTER_KEYS,
  WHAT_IF_FILTER_META,
  simulateWhatIf,
  type WhatIfFilterKey,
  type WhatIfFilters,
} from "@/lib/utils/what-if";

/**
 * What-If tab (Phase 9): 100% client-side replay of the closed-trade
 * sequence. Toggle any combination of rules — the cumulative-R curves
 * recompute instantly from the trades query, no new endpoint. The actual
 * line is solid accent; the simulated line is dashed neutral; the delta
 * carries the P&L color.
 */

interface WhatIfTabProps {
  trades: Trade[];
}

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function WhatIfTab({ trades }: WhatIfTabProps) {
  const [filters, setFilters] = React.useState<WhatIfFilters>(NO_FILTERS);
  const { resolvedTheme } = useTheme();

  const result = React.useMemo(() => simulateWhatIf(trades, filters), [trades, filters]);
  const activeCount = WHAT_IF_FILTER_KEYS.filter((key) => filters[key]).length;

  const toggleFilter = React.useCallback((key: WhatIfFilterKey) => {
    setFilters((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = getChartTheme();
    const points = result.points;

    const actualSeries = {
      id: "actual",
      name: "Actual",
      type: "line",
      data: points.map((point) => point.actualR),
      showSymbol: false,
      lineStyle: { color: t.accent, width: 1.6 },
      itemStyle: { color: t.accent },
      emphasis: { scale: 1.4 },
      areaStyle: {
        color: withAlpha(t.accent, 0.07),
      },
    };

    const simulatedSeries = {
      id: "simulated",
      name: "Simulated",
      type: "line",
      data: points.map((point) => point.simulatedR),
      showSymbol: false,
      lineStyle: { color: t.textMuted, width: 1.4, type: "dashed" as const },
      itemStyle: { color: t.textMuted },
      emphasis: { scale: 1.4 },
    };

    return {
      animationDuration: 320,
      grid: { left: 6, right: 14, top: 18, bottom: 2, containLabel: true },
      xAxis: {
        type: "category",
        data: points.map((point) => point.date),
        boundaryGap: false,
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          hideOverlap: true,
          formatter: (value: string) => formatDayLabel(value),
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}R`,
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: withAlpha(t.accent, 0.55), width: 1 } },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number } | undefined;
          const index = first?.dataIndex ?? 0;
          const point = points[index];
          if (!point) return "";
          const delta = point.simulatedR - point.actualR;
          return [
            `<div style="color:${t.textMuted};font-size:10px">${formatDayLabel(point.date)} · trade ${index + 1}</div>`,
            `<div>Actual <span style="color:${t.accent}">${formatR(point.actualR)}</span></div>`,
            `<div>Simulated <span style="color:${t.textMuted}">${formatR(point.simulatedR)}</span></div>`,
            `<div style="color:${delta >= 0 ? t.profit : t.loss}">Δ ${formatR(delta)}</div>`,
          ].join("");
        },
      },
      series: [actualSeries, simulatedSeries],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resolvedTheme]);

  if (result.points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No closed trade to replay yet — the simulator needs a history.
      </p>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Replay rules
          </CardTitle>
          <CardDescription>
            Toggle any combination — the simulation recomputes instantly, entirely in
            your browser. No server round-trip, no data leaves the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            role="group"
            aria-label="What-If replay filters"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            {WHAT_IF_FILTER_KEYS.map((key) => {
              const active = filters[key];
              const meta = WHAT_IF_FILTER_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleFilter(key)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                    active
                      ? "border-accent/60 bg-accent/10"
                      : "border-border bg-surface-raised hover:border-accent/30"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {active && (
                      <Check className="size-3.5 text-accent" aria-hidden="true" />
                    )}
                    <span
                      className={`text-[13px] font-medium ${
                        active ? "text-foreground" : "text-foreground/80"
                      }`}
                    >
                      {meta.label}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {meta.description}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {activeCount === 0
                ? "Baseline shown — both curves overlap until you apply a rule."
                : `${activeCount} rule${activeCount === 1 ? "" : "s"} applied.`}
            </p>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setFilters(NO_FILTERS)}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Cumulative R — actual vs simulated
          </CardTitle>
          <CardDescription>
            The simulated line stays flat where a filtered-out trade sat — every
            trade keeps its slot, so both curves stay comparable point for point.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-0.5 w-5 rounded-full bg-accent"
              />
              Actual
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-0 w-5 border-t-2 border-dashed border-muted-foreground"
              />
              Simulated
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
              <span className="rounded-md border border-border bg-surface-raised px-2 py-1">
                Δ{" "}
                <span className={result.deltaR >= 0 ? "text-profit" : "text-loss"}>
                  {formatR(result.deltaR)}
                </span>
              </span>
              <span className="rounded-md border border-border bg-surface-raised px-2 py-1 text-muted-foreground">
                {result.keptTrades}/{result.totalTrades} trades kept
              </span>
              <span className="rounded-md border border-border bg-surface-raised px-2 py-1 text-muted-foreground">
                {result.days}d window
              </span>
            </span>
          </div>
          <EChart
            option={option}
            className="h-[300px] w-full sm:h-[340px] lg:h-[380px]"
            ariaLabel="Cumulative R replay: actual versus simulated curve with applied filters"
          />
        </CardContent>
      </Card>

      {/* Priority 2 #6 — MAE/MFE stop-tuning hints, 100% client-side. */}
      <StopEfficiencyCard trades={trades} />
    </div>
  );
}
