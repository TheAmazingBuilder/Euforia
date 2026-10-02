"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, Stars } from "lucide-react";
import type { Strategy, StrategyStat } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StrategiesPanel } from "@/components/playbook/strategies-panel";
import { OverviewPanel } from "@/components/playbook/overview-panel";
import { SetupsPanel } from "@/components/playbook/setups-panel";
import { RulesPanel } from "@/components/playbook/rules-panel";
import { ChecklistsPanel } from "@/components/playbook/checklists-panel";
import { PerformancePanel } from "@/components/playbook/performance-panel";
import { TemplatesPanel } from "@/components/playbook/templates-panel";
import { StrategyDetailDialog } from "@/components/playbook/strategy-detail-dialog";
import { StrategyFormDialog } from "@/components/playbook/strategy-form-dialog";
import { UnderperformingBanner } from "@/components/playbook/underperforming-banner";
import { useI18n } from "@/i18n/i18n-provider";
import { usePlaybookOverview, useStrategies, useStrategiesStats } from "@/lib/api/queries";

/**
 * Professional Playbook module shell (MASTER PROMPT §4): seven tabs over the
 * operational trading-system repository — Overview, My Strategies, Setups,
 * Rules, Checklists, Performance, Templates. The tab persists as ?tab=
 * (module convention); shared data (strategies + per-strategy stats + the
 * overview aggregate) is fetched ONCE here and passed down.
 */

/** Tab machine ids — labels resolve through dict.playbook.view.tabs. */
const TAB_IDS = [
  "overview",
  "strategies",
  "setups",
  "rules",
  "checklists",
  "performance",
  "templates",
] as const;

type TabId = (typeof TAB_IDS)[number];

export function PlaybookView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const V = dict.playbook.view;

  const strategiesQuery = useStrategies();
  const statsQuery = useStrategiesStats();
  const overviewQuery = usePlaybookOverview();

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TAB_IDS.some((tab) => tab === rawTab) ? rawTab : "overview") as TabId;
  const setTab = React.useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Strategy | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Strategy | null>(null);

  const isLoading = strategiesQuery.isLoading || statsQuery.isLoading;
  const isError = strategiesQuery.isError || statsQuery.isError;
  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  const strategies = strategiesQuery.data?.strategies ?? [];
  const statsById = new Map<string, StrategyStat>(
    (statsQuery.data?.stats ?? []).map((stat) => [stat.strategyId, stat]),
  );
  const healthById = new Map(
    (overviewQuery.data?.health ?? []).map((entry) => [entry.strategyId, entry.flags]),
  );

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  const openEdit = (strategy: Strategy) => {
    setDetailTarget(null);
    setEditTarget(strategy);
    setFormOpen(true);
  };
  const openDetail = (strategy: Strategy) => setDetailTarget(strategy);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{V.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{V.subtitle}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          {V.newStrategy}
        </Button>
      </header>

      {isLoading ? (
        <PlaybookSkeleton />
      ) : isError ? (
        <ErrorPlaybook onRetry={retry} />
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="h-auto w-max flex-wrap gap-1">
              {TAB_IDS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="text-xs sm:text-sm" data-testid={`tab-${tab}`}>
                  {V.tabs[tab]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {statsQuery.data ? (
            <div className="mt-4">
              <UnderperformingBanner underperforming={statsQuery.data.underperforming} />
            </div>
          ) : null}

          <TabsContent value="overview" className="mt-4">
            <OverviewPanel
              overview={overviewQuery.data}
              strategies={strategies}
              onOpenDetail={openDetail}
              onCreateStrategy={openCreate}
              onGoTo={(tab) => setTab(tab)}
            />
          </TabsContent>
          <TabsContent value="strategies" className="mt-4">
            <StrategiesPanel
              strategies={strategies}
              statsById={statsById}
              healthById={healthById}
              isLoading={overviewQuery.isLoading}
              onOpenDetail={openDetail}
            />
          </TabsContent>
          <TabsContent value="setups" className="mt-4">
            <SetupsPanel strategies={strategies} onOpenDetail={openDetail} />
          </TabsContent>
          <TabsContent value="rules" className="mt-4">
            <RulesPanel strategies={strategies} />
          </TabsContent>
          <TabsContent value="checklists" className="mt-4">
            <ChecklistsPanel strategies={strategies} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <PerformancePanel />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesPanel />
          </TabsContent>
        </Tabs>
      )}

      <StrategyDetailDialog
        strategy={detailTarget}
        stat={detailTarget !== null ? statsById.get(detailTarget.id) : undefined}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        onEdit={openEdit}
      />
      <StrategyFormDialog
        key={editTarget?.id ?? "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        strategy={editTarget}
      />
    </div>
  );
}

function PlaybookSkeleton() {
  const { dict } = useI18n();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={dict.playbook.view.loadingAria}>
      <Skeleton className="h-10 w-64 rounded-md" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </div>
  );
}

function ErrorPlaybook({ onRetry }: { onRetry: () => void }) {
  const { dict } = useI18n();
  const V = dict.playbook.view;
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">{V.errorTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{V.errorBody}</p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          {V.retry}
        </Button>
      </CardContent>
    </Card>
  );
}
