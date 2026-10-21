"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { PnlBandWidgetConfig, StatsOverviewResponse } from "@cosmoz/shared";
import { formatMoneyCompact, formatSignedMoney } from "@cosmoz/shared";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EChart } from "@/components/charts/echart";
import { PeriodChips, useRangeParam, type RangeDays } from "@/components/dashboard/period-chips";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/** Short date label for axes + tooltips ("Sep 12"). */
const axisDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function sliceByRange<T>(points: T[], range: RangeDays): T[] {
  const count = Math.min(range, points.length);
  return points.slice(points.length - count);
}

/** Card header shared by both P&L charts: title + synced period chips. */
function PnlCardHeader({
  title,
  description,
  range,
  onRangeChange,
}: {
  title: string;
  description: string;
  range: RangeDays;
  onRangeChange: (range: RangeDays) => void;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between space-y-0">
      <div className="min-w-0 space-y-1">
        <CardTitle className="font-heading text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </div>
      <PeriodChips range={range} onRangeChange={onRangeChange} />
    </CardHeader>
  );
}

/**
 * Cumulative P&L — accent line over a soft gradient area with a zero
 * baseline, mono end-label on the last point. Range = period chips (URL).
 * Phase 02: when a widget config is provided the range comes from it and
 * the chips update the widget's own configuration instead of the URL.
 */
export function CumulativePnlCard({
  overview,
  chartConfig,
  onRangeChange,
}: {
  overview: StatsOverviewResponse;
  chartConfig?: PnlBandWidgetConfig;
  onRangeChange?: (range: RangeDays) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [urlRange, setUrlRange] = useRangeParam();
  const range: RangeDays = chartConfig ? chartConfig.range : urlRange;
  const setRange = chartConfig && onRangeChange ? onRangeChange : setUrlRange;
  const chartType = chartConfig?.cumulativeType ?? "AREA";
  const showEndMarker = chartConfig?.showEndMarker ?? true;
  const showZeroLine = chartConfig?.showZeroLine ?? true;

  // resolvedTheme is an intentional dependency even though tokens are read
  // from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const window = sliceByRange(overview.dailyPnl, range);
    const series = window.reduce<{ date: string; value: number; raw: number }[]>(
      (acc, point) => {
        const previous = acc.length > 0 ? acc[acc.length - 1]!.raw : 0;
        const raw = previous + Number(point.pnlNet);
        acc.push({
          date: axisDay.format(new Date(`${point.date}T00:00:00Z`)),
          value: Number(raw.toFixed(2)),
          raw,
        });
        return acc;
      },
      [],
    );

    const last = series[series.length - 1];
    const min = Math.min(0, ...series.map((point) => point.value));
    const max = Math.max(0, ...series.map((point) => point.value));
    const pad = Math.max((max - min) * 0.08, 1);

    const seriesBase = {
      id: "cumulative-pnl",
      data: series,
      smooth: 0.25,
      symbol: "none" as const,
      markPoint:
        showEndMarker && last !== undefined
          ? {
              silent: true,
              symbol: "circle",
              symbolSize: 8,
              itemStyle: {
                color: theme.accent,
                borderColor: theme.surfaceRaised,
                borderWidth: 2,
                shadowColor: withAlpha(theme.accent, 0.55),
                shadowBlur: 9,
              },
              label: { show: false },
              data: [{ coord: [last.date, last.value] }],
            }
          : undefined,
      markLine:
        showZeroLine && min < 0
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: theme.border, type: "dashed", width: 1 },
              data: [{ yAxis: 0 }],
            }
          : undefined,
      endLabel: {
        show: showEndMarker && last !== undefined,
        precision: 0,
        formatter: () => formatSignedMoney(last?.raw ?? 0, overview.currency, { digits: 0 }),
        color: (last?.raw ?? 0) >= 0 ? theme.profit : theme.loss,
        fontFamily: theme.monoFont,
        fontSize: 11,
        fontWeight: "bold",
        offset: [6, 0],
      },
    };

    if (chartType === "BAR") {
      return {
        grid: { left: 8, right: 44, top: 14, bottom: 8, containLabel: true },
        tooltip: barTooltip(theme, overview.currency),
        xAxis: categoryAxis(series.map((point) => point.date), theme),
        yAxis: valueAxis(min, max, pad, overview.currency, theme),
        series: [
          {
            ...seriesBase,
            type: "bar" as const,
            barMaxWidth: 18,
            itemStyle: {
              borderRadius: 3,
              color: (params: { dataIndex: number }) => {
                const raw = series[params.dataIndex]?.raw ?? 0;
                return raw >= 0 ? theme.profit : theme.loss;
              },
            },
          },
        ],
      } satisfies EChartsCoreOption;
    }

    if (chartType === "LINE") {
      return {
        grid: { left: 8, right: 44, top: 14, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: theme.border } },
          backgroundColor: theme.surfaceRaised,
          borderColor: theme.border,
          textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
          formatter: (params: unknown) => {
            const typed = params as { name: string; data: { raw: number } }[];
            const point = typed?.[0];
            if (!point) return "";
            return `${point.name}<br/><b>${formatSignedMoney(point.data.raw, overview.currency)}</b>`;
          },
        },
        xAxis: categoryAxis(series.map((point) => point.date), theme, true),
        yAxis: valueAxis(min, max, pad, overview.currency, theme),
        series: [
          {
            ...seriesBase,
            type: "line" as const,
            lineStyle: {
              color: theme.accent,
              width: 2.5,
              shadowColor: withAlpha(theme.accent, 0.45),
              shadowBlur: 10,
              shadowOffsetY: 5,
            },
          },
        ],
      } satisfies EChartsCoreOption;
    }

    return {
      grid: { left: 8, right: 44, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; data: { raw: number } }[];
          const point = typed?.[0];
          if (!point) return "";
          return `${point.name}<br/><b>${formatSignedMoney(point.data.raw, overview.currency)}</b>`;
        },
      },
      xAxis: categoryAxis(series.map((point) => point.date), theme, true),
      yAxis: valueAxis(min, max, pad, overview.currency, theme),
      series: [
        {
          ...seriesBase,
          type: "line" as const,
          lineStyle: {
            color: theme.accent,
            width: 2.5,
            shadowColor: withAlpha(theme.accent, 0.45),
            shadowBlur: 10,
            shadowOffsetY: 5,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(theme.accent, 0.42) },
                { offset: 0.55, color: withAlpha(theme.accent, 0.14) },
                { offset: 1, color: withAlpha(theme.accent, 0.03) },
              ],
            },
          },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [overview, range, theme, chartType, showEndMarker, showZeroLine]);

  return (
    <Card className="bg-surface" data-testid="cumulative-pnl-card" data-range={range} data-chart={chartType.toLowerCase()}>
      <PnlCardHeader
        title="Cumulative P&L"
        description={`Net result over the last ${range} trading days`}
        range={range}
        onRangeChange={setRange}
      />
      <CardContent>
        <EChart
          option={option}
          className="h-56 w-full sm:h-64"
          ariaLabel={`Cumulative P&L over the last ${range} trading days`}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Daily P&L — per-day bars, profit/loss ink by sign, tooltip with the
 * signed amount and the number of trades behind the day. The average
 * mark line is widget-configurable (Phase 02).
 */
export function DailyPnlCard({
  overview,
  chartConfig,
  onRangeChange,
}: {
  overview: StatsOverviewResponse;
  chartConfig?: PnlBandWidgetConfig;
  onRangeChange?: (range: RangeDays) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [urlRange, setUrlRange] = useRangeParam();
  const range: RangeDays = chartConfig ? chartConfig.range : urlRange;
  const setRange = chartConfig && onRangeChange ? onRangeChange : setUrlRange;
  const showAvgLine = chartConfig?.showAvgLine ?? true;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const window = sliceByRange(overview.dailyPnl, range);
    const values = window.map((point) => Number(point.pnlNet));
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const pad = Math.max((max - min) * 0.1, 1);

    return {
      grid: { left: 8, right: 34, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(theme.textPrimary, 0.06) } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; dataIndex: number }[];
          const point = typed?.[0];
          if (!point) return "";
          const raw = window[point.dataIndex];
          if (!raw) return "";
          return [
            point.name,
            `<b>${formatSignedMoney(raw.pnlNet, overview.currency)}</b>`,
            `${raw.tradesCount} trade${raw.tradesCount === 1 ? "" : "s"}`,
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
        min: Math.floor((min - pad) * 100) / 100,
        max: Math.ceil((max + pad) * 100) / 100,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          formatter: (value: number) => formatMoneyCompact(value, overview.currency),
        },
      },
      series: [
        {
          id: "daily-pnl",
          type: "bar",
          data: values.map((value) => {
            const positive = value >= 0;
            const color = positive ? theme.profit : theme.loss;
            // Vertical gradient — saturated at the bar's extremity, fading
            // toward the zero line (direction-aware for losses).
            return {
              value,
              itemStyle: {
                color: positive
                  ? new graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color },
                      { offset: 1, color: withAlpha(color, 0.42) },
                    ])
                  : new graphic.LinearGradient(0, 1, 0, 0, [
                      { offset: 0, color },
                      { offset: 1, color: withAlpha(color, 0.42) },
                    ]),
                borderRadius: 3,
              },
            };
          }),
          barMaxWidth: 22,
          markLine:
            showAvgLine && values.length > 1
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: theme.warning, type: "dashed", width: 1.2 },
                  label: {
                    show: true,
                    position: "end",
                    formatter: "avg",
                    color: theme.warning,
                    fontFamily: theme.monoFont,
                    fontSize: 9,
                    fontWeight: 600,
                  },
                  data: [
                    {
                      yAxis:
                        Math.round(
                          (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
                        ) / 100,
                    },
                  ],
                }
              : undefined,
        },
      ],
    };
  }, [overview, range, theme, showAvgLine]);

  return (
    <Card className="bg-surface" data-testid="daily-pnl-card" data-range={range}>
      <PnlCardHeader
        title="Daily P&L"
        description={`Result per trading day — last ${range} days`}
        range={range}
        onRangeChange={setRange}
      />
      <CardContent>
        <EChart
          option={option}
          className="h-56 w-full sm:h-64"
          ariaLabel={`Daily P&L over the last ${range} trading days`}
        />
      </CardContent>
    </Card>
  );
}

// ── Shared axis/tooltip builders (chart-config variants) ──────────────────

function categoryAxis(labels: string[], theme: ChartTheme, boundaryGapFree = false) {
  return {
    type: "category" as const,
    data: labels,
    boundaryGap: !boundaryGapFree ? undefined : false,
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont, hideOverlap: true },
  };
}

function valueAxis(min: number, max: number, pad: number, currency: StatsOverviewResponse["currency"], theme: ChartTheme) {
  return {
    type: "value" as const,
    min: Math.floor((min - pad) * 100) / 100,
    max: Math.ceil((max + pad) * 100) / 100,
    splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
    axisLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontFamily: theme.monoFont,
      formatter: (value: number) => formatMoneyCompact(value, currency),
    },
  };
}

function barTooltip(theme: ChartTheme, currency: StatsOverviewResponse["currency"]) {
  return {
    trigger: "axis" as const,
    axisPointer: { type: "shadow" as const, shadowStyle: { color: withAlpha(theme.textPrimary, 0.06) } },
    backgroundColor: theme.surfaceRaised,
    borderColor: theme.border,
    textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
    formatter: (params: unknown) => {
      const typed = params as { name: string; data: { raw: number } }[];
      const point = typed?.[0];
      if (!point) return "";
      return `${point.name}<br/><b>${formatSignedMoney(point.data.raw, currency)}</b>`;
    },
  };
}
