"use client";

import * as React from "react";
import { BookmarkPlus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AnalyticsDatasetMeta,
  AnalyticsFilters as Filters,
} from "@cosmoz/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTradeView, useDeleteTradeView, useTradeViews } from "@/lib/api/queries/trades";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The Analytics global filter system (MASTER PROMPT §5). One filter set
 * drives EVERY tab through ONE server endpoint — a chart can never silently
 * use a different dataset. The resolved dataset is echoed back by the server
 * ("WHAT DATASET AM I LOOKING AT?") and rendered verbatim below the controls.
 *
 * Presets live in the UNIFIED preset library (GET /trade-views, scope
 * ANALYTICS) — the same store the Trades ledger saves its views in, so a
 * named preset is managed in one place across modules.
 */

/**
 * Period machine ids — labels resolve through dict.analytics.filters.periods
 * (i18n pattern: machine values stay module-scope, display resolves at render).
 */
export const PERIOD_OPTIONS: readonly Filters["period"][] = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "LAST_30",
  "LAST_90",
  "YTD",
  "ALL",
  "CUSTOM",
];

export interface Catalogs {
  accounts: { id: string; name: string }[];
  instruments: { id: string; symbol: string }[];
  strategies: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}

const ASSET_CLASSES = ["FOREX", "METAL", "CRYPTO", "SYNTHETIC", "INDEX", "ENERGY"] as const;
/** Machine session ids — labels resolve through dict.analytics.filters.sessions. */
const SESSIONS = ["ASIA", "LONDON", "NEW_YORK"] as const;
const EMOTIONS = [
  "CALM", "CONFIDENT", "ANXIOUS", "FOMO", "TIRED",
  "FRUSTRATED", "REVENGE", "EUPHORIC", "RELIEVED", "BORED",
] as const;
const EXIT_REASONS = [
  "TP", "SL", "MANUAL", "TRAILING", "PARTIAL", "MARGIN",
] as const;

/** Severity styling for the server-detected anomaly chips. */
const ANOMALY_TONE: Record<string, string> = {
  INFO: "border-border bg-surface-raised text-muted-foreground",
  WARN: "border-warning/40 bg-warning/10 text-warning",
  ALERT: "border-loss/40 bg-loss/10 text-loss",
};

interface FilterBarProps {
  filters: Filters;
  catalogs: Catalogs;
  meta: AnalyticsDatasetMeta | undefined;
  isLoading: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

export function FilterBar({ filters, catalogs, meta, isLoading, onChange, onReset }: FilterBarProps) {
  const { dict } = useI18n();
  const F = dict.analytics.filters;
  const S = dict.analytics.shared;

  // Unified preset library (server-persisted) — this module manages the
  // ANALYTICS scope; the Trades ledger manages the TRADES scope of the
  // SAME store, so a preset is saved once and managed in one place.
  const { data: viewsData } = useTradeViews();
  const createView = useCreateTradeView();
  const deleteView = useDeleteTradeView();
  const presets = React.useMemo(
    () => (viewsData?.views ?? []).filter((view) => view.scope === "ANALYTICS"),
    [viewsData],
  );
  const tradesPresetCount = React.useMemo(
    () => (viewsData?.views ?? []).filter((view) => view.scope === "TRADES").length,
    [viewsData],
  );

  const [saveName, setSaveName] = React.useState("");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const savePreset = () => {
    const name = saveName.trim();
    if (name.length === 0) return;
    createView.mutate(
      {
        name,
        scope: "ANALYTICS",
        analyticsFilters: { ...filters },
        filters: {
          q: "", status: "CLOSED", direction: "all", instrumentId: "", strategyId: "",
          outcome: "all", tagId: "", from: "", to: "",
        },
        columns: ["date"],
        sortKey: "date",
        sortDir: "desc",
      },
      {
        onSuccess: () => {
          toast.success(`${F.toastSavedA}${name}${F.toastSavedB}`, {
            description: F.toastSavedDesc,
          });
          setSaveName("");
          setSaveOpen(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, F.toastSaveFailed)),
      },
    );
  };

  const applyPreset = (analyticsFilters: Filters | null) => {
    if (analyticsFilters === null) return;
    onChange({ ...analyticsFilters, period: analyticsFilters.period ?? "ALL" });
  };

  const activeCount = React.useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) =>
        value !== undefined && value !== "ALL" && !(key === "period" && value === "ALL"),
      ).length,
    [filters],
  );

  const selectClass = "h-8 w-full min-w-0 text-xs";

  return (
    <Card className="bg-surface" data-testid="analytics-filters">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            {F.filtersLabel}
            {activeCount > 0 && (
              <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                {activeCount}
              </span>
            )}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {presets.length > 0 && (
              <Select
                value=""
                onValueChange={(id) => {
                  const preset = presets.find((p) => p.id === id);
                  if (preset) applyPreset(preset.analyticsFilters as Filters | null);
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs" aria-label={F.presetsAria} data-testid="analytics-preset-select">
                  <SelectValue placeholder={`${F.presetsPlaceholder} (${presets.length})`} />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative flex items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setSaveOpen((open) => !open)}
                aria-expanded={saveOpen}
              >
                <BookmarkPlus className="size-3.5" aria-hidden="true" />
                {F.savePreset}
              </Button>
              {saveOpen && (
                <div className="absolute right-0 top-9 z-30 flex w-60 items-center gap-1.5 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
                  <Input
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder={F.presetNamePlaceholder}
                    className="h-7 text-xs"
                    aria-label={F.presetNameAria}
                    onKeyDown={(event) => event.key === "Enter" && savePreset()}
                  />
                  <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={savePreset}>
                    {F.save}
                  </Button>
                  <button
                    type="button"
                    aria-label={F.cancelAria}
                    className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setSaveOpen(false)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {/* Unified library manager — rename lives server-side; delete here. */}
            {presets.length > 0 && (
              <div className="relative flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => setManageOpen((open) => !open)}
                  aria-expanded={manageOpen}
                  data-testid="analytics-preset-manage"
                >
                  {F.manage}
                </Button>
                {manageOpen && (
                  <div className="absolute right-0 top-9 z-30 w-64 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
                    <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {F.libraryTitle}
                    </p>
                    <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                      {presets.map((preset) => (
                        <li key={preset.id} className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted/50">
                          <span className="min-w-0 flex-1 truncate text-xs">{preset.name}</span>
                          <button
                            type="button"
                            aria-label={`${F.deletePresetAria} ${preset.name}`}
                            data-testid={`analytics-preset-delete-${preset.name}`}
                            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-loss"
                            disabled={deleteView.isPending}
                            onClick={() =>
                              deleteView.mutate(preset.id, {
                                onSuccess: () => toast.success(`${F.toastDeletedA}${preset.name}${F.toastDeletedB}`),
                                onError: (error) => toast.error(apiErrorMessage(error, F.toastDeleteFailed)),
                              })
                            }
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-border px-1 pt-1.5 text-[10px] text-muted-foreground">
                      {F.sharedWithTrades} {tradesPresetCount} {tradesPresetCount === 1 ? F.ledgerViewOne : F.ledgerViewMany}
                    </p>
                  </div>
                )}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                onReset();
                setShowAdvanced(false);
              }}
              data-testid="analytics-reset"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {F.reset}
            </Button>
          </div>
        </div>

        {/* Primary row: period + the dimensions traders slice by most. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.period}</Label>
            <Select
              value={filters.period}
              onValueChange={(value) => onChange({ period: value as Filters["period"] })}
            >
              <SelectTrigger className={selectClass} data-testid="filter-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {F.periods[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filters.period === "CUSTOM" && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.from}</Label>
                <Input
                  type="date"
                  value={filters.customFrom ?? ""}
                  onChange={(event) => onChange({ customFrom: event.target.value || undefined })}
                  className="h-8 text-xs"
                  aria-label={F.customFromAria}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.to}</Label>
                <Input
                  type="date"
                  value={filters.customTo ?? ""}
                  onChange={(event) => onChange({ customTo: event.target.value || undefined })}
                  className="h-8 text-xs"
                  aria-label={F.customToAria}
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.account}</Label>
            <Select
              value={filters.accountId ?? "all"}
              onValueChange={(value) => onChange({ accountId: value === "all" ? undefined : value })}
            >
              <SelectTrigger className={selectClass} data-testid="filter-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.allAccounts}</SelectItem>
                {catalogs.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.symbol}</Label>
            <Select
              value={filters.instrumentId ?? "all"}
              onValueChange={(value) => onChange({ instrumentId: value === "all" ? undefined : value })}
            >
              <SelectTrigger className={selectClass} data-testid="filter-symbol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.allSymbols}</SelectItem>
                {catalogs.instruments.map((instrument) => (
                  <SelectItem key={instrument.id} value={instrument.id}>
                    {instrument.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.strategy}</Label>
            <Select
              value={filters.strategyId ?? "all"}
              onValueChange={(value) => onChange({ strategyId: value === "all" ? undefined : value })}
            >
              <SelectTrigger className={selectClass} data-testid="filter-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.allStrategies}</SelectItem>
                {catalogs.strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">{F.outOfPlaybook}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.direction}</Label>
            <Select
              value={filters.direction ?? "all"}
              onValueChange={(value) => onChange({ direction: value === "all" ? undefined : (value as Filters["direction"]) })}
            >
              <SelectTrigger className={selectClass} data-testid="filter-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.bothDirections}</SelectItem>
                <SelectItem value="BUY">{F.longOnly}</SelectItem>
                <SelectItem value="SELL">{F.shortOnly}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Secondary row — revealed on demand to keep the bar restrained (§32). */}
        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6", !showAdvanced && "hidden")}>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.assetClass}</Label>
            <Select
              value={filters.assetClass ?? "all"}
              onValueChange={(value) => onChange({ assetClass: value === "all" ? undefined : (value as Filters["assetClass"]) })}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.allClasses}</SelectItem>
                {ASSET_CLASSES.map((assetClass) => (
                  <SelectItem key={assetClass} value={assetClass}>
                    {F.assetClasses[assetClass]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.session}</Label>
            <Select
              value={filters.session ?? "all"}
              onValueChange={(value) => onChange({ session: value === "all" ? undefined : (value as Filters["session"]) })}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.allSessions}</SelectItem>
                {SESSIONS.map((session) => (
                  <SelectItem key={session} value={session}>
                    {F.sessions[session]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.emotionBefore}</Label>
            <Select
              value={filters.emotion ?? "all"}
              onValueChange={(value) => onChange({ emotion: value === "all" ? undefined : (value as Filters["emotion"]) })}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.anyEmotion}</SelectItem>
                {EMOTIONS.map((emotion) => (
                  <SelectItem key={emotion} value={emotion}>
                    {F.emotions[emotion]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.exitReason}</Label>
            <Select
              value={filters.exitReason ?? "all"}
              onValueChange={(value) => onChange({ exitReason: value === "all" ? undefined : (value as Filters["exitReason"]) })}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.anyExit}</SelectItem>
                {EXIT_REASONS.map((exitReason) => (
                  <SelectItem key={exitReason} value={exitReason}>
                    {F.exitReasons[exitReason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{F.tag}</Label>
            <Select
              value={filters.tagId ?? "all"}
              onValueChange={(value) => onChange({ tagId: value === "all" ? undefined : value })}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F.anyTag}</SelectItem>
                {catalogs.tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setShowAdvanced((open) => !open)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? F.hideFilters : F.showFilters} {F.moreFiltersTail}
          </button>
          {isLoading && <span className="text-[11px] text-muted-foreground" role="status">{F.computing}</span>}
        </div>

        {/* WHAT DATASET AM I LOOKING AT? — server-echoed truth (§5). */}
        {meta !== undefined && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-[11px] text-muted-foreground"
            data-testid="analytics-dataset"
          >
            <span className="font-semibold text-foreground">{F.datasetLabel}</span>
            <span className="font-mono tabular-nums">{meta.closedTrades} {S.closedTrades}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{meta.resolvedFrom} → {meta.resolvedTo}</span>
            {meta.descriptor !== "All accounts · all symbols" && (
              <>
                <span aria-hidden="true">·</span>
                <span>{meta.descriptor}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{meta.openTradesExcluded} {S.openExcluded}</span>
            {meta.warnings.map((warning) => (
              <span key={warning} className="w-full text-warning" role="note">
                ⚠ {warning}
              </span>
            ))}
            {/* Server-detected anomalies — measured facts, rendered verbatim. */}
            {meta.anomalies.length > 0 && (
              <div className="flex w-full flex-col gap-1 pt-0.5" data-testid="analytics-anomalies">
                {meta.anomalies.map((anomaly) => (
                  <div
                    key={anomaly.code}
                    className={cn(
                      "flex flex-wrap items-center gap-1.5 rounded border px-2 py-1",
                      ANOMALY_TONE[anomaly.severity] ?? ANOMALY_TONE.INFO,
                    )}
                  >
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">
                      {anomaly.code}
                    </span>
                    <span className="min-w-0 flex-1">{anomaly.message}</span>
                    {anomaly.hint !== null && (
                      <span className="text-[10px] italic opacity-80">{anomaly.hint}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
