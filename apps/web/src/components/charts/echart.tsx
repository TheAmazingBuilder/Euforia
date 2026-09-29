"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, CandlestickChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";

// Tree-shaken registration — line (equity/sparklines), bar (time buckets,
// histograms), scatter (sleep/tilt), heatmap (Overview grid) and candlestick
// (Session Live price chart) + the components those series consume.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  CandlestickChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  CanvasRenderer,
]);

/**
 * Factory for chart instances OUTSIDE the React bridge (Session Live price
 * chart manages its own lifecycle: merge-mode setOption per tick keeps the
 * user's zoom, which the bridge's notMerge:true would reset). All runtime
 * echarts usage in the app stays funneled through THIS module — one shared
 * echarts/zrender instance with every needed piece registered above;
 * a second runtime copy would throw "Renderer 'undefined' is not imported".
 */
export function createChartInstance(container: HTMLElement): echarts.ECharts {
  return echarts.init(container);
}

interface EChartProps {
  option: EChartsCoreOption;
  className?: string;
  ariaLabel: string;
}

/**
 * Minimal ECharts bridge for React: init, ResizeObserver-driven resize,
 * dispose, and a FULL re-init whenever useTheme().resolvedTheme changes so
 * canvas pixels always match the active tokens (design-tokens.md §8).
 * Options must be rebuilt with fresh getChartTheme() values on the same
 * dependency — see components/dashboard/*.
 */
export function EChart({ option, className, ariaLabel }: EChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Re-create the canvas on theme switch (dispose + init with fresh tokens).
  }, [resolvedTheme]);

  React.useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
    />
  );
}
