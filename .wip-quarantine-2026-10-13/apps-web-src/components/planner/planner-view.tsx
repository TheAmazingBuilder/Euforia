"use client";

/**
 * PlannerView — the Trade Planner module shell: Plans and Risk & Money tabs
 * (?tab= persists, module convention) with the plan editor hosted at
 * ?plan=<id> / ?view=new (same URL-state pattern as the Recognition module —
 * the editor survives a reload without extra state).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/i18n-provider";
import { PlansPanel } from "./plans-panel";
import { PlanEditor } from "./plan-editor";
import { RiskPanel } from "./risk-panel";

const TAB_IDS = ["plans", "risk"] as const;

type TabId = (typeof TAB_IDS)[number];

export function PlannerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dict } = useI18n();
  const V = dict.planner.view;

  const rawTab = searchParams.get("tab") ?? "plans";
  const activeTab: TabId = (TAB_IDS.some((tab) => tab === rawTab) ? rawTab : "plans") as TabId;
  const planId = searchParams.get("plan");
  const creating = searchParams.get("view") === "new";

  const setParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const query = params.toString();
      router.replace(query === "" ? "?" : `?${query}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setTab = (tab: string) =>
    setParams((params) => {
      params.set("tab", tab);
      params.delete("plan");
      params.delete("view");
    });
  const backToPlans = () =>
    setParams((params) => {
      params.delete("plan");
      params.delete("view");
    });
  const openPlan = (id: string) =>
    setParams((params) => {
      params.delete("view");
      params.set("plan", id);
    });
  const openNew = () =>
    setParams((params) => {
      params.delete("plan");
      params.set("view", "new");
    });

  const editorOpen = creating || planId !== null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="planner-view">
      {/* Header band */}
      <header className="overflow-hidden rounded-xl border bg-surface" data-testid="planner-header">
        <div className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ClipboardList className="size-3.5 text-accent" aria-hidden />
            {dict.nav.sections.Trading}
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{V.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{V.subtitle}</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList variant="line" data-testid="planner-tabs" aria-label={V.tabsAria}>
          {[
            { id: "plans", label: V.tabs.plans },
            { id: "risk", label: V.tabs.risk },
          ].map((entry) => (
            <TabsTrigger key={entry.id} value={entry.id} data-testid={`planner-tab-${entry.id}`}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="plans" className="mt-4">
          {editorOpen ? (
            <PlanEditor
              planId={creating ? null : planId}
              onBack={backToPlans}
              onOpened={openPlan}
            />
          ) : (
            <PlansPanel onOpenPlan={openPlan} onNewPlan={openNew} />
          )}
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
