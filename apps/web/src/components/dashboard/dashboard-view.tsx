"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, Stars } from "lucide-react";
import type { StatsOverviewResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { BestWorstCard } from "@/components/dashboard/best-worst-card";
import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { CoachInsights } from "@/components/dashboard/coach-insights";
import { DisciplineSavedCard } from "@/components/dashboard/discipline-saved-card";
import { EquityConstellation } from "@/components/dashboard/equity-constellation";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { OpenPositionsCard } from "@/components/dashboard/open-positions-card";
import { CumulativePnlCard, DailyPnlCard } from "@/components/dashboard/pnl-charts";
import { RiskBudgetCard } from "@/components/dashboard/risk-budget-card";
import { useAlerts, useRulesStatus, useStatsOverview } from "@/lib/api/queries";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-muted-foreground">
      {label}
      <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

/** Decorative constellation glyph for the empty state (token colors only). */
function ConstellationGlyph() {
  return (
    <svg
      viewBox="0 0 200 96"
      className="mx-auto h-28 w-44 text-accent"
      aria-hidden="true"
      fill="none"
    >
      <polyline
        points="8,78 44,54 76,62 112,30 148,40 190,12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="3 5"
        opacity="0.55"
      />
      {(
        [
          [8, 78, 2],
          [44, 54, 3],
          [76, 62, 2],
          [112, 30, 3.5],
          [148, 40, 2],
          [190, 12, 3],
        ] as const
      ).map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.9" />
      ))}
    </svg>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-[122px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <Skeleton className="h-[430px] rounded-xl lg:col-span-3" />
        <div className="space-y-3 sm:space-y-4 lg:col-span-2">
          <Skeleton className="h-[236px] rounded-xl" />
          <Skeleton className="h-[178px] rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-[352px] rounded-xl" />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Skeleton className="h-[288px] rounded-xl" />
        <Skeleton className="h-[288px] rounded-xl" />
      </div>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <Card className="mx-auto max-w-xl bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <ConstellationGlyph />
        <h2 className="mt-6 font-heading text-xl font-semibold">Your record starts here</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Every trade you log becomes an entry in your book of record — and every decision
          gets graded by your coach. Capture your first execution to open the ledger.
        </p>
        <Button className="mt-6" onClick={() => openTradeModal()}>
          <Plus className="size-4" aria-hidden="true" />
          Log your first trade
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorDashboard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">The sky went dark</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The dashboard could not load your stats. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

interface DashboardViewProps {
  title: string;
  description: string;
}

/**
 * Dashboard (Phase 6): KPI band → constellation hero + risk/coach column →
 * monthly heatmap → alerts feed + discipline saved. All aggregates come from
 * the typed API layer (GET /stats/overview, /rules/status, /alerts).
 */
export function DashboardView({ title, description }: DashboardViewProps) {
  const overview = useStatsOverview();
  const rules = useRulesStatus();
  const alerts = useAlerts();
  const queryClient = useQueryClient();

  const isLoading =
    overview.isLoading || rules.isLoading || alerts.isLoading;
  const isError = overview.isError || rules.isError || alerts.isError;
  const isEmpty =
    !isLoading && !isError && (overview.data?.equityCurve.length ?? 0) === 0;

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorDashboard onRetry={retry} />
      ) : isEmpty ? (
        <EmptyDashboard />
      ) : overview.data && rules.data && alerts.data ? (
        <DashboardContent overview={overview.data} rulesStatus={rules.data} alerts={alerts.data} />
      ) : null}
    </div>
  );
}

interface DashboardContentProps {
  overview: StatsOverviewResponse;
  rulesStatus: Awaited<ReturnType<typeof useRulesStatus>>["data"] & object;
  alerts: NonNullable<Awaited<ReturnType<typeof useAlerts>>["data"]>;
}

function DashboardContent({ overview, rulesStatus, alerts }: DashboardContentProps) {
  const insights = React.useMemo(
    () => alerts.alerts.filter((alert) => alert.type === "STRATEGY_DECAY"),
    [alerts.alerts],
  );

  return (
    <>
      <KpiRow overview={overview} />

      {/* P&L band — period chips live in the URL (?range=7|30|90).
          Suspense: useSearchParams inside the chips needs a boundary. */}
      <React.Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <CumulativePnlCard overview={overview} />
          <DailyPnlCard overview={overview} />
        </div>
      </React.Suspense>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="bg-surface lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">
              Equity trajectory
            </CardTitle>
            <CardDescription>
              Each star is a trading day — the plotted line of your decisions, drawdown
              zones shaded in loss ink.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <HeroChip label="Peak" value={formatMoney(overview.equityPeak, overview.currency)} />
              <HeroChip
                label="Max drawdown"
                value={`${formatNumber(overview.maxDrawdownPct, 1)} %`}
              />
            </div>
            <EquityConstellation points={overview.equityCurve} currency={overview.currency} />
          </CardContent>
        </Card>

        <div className="space-y-3 sm:space-y-4 lg:col-span-2">
          <OpenPositionsCard />
          <RiskBudgetCard status={rulesStatus} />
          <CoachInsights insights={insights} />
        </div>
      </div>

      <CalendarHeatmap dailyPnl={overview.dailyPnl} currency={overview.currency} />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BestWorstCard />
        <DisciplineSavedCard
          rSaved={overview.disciplineSaved.rSaved}
          settledCount={overview.disciplineSaved.settledCount}
        />
      </div>

      <AlertsFeed alerts={alerts.alerts} unreadCount={alerts.unreadCount} />
    </>
  );
}
