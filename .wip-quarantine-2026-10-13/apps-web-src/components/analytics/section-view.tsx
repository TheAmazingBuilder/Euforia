"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCcw, Stars } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InkRibbon } from "@/components/academy/ink-ribbon";
import { GradeMatrix } from "@/components/analytics/grade-matrix";
import { RHeatmap } from "@/components/analytics/r-heatmap";
import { SleepScatter } from "@/components/analytics/sleep-scatter";
import { StrategyDistributions } from "@/components/analytics/strategy-distributions";
import { StrategyTable } from "@/components/analytics/strategy-table";
import { SummaryCards } from "@/components/analytics/summary-cards";
import { TiltTimeline } from "@/components/analytics/tilt-timeline";
import { MistakeLedger } from "@/components/discipline/mistake-ledger";
import { KpiRow } from "@/components/analytics/panels/kpi-row";
import { PanelRenderer } from "@/components/analytics/panels/panel-renderer";
import { SECTION_INK_BG, SECTION_INK_BORDER, SECTION_INK_TEXT } from "@/components/analytics/section";
import { ATLAS_SECTIONS, atlasSection, type AtlasSection, type AtlasSubsection } from "@/lib/analytics/atlas";
import { useAnalytics, useAnalyticsSection, useStrategies, useStrategiesStats } from "@/lib/api/queries";
import type { AnalyticsPanel } from "@cosmoz/shared";
import { cn } from "@/lib/utils";

/**
 * One Atlas section page: header in the section's ink, KPI band, then the
 * subsections stacked in registry order — each anchored, framed by a left
 * rule in the section ink, and filled either by a bespoke Phase 9 component
 * (fed from the cached /stats/analytics payload) or by the section's generic
 * panels. Prev/next pager walks the registry like Academy's lesson pager.
 */

interface SectionViewProps {
  sectionId: string;
}

function SectionSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading section">
      <Skeleton className="h-10 w-80 rounded-md" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Section unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This section could not be aggregated. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function SubsectionFrame({
  section,
  subsection,
  index,
  children,
}: {
  section: AtlasSection;
  subsection: AtlasSubsection;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={subsection.id}
      data-testid={`subsection-${section.id}-${subsection.id}`}
      className="scroll-mt-24 space-y-3"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn("mt-2 size-2 shrink-0 rounded-full", SECTION_INK_BG[section.ink])}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
              SECTION_INK_TEXT[section.ink],
            )}
          >
            {section.num}.{index + 1} · {subsection.title}
          </p>
          <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subsection.blurb}</p>
        </div>
      </div>
      <Card className={cn("border-l-2 bg-surface", SECTION_INK_BORDER[section.ink])}>
        <CardContent className="space-y-5 p-4 sm:p-5">{children}</CardContent>
      </Card>
    </section>
  );
}

export function SectionView({ sectionId }: SectionViewProps) {
  const section = atlasSection(sectionId);
  const sectionQuery = useAnalyticsSection(sectionId);
  const analyticsQuery = useAnalytics();
  const strategiesQuery = useStrategies();
  const statsQuery = useStrategiesStats();
  const queryClient = useQueryClient();

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  if (!section) return null;

  if (sectionQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <SectionSkeleton />
      </div>
    );
  }

  if (sectionQuery.isError || !sectionQuery.data) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <SectionError onRetry={retry} />
      </div>
    );
  }

  const data = sectionQuery.data;
  const analytics = analyticsQuery.data;
  const strategies = strategiesQuery.data?.strategies ?? [];
  const stats = statsQuery.data?.stats ?? [];

  if (data.sampleTrades === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <Card className="mx-auto max-w-md bg-surface">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Stars className="size-8 text-accent" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-lg font-semibold">No closed trades yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {section.title} reads your closed trades only. Log executions and grade them — this
              section fills itself from the ledger.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/analytics">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to the atlas
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group panels by subsection key once.
  const panelsBySub = new Map<string, AnalyticsPanel[]>();
  for (const panel of data.panels) {
    const list = panelsBySub.get(panel.subsection) ?? [];
    list.push(panel);
    panelsBySub.set(panel.subsection, list);
  }

  const renderCustom = (custom: NonNullable<AtlasSubsection["custom"]>): React.ReactNode => {
    switch (custom) {
      case "overview-summary":
        return analytics ? <SummaryCards cards={analytics.cards} /> : <SectionSkeleton />;
      case "edge-map":
        return analytics ? (
          <div className="overflow-x-auto">
            <RHeatmap cells={analytics.heatmap} />
          </div>
        ) : (
          <SectionSkeleton />
        );
      case "tilt":
        return analytics ? <TiltTimeline points={analytics.tilt} currency={analytics.currency} /> : <SectionSkeleton />;
      case "sleep":
        return analytics ? <SleepScatter points={analytics.sleepScatter} currency={analytics.currency} /> : <SectionSkeleton />;
      case "grades":
        return analytics ? <GradeMatrix rows={analytics.gradeMatrix} /> : <SectionSkeleton />;
      case "strategy-table":
        return analytics ? (
          <div className="space-y-6">
            <StrategyDistributions distributions={analytics.strategyDistributions} />
            <div className="border-t border-border pt-4">
              <StrategyTable stats={stats} strategies={strategies} />
            </div>
          </div>
        ) : (
          <SectionSkeleton />
        );
      case "ledger":
        return analytics ? <MistakeLedger entries={analytics.mistakes} /> : <SectionSkeleton />;
      default:
        return null;
    }
  };

  const index = ATLAS_INDEX(sectionId);
  const prev = index > 0 ? ATLAS_SECTION_AT(index - 1) : undefined;
  const next = index < ATLAS_COUNT - 1 ? ATLAS_SECTION_AT(index + 1) : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 sm:space-y-8" data-testid={`section-view-${section.id}`}>
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link href="/analytics" className="transition-colors hover:text-accent">
            Analytics
          </Link>
          <span aria-hidden="true" className="mx-1.5">/</span>
          <span className={cn("font-mono uppercase tracking-[0.14em]", SECTION_INK_TEXT[section.ink])}>
            {section.title}
          </span>
        </nav>
        <h1 className="flex flex-wrap items-baseline gap-x-3 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <span className={cn("font-mono text-sm font-bold", SECTION_INK_TEXT[section.ink])}>{section.num}</span>
          {section.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{section.description}</p>
        <InkRibbon />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-muted-foreground">
            Sample
            <span className="font-mono font-medium tabular-nums text-foreground">
              {data.sampleTrades} closed
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-muted-foreground">
            Currency
            <span className="font-mono font-medium tabular-nums text-foreground">{data.currency}</span>
          </span>
        </div>
      </header>

      <KpiRow kpis={data.kpis} currency={data.currency} />

      {/* Subsection jump nav */}
      <nav
        aria-label={`${section.title} views`}
        className="flex flex-wrap gap-1.5 border-y border-border py-2.5"
      >
        {section.subsections.map((sub, subIndex) => (
          <a
            key={sub.id}
            href={`#${sub.id}`}
            data-testid={`jump-${sub.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", SECTION_INK_BG[section.ink])}
            />
            <span className="font-mono tabular-nums">{section.num}.{subIndex + 1}</span>
            {sub.title}
          </a>
        ))}
      </nav>

      <div className="space-y-8 sm:space-y-10">
        {section.subsections.map((sub, subIndex) => {
          const panels = panelsBySub.get(sub.id) ?? [];
          const content = sub.custom
            ? renderCustom(sub.custom)
            : panels.map((panel) => (
                <div key={`${panel.kind}-${panel.title}`} data-testid={`panel-${panel.kind}`}>
                  <PanelHeader panel={panel} />
                  <PanelRenderer panel={panel} currency={data.currency} />
                </div>
              ));
          if (sub.custom === undefined && panels.length === 0) return null;
          return (
            <SubsectionFrame key={sub.id} section={section} subsection={sub} index={subIndex}>
              {content}
            </SubsectionFrame>
          );
        })}
      </div>

      {/* Prev / next pager */}
      <nav aria-label="Atlas sections" className="grid gap-2 border-t border-border pt-5 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/analytics/${prev.id}`}
            data-testid="pager-prev"
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/50"
          >
            <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                {prev.num} · Previous
              </span>
              <span className="block truncate text-sm font-medium">{prev.title}</span>
            </span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {next ? (
          <Link
            href={`/analytics/${next.id}`}
            data-testid="pager-next"
            className="group flex items-center justify-end gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-right transition-colors hover:border-accent/50 sm:col-start-2"
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                {next.num} · Next
              </span>
              <span className="block truncate text-sm font-medium">{next.title}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

function PanelHeader({ panel }: { panel: { title: string; caption: string } }) {
  return (
    <div className="space-y-1">
      <h3 className="font-heading text-sm font-semibold tracking-tight sm:text-base">{panel.title}</h3>
      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{panel.caption}</p>
    </div>
  );
}

// Registry walkers for the pager.
const ATLAS_COUNT = ATLAS_SECTIONS.length;
function ATLAS_INDEX(id: string): number {
  return ATLAS_SECTIONS.findIndex((section) => section.id === id);
}
function ATLAS_SECTION_AT(index: number): AtlasSection | undefined {
  return ATLAS_SECTIONS[index];
}
