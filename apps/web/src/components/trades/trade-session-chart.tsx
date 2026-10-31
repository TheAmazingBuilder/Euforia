"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { ChevronDown, LineChart, Loader2 } from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";

import { EChart } from "@/components/charts/echart";
import { Button } from "@/components/ui/button";
import { useTradeSessionSeries } from "@/lib/api/queries";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import { formatNumber } from "@cosmoz/shared";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/** Time axis label - local clock, same convention as the rest of the app. */
const axisTime = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function tooltipTime(iso: string): string {
  const date = new Date(iso);
  return axisTime.format(date);
}

interface TradeSessionChartProps {
  tradeId: string;
  open: boolean;
}

/**
 * Per-trade projection chart - the journal's entry/exit/SL/TP levels drawn
 * OVER the session price path around the trade window. One request builds
 * everything: the server returns the series WITH the recorded levels and the
 * entry/exit bucket indices, so the client only renders.
 * Collapsible so the drawer keeps its rhythm when the chart is not needed.
 */
export function TradeSessionChart({ tradeId, open }: TradeSessionChartProps) {
  const { dict } = useI18n();
  const chartT = dict.trades.chart;
  const detailT = dict.trades.detail;
  const [expanded, setExpanded] = React.useState(true);
  const { resolvedTheme } = useTheme();
  const { data, isPending } = useTradeSessionSeries(open ? tradeId : null);

  // resolvedTheme is an intentional dependency: tokens are read from the DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption | null>(() => {
    if (!data) return null;
    const digits = data.digits;
    const labels = data.points.map((point) => tooltipTime(point.t));
    const prices = data.points.map((point) => Number(point.price));
    const entryPrice = Number(data.entryPrice);
    const exitPrice = data.exitPrice === null ? null : Number(data.exitPrice);
    const stop = data.initialStop === null ? null : Number(data.initialStop);
    const target = data.initialTP === null ? null : Number(data.initialTP);

    const entryMarker = {
      symbol: "circle",
      symbolSize: 9,
      itemStyle: { color: theme.accent, borderColor: theme.background, borderWidth: 2 },
      label: {
        show: true,
        formatter: `${detailT.entry} ${formatNumber(data.entryPrice, digits)}`,
        position: [0, -22] as [number, number],
        color: theme.textPrimary,
        fontFamily: theme.monoFont,
        fontSize: 10,
        textBorderColor: theme.background,
        textBorderWidth: 3,
      },
      data: [[data.entryIndex, entryPrice]],
    };
    const exitMarker =
      data.exitIndex !== null && exitPrice !== null
        ? {
            symbol: "diamond",
            symbolSize: 10,
            itemStyle: {
              color: exitPrice >= entryPrice ? theme.profit : theme.loss,
              borderColor: theme.background,
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: `${detailT.exit} ${formatNumber(data.exitPrice!, digits)}`,
              position: [0, 20] as [number, number],
              color: theme.textPrimary,
              fontFamily: theme.monoFont,
              fontSize: 10,
              textBorderColor: theme.background,
              textBorderWidth: 3,
            },
            data: [[data.exitIndex, exitPrice]],
          }
        : null;

    const verticalMarks = [
      {
        yAxis: "min",
        xAxis: data.entryIndex,
        lineStyle: { color: withAlpha(theme.accent, 0.55), type: "dashed" as const, width: 1 },
        label: { show: false },
      },
      ...(data.exitIndex !== null
        ? [
            {
              yAxis: "min",
              xAxis: data.exitIndex,
              lineStyle: { color: withAlpha(theme.textMuted, 0.5), type: "dashed" as const, width: 1 },
              label: { show: false },
            },
          ]
        : []),
    ];
    const horizontalMarks = [
      {
        yAxis: entryPrice,
        xAxis: "min",
        lineStyle: { color: withAlpha(theme.accent, 0.4), type: "dotted" as const, width: 1 },
        label: { show: false },
      },
      ...(stop !== null
        ? [
            {
              yAxis: stop,
              xAxis: "min",
              lineStyle: { color: theme.loss, type: "dashed" as const, width: 1 },
              label: {
                show: true,
                formatter: `${chartT.sl} ${formatNumber(data.initialStop!, digits)}`,
                position: "insideEndTop" as const,
                color: theme.loss,
                fontFamily: theme.monoFont,
                fontSize: 9,
              },
            },
          ]
        : []),
      ...(target !== null
        ? [
            {
              yAxis: target,
              xAxis: "min",
              lineStyle: { color: theme.profit, type: "dashed" as const, width: 1 },
              label: {
                show: true,
                formatter: `${chartT.tp} ${formatNumber(data.initialTP!, digits)}`,
                position: "insideEndBottom" as const,
                color: theme.profit,
                fontFamily: theme.monoFont,
                fontSize: 9,
              },
            },
          ]
        : []),
    ];

    return {
      grid: { left: 8, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 11 },
        valueFormatter: (value: unknown) => formatNumber(String(value), digits),
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 9, interval: 3 },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(theme.border, 0.6) } },
        axisLabel: {
          color: theme.textMuted,
          fontFamily: theme.monoFont,
          fontSize: 9,
          formatter: (value: number) => formatNumber(String(value), digits),
        },
      },
      series: [
        {
          type: "line",
          data: prices,
          showSymbol: false,
          lineStyle: { color: theme.accent, width: 2 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(theme.accent, 0.18) },
              { offset: 1, color: withAlpha(theme.accent, 0.02) },
            ]),
          },
          markPoint: { data: exitMarker ? [entryMarker, exitMarker] : [entryMarker] },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [...verticalMarks, ...horizontalMarks],
          },
        },
      ],
    };
  }, [data, theme, chartT, detailT]);

  const levels = data
    ? [
        { label: detailT.entry, value: data.entryPrice, tone: "text-accent" },
        ...(data.exitPrice !== null
          ? [{ label: detailT.exit, value: data.exitPrice, tone: "text-foreground" }]
          : []),
        ...(data.initialStop !== null ? [{ label: chartT.sl, value: data.initialStop, tone: "text-loss" }] : []),
        ...(data.initialTP !== null ? [{ label: chartT.tp, value: data.initialTP, tone: "text-profit" }] : []),
      ]
    : [];

  return (
    <section
      className="rounded-lg border border-border bg-background/40"
      data-testid="trade-session-chart"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <LineChart className="size-3.5 text-accent" aria-hidden="true" />
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            {chartT.heading}
          </p>
          {data ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.symbol} · {axisTime.format(new Date(data.from))}–{axisTime.format(new Date(data.to))}
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={expanded ? chartT.collapse : chartT.expand}
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
          data-testid="trade-session-chart-toggle"
        >
          <ChevronDown
            className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </div>

      {expanded ? (
        isPending || !data || !option ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <p className="text-xs">{chartT.unavailable}</p>
            )}
          </div>
        ) : (
          <div className="px-1 pb-2">
            <EChart option={option} className="h-48 w-full" ariaLabel={chartT.projectionAria} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-1">
              {levels.map((level) => (
                <span key={level.label} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className={cn("font-semibold", level.tone)}>{level.label}</span>
                  {formatNumber(level.value, data.digits)}
                </span>
              ))}
              {data.exitPrice === null ? (
                <span className="text-[10px] italic text-muted-foreground/70">
                  {chartT.openNote}
                </span>
              ) : null}
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
