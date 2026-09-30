"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Setup, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupFormDialog } from "@/components/playbook/setup-form-dialog";
import {
  MARKET_CONDITION_LABELS,
  STATUS_DOT,
  STATUS_LABELS,
} from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useDeleteSetup, useSetups } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Setups (§9): every setup in the playbook, grouped by strategy. A setup is
 * the operational recipe — trigger, confirmation, models, and ABOVE ALL its
 * invalidation (§12). Expand a row to read the recipe; edit inline.
 */
export function SetupsPanel({
  strategies,
  onOpenDetail,
}: {
  strategies: Strategy[];
  onOpenDetail: (strategy: Strategy) => void;
}) {
  const setupsQuery = useSetups();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Setup | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const setups = React.useMemo(() => setupsQuery.data?.setups ?? [], [setupsQuery.data]);

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
          {setups.length} {setups.length === 1 ? "setup" : "setups"} across {grouped.length}{" "}
          {grouped.length === 1 ? "strategy" : "strategies"} — the recipe layer of your systems.
        </p>
        <Button
          size="sm"
          disabled={strategies.length === 0}
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> New Setup
        </Button>
      </div>

      {setupsQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading setups">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : grouped.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="font-heading text-lg font-semibold">No setup yet</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              A strategy says WHEN the system applies; a setup says HOW the entry is executed.
              Define the trigger, the confirmation, the models — and never skip the invalidation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ strategy, setups: own }) => (
            <section key={strategy.id} aria-label={`Setups of ${strategy.name}`}>
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
                  {own.length} {own.length === 1 ? "setup" : "setups"}
                </span>
              </header>
              <div className="space-y-2">
                {own.map((setup) => (
                  <SetupRow
                    key={setup.id}
                    setup={setup}
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
  expanded,
  onToggle,
  onEdit,
}: {
  setup: Setup;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const deleteSetup = useDeleteSetup();

  const remove = async () => {
    try {
      await deleteSetup.mutateAsync(setup.id);
      toast.success("Setup deleted");
    } catch (error) {
      toast.error("Could not delete the setup", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  const facts: Array<{ label: string; value: string | null }> = [
    { label: "Trigger", value: setup.trigger },
    { label: "Confirmation", value: setup.confirmation },
    { label: "Entry model", value: setup.entryModel },
    { label: "Stop model", value: setup.stopModel },
    { label: "Target model", value: setup.targetModel },
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
              Missing invalidation
            </Badge>
          ) : null}
        </button>
        <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${setup.name}`} onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 hover:text-destructive"
          aria-label={`Delete ${setup.name}`}
          onClick={() => void remove()}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-loss">Invalidation</p>
              <p className="mt-0.5 text-sm text-foreground">{setup.invalidation}</p>
            </div>
          ) : null}
          {setup.context ? (
            <p className="text-xs leading-relaxed text-muted-foreground">Context: {setup.context}</p>
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
        </div>
      ) : null}
    </div>
  );
}
