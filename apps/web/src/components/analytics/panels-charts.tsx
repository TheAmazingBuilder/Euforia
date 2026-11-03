"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";
import type {
  AnalyticsHistogramBin,
  AnalyticsMonteCarlo,
  AnalyticsRPoint,
  AnalyticsRollingPoint,
  AnalyticsSuiteResponse,
  Currency,
} from "@cosmoz/shared";
import { formatMoney, formatNumber, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Analytics-suite charts. Every option is rebuilt with fresh chart tokens on
 * theme change (design-tokens.md §8); axes are mono-font, tooltips carry the
 * underlying numbers, and no option hardcodes a hex (tokens only).
 */

const axisDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Shared tooltip + axis styling for every suite chart. */
function baseTheme(theme: ChartTheme) {
  return {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const, lineStyle: { color: theme.border } },
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
    },
  };
}

/** Equity curve with a soft area + drawdown-% overlay on a second axis (§7/§11). */
export function EquityChart({
  points,
  currency,
  className,
}: {
  points: AnalyticsSuiteResponse["equity"];
  currency: Currency;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency: tokens are read from the DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const dates = points.map((point) => axisDay.format(new Date(`${point.date}T00:00:00Z`)));
    const equity = points.map((point) => Number(point.equity));
    const drawdown = points.map((point) => Number(point.drawdownPct));
    return {
      ...baseTheme(theme),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { seriesName: string; data: { value: number }; dataIndex: number }[];
          const equityPoint = typed?.[0];
          const ddPoint = typed?.[1];
          if (!equityPoint) return "";
          const label = dates[equityPoint.dataIndex] ?? "";
          const dd = ddPoint ? `<br/>Drawdown: ${formatNumber(ddPoint.data.value, 2)} %` : "";
          return `${label}<br/><b>${formatMoney(String(equityPoint.data.value), currency)}</b>${dd}`;
        },
      },
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
      },
      yAxis: [
        {
          type: "value",
          scale: true,
          splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
          axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
        },
        {
          type: "value",
          position: "right",
          splitLine: { show: false },
          axisLabel: {
            color: theme.textMuted,
            fontFamily: theme.monoFont,
            fontSize: 10,
            formatter: "{value}%",
          },
        },
      ],
      series: [
        {
          name: "Equity",
          type: "line",
          data: equity,
          showSymbol: false,
          lineStyle: { color: theme.accent, width: 2 },
          itemStyle: { color: theme.accent },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(theme.accent, 0.28) },
              { offset: 1, color: withAlpha(theme.accent, 0.02) },
            ]),
          },
        },
        {
          name: "Drawdown %",
          type: "line",
          yAxisIndex: 1,
          data: drawdown,
          showSymbol: false,
          lineStyle: { color: withAlpha(theme.loss, 0.75), width: 1.2, type: "dashed" },
          itemStyle: { color: withAlpha(theme.loss, 0.75) },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [points, theme, currency]);

  return <EChart option={option} className={className} ariaLabel="Equity curve with drawdown overlay" />;
}

/** Cumulative-R step line (§9) - zero baseline emphasised. */
export function CumulativeRChart({ points, className }: { points: AnalyticsRPoint[]; className?: string }) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const labels = points.map((point) => `#${point.index + 1}`);
    const values = points.map((point) => Number(point.cumR));
    return {
      ...baseTheme(theme),
      grid: { left: 8, right: 44, top: 14, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, interval: Math.max(0, Math.floor(labels.length / 8) - 1) },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => `${v > 0 ? "+" : ""}${v}R` },
      },
      series: [
        {
          type: "line",
          step: "end",
          data: values,
          showSymbol: false,
          lineStyle: { color: theme.accent, width: 2 },
          itemStyle: { color: theme.accent },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: withAlpha(theme.textMuted, 0.5), type: "solid", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        valueFormatter: (value: number) => formatR(value),
      },
    } satisfies EChartsCoreOption;
  }, [points, theme]);

  return <EChart option={option} className={className} ariaLabel="Cumulative R across the filtered trade sequence" />;
}

/** Rolling win-rate / avg-R overlay (windowed by the server, §7). */
export function RollingChart({ points, className }: { points: AnalyticsRollingPoint[]; className?: string }) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const labels = points.map((point) => `#${point.index + 1}`);
    return {
      ...baseTheme(theme),
      grid: { left: 8, right: 8, top: 26, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: theme.textMuted, fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, interval: Math.max(0, Math.floor(labels.length / 8) - 1) },
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          max: 1,
          splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
          axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => `${Math.round(v * 100)}%` },
        },
        {
          type: "value",
          position: "right",
          scale: true,
          splitLine: { show: false },
          axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => `${v > 0 ? "+" : ""}${v}R` },
        },
      ],
      series: [
        {
          name: "Rolling win rate (10)",
          type: "line",
          data: points.map((point) => (point.winRate === null ? null : Number(point.winRate))),
          showSymbol: false,
          lineStyle: { color: theme.accent, width: 1.6 },
          itemStyle: { color: theme.accent },
        },
        {
          name: "Rolling avg R (10)",
          type: "line",
          yAxisIndex: 1,
          data: points.map((point) => (point.avgR === null ? null : Number(point.avgR))),
          showSymbol: false,
          lineStyle: { color: withAlpha(theme.warning, 0.9), width: 1.6 },
          itemStyle: { color: withAlpha(theme.warning, 0.9) },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [points, theme]);

  return <EChart option={option} className={className} ariaLabel="Rolling win rate and average R over the last 10 trades" />;
}

/** Generic histogram for pre-binned server data (R, P&L, duration, MAE/MFE). */
export function HistogramChart({
  bins,
  ariaLabel,
  color = "accent",
  className,
}: {
  bins: AnalyticsHistogramBin[];
  ariaLabel: string;
  color?: "accent" | "profit" | "loss";
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const barColor =
      color === "accent" ? theme.accent : color === "profit" ? theme.profit : theme.loss;
    return {
      ...baseTheme(theme),
      grid: { left: 8, right: 8, top: 14, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: bins.map((bin) => bin.label),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 9, rotate: 30 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
      },
      series: [
        {
          type: "bar",
          data: bins.map((bin) => bin.count),
          barCategoryGap: "18%",
          itemStyle: { color: withAlpha(barColor, 0.8), borderRadius: [3, 3, 0, 0] },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [bins, theme, color]);

  return <EChart option={option} className={className} ariaLabel={ariaLabel} />;
}

/** Daily P&L bars - profit/loss by sign (§7). */
export function DailyPnlChart({
  points,
  className,
}: {
  points: AnalyticsSuiteResponse["dailyPnl"];
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    return {
      ...baseTheme(theme),
      grid: { left: 8, right: 8, top: 14, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: points.map((point) => axisDay.format(new Date(`${point.date}T00:00:00Z`))),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
      },
      series: [
        {
          type: "bar",
          data: points.map((point) => ({
            value: point.pnl === null ? null : Number(point.pnl),
            itemStyle: {
              color: withAlpha(
                point.pnl === null ? theme.textMuted : Number(point.pnl) >= 0 ? theme.profit : theme.loss,
                0.8,
              ),
              borderRadius: point.pnl !== null && Number(point.pnl) < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0],
            },
          })),
          barCategoryGap: "24%",
        },
      ],
    } satisfies EChartsCoreOption;
  }, [points, theme]);

  return <EChart option={option} className={className} ariaLabel="Daily P&L of the filtered dataset" />;
}

/** MAE/MFE vs realized-R scatter (§18) - excursion honesty lives in the panel. */
export function ExcursionScatter({
  scatter,
  className,
}: {
  scatter: AnalyticsSuiteResponse["quality"]["scatter"];
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const mfePoints = scatter
      .filter((point) => point.mfeR !== null)
      .map((point) => [Number(point.mfeR), Number(point.realizedR), point.symbol]);
    const maePoints = scatter
      .filter((point) => point.maeR !== null)
      .map((point) => [Number(point.maeR), Number(point.realizedR), point.symbol]);
    return {
      ...baseTheme(theme),
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: theme.textMuted, fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { left: 8, right: 16, top: 26, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { seriesName: string; data: [number, number, string] };
          return `${typed.data[2]}<br/>${typed.seriesName}: ${formatR(typed.data[0])}<br/>Realized: ${formatR(typed.data[1])}`;
        },
      },
      xAxis: {
        type: "value",
        name: "Excursion (R)",
        nameTextStyle: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => formatR(v) },
      },
      yAxis: {
        type: "value",
        name: "Realized (R)",
        nameTextStyle: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => formatR(v) },
      },
      series: [
        {
          name: "MFE vs realized",
          type: "scatter",
          data: mfePoints,
          symbolSize: 7,
          itemStyle: { color: withAlpha(theme.profit, 0.75) },
        },
        {
          name: "MAE vs realized",
          type: "scatter",
          data: maePoints,
          symbolSize: 7,
          itemStyle: { color: withAlpha(theme.loss, 0.75) },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [scatter, theme]);

  return <EChart option={option} className={className} ariaLabel="MAE and MFE against realized R per trade" />;
}

/** Monte Carlo percentile fan (§25) - clearly labelled SIMULATION. */
export function MonteCarloChart({
  monteCarlo,
  className,
}: {
  monteCarlo: AnalyticsMonteCarlo;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const labels = monteCarlo.bands.map((band) => `#${band.index + 1}`);
    const bandSeries = [
      { key: "p05" as const, color: withAlpha(theme.loss, 0.5) },
      { key: "p25" as const, color: withAlpha(theme.warning, 0.6) },
      { key: "p50" as const, color: theme.accent },
      { key: "p75" as const, color: withAlpha(theme.warning, 0.6) },
      { key: "p95" as const, color: withAlpha(theme.profit, 0.5) },
    ];
    return {
      ...baseTheme(theme),
      grid: { left: 8, right: 8, top: 26, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: theme.textMuted, fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, interval: Math.max(0, Math.floor(labels.length / 8) - 1) },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (v: number) => `${v > 0 ? "+" : ""}${v}R` },
      },
      series: bandSeries.map((band) => ({
        name: band.key.toUpperCase(),
        type: "line" as const,
        data: monteCarlo.bands.map((point) => Number(point[band.key])),
        showSymbol: false,
        lineStyle: { width: band.key === "p50" ? 2 : 1, color: band.color },
        itemStyle: { color: band.color },
      })),
    } satisfies EChartsCoreOption;
  }, [monteCarlo, theme]);

  return <EChart option={option} className={className} ariaLabel="Monte Carlo simulation percentile bands of cumulative R" />;
}
