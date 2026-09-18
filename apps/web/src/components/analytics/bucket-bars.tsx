"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";
import type { AnalyticsBucket } from "@cosmoz/shared";
import { formatPercent, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Generic grouped-bars chart for the analytics suite (hour buckets, weekdays,
 * sessions, emotions — all share the AnalyticsBucket shape). Bar = average R
 * (profit/loss by sign); EVERY bar carries its n — a rate without its count
 * is never shown. Buckets below LOW_SAMPLE_N get a warning-tinted n.
 */

export const LOW_SAMPLE_N = 10;

interface BucketBarsProps {
  buckets: AnalyticsBucket[];
  ariaLabel: string;
  /** Tall variant for hero rows, compact for grids. */
  height?: number;
  /** Render n under the axis labels (default true). */
  showN?: boolean;
  className?: string;
}

interface TooltipParam {
  dataIndex: number;
}

interface BarDatum {
  value: number | null;
  itemStyle: Record<string, unknown>;
  label: Record<string, unknown>;
}

export function BucketBars({ buckets, ariaLabel, height = 260, showN = true, className }: BucketBarsProps) {
  const { resolvedTheme } = useTheme();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = getChartTheme();

    const data: BarDatum[] = buckets.map((bucket) => {
      const avgR = bucket.avgR === null ? null : Number(bucket.avgR);
      const lowN = bucket.trades > 0 && bucket.trades < LOW_SAMPLE_N;
      return {
        value: avgR,
        itemStyle: {
          color:
            avgR === null
              ? withAlpha(t.textMuted, 0.18)
              : withAlpha(avgR >= 0 ? t.profit : t.loss, 0.8),
          borderRadius: [3, 3, 0, 0],
        },
        label: {
          show: avgR !== null,
          position: "top",
          formatter: () => formatR(avgR ?? 0),
          color: avgR !== null && avgR >= 0 ? t.profit : t.loss,
          fontFamily: t.monoFont,
          fontSize: 10,
        },
      };
    });

    const nHasLow = buckets.some((b) => b.trades > 0 && b.trades < LOW_SAMPLE_N);

    return {
      grid: { left: 6, right: 8, top: 22, bottom: 2, containLabel: true },
      xAxis: {
        type: "category",
        data: buckets.map((bucket) => bucket.label),
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          interval: 0,
          rotate: buckets.length > 8 ? 30 : 0,
          formatter: showN
            ? (value: string, index: number) => {
                const bucket = buckets[index];
                if (!bucket) return value;
                return bucket.trades === 0
                  ? `{zero|${value}}\n{zero|n=0}`
                  : `{v|${value}}\n{n|n=${bucket.trades}}`;
              }
            : undefined,
          rich: {
            v: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10, lineHeight: 14, align: "center" },
            n: {
              color: nHasLow ? t.warning : t.textMuted,
              fontFamily: t.monoFont,
              fontSize: 9,
              lineHeight: 12,
              align: "center",
              fontWeight: nHasLow ? ("bold" as const) : ("normal" as const),
            },
            zero: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 9, lineHeight: 12, align: "center" },
          },
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`,
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(t.accent, 0.08) } },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const bucket = typed ? buckets[typed.dataIndex] : undefined;
          if (!bucket) return "";
          const winRate = bucket.winRate === null ? "—" : formatPercent(bucket.winRate, 0);
          const avgR = bucket.avgR === null ? "—" : formatR(bucket.avgR);
          const lowNote =
            bucket.trades > 0 && bucket.trades < LOW_SAMPLE_N
              ? `<div style="color:${t.warning};margin-top:2px">Low sample — treat with caution</div>`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${bucket.label}</div>`,
            `<div>Avg ${avgR} · win rate ${winRate} (${bucket.trades} trades)</div>`,
            lowNote,
          ].join("");
        },
      },
      series: [
        {
          type: "bar",
          data,
          barMaxWidth: 34,
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, height, showN, resolvedTheme]);

  return (
    <div className={className} style={{ height }}>
      <EChart
        option={option}
        className="h-full w-full"
        ariaLabel={ariaLabel}
      />
    </div>
  );
}
