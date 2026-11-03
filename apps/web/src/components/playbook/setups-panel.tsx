"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Filter, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Setup, SetupInsight, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NofyLinkedNotesSection } from "@/components/nofy/nofy-linked-notes";
import { SetupFormDialog } from "@/components/playbook/setup-form-dialog";
import {
  marketConditionLabels,
  STATUS_DOT,
  statusLabels,
} from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateNofyNote, useDeleteSetup, useSetups, useSetupInsights } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Setups (§9): every setup in the playbook, grouped by strategy. A setup is
 * the operational recipe - trigger, confirmation, models, and ABOVE ALL its
 * invalidation (§12). Expand a row to read the recipe; edit inline.
 */
export function SetupsPanel({
  strategies,
  onOpenDetail,
}: {
  strategies: Strategy[];
  onOpenDetail: (strategy: Strategy) => void;
}) {
  const { dict } = useI18n();
  const V = dict.playbook.setups;
  const setupsQuery = useSetups();
  const insightsQuery = useSetupInsights();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Setup | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const setups = React.useMemo(() => setupsQuery.data?.setups ?? [], [setupsQuery.data]);
  const insights = React.useMemo(
    () => insightsQuery.data?.insights ?? [],
    [insightsQuery.data],
  );
  const insightOf = React.useMemo(() => {
    const map = new Map<string, SetupInsight>();
    for (const insight of insights) map.set(insight.setupId, insight);
    return map;
  }, [insights]);

  const grouped = React.useMemo(() => {
    const groups: Array<{ strategy: Strategy; setups: Setup[] }> = [];
    for (const strategy of strategies) {
      const own = setups.filter((setup) => setup.strategyId === strategy.id);
      if (own.length > 0) groups.push({ strategy, setups: own });
    }
    return groups;
  }, [strategies, setups]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {setups.length} {setups.length === 1 ? V.setupOne : V.setupMany} {V.acrossPrefix} {grouped.length}{" "}
          {grouped.length === 1 ? V.strategyOne : V.strategyMany} {V.introTail}
        </p>
        <Button
          size="sm"
          disabled={strategies.length === 0}
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> {V.newBtn}
        </Button>
      </div>

      {setupsQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label={V.loadingAria}>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : grouped.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="font-heading text-lg font-semibold">{V.emptyTitle}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {V.emptyBody}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ strategy, setups: own }) => (
            <section key={strategy.id} aria-label={`${V.ofAriaPrefix} ${strategy.name}`}>
              <header className="mb-2 flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: strategy.color ?? "var(--muted-foreground)" }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="font-heading text-sm font-semibold text-foreground hover:text-accent"
                  onClick={() => onOpenDetail(strategy)}
                >
                  {strategy.name}
                </button>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {own.length} {own.length === 1 ? V.setupOne : V.setupMany}
                </span>
              </header>
              <div className="space-y-2">
                {own.map((setup) => (
                  <SetupRow
                    key={setup.id}
                    setup={setup}
                    insight={insightOf.get(setup.id) ?? null}
                    expanded={expanded === setup.id}
                    onToggle={() => setExpanded(expanded === setup.id ? null : setup.id)}
                    onEdit={() => {
                      setEditTarget(setup);
                      setFormOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <SetupFormDialog
        key={editTarget?.id ?? "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        setup={editTarget}
        strategies={strategies}
      />
    </div>
  );
}

function SetupRow({
  setup,
  insight,
  expanded,
  onToggle,
  onEdit,
}: {
  setup: Setup;
  insight: SetupInsight | null;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { dict } = useI18n();
  const V = dict.playbook.setups;
  const S = dict.playbook.shared;
  const STATUS_LABELS = statusLabels(dict.playbook.labels.status);
  const MARKET_CONDITION_LABELS = marketConditionLabels(dict.playbook.labels.marketCondition);
  const deleteSetup = useDeleteSetup();
  const router = useRouter();

  // Nofy integration - the SETUP side of the knowledge loop (increment ③):
  // notes taken here carry a real SETUP ref and stay reachable from the row.
  const createNofyNote = useCreateNofyNote({
    onCreated: (note) => {
      toast.success(S.nofyToast, { description: `${S.nofyLinkedA}${setup.name}${S.nofyLinkedB}` });
      router.push(`/nofy?tab=notes&note=${note.id}`);
    },
  });
  const takeNofyNotes = () => {
    createNofyNote.mutate({
      title: `${setup.name}${V.noteTitleSuffix}`,
      blocks: [
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "ref", text: "", ref: { kind: "SETUP", id: setup.id } },
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "paragraph", text: "" },
      ],
    });
  };

  const remove = async () => {
    try {
      await deleteSetup.mutateAsync(setup.id);
      toast.success(V.toastDeleted);
    } catch (error) {
      toast.error(V.toastDeleteFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  const facts: Array<{ label: string; value: string | null }> = [
    { label: V.factTrigger, value: setup.trigger },
    { label: V.factConfirmation, value: setup.confirmation },
    { label: V.factEntryModel, value: setup.entryModel },
    { label: V.factStopModel, value: setup.stopModel },
    { label: V.factTargetModel, value: setup.targetModel },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface" data-testid="setup-row">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[setup.status]}`} aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">{setup.name}</span>
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {STATUS_LABELS[setup.status]}
          </span>
          {setup.marketCondition ? (
            <span className="hidden rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              {MARKET_CONDITION_LABELS[setup.marketCondition]}
            </span>
          ) : null}
          {setup.invalidation === null ? (
            <Badge variant="outline" className="border-warning/40 px-1.5 py-0 text-[10px] text-warning">
              {V.missingInvalidation}
            </Badge>
          ) : null}
        </button>
        <Button size="icon" variant="ghost" className="size-7" aria-label={`${S.editPrefix} ${setup.name}`} onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 hover:text-destructive"
          aria-label={`${S.deletePrefix} ${setup.name}`}
          onClick={() => void remove()}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? V.collapseAria : V.expandAria}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2.5 border-t border-border px-4 py-3" data-testid="setup-detail">
          {setup.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{setup.description}</p>
          ) : null}
          <dl className="space-y-1.5">
            {facts.map((fact) =>
              fact.value ? (
                <div key={fact.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <dt className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="text-sm text-foreground">{fact.value}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {setup.invalidation ? (
            <div className={cn("rounded-md border border-loss/30 bg-loss/5 px-3 py-2")}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-loss">{V.invalidationHeading}</p>
              <p className="mt-0.5 text-sm text-foreground">{setup.invalidation}</p>
            </div>
          ) : null}

          {/* Light 90d backtest + market heuristics (setupInsights endpoint) */}
          {insight ? (
            <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5" data-testid="setup-insight">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {V.trackRecord}
                </p>
                {insight.smallSample ? (
                  <Badge
                    variant="outline"
                    className="border-warning/40 px-1.5 py-0 text-[10px] text-warning"
                    data-testid="setup-insight-sample"
                  >
                    {V.smallSamplePrefix} {insight.trades}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-border px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
                    data-testid="setup-insight-sample"
                  >
                    {V.nPrefix} {insight.trades}
                  </Badge>
                )}
                {insight.topInstrumentId !== null ? (
                  <Link
                    href={`/trades?inst=${insight.topInstrumentId}&strat=${insight.strategyId}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-accent hover:border-accent/50"
                    data-testid="setup-insight-filter"
                  >
                    <Filter className="size-3" aria-hidden="true" />
                    {V.filterLedgerPrefix} {insight.topInstrument}
                  </Link>
                ) : null}
              </div>
              {insight.trades === 0 ? (
                <p className="mt-1.5 text-xs italic text-muted-foreground">
                  {V.insightEmpty}
                </p>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{V.statWinRate}</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums">
                      {insight.winRatePct === null ? "-" : `${insight.winRatePct.toFixed(0)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{V.statTotalR}</dt>
                    <dd
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        (insight.totalR ?? 0) >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {insight.totalR === null ? "-" : `${insight.totalR > 0 ? "+" : ""}${insight.totalR.toFixed(1)}R`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{V.statExpectancy}</dt>
                    <dd
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        (insight.expectancyR ?? 0) >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {insight.expectancyR === null ? "-" : `${insight.expectancyR > 0 ? "+" : ""}${insight.expectancyR.toFixed(2)}R`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{V.statBestWindow}</dt>
                    <dd className="text-sm text-foreground">
                      {insight.topInstrument ?? "-"}
                      {insight.topSession ? (
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">{insight.topSession}</span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ) : null}
          {setup.context ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{V.contextPrefix} {setup.context}</p>
          ) : null}
          {setup.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {setup.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <NofyLinkedNotesSection
            kind="SETUP"
            id={setup.id}
            onCreateNote={takeNofyNotes}
            creating={createNofyNote.isPending}
            testidPrefix="setup"
          />
        </div>
      ) : null}
    </div>
  );
}
