"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { graphic } from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import type { Currency, EquityPoint } from "@cosmoz/shared";
import { formatMoney } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * The Cosmoz signature visual: the equity curve as a constellation — a thin
 * luminous line, data points as small glowing stars, a soft gradient sky
 * under the curve and translucent loss-red drawdown zones. Subtle, premium,
 * never kitsch (design-tokens.md §1).
 */

/** Four-point sparkle — the same motif as the Cosmoz constellation logo. */
const STAR_SYMBOL =
  "path://M8 0C8.75 4.6 11.4 7.25 16 8C11.4 8.75 8.75 11.4 8 16C7.25 11.4 4.6 8.75 0 8C4.6 7.25 7.25 4.6 8 0Z";

const compactNumber = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

interface EquityConstellationProps {
  points: EquityPoint[];
  currency: Currency;
}

interface TooltipParam {
  dataIndex: number;
  axisValue: string;
}

export function EquityConstellation({ points, currency }: EquityConstellationProps) {
  const { resolvedTheme } = useTheme();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = getChartTheme();
    const xData = points.map((point) => point.date);
    const yData = points.map((point) => Number(point.equity));

    // Drawdown zones: contiguous spans below the running peak (display-only
    // geometry for the markArea shading — stats themselves stay server-side).
    const markAreas: Array<[{ xAxis: string }, { xAxis: string }]> = [];
    let runningPeak = yData.length > 0 ? yData[0]! : 0;
    let zoneStart: string | null = null;
    for (let i = 0; i < points.length; i += 1) {
      const equity = yData[i]!;
      if (equity > runningPeak) runningPeak = equity;
      const inDrawdown = equity < runningPeak;
      if (inDrawdown && zoneStart === null) zoneStart = xData[i]!;
      if (!inDrawdown && zoneStart !== null) {
        markAreas.push([{ xAxis: zoneStart }, { xAxis: xData[i]! }]);
        zoneStart = null;
      }
    }
    if (zoneStart !== null && xData.length > 0) {
      markAreas.push([{ xAxis: zoneStart }, { xAxis: xData[xData.length - 1]! }]);
    }

    return {
      animationDuration: 450,
      grid: { left: 6, right: 14, top: 26, bottom: 2, containLabel: true },
      xAxis: {
        type: "category",
        data: xData,
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
          formatter: (value: number) => compactNumber.format(value),
        },
        splitLine: {
          lineStyle: { color: t.border, type: "dashed", opacity: 0.55 },
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: withAlpha(t.accent, 0.55), width: 1 },
        },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as TooltipParam | undefined;
          const index = first?.dataIndex ?? 0;
          const equity = yData[index] ?? 0;
          const previous = index > 0 ? yData[index - 1]! : null;
          const delta = previous === null ? null : equity - previous;
          const deltaColor =
            delta === null ? t.textMuted : delta >= 0 ? t.profit : t.loss;
          const deltaHtml =
            delta === null
              ? ""
              : `<div style="color:${deltaColor}">${delta >= 0 ? "+" : "-"}${compactNumber.format(Math.abs(delta))} vs prev. day</div>`;
          return [
            `<div style="color:${t.textMuted};font-size:10px">${formatDayLabel(xData[index] ?? "")}</div>`,
            `<div style="font-weight:600">${formatMoney(equity, currency)}</div>`,
            deltaHtml,
          ].join("");
        },
      },
      series: [
        {
          id: "equity",
          name: "Equity",
          type: "line",
          data: yData,
          showSymbol: true,
          symbol: STAR_SYMBOL,
          symbolSize: 8,
          lineStyle: {
            color: t.accent,
            width: 1.5,
            shadowBlur: 7,
            shadowColor: withAlpha(t.accent, 0.5),
          },
          itemStyle: {
            color: t.surfaceRaised,
            borderColor: t.accent,
            borderWidth: 1.2,
            shadowBlur: 9,
            shadowColor: withAlpha(t.accent, 0.85),
          },
          emphasis: { scale: 1.7 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(t.accent, 0.28) },
              { offset: 1, color: withAlpha(t.accent, 0.02) },
            ]),
          },
          markArea: {
            silent: true,
            itemStyle: { color: withAlpha(t.loss, 0.1) },
            data: markAreas,
          },
        },
      ],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8) —
    // resolvedTheme is an intentional dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, currency, resolvedTheme]);

  return (
    <EChart
      option={option}
      className="h-[300px] w-full sm:h-[340px] lg:h-[380px]"
      ariaLabel="Equity curve constellation: daily equity with drawdown zones highlighted"
    />
  );
}
