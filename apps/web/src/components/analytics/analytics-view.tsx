"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AnalyticsFilters as Filters, AnalyticsSuiteResponse } from "@cosmoz/shared";

import { useAccounts, useInstruments, useStrategies, useTags } from "@/lib/api/queries/catalogs";
import { useAnalyticsSuite } from "@/lib/api/queries/stats";
import { useI18n } from "@/i18n/i18n-provider";
import { FilterBar, type Catalogs } from "@/components/analytics/analytics-filters";
import { OverviewTab, PerformanceTab, RiskTab } from "@/components/analytics/panels-performance";
import { MarketTab, PsychologyTab, StrategyTab, TimeTab } from "@/components/analytics/panels-dimensions";
import {
  AdvancedTab,
  EventsTab,
  MistakesTab,
  MonteCarloTab,
  QualityTab,
  ReportsTab,
} from "@/components/analytics/panels-behavior";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Analytics module shell (MASTER PROMPT §4/§5): a global filter bar feeds ONE
 * server dataset to 13 tabs. Filter state lives in the URL so any filtered
 * view is shareable; the tab is persisted as ?tab= like the other modules.
 */

/** Tab machine ids — labels resolve through dict.analytics.view.tabs. */
const TAB_IDS = [
  "overview",
  "performance",
  "risk",
  "strategy",
  "market",
  "time",
  "psychology",
  "quality",
  "mistakes",
  "events",
  "advanced",
  "montecarlo",
  "reports",
] as const;

type TabId = (typeof TAB_IDS)[number];

function filtersFromParams(searchParams: URLSearchParams): Filters {
  const get = (key: string): string | undefined => {
    const value = searchParams.get(key);
    return value === null || value === "" || value === "all" ? undefined : value;
  };
  const period = searchParams.get("period");
  return {
    period: (period !== null && period !== "" ? period : "ALL") as Filters["period"],
    customFrom: get("customFrom"),
    customTo: get("customTo"),
    accountId: get("acct"),
    instrumentId: get("sym"),
    assetClass: get("cls") as Filters["assetClass"],
    strategyId: get("strat"),
    direction: get("dir") as Filters["direction"],
    session: get("sess") as Filters["session"],
    emotion: get("emo") as Filters["emotion"],
    exitReason: get("exit") as Filters["exitReason"],
    tagId: get("tag"),
  };
}

export function AnalyticsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dict } = useI18n();
  const V = dict.analytics.view;

  const filters = React.useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TAB_IDS.some((tab) => tab === rawTab) ? rawTab : "overview") as TabId;

  const setParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const setTab = React.useCallback(
    (next: string) => setParams((params) => {
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
    }),
    [setParams],
  );

  const patchFilters = React.useCallback(
    (patch: Partial<Filters>) =>
      setParams((params) => {
        const mapping: Partial<Record<keyof Filters, string>> = {
          period: "period",
          customFrom: "customFrom",
          customTo: "customTo",
          accountId: "acct",
          instrumentId: "sym",
          assetClass: "cls",
          strategyId: "strat",
          direction: "dir",
          session: "sess",
          emotion: "emo",
          exitReason: "exit",
          tagId: "tag",
        };
        for (const [key, value] of Object.entries(patch)) {
          const param = mapping[key as keyof Filters];
          if (param === undefined) continue;
          if (value === undefined || value === "all") params.delete(param);
          else params.set(param, String(value));
        }
      }),
    [setParams],
  );

  const resetFilters = React.useCallback(
    () =>
      setParams((params) => {
        for (const key of ["period", "customFrom", "customTo", "acct", "sym", "cls", "strat", "dir", "sess", "emo", "exit", "tag"]) {
          params.delete(key);
        }
      }),
    [setParams],
  );

  // ── Catalogs for the filter dropdowns ─────────────────────────────────────
  const accounts = useAccounts();
  const instruments = useInstruments();
  const strategies = useStrategies();
  const tags = useTags();

  const catalogs: Catalogs = React.useMemo(
    () => ({
      accounts: (accounts.data?.accounts ?? []).map((account) => ({ id: account.id, name: account.name })),
      instruments: (instruments.data?.instruments ?? []).map((instrument) => ({ id: instrument.id, symbol: instrument.symbol })),
      strategies: (strategies.data?.strategies ?? []).map((strategy) => ({ id: strategy.id, name: strategy.name })),
      tags: (tags.data?.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
    }),
    [accounts.data, instruments.data, strategies.data, tags.data],
  );

  // ── THE dataset (one request, one truth) ──────────────────────────────────
  const suite = useAnalyticsSuite(filters);
  const data: AnalyticsSuiteResponse | undefined = suite.data;

  return (
    <div className="space-y-4 sm:space-y-5">
      <FilterBar
        filters={filters}
        catalogs={catalogs}
        meta={data?.meta}
        isLoading={suite.isLoading}
        onChange={patchFilters}
        onReset={resetFilters}
      />

      <Tabs value={activeTab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="h-auto w-max flex-wrap gap-1">
            {TAB_IDS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="text-xs">
                {V.tabs[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {data === undefined ? (
          <div className="space-y-3 pt-4" aria-busy="true" aria-label={V.loadingAria}>
            <Skeleton className="h-28 rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-4">
              <OverviewTab suite={data} />
            </TabsContent>
            <TabsContent value="performance" className="mt-4">
              <PerformanceTab suite={data} />
            </TabsContent>
            <TabsContent value="risk" className="mt-4">
              <RiskTab suite={data} />
            </TabsContent>
            <TabsContent value="strategy" className="mt-4">
              <StrategyTab
                suite={data}
                onDrillToStrategy={(strategyId) => patchFilters({ strategyId: strategyId ?? "none" })}
              />
            </TabsContent>
            <TabsContent value="market" className="mt-4">
              <MarketTab suite={data} onDrillToSymbol={(instrumentId) => patchFilters({ instrumentId })} />
            </TabsContent>
            <TabsContent value="time" className="mt-4">
              <TimeTab suite={data} />
            </TabsContent>
            <TabsContent value="psychology" className="mt-4">
              <PsychologyTab suite={data} />
            </TabsContent>
            <TabsContent value="quality" className="mt-4">
              <QualityTab suite={data} />
            </TabsContent>
            <TabsContent value="mistakes" className="mt-4">
              <MistakesTab suite={data} />
            </TabsContent>
            <TabsContent value="events" className="mt-4">
              <EventsTab suite={data} />
            </TabsContent>
            <TabsContent value="advanced" className="mt-4">
              <AdvancedTab suite={data} />
            </TabsContent>
            <TabsContent value="montecarlo" className="mt-4">
              <MonteCarloTab suite={data} />
            </TabsContent>
            <TabsContent value="reports" className="mt-4">
              <ReportsTab suite={data} filters={filters} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
