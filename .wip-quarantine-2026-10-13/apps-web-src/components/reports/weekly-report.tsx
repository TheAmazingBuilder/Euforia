"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
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
import type { Trade, WeeklyReportResponse } from "@cosmoz/shared";
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
import { useInstruments, useStrategies, useTrades, useWeeklyReport } from "@/lib/api/queries";
import { getNavItem } from "@/lib/navigation";
import {
  buildReportCsv,
  buildReportMarkdown,
  downloadTextFile,
  type ReportExportInput,
  type ReportExportTrade,
} from "@/lib/reports-export";
import {
  buildReportPdfInput,
  toPdfTrade,
} from "@/lib/pdf/export-inputs";
import { downloadPdf, rasterizeBrandMark } from "@/lib/pdf/journal-pdf";
import { cn } from "@/lib/utils";

const nav = getNavItem("/reports");

type DirectionFilter = "all" | "BUY" | "SELL";
type OutcomeFilter = "all" | "win" | "loss";

/**
 * Weekly report view — the journal rolls itself up: the client only picks
 * the week (Monday key), every aggregate is recomputed server-side. The
 * trade-log section adds pro filters (instrument / direction / outcome /
 * strategy) and honest client-side rollups labeled as a filtered view, plus
 * PDF / Markdown / CSV exports that mirror exactly what is on screen.
 * Honest demo note: the default week resolves in America/Toronto, the fixture TZ.
 */

/** Toronto trading-date key for "today" (en-CA gives YYYY-MM-DD). */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shifts a date key by whole days on UTC date math (no TZ drift). */
function addDaysKey(key: string, days: number): string {
  const shifted = new Date(`${key}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Monday of the week containing the given key. */
function mondayKeyOf(key: string): string {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return addDaysKey(key, -((weekday + 6) % 7));
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function Kpi({
  label,
  value,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral";
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
  currency: WeeklyReportResponse["currency"];
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
              {date === null ? "" : longDate.format(new Date(`${date}T00:00:00Z`))}
              {r !== null ? ` · ${formatR(r)}` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function WeeklyReportView() {
  const [start, setStart] = React.useState(() => mondayKeyOf(todayKey()));
  const { data: report, isPending, isError } = useWeeklyReport(start);
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

  const weekStart = report?.weekStart ?? start;
  const weekEnd = report?.weekEnd ?? addDaysKey(start, 6);

  /** The week's closed trades (the report only aggregates CLOSED results). */
  const weekTrades = React.useMemo(() => {
    const all = tradesData?.trades ?? [];
    return all
      .filter(
        (trade) =>
          trade.status === "CLOSED" && trade.tradingDate >= weekStart && trade.tradingDate <= weekEnd,
      )
      .sort((a, b) => (a.tradingDate < b.tradingDate ? 1 : a.tradingDate > b.tradingDate ? -1 : 0));
  }, [tradesData, weekStart, weekEnd]);

  const filteredTrades = React.useMemo(
    () =>
      weekTrades.filter((trade) => {
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
    [weekTrades, instrumentFilter, directionFilter, outcomeFilter, strategyFilter, symbolOf, strategyNameOf],
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
    let planTotal = 0;
    let planFollowed = 0;
    const bySymbol = new Map<string, { tradesCount: number; netPnl: number }>();
    for (const trade of filteredTrades) {
      const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
      netPnl += pnl;
      if (pnl >= 0) wins += 1;
      if (trade.rMultiple !== null) {
        totalR += Number(trade.rMultiple);
        rCount += 1;
      }
      if (trade.followedPlan !== null) {
        planTotal += 1;
        if (trade.followedPlan) planFollowed += 1;
      }
      const symbol = symbolOf(trade);
      const bucket = bySymbol.get(symbol) ?? { tradesCount: 0, netPnl: 0 };
      bucket.tradesCount += 1;
      bucket.netPnl += pnl;
      bySymbol.set(symbol, bucket);
    }
    return {
      count: filteredTrades.length,
      netPnl,
      winRate: filteredTrades.length > 0 ? wins / filteredTrades.length : null,
      rEarned: rCount > 0 ? totalR : null,
      planFollowedPct: planTotal > 0 ? planFollowed / planTotal : null,
      byInstrument: [...bySymbol.entries()]
        .map(([symbol, row]) => ({ symbol, ...row }))
        .sort((a, b) => b.netPnl - a.netPnl),
    };
  }, [filteredTrades, symbolOf]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const currency = report?.currency ?? "USD";
  const isCurrent = report?.isCurrent ?? false;

  // Daily P&L bars — fixed 7-day window, profit/loss ink by sign.
  const option = React.useMemo<EChartsCoreOption>(() => {
    if (!report) return {};
    const values = report.days.map((day) => Number(day.pnlNet));
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
          const typed = params as { dataIndex: number }[];
          const day = report.days[typed?.[0]?.dataIndex ?? -1];
          if (!day) return "";
          return [
            longDate.format(new Date(`${day.date}T00:00:00Z`)),
            `<b>${formatSignedMoney(day.pnlNet, report.currency)}</b>`,
            `${day.tradesCount} trade${day.tradesCount === 1 ? "" : "s"}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: report.days.map((day) => day.label),
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
          id: "weekly-daily-pnl",
          type: "bar",
          data: values.map((value) => {
            const positive = value >= 0;
            const color = positive ? theme.profit : theme.loss;
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
          barMaxWidth: 26,
          markLine:
            min < 0
              ? {
                  silent: true,
                  symbol: "none",
                  label: { show: false },
                  lineStyle: { color: theme.border, type: "dashed", width: 1 },
                  data: [{ yAxis: 0 }],
                }
              : undefined,
        },
      ],
    };
  }, [report, theme]);

  const weekLabel = React.useMemo(() => {
    const from = report?.weekStart ?? start;
    const to = report?.weekEnd ?? addDaysKey(start, 6);
    const year = new Date(`${to}T00:00:00Z`).getUTCFullYear();
    return `${shortDate.format(new Date(`${from}T00:00:00Z`))} – ${shortDate.format(
      new Date(`${to}T00:00:00Z`),
    )}, ${year}`;
  }, [report, start]);

  /** Shared export model: exactly what the filtered table shows. */
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
      weekLabel,
      filterNote,
      summary: {
        tradesCount: filteredStats.count,
        netPnl: formatSignedMoney(filteredStats.netPnl, currency),
        winRate: filteredStats.winRate,
        rEarned: filteredStats.rEarned,
      },
      byInstrument: filteredStats.byInstrument,
      insights: (report?.insights ?? []).map((insight) => insight.text),
      trades,
    };
  }, [filteredTrades, filteredStats, currency, weekLabel, filterNote, report, symbolOf, strategyNameOf]);

  const exportFileName = React.useMemo(() => {
    const range = weekLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return filterNote !== null ? `cosmoz-weekly-${range}-filtered` : `cosmoz-weekly-${range}`;
  }, [weekLabel, filterNote]);

  const onExportPdf = async () => {
    setExporting(true);
    try {
      const logoDataUrl = await rasterizeBrandMark().catch(() => undefined);
      await downloadPdf(
        buildReportPdfInput({
          trades: filteredTrades.map((trade) => toPdfTrade(trade, symbolOf, strategyNameOf)),
          currency,
          weekLabel,
          filterNote,
          summary: {
            netPnl: filteredStats.netPnl,
            tradesCount: filteredStats.count,
            winRate: filteredStats.winRate,
            rEarned: filteredStats.rEarned,
            planFollowedPct: filteredStats.planFollowedPct,
          },
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

  /** Instrument / strategy options present in the week's trades (no empty menus). */
  const weekSymbols = React.useMemo(
    () => [...new Set(weekTrades.map((trade) => symbolOf(trade)))].sort(),
    [weekTrades, symbolOf],
  );
  const weekStrategyNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const trade of weekTrades) {
      const name = strategyNameOf(trade.strategyId);
      if (name !== null) names.add(name);
    }
    return [...names].sort();
  }, [weekTrades, strategyNameOf]);

  return (
    <div className="space-y-6" data-testid="weekly-report">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {nav.label}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>

      {/* Week navigation — next is disabled on the current week (no future to report). */}
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="week-nav">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            data-testid="week-prev"
            onClick={() => setStart((current) => addDaysKey(current, -7))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            data-testid="week-next"
            disabled={isPending || isCurrent}
            onClick={() => setStart((current) => addDaysKey(current, 7))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          {isPending ? (
            <Skeleton className="h-6 w-44" />
          ) : (
            <span className="flex flex-wrap items-center gap-2" data-testid="week-range">
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {weekLabel}
              </span>
              {isCurrent ? (
                <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  This week
                </span>
              ) : null}
            </span>
          )}
        </div>
        {/* Export — mirrors the filtered trade log below. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={isPending || exporting} data-testid="report-export">
              <Download className="size-3.5" aria-hidden="true" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              {filterNote !== null ? `Filtered: ${filterNote}` : "Full week"}
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
            The weekly report could not be loaded. Try again in a moment.
          </CardContent>
        </Card>
      ) : isPending || !report ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-56 w-full sm:h-64" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* KPI band */}
          <section
            aria-label="Week KPIs"
            className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:grid-cols-3 lg:grid-cols-5"
            data-testid="weekly-kpis"
          >
            <Kpi
              label="Net P&L"
              value={formatSignedMoney(report.totals.netPnl, currency)}
              tone={Number(report.totals.netPnl) >= 0 ? "profit" : "loss"}
              testId="kpi-net-pnl"
            />
            <Kpi label="Trades" value={String(report.totals.tradesCount)} testId="kpi-trades" />
            <Kpi
              label="Win rate"
              value={report.totals.tradesCount > 0 ? formatPercent(report.totals.winRate) : "—"}
              testId="kpi-win-rate"
            />
            <Kpi label="R earned" value={formatR(report.totals.rEarned)} testId="kpi-r-earned" />
            <Kpi
              label="Plan adherence"
              value={
                report.totals.disciplineAvg === null
                  ? "—"
                  : `${Math.round(Number(report.totals.disciplineAvg))}/100`
              }
              testId="kpi-plan"
            />
          </section>

          {/* Daily P&L bars */}
          <Card className="bg-surface" data-testid="weekly-chart">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Daily P&L</CardTitle>
                <CardDescription className="text-xs">
                  Result per trading day — Monday to Sunday
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <EChart
                option={option}
                className="h-56 w-full sm:h-64"
                ariaLabel="Daily P&L for the selected week"
              />
            </CardContent>
          </Card>

          {/* Best / worst of the week */}
          <div className="grid gap-4 md:grid-cols-2" data-testid="weekly-spots">
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

          {/* Per-instrument rollup */}
          <Card className="bg-surface" data-testid="weekly-instruments">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">
                  By instrument
                </CardTitle>
                <CardDescription className="text-xs">
                  Where the week&apos;s result came from
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {report.byInstrument.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No instrument traded this week.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="ledger-label pb-2">Instrument</th>
                      <th scope="col" className="ledger-label pb-2 text-right">Trades</th>
                      <th scope="col" className="ledger-label pb-2 text-right">Win rate</th>
                      <th scope="col" className="ledger-label pb-2 text-right">Net P&L</th>
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
              )}
            </CardContent>
          </Card>

          {/* Trade log — pro filters; exports mirror exactly this view */}
          <Card className="bg-surface" data-testid="weekly-trade-log">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Trade log</CardTitle>
                <CardDescription className="text-xs">
                  Closed trades of the week — filter, then export exactly what you see
                </CardDescription>
              </div>
              <span
                className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
                data-testid="report-log-count"
              >
                {filteredTrades.length} / {weekTrades.length}
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
                    {weekSymbols.map((symbol) => (
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
                    {weekStrategyNames.map((name) => (
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
                      {filteredStats.count} of {weekTrades.length} trades
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Rows */}
              {filteredTrades.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="report-log-empty">
                  {weekTrades.length === 0
                    ? "No closed trade this week."
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
          <Card className="bg-surface" data-testid="weekly-insights">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-heading text-base font-semibold">Insights</CardTitle>
                <CardDescription className="text-xs">
                  Auto-generated from the same numbers — no coaching, just facts
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
