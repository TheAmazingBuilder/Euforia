"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { Currency, SleepPoint } from "@cosmoz/shared";
import { formatMoneyCompact, formatSignedMoney } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Sleep × P&L scatter (Phase 9): one dot per day with a logged sleep
 * duration — the body's fingerprint on the ledger. Dots wear the outcome's
 * ink (emerald ahead, carmine behind); the dashed line is break-even, so
 * the eye reads clusters above and below it without any statistics talk.
 */

interface SleepScatterProps {
  points: SleepPoint[];
  currency: Currency;
  className?: string;
}

interface TooltipParam {
  data: { value: [number, number, SleepPoint] };
}

export function SleepScatter({ points, currency, className }: SleepScatterProps) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {

    const data = points.map((point) => {
      const pnl = Number(point.pnlNet);
      return {
        value: [Number(point.sleepHours), pnl, point] as [number, number, SleepPoint],
        itemStyle: {
          color: withAlpha(pnl >= 0 ? t.profit : t.loss, 0.65),
          borderColor: pnl >= 0 ? t.profit : t.loss,
          borderWidth: 1,
        },
      };
    });

    const sleepValues = points.map((point) => Number(point.sleepHours));
    const minSleep = sleepValues.length > 0 ? Math.floor(Math.min(...sleepValues)) - 1 : 0;
    const maxSleep = sleepValues.length > 0 ? Math.ceil(Math.max(...sleepValues)) + 1 : 12;

    return {
      grid: { left: 6, right: 14, top: 16, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "value",
        min: minSleep,
        max: maxSleep,
        name: "sleep (h)",
        nameGap: 6,
        nameTextStyle: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 9, align: "right" },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10, formatter: (value: number) => `${value}h` },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => formatMoneyCompact(value, currency),
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      tooltip: {
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const point = typed?.data.value[2];
          if (!point) return "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${point.date}</div>`,
            `<div>${Number(point.sleepHours).toFixed(1)}h slept · ${formatSignedMoney(point.pnlNet, currency)}</div>`,
            `<div style="color:${t.textMuted};font-size:10px">${point.tradesCount} trade${point.tradesCount === 1 ? "" : "s"}</div>`,
          ].join("");
        },
      },
      series: [
        {
          type: "scatter",
          data,
          symbolSize: 11,
          markLine: {
            silent: true,
            symbol: "none",
            label: {
              show: true,
              position: "insideEndTop",
              formatter: "break-even",
              color: t.textMuted,
              fontFamily: t.monoFont,
              fontSize: 9,
            },
            lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [points, currency, t]);

  return (
    <div className={className}>
      <div style={{ height: 240 }}>
        <EChart
          option={option}
          className="h-full w-full"
          ariaLabel="Scatter of sleep hours versus daily net P&L, dots colored by outcome"
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Each dot is a day with a logged sleep duration. Short nights that precede red clusters
        are a body signal, not a coincidence — treat them like a position size rule.
      </p>
    </div>
  );
}
