"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { PanelHeatmap } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Generic R heatmap with string axes (symbol × session, regime × day…).
 * Same painting rules as the Overview edge map: cell color by average-R
 * sign and magnitude, dashed warning border on low samples, "—" on empty
 * cells, and the bounded-inert visualMap ECharts 6 requires.
 */

/** Magnitude scale ceiling: |avgR| beyond this renders at full intensity. */
const MAX_INTENSITY_R = 1.5;
/** Cells with fewer trades than this are flagged as low sample. */
const LOW_N_THRESHOLD = 10;

interface TooltipParam {
  dataIndex: number;
}

export function PanelHeatmap({ panel }: { panel: PanelHeatmap }) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const meta: { row: number; col: number; avgR: number | null; trades: number }[] = [];
    const data: {
      value: [number, number, number];
      itemStyle: Record<string, unknown>;
      label: Record<string, unknown>;
    }[] = [];

    panel.rows.forEach((_, row) => {
      panel.columns.forEach((_, col) => {
        const cell =
          panel.cells.find((c) => c.row === row && c.col === col) ?? null;
        const trades = cell?.trades ?? 0;
        const avgR = cell?.avgR === null || cell?.avgR === undefined ? null : Number(cell.avgR);
        const lowN = trades > 0 && trades < LOW_N_THRESHOLD;

        const baseColor =
          avgR === null || trades === 0
            ? withAlpha(t.textMuted, 0.06)
            : withAlpha(
                avgR >= 0 ? t.profit : t.loss,
                0.16 + 0.7 * Math.min(1, Math.abs(avgR) / MAX_INTENSITY_R),
              );

        data.push({
          value: [col, row, avgR ?? 0],
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
        meta.push({ row, col, avgR, trades });
      });
    });

    return {
      grid: { left: 8, right: 10, top: 8, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "category",
        data: panel.columns,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          rotate: panel.columns.some((c) => c.length > 6) ? 20 : 0,
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: panel.rows,
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
          const raw = typed ? meta[typed.dataIndex] : undefined;
          if (!raw || raw.trades === 0) return "No trades in this pocket";
          const rowLabel = panel.rows[raw.row] ?? "";
          const colLabel = panel.columns[raw.col] ?? "";
          const rText = raw.avgR === null ? "—" : formatR(raw.avgR);
          const lowNote =
            raw.trades < LOW_N_THRESHOLD
              ? `<div style="color:${t.warning};margin-top:2px">Low sample — treat with caution</div>`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${rowLabel} · ${colLabel}</div>`,
            `<div>Avg ${rText} · ${raw.trades} trades</div>`,
            lowNote,
          ].join("");
        },
      },
      // ECharts 6 requires a visualMap on heatmap series; bounded + hidden
      // keeps it inert so the per-cell itemStyle paints (see RHeatmap).
      visualMap: {
        show: false,
        min: -MAX_INTENSITY_R,
        max: MAX_INTENSITY_R,
        calculable: false,
        inRange: { color: [t.textMuted, t.textMuted] },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: true },
          emphasis: { itemStyle: { borderColor: t.accent, borderWidth: 1.5 } },
        },
      ],
    };
  }, [panel, t]);

  return (
    <div className="min-w-[560px]">
      <EChart option={option} className="h-[320px] w-full" ariaLabel={panel.ariaLabel} />
    </div>
  );
}
