"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { ApexOptions } from "apexcharts";
import type ApexChartsType from "apexcharts";
import type { SymbolHistoryResponse } from "@cosmoz/shared";
import { formatMoneyCompact, formatSignedMoney } from "@cosmoz/shared";

import { getChartTheme } from "@/lib/utils/chart-theme";

/**
 * Symbol history (ApexCharts) — the last closed trades on THIS symbol, one
 * bar per trade, colored by outcome. ApexCharts is dynamically imported so
 * its bundle is only paid for when the chart panel renders.
 */
export function SymbolHistoryChart({ data }: { data: SymbolHistoryResponse }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    let cancelled = false;
    let chart: ApexChartsType | null = null;

    void import("apexcharts").then((module) => {
      if (cancelled || !containerRef.current) return;
      const ApexCharts = module.default;
      const theme = getChartTheme();
      const trades = data.trades;

      const options: ApexOptions = {
        chart: {
          type: "bar",
          height: "100%",
          background: "transparent",
          toolbar: { show: false },
          animations: { enabled: false },
          fontFamily: theme.monoFont,
          zoom: { enabled: false },
        },
        series: [
          {
            name: "Net P&L",
            data: trades.map((trade) => ({
              x: new Date(trade.entryAt).toISOString().slice(5, 10),
              y: Math.round(trade.pnlNet * 100) / 100,
              fillColor: trade.pnlNet >= 0 ? theme.profit : theme.loss,
            })),
          },
        ],
        plotOptions: { bar: { columnWidth: "62%", borderRadius: 2 } },
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: {
          borderColor: theme.border,
          yaxis: { lines: { show: true } },
          xaxis: { lines: { show: false } },
          padding: { left: 4, right: 4, top: 0 },
        },
        annotations: {
          yaxis: [
            {
              y: 0,
              strokeDashArray: 3,
              borderColor: theme.border,
            },
          ],
        },
        xaxis: {
          axisBorder: { show: false },
          axisTicks: { show: false },
          labels: {
            style: { colors: theme.textMuted, fontSize: "9px", fontFamily: theme.monoFont },
            rotate: 0,
            hideOverlappingLabels: true,
          },
          tooltip: { enabled: false },
        },
        yaxis: {
          labels: {
            style: { colors: theme.textMuted, fontSize: "9px", fontFamily: theme.monoFont },
            formatter: (value: number) => formatMoneyCompact(String(value), "USD"),
          },
        },
        tooltip: {
          theme: resolvedTheme === "light" ? "light" : "dark",
          custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
            const trade = trades[dataPointIndex];
            if (!trade) return "";
            const r = trade.rMultiple === null ? "—" : `${trade.rMultiple > 0 ? "+" : ""}${trade.rMultiple.toFixed(2)}R`;
            return [
              `<div style="padding:6px 8px;font-family:${theme.monoFont};font-size:11px">`,
              `<b>${data.symbol}</b> · ${trade.direction}`,
              "<br/>",
              formatSignedMoney(String(trade.pnlNet), "USD", { digits: 2 }),
              ` · ${r}`,
              "<br/>",
              `<span style="opacity:.7">${new Date(trade.entryAt).toISOString().slice(0, 10)}</span>`,
              "</div>",
            ].join("");
          },
        },
      };

      chart = new ApexCharts(containerRef.current, options);
      void chart.render();
    });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [data, resolvedTheme, data.symbol]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Net P&L of the last closed ${data.symbol} trades`}
      className="h-28 w-full"
      data-testid="symbol-history-chart"
    />
  );
}
