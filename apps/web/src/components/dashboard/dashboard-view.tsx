"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LayoutDashboard,
  Plus,
  RefreshCcw,
  RotateCcw,
  Stars,
} from "lucide-react";
import type { DashboardWidgetKey, StatsOverviewResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { BestWorstCard } from "@/components/dashboard/best-worst-card";
import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { CoachInsights } from "@/components/dashboard/coach-insights";
import { DisciplineSavedCard } from "@/components/dashboard/discipline-saved-card";
import { EquityConstellation } from "@/components/dashboard/equity-constellation";
import { GoalsPaceCard } from "@/components/dashboard/goals-pace-card";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { OpenPositionsCard } from "@/components/dashboard/open-positions-card";
import { CumulativePnlCard, DailyPnlCard } from "@/components/dashboard/pnl-charts";
import { RiskBudgetCard } from "@/components/dashboard/risk-budget-card";
import { WeekCompareCard } from "@/components/dashboard/week-compare-card";
import {
  useAlerts,
  usePreferences,
  useResetPreferencesDomain,
  useRulesStatus,
  useStatsOverview,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { cn } from "@/lib/utils";

/** Canonical widget order — the designed default. Saved orders are merged
 * with this list (missing keys appended, unknown keys dropped) so new
 * widgets appear without a preference migration. */
const CANONICAL_ORDER: DashboardWidgetKey[] = [
  "PNL_BAND",
  "EQUITY_ROW",
  "GOALS_PACE",
  "WEEK_COMPARE",
  "HEATMAP",
  "BEST_WORST",
  "ALERTS",
];

const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  PNL_BAND: "P&L charts",
  EQUITY_ROW: "Equity & live risk",
  GOALS_PACE: "Goals on pace",
  WEEK_COMPARE: "Week vs week",
  HEATMAP: "Consistency heatmap",
  BEST_WORST: "Best & worst",
  ALERTS: "Alerts feed",
};

function mergeWidgetOrder(saved: readonly string[] | undefined): DashboardWidgetKey[] {
  if (!saved || saved.length === 0) return [...CANONICAL_ORDER];
  const valid = saved.filter((key): key is DashboardWidgetKey =>
    (CANONICAL_ORDER as string[]).includes(key),
  );
  const unique = [...new Set(valid)];
  return [...unique, ...CANONICAL_ORDER.filter((key) => !unique.includes(key))];
}

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
      {/* Mirrors the KPI band: two heroes (span 6) + four KPIs (span 3). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-12 sm:gap-4">
        <Skeleton className="h-[164px] rounded-xl max-sm:col-span-2 sm:col-span-6" />
        <Skeleton className="h-[164px] rounded-xl max-sm:col-span-2 sm:col-span-6" />
        <Skeleton className="h-[150px] rounded-xl sm:col-span-3" />
        <Skeleton className="h-[150px] rounded-xl sm:col-span-3" />
        <Skeleton className="h-[150px] rounded-xl sm:col-span-3" />
        <Skeleton className="h-[150px] rounded-xl sm:col-span-3" />
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

/** Edit-mode tool chip that floats over a widget: grip + move buttons.
 * Only rendered while layout editing is active — the resting dashboard
 * keeps its designed look, byte for byte. */
function WidgetTools({
  widgetKey,
  label,
  index,
  count,
  onMove,
}: {
  widgetKey: DashboardWidgetKey;
  label: string;
  index: number;
  count: number;
  onMove: (key: DashboardWidgetKey, direction: -1 | 1) => void;
}) {
  const key = widgetKey.toLowerCase();
  return (
    <div
      className="absolute -top-3 right-4 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-background/95 px-1 py-0.5 shadow-sm backdrop-blur"
      data-testid={`dashboard-widget-tools-${key}`}
    >
      <span
        className="flex cursor-grab items-center px-0.5 text-muted-foreground active:cursor-grabbing"
        title={`Drag to reorder ${label}`}
        data-testid={`dashboard-widget-grip-${key}`}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </span>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        aria-label={`Move ${label} up`}
        data-testid={`dashboard-widget-up-${key}`}
        disabled={index === 0}
        onClick={() => onMove(widgetKey, -1)}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronUp className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        data-testid={`dashboard-widget-down-${key}`}
        disabled={index === count - 1}
        onClick={() => onMove(widgetKey, 1)}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Fresh-account window: an account created less than 48 hours ago is
 * greeted as a first arrival ("Welcome") instead of a returning trader
 * ("Welcome back"). Derived from the REAL signup timestamp — no fake
 * persistence, self-expires. */
const FRESH_ACCOUNT_WINDOW_MS = 48 * 60 * 60 * 1000;

function useDashboardGreeting(): string {
  const { user } = useAuth();
  const name = user?.name?.trim() || "trader";
  // Captured once (lazy-init pattern shared with notification-center) — a 48 h
  // window makes per-render clock drift irrelevant, no ticker needed.
  const [nowMs] = React.useState(() => Date.now());
  const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : Number.NaN;
  const isFreshAccount =
    Number.isFinite(createdAt) && nowMs - createdAt < FRESH_ACCOUNT_WINDOW_MS;
  return `${isFreshAccount ? "Welcome" : "Welcome back"}, ${name}`;
}

interface DashboardViewProps {
  title: string;
  description: string;
}

/**
 * Dashboard (Phase 6 → personalized): KPI band → reorderable widget stack.
 * Widget order lives in the `dashboard` preference domain (PATCH
 * /me/preferences/dashboard) and is edited inline — drag the grip or use
 * the move buttons. Density COMFORTABLE keeps the designed rhythm;
 * COMPACT tightens it per the stored appearance preference.
 */
export function DashboardView({ description }: DashboardViewProps) {
  const greeting = useDashboardGreeting();
  const overview = useStatsOverview();
  const rules = useRulesStatus();
  const alerts = useAlerts();
  const queryClient = useQueryClient();

  const { data: prefs } = usePreferences();
  const compact = (prefs?.appearance.density ?? "COMFORTABLE") === "COMPACT";
  const updateDashboard = useUpdatePreferencesDomain("dashboard");
  const resetDashboard = useResetPreferencesDomain();

  const savedOrder = prefs?.dashboard.widgetOrder;
  const order = React.useMemo(() => mergeWidgetOrder(savedOrder), [savedOrder]);
  const orderChanged = React.useMemo(
    () => order.join() !== CANONICAL_ORDER.join(),
    [order],
  );

  const [editing, setEditing] = React.useState(false);
  const [dragOrder, setDragOrder] = React.useState<DashboardWidgetKey[] | null>(null);
  const [draggingKey, setDraggingKey] = React.useState<DashboardWidgetKey | null>(null);
  const dragKeyRef = React.useRef<DashboardWidgetKey | null>(null);
  const displayOrder = dragOrder ?? order;

  const isLoading = overview.isLoading || rules.isLoading || alerts.isLoading;
  const isError = overview.isError || rules.isError || alerts.isError;
  const isEmpty =
    !isLoading && !isError && (overview.data?.equityCurve.length ?? 0) === 0;

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  const commitOrder = React.useCallback(
    (next: DashboardWidgetKey[]) => updateDashboard.mutate({ widgetOrder: next }),
    [updateDashboard],
  );

  const handleDragStart = React.useCallback(
    (key: DashboardWidgetKey) => {
      dragKeyRef.current = key;
      setDraggingKey(key);
      setDragOrder(order);
    },
    [order],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, overKey: DashboardWidgetKey) => {
      event.preventDefault();
      const dragKey = dragKeyRef.current;
      if (!dragKey || dragKey === overKey) return;
      setDragOrder((current) => {
        const source = current ?? order;
        const from = source.indexOf(dragKey);
        const to = source.indexOf(overKey);
        if (from < 0 || to < 0) return current;
        const next = [...source];
        next.splice(to, 0, ...next.splice(from, 1));
        return next.join() === source.join() ? current : next;
      });
    },
    [order],
  );

  const handleDragEnd = React.useCallback(() => {
    const dragKey = dragKeyRef.current;
    const next = dragOrder;
    dragKeyRef.current = null;
    setDraggingKey(null);
    setDragOrder(null);
    if (dragKey && next && next.join() !== order.join()) commitOrder(next);
  }, [dragOrder, order, commitOrder]);

  const move = React.useCallback(
    (key: DashboardWidgetKey, direction: -1 | 1) => {
      const from = order.indexOf(key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return;
      const next = [...order];
      next.splice(to, 0, ...next.splice(from, 1));
      commitOrder(next);
    },
    [order, commitOrder],
  );

  return (
    <div
      data-page="dashboard"
      className={cn(
        "mx-auto w-full max-w-7xl",
        compact ? "space-y-3" : "space-y-4 sm:space-y-6",
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="space-y-1">
          <h1
            data-testid="dashboard-welcome"
            className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl"
          >
            {greeting}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing && orderChanged && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="dashboard-layout-reset"
              onClick={() => resetDashboard.mutate({ domain: "dashboard" })}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset layout
            </Button>
          )}
          <Button
            variant={editing ? "default" : "outline"}
            size="sm"
            data-testid="dashboard-customize"
            onClick={() => setEditing((value) => !value)}
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            {editing ? "Done" : "Edit layout"}
          </Button>
        </div>
      </header>

      {editing && (
        <p className="text-xs text-muted-foreground" data-testid="dashboard-edit-hint">
          Drag a widget by its grip — or use the arrows. The order saves automatically to your
          profile.
        </p>
      )}

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorDashboard onRetry={retry} />
      ) : isEmpty ? (
        <EmptyDashboard />
      ) : overview.data && rules.data && alerts.data ? (
        <DashboardContent
          overview={overview.data}
          rulesStatus={rules.data}
          alerts={alerts.data}
          editing={editing}
          displayOrder={displayOrder}
          draggingKey={draggingKey}
          onMove={move}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        />
      ) : null}
    </div>
  );
}

interface DashboardContentProps {
  overview: StatsOverviewResponse;
  rulesStatus: Awaited<ReturnType<typeof useRulesStatus>>["data"] & object;
  alerts: NonNullable<Awaited<ReturnType<typeof useAlerts>>["data"]>;
  editing: boolean;
  displayOrder: DashboardWidgetKey[];
  draggingKey: DashboardWidgetKey | null;
  onMove: (key: DashboardWidgetKey, direction: -1 | 1) => void;
  onDragStart: (key: DashboardWidgetKey) => void;
  onDragOver: (event: React.DragEvent, key: DashboardWidgetKey) => void;
  onDragEnd: () => void;
}

function DashboardContent({
  overview,
  rulesStatus,
  alerts,
  editing,
  displayOrder,
  draggingKey,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: DashboardContentProps) {
  const insights = React.useMemo(
    () => alerts.alerts.filter((alert) => alert.type === "STRATEGY_DECAY"),
    [alerts.alerts],
  );

  /** Widget registry — each entry renders exactly one reorderable section. */
  const WIDGETS: Record<DashboardWidgetKey, React.ReactNode> = {
    PNL_BAND: (
      <React.Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <CumulativePnlCard overview={overview} />
          <DailyPnlCard overview={overview} />
        </div>
      </React.Suspense>
    ),
    EQUITY_ROW: (
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
    ),
    GOALS_PACE: <GoalsPaceCard />,
    WEEK_COMPARE: (
      <WeekCompareCard weeklyCompare={overview.weeklyCompare} currency={overview.currency} />
    ),
    HEATMAP: <CalendarHeatmap dailyPnl={overview.dailyPnl} currency={overview.currency} />,
    BEST_WORST: (
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BestWorstCard />
        <DisciplineSavedCard
          rSaved={overview.disciplineSaved.rSaved}
          settledCount={overview.disciplineSaved.settledCount}
        />
      </div>
    ),
    ALERTS: <AlertsFeed alerts={alerts.alerts} unreadCount={alerts.unreadCount} />,
  };

  return (
    <>
      <KpiRow overview={overview} />

      {displayOrder.map((key, index) => (
        <section
          key={key}
          data-testid={`dashboard-widget-${key.toLowerCase()}`}
          data-widget={key}
          aria-label={WIDGET_LABELS[key]}
          draggable={editing}
          onDragStart={() => onDragStart(key)}
          onDragOver={(event) => onDragOver(event, key)}
          onDragEnd={onDragEnd}
          onDrop={(event) => event.preventDefault()}
          className={cn(
            "relative rounded-xl",
            draggingKey === key && "opacity-45",
            editing && "ring-offset-2",
          )}
        >
          {editing && (
            <WidgetTools
              widgetKey={key}
              label={WIDGET_LABELS[key]}
              index={index}
              count={displayOrder.length}
              onMove={onMove}
            />
          )}
          {WIDGETS[key]}
        </section>
      ))}
    </>
  );
}
