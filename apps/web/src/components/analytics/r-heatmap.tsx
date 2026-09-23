"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";
import type { HeatmapCell } from "@cosmoz/shared";
import { ANALYTICS_HOUR_BUCKETS, ANALYTICS_WEEKDAYS, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Temporal edge heatmap (Phase 9 Overview): weekday × UTC hour bucket, cell
 * green/red by average R sign, intensity by magnitude. Cells below 10 trades
 * carry a visible "low n" treatment — dashed border + warning-tinted n label
 * — because statistical honesty is a product principle.
 */

/** Magnitude scale ceiling: |avgR| beyond this renders at full intensity. */
const MAX_INTENSITY_R = 1.5;
/** Cells with fewer trades than this are flagged as low sample. */
export const LOW_N_THRESHOLD = 10;

interface RHeatmapProps {
  cells: HeatmapCell[];
  className?: string;
}

interface TooltipParam {
  data: { value: [number, number, { avgR: number | null; trades: number; wins: number }] };
}

export function RHeatmap({ cells, className }: RHeatmapProps) {
  const { resolvedTheme } = useTheme();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = getChartTheme();
    const lookup = new Map<string, HeatmapCell>();
    for (const cell of cells) lookup.set(`${cell.weekday}:${cell.hourBucket}`, cell);

    const data: {
      value: [number, number, { avgR: number | null; trades: number; wins: number }];
      itemStyle: Record<string, unknown>;
      label: Record<string, unknown>;
    }[] = [];

    ANALYTICS_WEEKDAYS.forEach((weekday, y) => {
      ANALYTICS_HOUR_BUCKETS.forEach((_, x) => {
        const cell = lookup.get(`${weekday.index}:${x}`);
        const trades = cell?.trades ?? 0;
        const avgR = cell?.avgR === undefined || cell.avgR === null ? null : Number(cell.avgR);
        const wins = cell?.wins ?? 0;
        const lowN = trades > 0 && trades < LOW_N_THRESHOLD;

        const baseColor =
          avgR === null || trades === 0
            ? withAlpha(t.textMuted, 0.06)
            : withAlpha(avgR >= 0 ? t.profit : t.loss, 0.16 + 0.7 * Math.min(1, Math.abs(avgR) / MAX_INTENSITY_R));

        data.push({
          value: [x, y, { avgR, trades, wins }],
          itemStyle: {
            color: baseColor,
            borderColor: lowN ? withAlpha(t.warning, 0.75) : withAlpha(t.border, 0.7),
            borderWidth: lowN ? 1.2 : 0.5,
            borderType: lowN ? "dashed" : "solid",
            borderRadius: 3,
          },
          label: {
            show: true,
            formatter: () => {
              if (trades === 0) return "—";
              const rLine = `{r|${formatR(avgR ?? 0)}}`;
              const nLine = lowN ? `{lowN|n=${trades}}` : `{n|n=${trades}}`;
              return `${rLine}\n${nLine}`;
            },
            rich: {
              r: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 10, lineHeight: 14, align: "center" },
              n: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 9, lineHeight: 12, align: "center" },
              lowN: { color: t.warning, fontFamily: t.monoFont, fontSize: 9, fontWeight: "bold" as const, lineHeight: 12, align: "center" },
            },
          },
        });
      });
    });

    return {
      grid: { left: 8, right: 10, top: 8, bottom: 2, containLabel: true },
      xAxis: {
        type: "category",
        data: ANALYTICS_HOUR_BUCKETS.map((bucket) => `${bucket.label} UTC`),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: ANALYTICS_WEEKDAYS.map((weekday) => weekday.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
      },
      tooltip: {
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const raw = typed?.data.value[2];
          if (!raw || raw.trades === 0) return "No trades in this window";
          const day = ANALYTICS_WEEKDAYS[typed!.data.value[1]!]?.label ?? "";
          const bucketLabel = ANALYTICS_HOUR_BUCKETS[typed!.data.value[0]!]?.label ?? "";
          const rText = raw.avgR === null ? "—" : formatR(raw.avgR);
          const lowNote =
            raw.trades < LOW_N_THRESHOLD
              ? `<div style="color:${t.warning};margin-top:2px">Low sample — treat with caution</div>`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${day} · ${bucketLabel} UTC</div>`,
            `<div>Avg ${rText} · ${raw.trades} trades (${raw.wins} wins)</div>`,
            lowNote,
          ].join("");
        },
      },
      visualMap: { show: false },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: true },
          emphasis: { itemStyle: { borderColor: t.accent, borderWidth: 1.5 } },
        },
      ],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, resolvedTheme]);

  return (
    <div className={className}>
      <div className="min-w-[620px]">
        <EChart
          option={option}
          className="h-[320px] w-full"
          ariaLabel="Heatmap of average R by weekday and UTC hour bucket, low-sample cells flagged"
        />
      </div>
    </div>
  );
}
