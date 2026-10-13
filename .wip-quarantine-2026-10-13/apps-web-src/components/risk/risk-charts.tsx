"use client";

import * as React from "react";
import type { RiskOverviewResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";

import { EChart } from "@/components/charts/echart";
import type { ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/** Short date label for axes + tooltips ("Sep 12") — same idiom as pnl-charts. */
const axisDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Underwater chart — the drawdown-from-peak view of the equity curve:
 * loss-ink area from 0 down, dashed escalation-ladder thresholds
 * (caution / warning / critical) and a thin accent equity line for
 * context on a hidden secondary axis. Token-driven (design-tokens.md §8).
 */
export function UnderwaterDrawdownChart({
  data,
  theme,
}: {
  data: RiskOverviewResponse;
  theme: ChartTheme;
}) {
  const option = React.useMemo<EChartsCoreOption>(() => {
    const series = data.equityCurve.map((point) => ({
      name: axisDay.format(new Date(`${point.date}T00:00:00Z`)),
      equity: Number(point.equity),
      dd: Number(point.drawdownPct),
      amount: (Number(point.drawdownPct) / 100) * Number(point.equity),
    }));
    const ddValues = series.map((point) => point.dd);
    const ddMin = ddValues.length > 0 ? Math.min(...ddValues) : 0;
    const thresholds = data.drawdown.thresholds.filter((t) => t.triggered || data.drawdown.limitPct !== null);
    const criticalDd = thresholds.length > 0 ? Number(thresholds[thresholds.length - 1]!.ddPct) : 0;
    const yMin = Math.min(ddMin, criticalDd, 0) * 1.12;

    const thresholdLines = data.drawdown.limitPct !== null
      ? data.drawdown.thresholds.map((step) => ({
          yAxis: Number(step.ddPct),
          lineStyle: {
            color: step.key === "critical" ? theme.loss : theme.warning,
            type: "dashed" as const,
            width: 1.2,
            opacity: step.key === "critical" ? 0.9 : 0.7,
          },
          label: {
            show: true,
            position: "insideEndTop" as const,
            formatter: `${step.key} ${formatNumber(step.ddPct, step.key === "warning" ? 1 : 0)}%`,
            color: step.key === "critical" ? theme.loss : theme.warning,
            fontFamily: theme.monoFont,
            fontSize: 9,
            fontWeight: 600,
          },
        }))
      : [];

    return {
      grid: { left: 8, right: 46, top: 22, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; dataIndex: number }[];
          const point = series[typed?.[0]?.dataIndex ?? -1];
          if (!point) return "";
          return [
            point.name,
            `Equity <b>${formatMoney(point.equity, data.currency)}</b>`,
            `Drawdown <b>${formatNumber(point.dd, 2)}%</b> (${formatMoney(Math.round(point.amount), data.currency, { digits: 0 })})`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: series.map((point) => point.name),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont, hideOverlap: true },
      },
      yAxis: [
        {
          type: "value",
          min: yMin,
          max: 0,
          splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
          axisLabel: {
            color: theme.textMuted,
            fontSize: 10,
            fontFamily: theme.monoFont,
            formatter: (value: number) => `${formatNumber(value, 0)}%`,
          },
        },
        {
          type: "value",
          min: Math.min(...series.map((p) => p.equity), data.equityCurve.length > 0 ? Number(data.equityCurve[0]!.equity) : 0),
          max: Math.max(...series.map((p) => p.equity)),
          splitLine: { show: false },
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      series: [
        {
          id: "underwater",
          type: "line",
          yAxisIndex: 0,
          data: ddValues,
          symbol: "none",
          lineStyle: { color: withAlpha(theme.loss, 0.85), width: 1.4 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(theme.loss, 0.03) },
                { offset: 0.6, color: withAlpha(theme.loss, 0.22) },
                { offset: 1, color: withAlpha(theme.loss, 0.52) },
              ],
            },
          },
          markLine:
            thresholdLines.length > 0
              ? { silent: true, symbol: "none", data: thresholdLines }
              : undefined,
        },
        {
          id: "equity-context",
          type: "line",
          yAxisIndex: 1,
          data: series.map((point) => point.equity),
          symbol: "none",
          lineStyle: {
            color: withAlpha(theme.accent, 0.55),
            width: 1.2,
            shadowColor: withAlpha(theme.accent, 0.3),
            shadowBlur: 6,
          },
          emphasis: { disabled: true },
          tooltip: { show: false },
        },
      ],
    };
  }, [data, theme]);

  return (
    <div data-testid="risk-underwater-canvas" className="h-52 w-full sm:h-64">
      <EChart
        option={option}
        className="h-full w-full"
        ariaLabel="Underwater drawdown chart — distance from the equity peak with alert thresholds"
      />
    </div>
  );
}

/**
 * Daily risk committed — per-day bars in % of balance over the last 21
 * trading days, colored by the day's realized loss pressure (accent →
 * warning → loss) with the daily-loss budget as a dashed markLine.
 */
export function DailyRiskChart({
  data,
  theme,
}: {
  data: RiskOverviewResponse;
  theme: ChartTheme;
}) {
  const option = React.useMemo<EChartsCoreOption>(() => {
    const window = data.dailyRisk;
    const values = window.map((point) => Number(point.riskPct));
    const limitPct = data.daily.limitPct !== null ? Number(data.daily.limitPct) : null;
    const max = Math.max(0, ...values, limitPct ?? 0);
    const pad = Math.max(max * 0.12, 0.5);

    return {
      grid: { left: 8, right: 14, top: 18, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(theme.textPrimary, 0.06) } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { dataIndex: number }[];
          const raw = window[typed?.[0]?.dataIndex ?? -1];
          if (!raw) return "";
          return [
            axisDay.format(new Date(`${raw.date}T00:00:00Z`)),
            `Risk committed <b>${formatNumber(raw.riskPct, 2)}%</b>`,
            `Day loss <b>${formatNumber(raw.lossPct, 2)}%</b>`,
            `${raw.trades} trade${raw.trades === 1 ? "" : "s"}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: window.map((point) => axisDay.format(new Date(`${point.date}T00:00:00Z`))),
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: Math.ceil((max + pad) * 10) / 10,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          formatter: (value: number) => `${formatNumber(value, 0)}%`,
        },
      },
      series: [
        {
          id: "daily-risk",
          type: "bar",
          data: values.map((value, index) => {
            const lossPct = Number(window[index]?.lossPct ?? 0);
            const breached = limitPct !== null && lossPct >= limitPct;
            const half = limitPct !== null && lossPct >= limitPct * 0.5;
            const color = breached ? theme.loss : half ? theme.warning : theme.accent;
            return {
              value,
              itemStyle: {
                color: new graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color },
                  { offset: 1, color: withAlpha(color, 0.4) },
                ]),
                borderRadius: 3,
              },
            };
          }),
          barMaxWidth: 14,
          markLine:
            limitPct !== null
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: theme.warning, type: "dashed", width: 1.2 },
                  label: {
                    show: true,
                    position: "insideEndTop",
                    formatter: `budget ${formatNumber(limitPct, limitPct % 1 === 0 ? 0 : 1)}%`,
                    color: theme.warning,
                    fontFamily: theme.monoFont,
                    fontSize: 9,
                    fontWeight: 600,
                  },
                  data: [{ yAxis: limitPct }],
                }
              : undefined,
        },
      ],
    };
  }, [data, theme]);

  return (
    <div data-testid="risk-daily-canvas" className="h-52 w-full sm:h-60">
      <EChart
        option={option}
        className="h-full w-full"
        ariaLabel="Risk committed per trading day over the last 21 sessions, versus the daily loss budget"
      />
    </div>
  );
}

