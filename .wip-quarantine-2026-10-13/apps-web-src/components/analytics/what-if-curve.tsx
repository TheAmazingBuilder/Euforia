"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { ExcursionPoint } from "@cosmoz/shared";
import { formatNumber, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * What-If curve (Phase 9 What-If lab): drag the exit rule — "on winners I
 * keep k % of my peak MFE" — and watch the cumulative-R trajectory re-run
 * against the actual one. Losers and scratches stay untouched: the lab
 * only renegotiates how winners were exited. Recomputed client-side from
 * the shipped per-trade rows (a live-form estimate, like the sizer).
 */

interface TooltipParam {
  dataIndex: number;
}

export function WhatIfCurve({ points }: { points: ExcursionPoint[] }) {
  const theme = useChartTheme();
  const [keepPct, setKeepPct] = React.useState(60);

  const chronological = React.useMemo(
    () =>
      [...points]
        .filter((point) => point.mfeR !== null)
        .sort((a, b) => (a.date + a.tradeId).localeCompare(b.date + b.tradeId)),
    [points],
  );

  const scenarioDelta = React.useMemo(() => {
    const actualTotal = chronological.reduce((sum, point) => sum + Number(point.rMultiple), 0);
    const scenarioTotal = chronological.reduce((sum, point) => {
      const exit = Number(point.rMultiple);
      if (exit <= 0) return sum + exit;
      return sum + Math.max((Number(point.mfeR) * keepPct) / 100, 0);
    }, 0);
    return scenarioTotal - actualTotal;
  }, [chronological, keepPct]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = theme;

    let actualCum = 0;
    let scenarioCum = 0;
    const actualSeries: number[] = [];
    const scenarioSeries: number[] = [];
    chronological.forEach((point) => {
      const exit = Number(point.rMultiple);
      actualCum += exit;
      scenarioCum += exit <= 0 ? exit : Math.max((Number(point.mfeR) * keepPct) / 100, 0);
      actualSeries.push(Number(actualCum.toFixed(2)));
      scenarioSeries.push(Number(scenarioCum.toFixed(2)));
    });

    return {
      grid: { left: 6, right: 12, top: 16, bottom: 2, containLabel: true },
      xAxis: {
        type: "category",
        data: chronological.map((point) => point.date),
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: t.border } },
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
        axisPointer: { type: "line", lineStyle: { color: withAlpha(t.textMuted, 0.4) } },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const list = Array.isArray(params) ? params : [params];
          const typed = list[0] as TooltipParam | undefined;
          const index = typed?.dataIndex;
          const point = index === undefined ? undefined : chronological[index];
          if (index === undefined || !point) return "";
          const actual = actualSeries[index] ?? 0;
          const scenario = scenarioSeries[index] ?? 0;
          return [
            `<div style="color:${t.textMuted};font-size:10px">${point.date}</div>`,
            `<div>Actual ${formatR(actual)} · What-if ${formatR(scenario)}</div>`,
          ].join("");
        },
      },
      series: [
        {
          type: "line",
          name: "Actual",
          data: actualSeries,
          showSymbol: false,
          lineStyle: { color: withAlpha(t.accent, 0.9), width: 1.5 },
          itemStyle: { color: withAlpha(t.accent, 0.9) },
        },
        {
          type: "line",
          name: "What-if",
          data: scenarioSeries,
          showSymbol: false,
          lineStyle: { color: withAlpha(t.chartPalette[1] ?? t.accent, 0.95), width: 1.5, type: "dashed" },
          itemStyle: { color: withAlpha(t.chartPalette[1] ?? t.accent, 0.95) },
        },
      ],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8).
  }, [chronological, keepPct, theme]);

  return (
    <div>
      <div className="h-[280px]" role="img" aria-label="Actual versus what-if cumulative R curve">
        <EChart
          option={option}
          className="h-full w-full"
          ariaLabel="Actual versus what-if cumulative R curve"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border px-3 pt-3">
        <label className="flex min-w-56 flex-1 items-center gap-3">
          <span className="ledger-label shrink-0">Keep {formatNumber(keepPct, 0)}% of peak</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={keepPct}
            onChange={(event) => setKeepPct(Number(event.target.value))}
            className="h-1 w-full cursor-pointer accent-primary"
            aria-label="Share of peak MFE kept on winners"
          />
        </label>
        <p className="font-mono text-sm tabular-nums">
          <span className="text-muted-foreground">Scenario delta </span>
          <span className={scenarioDelta >= 0 ? "font-semibold text-profit" : "font-semibold text-loss"}>
            {formatR(scenarioDelta)}
          </span>
          <span className="ml-2 text-[11px] text-muted-foreground">
            over {formatNumber(chronological.length, 0)} trades
          </span>
        </p>
      </div>
    </div>
  );
}
