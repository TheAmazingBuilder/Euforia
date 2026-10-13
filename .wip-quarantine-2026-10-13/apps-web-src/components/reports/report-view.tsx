"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  FileText,
  RotateCcw,
  Table2,
} from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";
import type { PeriodReportResponse, ReportGranularity, Trade } from "@cosmoz/shared";
import {
  formatMoneyCompact,
  formatPercent,
  formatR,
  formatSignedMoney,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/charts/echart";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import { useInstruments, useStrategies, useTrades, usePeriodReport } from "@/lib/api/queries";
import { getNavItem } from "@/lib/navigation";
import { downloadPdf, rasterizeBrandMark } from "@/lib/pdf/journal-pdf";
import { buildReportPdfInput, toPdfTrade } from "@/lib/pdf/export-inputs";
import {
  buildReportCsv,
  buildReportMarkdown,
  downloadTextFile,
  type ReportExportInput,
  type ReportExportTrade,
} from "@/lib/reports-export";
import { cn } from "@/lib/utils";

const nav = getNavItem("/reports");

type DirectionFilter = "all" | "BUY" | "SELL";
type OutcomeFilter = "all" | "win" | "loss";

/**
 * Premium period report — week, month or quarter from one server contract
 * (GET /stats/report): totals, comparison vs the previous period, equity
 * curve, R distribution, pro metrics and rollups are ALL server-computed.
 * The client only picks the granularity + an anchor day, filters the trade
 * log locally (labeled as such) and exports exactly what is on screen.
 */

const GRANULARITIES: { value: ReportGranularity; label: string; title: string; current: string }[] = [
  { value: "week", label: "Week", title: "Weekly report", current: "This week" },
  { value: "month", label: "Month", title: "Monthly report", current: "This month" },
  { value: "quarter", label: "Quarter", title: "Quarterly report", current: "This quarter" },
];

// ── Date math (UTC-anchored, mirrors the store) ──────────────────────────────

function addDaysKey(key: string, days: number): string {
  const shifted = new Date(`${key}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function addMonthsKey(monthStartKey: string, delta: number): string {
  const [year, month] = monthStartKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** Anchor of the adjacent period (same granularity, ±1 step). */
function shiftPeriod(granularity: ReportGranularity, periodStart: string, delta: number): string {
  if (granularity === "week") return addDaysKey(periodStart, delta * 7);
  if (granularity === "month") return addMonthsKey(periodStart, delta);
  return addMonthsKey(periodStart, delta * 3);
}

const MONTH_LONG = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_FMT_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Sep 15 – Sep 21, 2025" · "September 2025" · "Q3 2025 · Jul – Sep". */
function periodLabelOf(granularity: ReportGranularity, periodStart: string, periodEnd: string): string {
  if (granularity === "month") return MONTH_LONG.format(new Date(`${periodStart}T00:00:00Z`));
  if (granularity === "quarter") {
    const quarter = Math.floor((Number(periodStart.slice(5, 7)) - 1) / 3) + 1;
    return `Q${quarter} ${periodStart.slice(0, 4)} · ${MONTH_SHORT.format(new Date(`${periodStart}T00:00:00Z`))} – ${MONTH_SHORT.format(new Date(`${periodEnd}T00:00:00Z`))}`;
  }
  const from = DAY_FMT.format(new Date(`${periodStart}T00:00:00Z`));
  const to = DAY_FMT_YEAR.format(new Date(`${periodEnd}T00:00:00Z`));
  return `${from} – ${to}`;
}

/** "vs Sep 8 – Sep 14" · "vs August 2025" · "vs Q2 2025". */
function comparisonLabelOf(granularity: ReportGranularity, start: string, end: string): string {
  if (granularity === "month") return `vs ${MONTH_LONG.format(new Date(`${start}T00:00:00Z`))}`;
  if (granularity === "quarter") {
    const quarter = Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1;
    return `vs Q${quarter} ${start.slice(0, 4)}`;
  }
  return `vs ${DAY_FMT.format(new Date(`${start}T00:00:00Z`))} – ${DAY_FMT.format(new Date(`${end}T00:00:00Z`))}`;
}

function sliceLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function DeltaBadge({
  delta,
  format,
  goodWhenUp = true,
  neutral = false,
  testId,
}: {
  delta: number | null;
  format: (value: number) => string;
  goodWhenUp?: boolean;
  neutral?: boolean;
  testId?: string;
}) {
  if (delta === null) return null;
  const flat = Math.abs(delta) < 1e-9;
  const good = neutral || flat ? null : goodWhenUp ? delta > 0 : delta < 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
        good === null
          ? "border-border bg-surface-raised text-muted-foreground"
          : good
            ? "border-profit/40 bg-profit/10 text-profit"
            : "border-loss/40 bg-loss/10 text-loss",
      )}
    >
      {!flat && !neutral ? <Icon className="size-3" aria-hidden="true" /> : null}
      {format(Math.abs(delta))}
    </span>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
  delta,
  deltaFormat,
  deltaGoodWhenUp,
  deltaNeutral,
  testId,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral";
  delta?: number | null;
  deltaFormat?: (value: number) => string;
  deltaGoodWhenUp?: boolean;
  deltaNeutral?: boolean;
  testId?: string;
}) {
  return (
    <div className="min-w-0 space-y-1" data-testid={testId}>
      <p className="ledger-label">{label}</p>
      <p
        className={cn(
          "truncate font-mono text-lg font-semibold tabular-nums sm:text-xl",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {delta !== undefined && deltaFormat ? (
        <DeltaBadge
          delta={delta}
          format={deltaFormat}
          goodWhenUp={deltaGoodWhenUp}
          neutral={deltaNeutral}
        />
      ) : null}
    </div>
  );
}

function SpotCard({
  title,
  symbol,
  date,
  pnl,
  r,
  currency,
}: {
  title: string;
  symbol: string | null;
  date: string | null;
  pnl: string | null;
  r: string | null;
  currency: PeriodReportResponse["currency"];
}) {
  const positive = pnl !== null && Number(pnl) >= 0;
  return (
    <Card className="bg-surface">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="font-heading text-sm font-semibold">{title}</CardTitle>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
            pnl === null
              ? "border-border bg-surface-raised text-muted-foreground"
              : positive
                ? "border-profit/40 bg-profit/10 text-profit"
                : "border-loss/40 bg-loss/10 text-loss",
          )}
        >
          {pnl === null ? "—" : formatSignedMoney(pnl, currency)}
        </span>
      </CardHeader>
      <CardContent className="space-y-1">
        {symbol === null ? (
          <p className="text-sm text-muted-foreground">No trade to report.</p>
        ) : (
          <>
            <p className="font-mono text-base font-semibold text-foreground">{symbol}</p>
            <p className="text-xs text-muted-foreground">
              {date === null ? "" : DAY_FMT_YEAR.format(new Date(`${date}T00:00:00Z`))}
              {r !== null ? ` · ${formatR(r)}` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Side row of the long/short card — count, win rate, R, net P&L. */
function SideRow({
  label,
  row,
  currency,
  maxAbsPnl,
}: {
  label: string;
  row: PeriodReportResponse["long"];
  currency: PeriodReportResponse["currency"];
  maxAbsPnl: number;
}) {
  const pnl = Number(row.netPnl);
  const width = maxAbsPnl > 0 ? Math.min(100, (Math.abs(pnl) / maxAbsPnl) * 100) : 0;
  return (
    <div className="space-y-1.5" data-testid={`report-side-${label.toLowerCase()}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-heading text-sm font-semibold text-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            pnl >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedMoney(row.netPnl, currency)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", pnl >= 0 ? "bg-profit" : "bg-loss")}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {row.tradesCount} trade{row.tradesCount === 1 ? "" : "s"} ·{" "}
        {row.winRate === null ? "no close" : formatPercent(row.winRate)} win ·{" "}
        {formatR(row.rEarned)}
      </p>
    </div>
  );
}

export function PeriodReportView() {
  // Period selection — the client picks granularity + anchor, nothing else.
  const [granularity, setGranularity] = React.useState<ReportGranularity>("week");
  const [anchor, setAnchor] = React.useState<string | undefined>(undefined);
  const { data: report, isPending, isError } = usePeriodReport(granularity, anchor);
  const { resolvedTheme } = useTheme();

  // Trade log + filters (client-side, clearly labeled as a filtered view).
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const [instrumentFilter, setInstrumentFilter] = React.useState<string>("all");
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = React.useState<OutcomeFilter>("all");
  const [strategyFilter, setStrategyFilter] = React.useState<string>("all");
  const [exporting, setExporting] = React.useState(false);

  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const strategies = React.useMemo(() => strategiesData?.strategies ?? [], [strategiesData]);
  const symbolOf = React.useCallback(
    (trade: Trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "—",
    [instruments],
  );
  const strategyNameOf = React.useCallback(
    (strategyId: string | null) =>
      strategyId ? strategies.find((strategy) => strategy.id === strategyId)?.name ?? null : null,
    [strategies],
  );

  const periodStart = report?.periodStart ?? "";
  const periodEnd = report?.periodEnd ?? "";
  const currency = report?.currency ?? "USD";
  const isCurrent = report?.isCurrent ?? true;
  const granularityMeta = GRANULARITIES.find((item) => item.value === granularity)!;

  const periodLabel = React.useMemo(
    () =>
      report
        ? periodLabelOf(report.granularity, report.periodStart, report.periodEnd)
        : "",
    [report],
  );
  const comparisonNote = React.useMemo(
    () =>
      report
        ? comparisonLabelOf(
            report.granularity,
            report.comparison.periodStart,
            report.comparison.periodEnd,
          )
        : null,
    [report],
  );

  /** The period's closed trades (the report only aggregates CLOSED results). */
  const periodTrades = React.useMemo(() => {
    const all = tradesData?.trades ?? [];
    if (!periodStart || !periodEnd) return [];
    return all
      .filter(
        (trade) =>
          trade.status === "CLOSED" && trade.tradingDate >= periodStart && trade.tradingDate <= periodEnd,
      )
      .sort((a, b) => (a.tradingDate < b.tradingDate ? 1 : a.tradingDate > b.tradingDate ? -1 : 0));
  }, [tradesData, periodStart, periodEnd]);

  const filteredTrades = React.useMemo(
    () =>
      periodTrades.filter((trade) => {
        if (instrumentFilter !== "all" && symbolOf(trade) !== instrumentFilter) return false;
        if (directionFilter !== "all" && trade.direction !== directionFilter) return false;
        const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
        if (outcomeFilter === "win" && pnl < 0) return false;
        if (outcomeFilter === "loss" && pnl >= 0) return false;
        const name = strategyNameOf(trade.strategyId);
        if (strategyFilter === "out" && name !== null) return false;
        if (strategyFilter !== "all" && strategyFilter !== "out" && name !== strategyFilter) return false;
        return true;
      }),
    [periodTrades, instrumentFilter, directionFilter, outcomeFilter, strategyFilter, symbolOf, strategyNameOf],
  );

  const isFiltered =
    instrumentFilter !== "all" ||
    directionFilter !== "all" ||
    outcomeFilter !== "all" ||
    strategyFilter !== "all";

  const filterNote = React.useMemo(() => {
    if (!isFiltered) return null;
    const parts: string[] = [];
    if (instrumentFilter !== "all") parts.push(instrumentFilter);
    if (directionFilter !== "all") parts.push(directionFilter === "BUY" ? "Long only" : "Short only");
    if (outcomeFilter !== "all") parts.push(outcomeFilter === "win" ? "Wins" : "Losses");
    if (strategyFilter === "out") parts.push("Out of playbook");
    else if (strategyFilter !== "all") parts.push(strategyFilter);
    return parts.join(" · ");
  }, [isFiltered, instrumentFilter, directionFilter, outcomeFilter, strategyFilter]);

  /** Honest client-side rollup of the FILTERED subset. */
  const filteredStats = React.useMemo(() => {
    let netPnl = 0;
    let wins = 0;
    let totalR = 0;
    let rCount = 0;
    const bySymbol = new Map<string, { tradesCount: number; netPnl: number }>();
    const byStrategy = new Map<string, { tradesCount: number; netPnl: number }>();
    const sides = { long: { tradesCount: 0, netPnl: 0, wins: 0, r: 0 }, short: { tradesCount: 0, netPnl: 0, wins: 0, r: 0 } };
    for (const trade of filteredTrades) {
      const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
      netPnl += pnl;
      if (pnl >= 0) wins += 1;
      if (trade.rMultiple !== null) {
        totalR += Number(trade.rMultiple);
        rCount += 1;
      }
      const symbol = symbolOf(trade);
      const symbolBucket = bySymbol.get(symbol) ?? { tradesCount: 0, netPnl: 0 };
      symbolBucket.tradesCount += 1;
      symbolBucket.netPnl += pnl;
      bySymbol.set(symbol, symbolBucket);
      const strategyKey = strategyNameOf(trade.strategyId) ?? "Out of playbook";
      const strategyBucket = byStrategy.get(strategyKey) ?? { tradesCount: 0, netPnl: 0 };
      strategyBucket.tradesCount += 1;
      strategyBucket.netPnl += pnl;
      byStrategy.set(strategyKey, strategyBucket);
      const side = trade.direction === "BUY" ? sides.long : sides.short;
      side.tradesCount += 1;
      side.netPnl += pnl;
      if (pnl >= 0) side.wins += 1;
      if (trade.rMultiple !== null) side.r += Number(trade.rMultiple);
    }
    return {
      count: filteredTrades.length,
      netPnl,
      winRate: filteredTrades.length > 0 ? wins / filteredTrades.length : null,
      rEarned: rCount > 0 ? totalR : null,
      byInstrument: [...bySymbol.entries()]
        .map(([symbol, row]) => ({ symbol, ...row }))
        .sort((a, b) => b.netPnl - a.netPnl),
      byStrategy: [...byStrategy.entries()]
        .map(([name, row]) => ({ name, ...row }))
        .sort((a, b) => b.netPnl - a.netPnl),
      longShort: [
        { side: "Long", ...sides.long },
        { side: "Short", ...sides.short },
      ]
        .filter((row) => row.tradesCount > 0)
        .map((row) => ({
          side: row.side,
          tradesCount: row.tradesCount,
          netPnl: row.netPnl,
          winRate: row.tradesCount > 0 ? row.wins / row.tradesCount : null,
          rEarned: row.r,
        })),
    };
  }, [filteredTrades, symbolOf, strategyNameOf]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  // ── Equity curve — cumulative net P&L inside the period ──
  const equityOption = React.useMemo<EChartsCoreOption>(() => {
    if (!report) return {};
    const values = report.points.map((point) => Number(point.equity));
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const pad = Math.max((max - min) * 0.08, 1);
    const ink = (values[values.length - 1] ?? 0) >= 0 ? theme.profit : theme.loss;

    return {
      grid: { left: 8, right: 34, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { dataIndex: number }[];
          const point = report.points[typed?.[0]?.dataIndex ?? -1];
          if (!point) return "";
          return [
            sliceLabel(point.date),
            `<b>${formatSignedMoney(point.equity, report.currency)} cumulative</b>`,
            `${formatSignedMoney(point.pnlNet, report.currency)} · ${point.tradesCount} trade${point.tradesCount === 1 ? "" : "s"}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: report.points.map((point) => point.label),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont },
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
          formatter: (value: number) => formatMoneyCompact(value, report.currency),
        },
      },
      series: [
        {
          id: "report-equity",
          type: "line",
          data: values,
          symbol: "none",
          lineStyle: { color: ink, width: 2 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(ink, 0.26) },
              { offset: 1, color: withAlpha(ink, 0.02) },
            ]),
          },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: theme.border, type: "dashed", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [report, theme]);

  // ── R distribution histogram ──
  const rOption = React.useMemo<EChartsCoreOption>(() => {
    if (!report) return {};
    return {
      grid: { left: 8, right: 12, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(theme.textPrimary, 0.06) } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { dataIndex: number }[];
          const bucket = report.rBuckets[typed?.[0]?.dataIndex ?? -1];
          if (!bucket) return "";
          return `<b>${bucket.count}</b> trade${bucket.count === 1 ? "" : "s"} · ${bucket.label}`;
        },
      },
      xAxis: {
        type: "category",
        data: report.rBuckets.map((bucket) => bucket.label),
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 9,
          fontFamily: theme.monoFont,
          interval: 0,
          rotate: 38,
        },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont },
      },
      series: [
        {
          id: "report-r-dist",
          type: "bar",
          data: report.rBuckets.map((bucket) => ({
            value: bucket.count,
            itemStyle: {
              color: bucket.negative ? theme.loss : theme.profit,
              opacity: bucket.count === 0 ? 0.22 : 1,
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barMaxWidth: 22,
        },
      ],
    };
  }, [report, theme]);

  // ── Pro metric lines (full-period facts — exports carry them unfiltered only) ──
  const proMetricLines = React.useMemo(() => {
    if (!report) return [];
    const metrics = report.proMetrics;
    const lines = [
      { label: "Profit factor", value: metrics.profitFactor === null ? (report.totals.tradesCount > 0 ? "∞ (no losing trade)" : "—") : `${Number(metrics.profitFactor).toFixed(2)}` },
      { label: "Expectancy", value: metrics.expectancyR === null ? "—" : formatR(metrics.expectancyR) },
      { label: "Average win", value: metrics.avgWin === null ? "—" : formatSignedMoney(metrics.avgWin, report.currency) },
      { label: "Average loss", value: metrics.avgLoss === null ? "—" : `-${formatSignedMoney(metrics.avgLoss, report.currency).replace("-", "")}` },
      { label: "Max drawdown (equity)", value: Number(metrics.maxDrawdown) > 0 ? formatSignedMoney(-Number(metrics.maxDrawdown), report.currency) : "—" },
      { label: "Longest win streak", value: `${metrics.longestWinStreak} trade${metrics.longestWinStreak === 1 ? "" : "s"}` },
      { label: "Longest loss streak", value: `${metrics.longestLossStreak} trade${metrics.longestLossStreak === 1 ? "" : "s"}` },
      { label: "Biggest win", value: metrics.biggestWin === null ? "—" : `+${formatSignedMoney(metrics.biggestWin, report.currency).replace("-", "")}` },
      { label: "Biggest loss", value: metrics.biggestLoss === null ? "—" : `-${formatSignedMoney(metrics.biggestLoss, report.currency).replace("-", "")}` },
    ];
    return lines;
  }, [report]);

  // ── Exports — mirror the filtered trade log; full-period facts labeled ──
  const exportInput = React.useMemo<ReportExportInput>(() => {
    const trades: ReportExportTrade[] = filteredTrades.map((trade) => ({
      tradingDate: trade.tradingDate,
      symbol: symbolOf(trade),
      direction: trade.direction,
      strategyName: strategyNameOf(trade.strategyId),
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      quantity: trade.quantity,
      rMultiple: trade.rMultiple,
      pnlNet: trade.pnlNet,
      decisionGrade: trade.decisionGrade,
      notes: trade.notes,
    }));
    return {
      currency,
      reportTitle: granularityMeta.title,
      periodLabel,
      comparisonNote: comparisonNote === null ? null : `${comparisonNote} (full-period server data)`,
      filterNote,
      summary: {
        tradesCount: filteredStats.count,
        netPnl: formatSignedMoney(filteredStats.netPnl, currency),
        winRate: filteredStats.winRate,
        rEarned: filteredStats.rEarned,
      },
      proMetrics: isFiltered ? [] : proMetricLines,
      byInstrument: filteredStats.byInstrument,
      byStrategy: filteredStats.byStrategy,
      longShort: filteredStats.longShort.map((row) => ({
        side: row.side,
        tradesCount: row.tradesCount,
        netPnl: row.netPnl,
        winRate: row.winRate,
      })),
      insights: (report?.insights ?? []).map((insight) => insight.text),
      trades,
    };
  }, [filteredTrades, filteredStats, currency, granularityMeta.title, periodLabel, comparisonNote, filterNote, isFiltered, proMetricLines, report, symbolOf, strategyNameOf]);

  const exportFileName = React.useMemo(() => {
    const range = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return filterNote !== null ? `cosmoz-report-${range}-filtered` : `cosmoz-report-${range}`;
  }, [periodLabel, filterNote]);

  const onExportPdf = async () => {
    setExporting(true);
    try {
      const logoDataUrl = await rasterizeBrandMark().catch(() => undefined);
      const summaryItems = isFiltered
        ? [
            { label: "Net P&L", value: formatSignedMoney(filteredStats.netPnl, currency), tone: (filteredStats.netPnl >= 0 ? "profit" : "loss") as "profit" | "loss" },
            { label: "Trades", value: String(filteredStats.count), tone: "neutral" as const },
            { label: "Win rate", value: filteredStats.winRate === null ? "—" : formatPercent(filteredStats.winRate), tone: "neutral" as const },
            { label: "R earned", value: filteredStats.rEarned === null ? "—" : formatR(filteredStats.rEarned), tone: "neutral" as const },
          ]
        : [
            { label: "Net P&L", value: formatSignedMoney(Number(report?.totals.netPnl ?? 0), currency), tone: (Number(report?.totals.netPnl ?? 0) >= 0 ? "profit" : "loss") as "profit" | "loss" },
            { label: "Trades", value: String(report?.totals.tradesCount ?? 0), tone: "neutral" as const },
            { label: "Win rate", value: report && report.totals.tradesCount > 0 ? formatPercent(Number(report.totals.winRate)) : "—", tone: "neutral" as const },
            { label: "R earned", value: report ? formatR(report.totals.rEarned) : "—", tone: "neutral" as const },
            { label: "Profit factor", value: proMetricLines.find((line) => line.label === "Profit factor")?.value ?? "—", tone: "neutral" as const },
            { label: "Expectancy", value: proMetricLines.find((line) => line.label === "Expectancy")?.value ?? "—", tone: "neutral" as const },
            { label: "Max drawdown", value: proMetricLines.find((line) => line.label === "Max drawdown (equity)")?.value ?? "—", tone: "neutral" as const },
          ];
      await downloadPdf(
        buildReportPdfInput({
          trades: filteredTrades.map((trade) => toPdfTrade(trade, symbolOf, strategyNameOf)),
          currency,
          reportTitle: granularityMeta.title,
          periodLabel,
          filterNote,
          comparison: isFiltered ? null : comparisonNote,
          summaryItems,
          logoDataUrl,
        }),
      );
      toast.success(`PDF exported — ${exportFileName}.pdf`);
    } catch {
      toast.error("PDF export failed — try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  const onExportMarkdown = () => {
    try {
      downloadTextFile(buildReportMarkdown(exportInput), `${exportFileName}.md`, "text/markdown");
      toast.success(`Markdown exported — ${exportFileName}.md`);
    } catch {
      toast.error("Markdown export failed.");
    }
  };

  const onExportCsv = () => {
    try {
      downloadTextFile(buildReportCsv(exportInput), `${exportFileName}.csv`, "text/csv");
      toast.success(`CSV exported — ${exportFileName}.csv`);
    } catch {
      toast.error("CSV export failed.");
    }
  };

  const resetFilters = () => {
    setInstrumentFilter("all");
    setDirectionFilter("all");
    setOutcomeFilter("all");
    setStrategyFilter("all");
  };

  /** Instrument / strategy options present in the period's trades (no empty menus). */
  const periodSymbols = React.useMemo(
    () => [...new Set(periodTrades.map((trade) => symbolOf(trade)))].sort(),
    [periodTrades, symbolOf],
  );
  const periodStrategyNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const trade of periodTrades) {
      const name = strategyNameOf(trade.strategyId);
      if (name !== null) names.add(name);
    }
    return [...names].sort();
  }, [periodTrades, strategyNameOf]);

  // ── Deltas vs the previous period (server comparison) ──
  const deltas = React.useMemo(() => {
    if (!report) return null;
    const prevWinRate = report.comparison.winRate === null ? null : Number(report.comparison.winRate);
    const curWinRate = report.totals.tradesCount > 0 ? Number(report.totals.winRate) : null;
    return {
      netPnl: Number(report.totals.netPnl) - Number(report.comparison.netPnl),
      trades: report.totals.tradesCount - report.comparison.tradesCount,
      winRate: curWinRate !== null && prevWinRate !== null ? (curWinRate - prevWinRate) * 100 : null,
      rEarned: Number(report.totals.rEarned) - Number(report.comparison.rEarned),
    };
  }, [report]);

  const maxSideAbsPnl = React.useMemo(() => {
    if (!report) return 0;
    return Math.max(Math.abs(Number(report.long.netPnl)), Math.abs(Number(report.short.netPnl)), 1);
  }, [report]);

  const generatedStamp = React.useMemo(() => {
    if (!report) return null;
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(report.generatedAt));
  }, [report]);

  return (
    <div className="space-y-6" data-testid="report-view">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {nav.label}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
        </div>
        {generatedStamp !== null ? (
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="report-generated">
            Generated {generatedStamp}
          </p>
        ) : null}
      </header>

      {/* Controls — granularity tabs + export */}
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="report-controls">
        <div
          role="tablist"
          aria-label="Report period"
          className="flex w-fit overflow-hidden rounded-lg border border-border bg-surface"
          data-testid="report-tabs"
        >
          {GRANULARITIES.map((item) => {
            const active = granularity === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setGranularity(item.value);
                  setAnchor(undefined);
                  resetFilters();
                }}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`report-tab-${item.value}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={isPending || exporting || !report} data-testid="report-export">
              <Download className="size-3.5" aria-hidden="true" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              {filterNote !== null ? `Filtered: ${filterNote}` : "Full period"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onExportPdf()} data-testid="report-export-pdf">
              <FileText className="size-4" aria-hidden="true" />
              PDF — print-ready
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportMarkdown} data-testid="report-export-md">
              <FileCode2 className="size-4" aria-hidden="true" />
              Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportCsv} data-testid="report-export-csv">
              <Table2 className="size-4" aria-hidden="true" />
              CSV — spreadsheet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isError ? (
        <Card className="bg-surface">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            The report could not be loaded. Try again in a moment.
          </CardContent>
        </Card>
      ) : isPending || !report ? (
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-56 w-full sm:h-64" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-32 lg:col-span-2" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* Period navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2" data-testid="report-period-nav">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous period"
                data-testid="report-prev"
                onClick={() => setAnchor(shiftPeriod(granularity, report.periodStart, -1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next period"
                data-testid="report-next"
                disabled={isCurrent}
                onClick={() => setAnchor(shiftPeriod(granularity, report.periodStart, 1))}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <span className="flex flex-wrap items-center gap-2" data-testid="report-period-label">
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {periodLabel}
                </span>
                {isCurrent ? (
                  <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    {granularityMeta.current}
                  </span>
                ) : null}
              </span>
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="report-comparison-note">
              {comparisonNote} · prev period {formatSignedMoney(report.comparison.netPnl, currency)}
            </p>
          </div>

          {/* KPI band with period-over-period deltas */}
          <section
            aria-label="Period KPIs"
            className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:grid-cols-3 lg:grid-cols-5"
            data-testid="report-kpis"
          >
            <Kpi
              label="Net P&L"
              value={formatSignedMoney(report.totals.netPnl, currency)}
              tone={Number(report.totals.netPnl) >= 0 ? "profit" : "loss"}
              delta={deltas?.netPnl ?? null}
              deltaFormat={(value) => formatSignedMoney(value, currency)}
              deltaGoodWhenUp
              testId="kpi-net-pnl"
            />
            <Kpi
              label="Trades"
              value={String(report.totals.tradesCount)}
              delta={deltas?.trades ?? null}
              deltaFormat={(value) => `${value > 0 ? "+" : ""}${value}`}
              deltaNeutral
              testId="kpi-trades"
            />
            <Kpi
              label="Win rate"
              value={report.totals.tradesCount > 0 ? formatPercent(report.totals.winRate) : "—"}
              delta={deltas?.winRate ?? null}
              deltaFormat={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`}
              deltaGoodWhenUp
              testId="kpi-win-rate"
            />
            <Kpi
              label="R earned"
              value={formatR(report.totals.rEarned)}
              delta={deltas?.rEarned ?? null}
              deltaFormat={(value) => formatR(value)}
              deltaGoodWhenUp
              testId="kpi-r-earned"
            />
            <Kpi
              label="Discipline avg"
              value={
                report.totals.disciplineAvg === null
                  ? "—"
                  : `${Math.round(Number(report.totals.disciplineAvg))}/100`
              }
              testId="kpi-discipline"
            />
          </section>

          {/* Equity curve + R distribution */}
          <div className="grid gap-4 lg:grid-cols-3" data-testid="report-charts">
            <Card className="bg-surface lg:col-span-2" data-testid="report-equity">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-heading text-base font-semibold">Equity curve</CardTitle>
                  <CardDescription className="text-xs">
                    Cumulative net P&amp;L inside the period — {granularity === "quarter" ? "weekly buckets" : "trading days"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <EChart
                  option={equityOption}
                  className="h-56 w-full sm:h-64"
                  ariaLabel="Equity curve for the selected period"
                />
              </CardContent>
            </Card>
            <Card className="bg-surface" data-testid="report-r-dist">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-heading text-base font-semibold">R distribution</CardTitle>
                  <CardDescription className="text-xs">Where the results cluster</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <EChart
                  option={rOption}
                  className="h-56 w-full sm:h-64"
                  ariaLabel="R-multiple distribution for the selected period"
                />
              </CardContent>
            </Card>
          </div>

          {/* Pro metrics — the numbers professionals ask for first */}
          <section
            aria-label="Pro metrics"
            className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:grid-cols-4 lg:grid-cols-8"
            data-testid="report-pro-metrics"
          >
            <Kpi
              label="Profit factor"
              value={report.proMetrics.profitFactor === null ? (report.totals.tradesCount > 0 ? "∞" : "—") : Number(report.proMetrics.profitFactor).toFixed(2)}
              tone={report.proMetrics.profitFactor === null ? "neutral" : Number(report.proMetrics.profitFactor) >= 1 ? "profit" : "loss"}
              testId="metric-profit-factor"
            />
            <Kpi
              label="Expectancy"
              value={report.proMetrics.expectancyR === null ? "—" : formatR(report.proMetrics.expectancyR)}
              tone={report.proMetrics.expectancyR === null ? "neutral" : Number(report.proMetrics.expectancyR) >= 0 ? "profit" : "loss"}
              testId="metric-expectancy"
            />
            <Kpi
              label="Avg win"
              value={report.proMetrics.avgWin === null ? "—" : formatSignedMoney(report.proMetrics.avgWin, currency)}
              tone="profit"
              testId="metric-avg-win"
            />
            <Kpi
              label="Avg loss"
              value={report.proMetrics.avgLoss === null ? "—" : `-${formatSignedMoney(report.proMetrics.avgLoss, currency).replace("-", "")}`}
              tone="loss"
              testId="metric-avg-loss"
            />
            <Kpi
              label="Max drawdown"
              value={Number(report.proMetrics.maxDrawdown) > 0 ? formatSignedMoney(-Number(report.proMetrics.maxDrawdown), currency) : "—"}
              tone={Number(report.proMetrics.maxDrawdown) > 0 ? "loss" : "neutral"}
              testId="metric-max-dd"
            />
            <Kpi
              label="Streaks W / L"
              value={`${report.proMetrics.longestWinStreak} / ${report.proMetrics.longestLossStreak}`}
              testId="metric-streaks"
            />
            <Kpi
              label="Biggest win"
              value={report.proMetrics.biggestWin === null ? "—" : `+${formatSignedMoney(report.proMetrics.biggestWin, currency).replace("-", "")}`}
              tone="profit"
              testId="metric-biggest-win"
            />
            <Kpi
              label="Biggest loss"
              value={report.proMetrics.biggestLoss === null ? "—" : `-${formatSignedMoney(report.proMetrics.biggestLoss, currency).replace("-", "")}`}
              tone="loss"
              testId="metric-biggest-loss"
            />
          </section>

          {/* Best / worst of the period */}
          <div className="grid gap-4 md:grid-cols-2" data-testid="report-spots">
            <SpotCard
              title="Best trade"
              symbol={report.best?.symbol ?? null}
              date={report.best?.date ?? null}
              pnl={report.best?.pnlNet ?? null}
              r={report.best?.rMultiple ?? null}
              currency={currency}
            />
            <SpotCard
              title="Worst trade"
              symbol={report.worst?.symbol ?? null}
              date={report.worst?.date ?? null}
              pnl={report.worst?.pnlNet ?? null}
              r={report.worst?.rMultiple ?? null}
              currency={currency}
            />
          </div>

          {/* Rollups + sides */}
          <div className="grid gap-4 lg:grid-cols-3" data-testid="report-rollups">
            <Card className="bg-surface lg:col-span-2" data-testid="report-instruments">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-heading text-base font-semibold">By instrument</CardTitle>
                  <CardDescription className="text-xs">Where the period&apos;s result came from</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {report.byInstrument.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No instrument traded this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th scope="col" className="ledger-label pb-2">Instrument</th>
                          <th scope="col" className="ledger-label pb-2 text-right">Trades</th>
                          <th scope="col" className="ledger-label pb-2 text-right">Win rate</th>
                          <th scope="col" className="ledger-label pb-2 text-right">Net P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byInstrument.map((row) => (
                          <tr key={row.symbol} className="border-b border-border/60 last:border-0">
                            <td className="py-2.5">
                              <span className="font-mono font-semibold text-foreground">{row.symbol}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{row.name}</span>
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              {row.tradesCount}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              {row.winRate === null ? "—" : formatPercent(row.winRate)}
                            </td>
                            <td
                              className={cn(
                                "py-2.5 text-right font-mono font-semibold tabular-nums",
                                Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                              )}
                            >
                              {formatSignedMoney(row.netPnl, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="bg-surface" data-testid="report-strategies">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-heading text-base font-semibold">By strategy</CardTitle>
                  <CardDescription className="text-xs">Which playbook earned the result</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {report.byStrategy.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No strategy linked this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th scope="col" className="ledger-label pb-2">Strategy</th>
                          <th scope="col" className="ledger-label pb-2 text-right">N</th>
                          <th scope="col" className="ledger-label pb-2 text-right">R</th>
                          <th scope="col" className="ledger-label pb-2 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byStrategy.map((row) => (
                          <tr key={row.strategyId ?? "out"} className="border-b border-border/60 last:border-0">
                            <td className="max-w-36 truncate py-2.5 text-xs text-foreground">{row.name}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{row.tradesCount}</td>
                            <td
                              className={cn(
                                "py-2.5 text-right font-mono tabular-nums",
                                Number(row.rEarned) >= 0 ? "text-profit" : "text-loss",
                              )}
                            >
                              {formatR(row.rEarned)}
                            </td>
                            <td
                              className={cn(
                                "py-2.5 text-right font-mono font-semibold tabular-nums",
                                Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                              )}
                            >
                              {formatSignedMoney(row.netPnl, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-surface" data-testid="report-sides">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Long vs short</CardTitle>
                <CardDescription className="text-xs">Direction split of the period&apos;s result</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <SideRow label="Long" row={report.long} currency={currency} maxAbsPnl={maxSideAbsPnl} />
                <SideRow label="Short" row={report.short} currency={currency} maxAbsPnl={maxSideAbsPnl} />
              </div>
            </CardContent>
          </Card>

          {/* Trade log — pro filters; exports mirror exactly this view */}
          <Card className="bg-surface" data-testid="report-trade-log">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Trade log</CardTitle>
                <CardDescription className="text-xs">
                  Closed trades of the period — filter, then export exactly what you see
                </CardDescription>
              </div>
              <span
                className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
                data-testid="report-log-count"
              >
                {filteredTrades.length} / {periodTrades.length}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2" data-testid="report-filters">
                <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
                  <SelectTrigger
                    className="h-8 w-[150px] text-xs"
                    aria-label="Filter by instrument"
                    data-testid="report-filter-instrument"
                  >
                    <SelectValue placeholder="Instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All instruments</SelectItem>
                    {periodSymbols.map((symbol) => (
                      <SelectItem key={symbol} value={symbol}>
                        {symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={directionFilter}
                  onValueChange={(value) => setDirectionFilter(value as DirectionFilter)}
                >
                  <SelectTrigger
                    className="h-8 w-[120px] text-xs"
                    aria-label="Filter by direction"
                    data-testid="report-filter-direction"
                  >
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All directions</SelectItem>
                    <SelectItem value="BUY">Long (BUY)</SelectItem>
                    <SelectItem value="SELL">Short (SELL)</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={outcomeFilter}
                  onValueChange={(value) => setOutcomeFilter(value as OutcomeFilter)}
                >
                  <SelectTrigger
                    className="h-8 w-[110px] text-xs"
                    aria-label="Filter by outcome"
                    data-testid="report-filter-outcome"
                  >
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All outcomes</SelectItem>
                    <SelectItem value="win">Wins</SelectItem>
                    <SelectItem value="loss">Losses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                  <SelectTrigger
                    className="h-8 w-[170px] text-xs"
                    aria-label="Filter by strategy"
                    data-testid="report-filter-strategy"
                  >
                    <SelectValue placeholder="Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All strategies</SelectItem>
                    {periodStrategyNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="out">Out of playbook</SelectItem>
                  </SelectContent>
                </Select>
                {isFiltered ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={resetFilters}
                    data-testid="report-filters-reset"
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Reset
                  </Button>
                ) : null}
              </div>

              {/* Filtered rollup — honest client-side math, labeled as such */}
              {isFiltered ? (
                <div
                  className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 sm:grid-cols-4"
                  data-testid="report-filtered-rollup"
                >
                  <div className="space-y-0.5">
                    <p className="ledger-label">Filtered net P&amp;L</p>
                    <p
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        filteredStats.netPnl >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatSignedMoney(filteredStats.netPnl, currency)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="ledger-label">Filtered win rate</p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {filteredStats.winRate === null ? "—" : formatPercent(filteredStats.winRate)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="ledger-label">R earned</p>
                    <p
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        filteredStats.rEarned === null
                          ? "text-foreground"
                          : filteredStats.rEarned >= 0
                            ? "text-profit"
                            : "text-loss",
                      )}
                    >
                      {filteredStats.rEarned === null ? "—" : formatR(filteredStats.rEarned)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="ledger-label">Selection</p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {filteredStats.count} of {periodTrades.length} trades
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Rows */}
              {filteredTrades.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="report-log-empty">
                  {periodTrades.length === 0
                    ? "No closed trade this period."
                    : "No trade matches these filters."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-140 text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th scope="col" className="ledger-label pb-2">Date</th>
                        <th scope="col" className="ledger-label pb-2">Instrument</th>
                        <th scope="col" className="ledger-label pb-2">Dir</th>
                        <th scope="col" className="ledger-label pb-2">Strategy</th>
                        <th scope="col" className="ledger-label pb-2 text-right">R</th>
                        <th scope="col" className="ledger-label pb-2 text-right">Net P&amp;L</th>
                        <th scope="col" className="ledger-label pb-2 text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((trade) => {
                        const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
                        return (
                          <tr key={trade.id} className="border-b border-border/60 last:border-0">
                            <td className="py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                              {trade.tradingDate}
                            </td>
                            <td className="py-2.5 font-mono font-semibold text-foreground">
                              {symbolOf(trade)}
                            </td>
                            <td
                              className={cn(
                                "py-2.5 font-mono text-xs font-semibold",
                                trade.direction === "SELL" ? "text-loss" : "text-profit",
                              )}
                            >
                              {trade.direction}
                            </td>
                            <td className="max-w-44 truncate py-2.5 text-xs text-muted-foreground">
                              {strategyNameOf(trade.strategyId) ?? (
                                <span className="italic">Out of playbook</span>
                              )}
                            </td>
                            <td
                              className={cn(
                                "py-2.5 text-right font-mono tabular-nums",
                                trade.rMultiple === null
                                  ? "text-muted-foreground"
                                  : Number(trade.rMultiple) >= 0
                                    ? "text-profit"
                                    : "text-loss",
                              )}
                            >
                              {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
                            </td>
                            <td
                              className={cn(
                                "py-2.5 text-right font-mono font-semibold tabular-nums",
                                pnl >= 0 ? "text-profit" : "text-loss",
                              )}
                            >
                              {formatSignedMoney(trade.pnlNet, currency)}
                            </td>
                            <td className="py-2.5 text-center">
                              {trade.decisionGrade !== null ? (
                                <span className="inline-block min-w-6 rounded-sm border border-border px-1 py-0.5 font-heading text-xs font-bold text-foreground">
                                  {trade.decisionGrade}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Auto insights */}
          <Card className="bg-surface" data-testid="report-insights">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Insights</CardTitle>
                <CardDescription className="text-xs">
                  Auto-generated from the full period — no coaching, just facts
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {report.insights.map((insight, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        insight.tone === "positive" && "bg-profit",
                        insight.tone === "negative" && "bg-loss",
                        insight.tone === "neutral" && "bg-muted-foreground",
                      )}
                    />
                    <span className="text-foreground">{insight.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
