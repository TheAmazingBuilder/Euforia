"use client";

import * as React from "react";
import {
  BookmarkPlus,
  Copy,
  Filter,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { DashboardFilters, DashboardSavedView } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/dashboard/customization/confirm-dialog";
import { toast } from "sonner";
import {
  activeFilterChips,
  DASHBOARD_PERIOD_LABELS,
  DASHBOARD_PERIOD_OPTIONS,
  isDefaultFilters,
} from "@/lib/dashboard-customization/filters";
import { cn } from "@/lib/utils";

/**
 * The dashboard global filter bar (Phase 03 §5/§10) — ONE authoritative
 * filter context above the customizable grid. Suite-fed widgets consume it
 * (registry `filterSupport: FULL`); unaffected widgets are badged by the
 * grid instead of faking a filtered result (§8).
 *
 * Layout mirrors the Analytics FilterBar conventions (compact h-8 controls,
 * progressive disclosure) with the dashboard's own saved-view store: views
 * are analytical filter contexts ONLY — never layouts (§11).
 */

export interface FilterBarCatalogs {
  accounts: { id: string; name: string }[];
  instruments: { id: string; symbol: string }[];
  strategies: { id: string; name: string }[];
}

interface FilterBarProps {
  filters: DashboardFilters;
  views: DashboardSavedView[];
  /** The view currently applied, if any. */
  activeView: DashboardSavedView | null;
  /** True when the active filters differ from the applied view (§10.7). */
  diverged: boolean;
  saving: boolean;
  /** Last saved-view op error — surfaced inline (never a silent failure). */
  viewError: string | null;
  catalogs: FilterBarCatalogs;
  onPatch: (patch: Partial<DashboardFilters>) => void;
  onClear: () => void;
  onApplyView: (viewId: string) => void;
  onCreate: (name: string, description?: string) => void;
  onRename: (viewId: string, name: string) => void;
  onDuplicate: (viewId: string) => void;
  onDelete: (viewId: string) => void;
}

const DIRECTION_OPTIONS = [
  { value: "BUY", label: "Long (BUY)" },
  { value: "SELL", label: "Short (SELL)" },
] as const;

const selectClass = "h-8 min-w-0 text-xs";

export function DashboardFilterBar({
  filters,
  views,
  activeView,
  diverged,
  saving,
  viewError,
  catalogs,
  onPatch,
  onClear,
  onApplyView,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: FilterBarProps) {
  const chips = activeFilterChips(filters);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [manageOpen, setManageOpen] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<DashboardSavedView | null>(null);

  const saveView = () => {
    const name = saveName.trim();
    if (name.length === 0) return;
    onCreate(name);
    setSaveName("");
    setSaveOpen(false);
    toast.success(`View "${name}" saved.`, {
      description: "The current filter combination is stored in your dashboard preferences.",
    });
  };

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name.length === 0) return;
    onRename(renamingId, name);
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <Card
      className="bg-surface"
      data-testid="dashboard-filter-bar"
      data-active-view={activeView?.id ?? ""}
      data-views-count={views.length}
      data-persistence={saving ? "saving" : "idle"}
    >
      <CardContent className="space-y-2.5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* ── Saved views (§10) ─────────────────────────────────────────── */}
          <span
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            aria-hidden="true"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {chips.length > 0 && (
              <span
                className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent"
                data-testid="dashboard-filter-count"
              >
                {chips.length}
              </span>
            )}
          </span>

          <Select
            value={activeView?.id ?? ""}
            onValueChange={(id) => {
              if (id) onApplyView(id);
            }}
          >
            <SelectTrigger
              className={cn("h-8 w-44 text-xs", diverged && "border-accent/60")}
              aria-label="Saved analytical views"
              data-testid="dashboard-view-select"
            >
              <SelectValue placeholder="Saved views" />
            </SelectTrigger>
            <SelectContent>
              {views.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No saved views yet.</div>
              )}
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id} data-testid={`dashboard-view-option-${view.id}`}>
                  {view.name}
                  {view.id === activeView?.id && diverged ? " •" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Save current combination */}
          <div className="relative flex items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setSaveOpen((open) => !open)}
              aria-expanded={saveOpen}
              data-testid="dashboard-view-save"
              disabled={isDefaultFilters(filters)}
              title={isDefaultFilters(filters) ? "Set at least one filter before saving a view" : "Save the current filter combination"}
            >
              <BookmarkPlus className="size-3.5" aria-hidden="true" />
              Save view
            </Button>
            {saveOpen && (
              <div className="absolute left-0 top-9 z-30 flex w-64 items-center gap-1.5 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
                <Input
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  placeholder="View name"
                  className="h-7 text-xs"
                  aria-label="Saved view name"
                  maxLength={60}
                  data-testid="dashboard-view-name-input"
                  onKeyDown={(event) => event.key === "Enter" && saveView()}
                />
                <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={saveView}>
                  Save
                </Button>
                <button
                  type="button"
                  aria-label="Cancel"
                  className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setSaveOpen(false)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Manage views (rename / duplicate / delete) */}
          {views.length > 0 && (
            <div className="relative flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setManageOpen((open) => !open)}
                aria-expanded={manageOpen}
                data-testid="dashboard-view-manage"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Manage
              </Button>
              {manageOpen && (
                <div
                  className="absolute left-0 top-9 z-30 w-72 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
                  data-testid="dashboard-view-manage-popover"
                >
                  {viewError && (
                    <p className="mb-1.5 rounded-md border border-loss/40 bg-loss/10 px-2 py-1 text-[11px] text-loss" role="alert">
                      {viewError === "NAME_TAKEN"
                        ? "A view with this name already exists."
                        : viewError === "LIMIT_REACHED"
                          ? "The saved-view limit (30) is reached — delete one first."
                          : viewError === "INVALID_NAME"
                            ? "Names must be 1–60 characters."
                            : "This view no longer exists."}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {views.map((view) => (
                      <li key={view.id} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-background/60">
                        {renamingId === view.id ? (
                          <>
                            <Input
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              className="h-7 text-xs"
                              aria-label={`New name for ${view.name}`}
                              autoFocus
                              maxLength={60}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRename();
                                if (event.key === "Escape") setRenamingId(null);
                              }}
                            />
                            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={commitRename}>
                              OK
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                              title={view.description ?? view.name}
                              onClick={() => {
                                onApplyView(view.id);
                                setManageOpen(false);
                              }}
                            >
                              {view.name}
                            </button>
                            <button
                              type="button"
                              aria-label={`Duplicate ${view.name}`}
                              title="Duplicate"
                              className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                              onClick={() => onDuplicate(view.id)}
                            >
                              <Copy className="size-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Rename ${view.name}`}
                              title="Rename"
                              className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setRenamingId(view.id);
                                setRenameValue(view.name);
                              }}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${view.name}`}
                              title="Delete"
                              className="rounded-sm p-1 text-muted-foreground hover:text-loss"
                              onClick={() => setDeleteTarget(view)}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    aria-label="Close manage views"
                    className="mt-1 w-full rounded-md py-1 text-center text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setManageOpen(false)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {diverged && activeView && (
            <button
              type="button"
              className="rounded-md border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/20"
              data-testid="dashboard-view-diverged"
              title="The active filters differ from this saved view. Click to restore the view's filters — or save the current combination as a new view."
              onClick={() => onApplyView(activeView.id)}
            >
              {activeView.name} · modified — apply again
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onClear}
              disabled={chips.length === 0}
              data-testid="dashboard-filter-clear"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Clear all
            </Button>
            {saving && <span className="text-[11px] text-muted-foreground">Saving…</span>}
          </div>
        </div>

        {/* ── Dimension controls (§5) — wrap on mobile, no overflow ────────── */}
        <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-filter-dimensions">
          <span
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
            aria-hidden="true"
          >
            <Filter className="size-3" />
          </span>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Period</span>
            <Select
              value={filters.period}
              onValueChange={(value) => onPatch({ period: value as DashboardFilters["period"] })}
            >
              <SelectTrigger className={cn(selectClass, "w-36")} aria-label="Period" data-testid="dashboard-filter-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {DASHBOARD_PERIOD_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Account</span>
            <Select
              value={filters.accountId ?? "ALL"}
              onValueChange={(value) => onPatch({ accountId: value === "ALL" ? undefined : value })}
            >
              <SelectTrigger className={cn(selectClass, "w-40")} aria-label="Account" data-testid="dashboard-filter-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All accounts</SelectItem>
                {catalogs.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Instrument</span>
            <Select
              value={filters.instrumentId ?? "ALL"}
              onValueChange={(value) => onPatch({ instrumentId: value === "ALL" ? undefined : value })}
            >
              <SelectTrigger className={cn(selectClass, "w-36")} aria-label="Instrument" data-testid="dashboard-filter-instrument">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All instruments</SelectItem>
                {catalogs.instruments.map((instrument) => (
                  <SelectItem key={instrument.id} value={instrument.id}>
                    {instrument.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Strategy</span>
            <Select
              value={filters.strategyId ?? "ALL"}
              onValueChange={(value) =>
                onPatch({ strategyId: value === "ALL" ? undefined : (value as DashboardFilters["strategyId"]) })
              }
            >
              <SelectTrigger className={cn(selectClass, "w-40")} aria-label="Strategy" data-testid="dashboard-filter-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All strategies</SelectItem>
                <SelectItem value="none">Out of playbook</SelectItem>
                {catalogs.strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Direction</span>
            <Select
              value={filters.direction ?? "ALL"}
              onValueChange={(value) =>
                onPatch({ direction: value === "ALL" ? undefined : (value as DashboardFilters["direction"]) })
              }
            >
              <SelectTrigger className={cn(selectClass, "w-32")} aria-label="Direction" data-testid="dashboard-filter-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Long &amp; short</SelectItem>
                {DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {filters.period === "CUSTOM" && (
            <div className="flex items-center gap-1.5" data-testid="dashboard-filter-custom-range">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="sr-only sm:not-sr-only">From</span>
                <Input
                  type="date"
                  value={filters.customFrom ?? ""}
                  onChange={(event) => onPatch({ customFrom: event.target.value || undefined })}
                  className="h-8 w-36 text-xs"
                  aria-label="Custom range start"
                />
              </label>
              <span aria-hidden="true" className="text-xs text-muted-foreground">→</span>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="sr-only sm:not-sr-only">To</span>
                <Input
                  type="date"
                  value={filters.customTo ?? ""}
                  onChange={(event) => onPatch({ customTo: event.target.value || undefined })}
                  className="h-8 w-36 text-xs"
                  aria-label="Custom range end"
                />
              </label>
              {!filters.customFrom || !filters.customTo ? (
                <span className="text-[11px] text-muted-foreground" role="status">
                  Pick both bounds — until then the period stays unfiltered.
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Active-filter chips (§5 view/remove) ─────────────────────────── */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="dashboard-filter-chips">
            {chips.map((chip) => (
              <span
                key={`${chip.dimension}:${chip.value}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <span className="font-medium text-foreground">{chipLabel(chip, catalogs, filters)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${chip.dimension} filter`}
                  className="rounded-full p-0.5 hover:text-foreground"
                  onClick={() => removeChip(chip.dimension, onPatch)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="The saved view is removed. Your trades, accounts, layouts and current filters stay untouched."
        confirmLabel="Delete view"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Card>
  );
}

function chipLabel(
  chip: { dimension: string; value: string },
  catalogs: FilterBarCatalogs,
  filters: DashboardFilters,
): string {
  switch (chip.dimension) {
    case "period":
      return chip.value === "CUSTOM" && filters.customFrom && filters.customTo
        ? `${filters.customFrom} → ${filters.customTo}`
        : (DASHBOARD_PERIOD_LABELS[chip.value as DashboardFilters["period"]] ?? chip.value);
    case "account":
      return catalogs.accounts.find((account) => account.id === chip.value)?.name ?? "Unknown account";
    case "instrument":
      return catalogs.instruments.find((instrument) => instrument.id === chip.value)?.symbol ?? "Unknown instrument";
    case "strategy":
      return chip.value === "none"
        ? "Out of playbook"
        : (catalogs.strategies.find((strategy) => strategy.id === chip.value)?.name ?? "Unknown strategy");
    case "direction":
      return chip.value === "BUY" ? "Long" : "Short";
    default:
      return chip.value;
  }
}

function removeChip(
  dimension: "period" | "account" | "instrument" | "strategy" | "direction",
  onPatch: (patch: Partial<DashboardFilters>) => void,
): void {
  switch (dimension) {
    case "period":
      onPatch({ period: "ALL", customFrom: undefined, customTo: undefined });
      break;
    case "account":
      onPatch({ accountId: undefined });
      break;
    case "instrument":
      onPatch({ instrumentId: undefined });
      break;
    case "strategy":
      onPatch({ strategyId: undefined });
      break;
    case "direction":
      onPatch({ direction: undefined });
      break;
  }
}
