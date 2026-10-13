"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";
import { graphic } from "echarts/core";
import {
  ArrowLeft,
  ArrowUpRight,
  Pencil,
  Play,
  RefreshCcw,
  Stars,
} from "lucide-react";
import type { StrategyStat } from "@cosmoz/shared";
import { formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/charts/echart";
import { Markdown } from "@/components/playbook/markdown";
import { GradeBadge } from "@/components/playbook/strategy-card";
import { StrategyFormDialog } from "@/components/playbook/strategy-form-dialog";
import {
  useAnalytics,
  useInstruments,
  useStrategies,
  useStrategiesStats,
  useTrades,
} from "@/lib/api/queries";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { getThemeToken } from "@/lib/utils/theme";
import { withAlpha } from "@/lib/utils/color";
import { cn } from "@/lib/utils";

/**
 * Strategy detail page (enriched): full-page record of one playbook setup —
 * identity + actions, the six-number stat band, the cumulative-R equity
 * curve, the closed-trade R histogram, the written rules rendered and the
 * latest executions of this setup. Aggregates stay server-computed; the
 * client only slices and formats.
 */

const R_BIN_EDGES = [-3, -2, -1, 0, 1, 2, 3] as const;

function binLabel(index: number): string {
  if (index === 0) return `<${R_BIN_EDGES[0]}`;
  if (index === R_BIN_EDGES.length) return `≥${R_BIN_EDGES[R_BIN_EDGES.length - 1]!}`;
  return `${R_BIN_EDGES[index - 1]!}…${R_BIN_EDGES[index]!}`;
}

function binOf(r: number): number {
  for (let index = 0; index < R_BIN_EDGES.length; index += 1) {
    if (r < R_BIN_EDGES[index]!) return index;
  }
  return R_BIN_EDGES.length;
}

function StatBandCell({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | null;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-4">
      <span className="ledger-label">{label}</span>
      <span
        className={cn(
          "font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-[11px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function StatBandSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-[92px] rounded-none" />
      ))}
    </div>
  );
}

/** Cumulative-R equity curve for one strategy (from the server sparkline). */
function REquityCurve({ stat }: { stat: StrategyStat }) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const values = stat.sparkline.map((value) => Number(value));
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const pad = Math.max((max - min) * 0.1, 0.5);
    return {
      grid: { left: 8, right: 40, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as
            | { dataIndex: number }
            | undefined;
          if (!typed) return "";
          const value = values[typed.dataIndex] ?? 0;
          return [
            `<div>Cum R <b>${formatR(value)}</b></div>`,
            `<div style="color:${theme.textMuted}">trade ${typed.dataIndex + 1}</div>`,
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: values.map((_, index) => String(index + 1)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: Math.round((min - pad) * 100) / 100,
        max: Math.round((max + pad) * 100) / 100,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
      },
      series: [
        {
          id: "strategy-r-equity",
          type: "line",
          data: values,
          smooth: 0.25,
          symbol: "none",
          lineStyle: {
            color: theme.accent,
            width: 2.5,
            shadowColor: withAlpha(theme.accent, 0.45),
            shadowBlur: 10,
            shadowOffsetY: 5,
          },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(theme.accent, 0.4) },
              { offset: 0.55, color: withAlpha(theme.accent, 0.13) },
              { offset: 1, color: withAlpha(theme.accent, 0.03) },
            ]),
          },
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
  }, [stat, theme]);

  return (
    <EChart
      option={option}
      className="h-[220px] w-full"
      ariaLabel="Cumulative R equity curve for this strategy"
    />
  );
}

/** Closed-trade R histogram (shared bin edges, sign-colored). */
function RHistogram({ rValues }: { rValues: string[] }) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const bins = new Array<number>(R_BIN_EDGES.length + 1).fill(0);
    for (const raw of rValues) bins[binOf(Number(raw))] += 1;
    return {
      grid: { left: 8, right: 8, top: 22, bottom: 2, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(theme.textPrimary, 0.06) } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as
            | { dataIndex: number }
            | undefined;
          if (!typed) return "";
          const count = bins[typed.dataIndex] ?? 0;
          return `<div>R ${binLabel(typed.dataIndex)}</div><div><b>${count}</b> trade${count === 1 ? "" : "s"}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: bins.map((_, index) => binLabel(index)),
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 9, interval: 0 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.border, type: "dashed", opacity: 0.55 } },
      },
      series: [
        {
          id: "strategy-r-histogram",
          type: "bar",
          data: bins.map((count, index) => ({
            value: count,
            itemStyle: {
              color:
                count === 0
                  ? withAlpha(theme.textMuted, 0.14)
                  : index <= R_BIN_EDGES.indexOf(0)
                    ? withAlpha(theme.loss, 0.75)
                    : withAlpha(theme.profit, 0.75),
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barMaxWidth: 30,
        },
      ],
    };
  }, [rValues, theme]);

  return (
    <EChart
      option={option}
      className="h-[220px] w-full"
      ariaLabel="Histogram of closed-trade R multiples for this strategy"
    />
  );
}

function RuleSection({ title, source }: { title: string; source: string | null }) {
  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <Markdown source={source} />
    </section>
  );
}

function StrategyDetailSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading strategy">
      <Skeleton className="h-10 w-72 rounded-md" />
      <StatBandSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
      <Skeleton className="h-[220px] rounded-xl" />
    </div>
  );
}

export function StrategyDetailView({ id }: { id: string }) {
  const router = useRouter();
  const strategies = useStrategies();
  const stats = useStrategiesStats();
  const analytics = useAnalytics();
  const instruments = useInstruments();
  const trades = useTrades();

  const [editOpen, setEditOpen] = React.useState(false);

  const isLoading = strategies.isLoading || stats.isLoading || analytics.isLoading;
  const isError = strategies.isError || stats.isError || analytics.isError;
  const retry = React.useCallback(() => {
    void strategies.refetch();
    void stats.refetch();
    void analytics.refetch();
  }, [strategies, stats, analytics]);

  const strategy = strategies.data?.strategies.find((item) => item.id === id) ?? null;
  const stat = stats.data?.stats.find((item) => item.strategyId === id);
  const distribution = analytics.data?.strategyDistributions.find(
    (item) => item.strategyId === id,
  );

  if (isLoading) return <StrategyDetailSkeleton />;
  if (isError) {
    return (
      <Card className="mx-auto max-w-md bg-surface">
        <CardContent className="flex flex-col items-center py-14 text-center">
          <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-heading text-lg font-semibold">Setup unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The strategy record could not be loaded.
          </p>
          <Button variant="outline" className="mt-6" onClick={retry}>
            <RefreshCcw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (strategy === null) {
    return (
      <Card className="mx-auto max-w-md bg-surface">
        <CardContent className="flex flex-col items-center py-14 text-center">
          <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-heading text-lg font-semibold">Setup not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This playbook page does not exist (or was deleted).
          </p>
          <Button className="mt-6" onClick={() => router.push("/playbook")}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the playbook
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rValues = (distribution?.rValues ?? []).map((value) => Number(value));
  const bestR = rValues.length > 0 ? Math.max(...rValues) : null;
  const worstR = rValues.length > 0 ? Math.min(...rValues) : null;
  const avgR = stat ? Number(stat.avgR) : null;
  const last20 = stat
    ? stat.last20Expectancy === null
      ? null
      : Number(stat.last20Expectancy)
    : null;

  const color = strategy.color ?? getThemeToken("--accent");
  const symbolOf = (instrumentId: string): string =>
    instruments.data?.instruments.find((item) => item.id === instrumentId)?.symbol ?? "—";

  const strategyTrades = (trades.data?.trades ?? [])
    .filter((trade) => trade.strategyId === id)
    .sort((a, b) => (a.entryAt < b.entryAt ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <Link
        href="/playbook"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Playbook
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${withAlpha(color, 0.2)}` }}
            />
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {strategy.name}
            </h1>
            <GradeBadge grade={strategy.grade} />
            <span className="rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {strategy.status}
            </span>
          </div>
          {strategy.description ? (
            <p className="max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
              {strategy.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={() =>
              openTradeModal({
                instrumentId: null,
                direction: "BUY",
                strategyId: strategy.id,
                outOfPlaybook: false,
                emotionBefore: null,
                entryAtISO: new Date().toISOString(),
              })
            }
          >
            <Play className="size-4" aria-hidden="true" />
            Trade this setup
          </Button>
        </div>
      </header>

      {/* Stat band — the six-number record of the setup */}
      {stat !== undefined ? (
        <div
          data-testid="strategy-stat-band"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6"
        >
          <StatBandCell label="Trades" value={String(stat.trades)} sub="closed, all time" />
          <StatBandCell label="Win rate" value={formatPercent(stat.winRate, 1)} />
          <StatBandCell
            label="Avg R"
            value={formatR(stat.avgR)}
            tone={avgR !== null && avgR >= 0 ? "profit" : "loss"}
            sub="expectancy"
          />
          <StatBandCell
            label="Last 20"
            value={formatR(stat.last20Expectancy)}
            tone={last20 !== null && last20 >= 0 ? "profit" : "loss"}
            sub="decay window"
          />
          <StatBandCell
            label="Best R"
            value={bestR === null ? "—" : formatR(bestR)}
            tone={bestR !== null && bestR >= 0 ? "profit" : null}
          />
          <StatBandCell
            label="Worst R"
            value={worstR === null ? "—" : formatR(worstR)}
            tone={worstR !== null && worstR < 0 ? "loss" : null}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No closed trades yet — the stat band, equity curve and histogram appear with the first
          settled execution of this setup.
        </p>
      )}

      {stat !== undefined ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Cumulative R equity
              </CardTitle>
              <CardDescription>
                The setup&apos;s compounding curve in R units — result-independent of position size.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <REquityCurve stat={stat} />
            </CardContent>
          </Card>
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                R distribution
              </CardTitle>
              <CardDescription>
                Closed-trade R histogram — shared bins across the whole analytics suite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RHistogram rValues={distribution?.rValues ?? []} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">The written rules</CardTitle>
          <CardDescription>
            Trade them as written — or change the page, never the moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <RuleSection title="Entry rules" source={strategy.entryRules} />
          <RuleSection title="Exit rules" source={strategy.exitRules} />
          <RuleSection title="Risk rules" source={strategy.riskRules} />
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="font-heading text-base font-semibold">
              Latest executions
            </CardTitle>
            <CardDescription>The 8 most recent trades attributed to this setup.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/trades">
              Open Trades
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {strategyTrades.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No trades captured on this setup yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">Latest trades of this strategy</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2 font-medium">Symbol</th>
                    <th scope="col" className="px-3 py-2 font-medium">Side</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">R</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">P&L</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyTrades.map((trade) => {
                    const r = trade.rMultiple === null ? null : Number(trade.rMultiple);
                    const pnl = trade.pnlNet === null ? null : Number(trade.pnlNet);
                    return (
                      <tr
                        key={trade.id}
                        className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40"
                      >
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {trade.tradingDate}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{symbolOf(trade.instrumentId)}</td>
                        <td
                          className={cn(
                            "px-3 py-2.5 font-mono text-xs font-medium",
                            trade.direction === "BUY" ? "text-profit" : "text-loss",
                          )}
                        >
                          {trade.direction}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-mono font-medium tabular-nums",
                            r === null ? "text-muted-foreground" : r >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {r === null ? "—" : formatR(r)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-mono tabular-nums",
                            pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {pnl === null ? "—" : formatSignedMoney(pnl, "USD")}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                          {trade.status}
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

      <StrategyFormDialog
        key={strategy.id}
        open={editOpen}
        onOpenChange={setEditOpen}
        strategy={strategy}
      />
    </div>
  );
}
