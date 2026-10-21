"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  LayoutGrid,
  Plus,
  RefreshCcw,
  Stars,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ConfirmDialog } from "@/components/dashboard/customization/confirm-dialog";
import { DashboardFilterBar } from "@/components/dashboard/customization/filter-bar";
import { DashboardGrid } from "@/components/dashboard/customization/dashboard-grid";
import { EditToolbar } from "@/components/dashboard/customization/edit-toolbar";
import { LayoutsManagerDialog } from "@/components/dashboard/customization/layouts-manager-dialog";
import { WidgetLibraryDialog } from "@/components/dashboard/customization/widget-library-dialog";
import {
  WidgetSettingsDialog,
} from "@/components/dashboard/customization/widget-settings-dialog";
import type { DashboardWidgetData } from "@/components/dashboard/customization/widgets-renderer";
import { useDashboardCustomization } from "@/lib/hooks/use-dashboard-customization";
import { useDashboardFilters } from "@/lib/hooks/use-dashboard-filters";
import { useAccounts, useInstruments, useStrategies } from "@/lib/api/queries/catalogs";
import {
  useAlerts,
  useAnalyticsSuite,
  usePreferences,
  useRulesStatus,
  useStatsOverview,
} from "@/lib/api/queries";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard-customization/templates";
import { activeFilterCount, filtersToSuiteFilters } from "@/lib/dashboard-customization/filters";
import { activeViewOf, isDivergedFromView } from "@/lib/dashboard-customization/filters-state";
import { WIDGET_REGISTRY } from "@/lib/dashboard-customization/registry";
import type { DashboardWidgetConfig } from "@cosmoz/shared";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";

/** Fresh-account window: an account created less than 48 hours ago is
 * greeted as a first arrival ("Welcome") instead of a returning trader
 * ("Welcome back"). Derived from the REAL signup timestamp — no fake
 * persistence, self-expires. */
const FRESH_ACCOUNT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Widget types fed by the dashboard-level analytics-suite fetch (filter-
 * aware — Phase 05 §10 closed the gap where the comparison widgets fetched
 * their own ALL window and ignored the global filter context). METRICS_CARD
 * manages its OWN per-period fetches — it is deliberately NOT in this list
 * (no double fetch, §14). */
const SUITE_WIDGET_TYPES = new Set([
  "STRATEGY_COMPARE",
  "LONG_SHORT",
  "ACTIVITY_HEATMAP",
  "PERFORMANCE_BREAKDOWN",
  "BEHAVIORAL_INSIGHTS",
  "LOSS_STREAKS",
  "PERFORMANCE_TREND",
]);

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

/** Confirmation intents — one ConfirmDialog instance serves every flow. */
type ConfirmIntent =
  | { kind: "cancelEdit" }
  | { kind: "resetDraft" }
  | { kind: "deleteLayout"; layoutId: string; layoutName: string }
  | { kind: "templateDraft"; templateId: string; templateName: string };

interface DashboardViewProps {
  title: string;
  description: string;
}

/**
 * Dashboard (Phase 01 — customizable workspace): KPI band → a draggable,
 * resizable, hide-able widget grid driven by saved layouts. Layout
 * configuration lives in the `dashboard` preferences domain (PATCH
 * /me/preferences/dashboard) and is edited as an explicit draft
 * transaction (Edit mode → Save/Cancel). Density COMFORTABLE keeps the
 * designed rhythm; COMPACT tightens it per the stored appearance pref.
 */
export function DashboardView({ description }: DashboardViewProps) {
  const greeting = useDashboardGreeting();
  const overview = useStatsOverview();
  const rules = useRulesStatus();
  const alerts = useAlerts();
  const queryClient = useQueryClient();

  const c = useDashboardCustomization();
  const f = useDashboardFilters();
  const { data: prefs } = usePreferences();
  const compact = (prefs?.appearance.density ?? "COMFORTABLE") === "COMPACT";

  // Catalogs for the filter bar (same source as the Analytics page — the
  // user's OWN accounts/instruments/strategies, never a fabricated list).
  const accounts = useAccounts();
  const instruments = useInstruments();
  const strategies = useStrategies();

  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [layoutsOpen, setLayoutsOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<ConfirmIntent | null>(null);
  const [settingsInstanceId, setSettingsInstanceId] = React.useState<string | null>(null);

  // The analytics-suite aggregates for the comparison widgets — fetched
  // with the AUTHORITATIVE global filter context (Phase 03 §7: one shared
  // query per filter combination; the filter set IS the query key, so a
  // change refetches and stale responses cannot cross key boundaries).
  // METRICS_CARD manages its OWN per-period fetches — it is deliberately
  // NOT in this list (no double fetch, §14) — it merges the global filters
  // itself.
  const displayedTypes = React.useMemo(
    () => new Set(c.displayedLayout.widgets.filter((widget) => widget.visible).map((widget) => widget.type)),
    [c.displayedLayout.widgets],
  );
  const needsSuite = [...SUITE_WIDGET_TYPES].some((type) => displayedTypes.has(type as never));
  const suiteQuery = useAnalyticsSuite(filtersToSuiteFilters(f.filters), 50, { enabled: needsSuite });
  // Destructured for the memoized bundle below (stable dep list, no lint warning).
  const { data: suiteData, isPending: suitePending, isLoading: suiteLoading, isError: suiteError, refetch: suiteRefetch } = suiteQuery;

  const compactSpacing = compact; // named for the className below
  const activeView = activeViewOf(f.state);
  const diverged = isDivergedFromView(f.state);
  const filterCount = activeFilterCount(f.filters);
  const isLoading = overview.isLoading || rules.isLoading || alerts.isLoading || c.prefsLoading;
  const isError = overview.isError || rules.isError || alerts.isError;
  const isEmpty =
    !isLoading && !isError && (overview.data?.equityCurve.length ?? 0) === 0;
  const contentReady = Boolean(overview.data && rules.data && alerts.data) && !isEmpty;

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  // Phase 09 — the bundle is memoized so suite-fed widgets and the grid
  // receive a STABLE object + refetch identity across unrelated re-renders
  // (filter-bar state churn no longer rebuilds the widget-data contract).
  const widgetData: DashboardWidgetData | null = React.useMemo(
    () =>
      overview.data && rules.data && alerts.data
        ? {
            overview: overview.data,
            rulesStatus: rules.data,
            alerts: alerts.data,
            suite: needsSuite ? (suiteData ?? null) : null,
            suiteStatus: {
              isLoading: needsSuite ? suitePending || suiteLoading : false,
              isError: needsSuite ? Boolean(suiteError) : false,
              refetch: () => void suiteRefetch(),
            },
          }
        : null,
    [overview.data, rules.data, alerts.data, needsSuite, suiteData, suitePending, suiteLoading, suiteError, suiteRefetch],
  );

  const editing = c.editing;
  const actionsDisabled = isLoading || isError || isEmpty;

  /** Per-widget settings (Phase 02 §6): the dialog validates, the hook
   * routes (draft in edit mode, immediate persist in view mode). */
  const settingsWidget = React.useMemo(
    () =>
      settingsInstanceId
        ? c.displayedLayout.widgets.find((widget) => widget.instanceId === settingsInstanceId) ?? null
        : null,
    [settingsInstanceId, c.displayedLayout.widgets],
  );
  const handleConfirmSettings = React.useCallback(
    (config: DashboardWidgetConfig) => {
      if (!settingsInstanceId) return;
      c.setWidgetConfig(settingsInstanceId, config);
    },
    [settingsInstanceId, c],
  );
  const handleConfigRange = React.useCallback(
    (instanceId: string, range: 7 | 30 | 90) => {
      const widget = c.displayedLayout.widgets.find((candidate) => candidate.instanceId === instanceId);
      if (!widget || widget.config?.kind !== "PNL_BAND") return;
      c.setWidgetConfig(instanceId, { ...widget.config, range });
    },
    [c],
  );

  const handleCancel = React.useCallback(() => {
    if (c.dirty) setConfirm({ kind: "cancelEdit" });
    else c.cancelEdit();
  }, [c]);

  const handleDeleteLayout = React.useCallback(
    (layoutId: string) => {
      const layout = c.state.layouts.find((candidate) => candidate.id === layoutId);
      if (!layout) return;
      setConfirm({ kind: "deleteLayout", layoutId, layoutName: layout.name });
    },
    [c.state.layouts],
  );

  const handleApplyTemplate = React.useCallback(
    (templateId: string, templateName: string) => {
      if (editing) {
        setConfirm({ kind: "templateDraft", templateId, templateName });
      } else {
        c.createLayoutFromTemplate(templateId);
        setLayoutsOpen(false);
      }
    },
    [editing, c],
  );

  const confirmCopy: Record<ConfirmIntent["kind"], { title: string; body: string; confirm: string; destructive: boolean }> = {
    cancelEdit: {
      title: "Discard layout changes?",
      body: "Your edits to this layout are not saved yet. Cancel now discards them.",
      confirm: "Discard changes",
      destructive: true,
    },
    resetDraft: {
      title: "Reset to the default layout?",
      body: "This replaces the current draft with the shipped default arrangement. Save to keep it.",
      confirm: "Reset draft",
      destructive: true,
    },
    deleteLayout: {
      title: `Delete "${confirm?.kind === "deleteLayout" ? confirm.layoutName : ""}"?`,
      body: "The layout and its arrangement are removed. Your trades, accounts and widgets stay untouched.",
      confirm: "Delete layout",
      destructive: true,
    },
    templateDraft: {
      title: "Replace the draft with this template?",
      body: "Your current draft arrangement is replaced by the template's. Save to keep the result.",
      confirm: "Replace draft",
      destructive: true,
    },
  };

  return (
    <div
      data-page="dashboard"
      className={`mx-auto w-full max-w-7xl ${compactSpacing ? "space-y-3" : "space-y-4 sm:space-y-6"}`}
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
        {!editing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="dashboard-layouts"
              onClick={() => setLayoutsOpen(true)}
              disabled={actionsDisabled}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              Workspaces
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="dashboard-customize"
              onClick={c.enterEdit}
              disabled={actionsDisabled}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Edit layout
            </Button>
          </div>
        )}
      </header>

      {editing && (
        <>
          <p className="text-xs text-muted-foreground" data-testid="dashboard-edit-hint">
            Drag a widget by its grip, resize it from its edges — or use the tools on each
            card (the gear opens a widget&apos;s own settings). Nothing is saved until you press
            Save.
          </p>
          <EditToolbar
            layoutName={c.activeLayout.name}
            dirty={c.dirty}
            saving={c.state.persistence === "saving"}
            saveError={c.state.saveError}
            onAddWidgets={() => setLibraryOpen(true)}
            onManageLayouts={() => setLayoutsOpen(true)}
            onReset={() => setConfirm({ kind: "resetDraft" })}
            onCancel={handleCancel}
            onSave={c.saveEdit}
          />
        </>
      )}

      {/* Phase 03 — the global filter bar: ONE authoritative filter context
          above the grid. Visible in view AND edit mode (filters are
          orthogonal to layout editing, §11). */}
      {!isError && (
        <DashboardFilterBar
          filters={f.filters}
          views={f.views}
          activeView={activeView}
          diverged={diverged}
          saving={f.saving}
          viewError={f.viewError}
          catalogs={{
            accounts: (accounts.data?.accounts ?? []).map((account) => ({ id: account.id, name: account.name })),
            instruments: (instruments.data?.instruments ?? []).map((instrument) => ({ id: instrument.id, symbol: instrument.symbol })),
            strategies: (strategies.data?.strategies ?? []).map((strategy) => ({ id: strategy.id, name: strategy.name })),
          }}
          onPatch={f.patchFilter}
          onClear={f.clearFilters}
          onApplyView={f.applyView}
          onCreate={f.createView}
          onRename={f.renameView}
          onDuplicate={f.duplicateView}
          onDelete={f.deleteView}
        />
      )}

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorDashboard onRetry={retry} />
      ) : isEmpty ? (
        <EmptyDashboard />
      ) : contentReady && widgetData ? (
        <>
          {/* The KPI band stays fixed above the customizable grid — the
              designed ledger header is not a Phase 01 widget. */}
          <KpiRow overview={overview.data!} />
          <DashboardGrid
            layout={c.displayedLayout}
            data={widgetData}
            editing={editing}
            globalFilters={filtersToSuiteFilters(f.filters)}
            showUnfilteredBadges={filterCount > 0}
            onMoveTo={c.moveWidgetTo}
            onMoveBy={c.moveWidgetBy}
            onResize={c.resizeWidget}
            onHide={(instanceId) => c.setWidgetVisible(instanceId, false)}
            onRemove={c.removeWidget}
            onOpenSettings={setSettingsInstanceId}
            onConfigRange={handleConfigRange}
          />
        </>
      ) : null}

      <WidgetLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        layout={c.displayedLayout}
        onAdd={c.addWidget}
        onShow={(instanceId) => c.setWidgetVisible(instanceId, true)}
      />

      <LayoutsManagerDialog
        open={layoutsOpen}
        onOpenChange={setLayoutsOpen}
        layouts={c.state.layouts}
        activeLayoutId={c.activeLayout.id}
        editing={editing}
        onSwitch={c.switchLayout}
        onDuplicate={c.duplicateLayout}
        onRename={c.renameLayout}
        onDelete={handleDeleteLayout}
        onCreateEmpty={() => c.createEmptyLayout()}
        onApplyTemplate={(templateId) => {
          const name =
            DASHBOARD_TEMPLATES.find((template) => template.id === templateId)?.name ??
            "this template";
          handleApplyTemplate(templateId, name);
        }}
        defaultLayoutId={c.state.defaultLayoutId}
        userTemplates={c.state.userTemplates}
        onSetDefault={c.setDefaultLayout}
        onSaveAsTemplate={(name) => c.saveWorkspaceAsTemplate(name)}
        onDeleteUserTemplate={c.deleteUserTemplate}
        onApplyUserTemplate={(templateId) => c.createWorkspaceFromUserTemplate(templateId)}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? confirmCopy[confirm.kind].title : ""}
        description={confirm ? confirmCopy[confirm.kind].body : ""}
        confirmLabel={confirm ? confirmCopy[confirm.kind].confirm : ""}
        destructive={confirm ? confirmCopy[confirm.kind].destructive : false}
        onConfirm={() => {
          if (!confirm) return;
          switch (confirm.kind) {
            case "cancelEdit":
              c.cancelEdit();
              break;
            case "resetDraft":
              c.resetDraftToDefault();
              break;
            case "deleteLayout":
              c.deleteLayout(confirm.layoutId);
              break;
            case "templateDraft":
              c.replaceDraftWithTemplate(confirm.templateId);
              break;
          }
        }}
      />

      <WidgetSettingsDialog
        open={settingsInstanceId !== null && settingsWidget !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsInstanceId(null);
        }}
        widgetType={settingsWidget?.type ?? "PNL_BAND"}
        widgetName={
          settingsWidget
            ? (WIDGET_REGISTRY[settingsWidget.type]?.name ?? settingsWidget.type)
            : ""
        }
        config={settingsWidget?.config}
        onConfirm={handleConfirmSettings}
      />
    </div>
  );
}

