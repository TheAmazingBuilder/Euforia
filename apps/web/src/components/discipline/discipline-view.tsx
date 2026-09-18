"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, ShieldCheck, Stars } from "lucide-react";
import type { RuleViolationView } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MistakeLedger } from "@/components/discipline/mistake-ledger";
import { RuleCard } from "@/components/discipline/rule-card";
import { RuleFormDialog } from "@/components/discipline/rule-form-dialog";
import { ScoreGauge } from "@/components/discipline/score-gauge";
import { ViolationTable } from "@/components/discipline/violation-table";
import {
  useDisciplineScore,
  useMistakesLedger,
  useRules,
  useViolations,
} from "@/lib/api/queries";
import { formatDateKeyShort } from "@/lib/utils/datetime";

/**
 * Discipline screen (Phase 8): the Cosmoz Discipline Score gauge with its
 * four process components, the rule cards (toggle / param editor / history
 * mini-timeline), the violation log with acknowledge and the Mistake
 * Ledger with frequency bars + R cost. All aggregates come from the API.
 */

const WINDOW_DAYS = 30;

function DisciplineSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading discipline">
      <Skeleton className="h-10 w-56 rounded-md" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function ErrorDiscipline({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Discipline data unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your rules, violations and score could not be loaded. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function DisciplineView() {
  const scoreQuery = useDisciplineScore();
  const rulesQuery = useRules();
  const violationsQuery = useViolations();
  const ledgerQuery = useMistakesLedger();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = React.useState(false);

  const isLoading = rulesQuery.isLoading || violationsQuery.isLoading || scoreQuery.isLoading;
  const isError = rulesQuery.isError || violationsQuery.isError || scoreQuery.isError;
  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  const rules = rulesQuery.data?.rules ?? [];
  const violations = React.useMemo(
    () => violationsQuery.data?.violations ?? [],
    [violationsQuery.data],
  );
  const windowStart = violationsQuery.data?.windowStart ?? scoreQuery.data?.windowStart ?? "";

  const violationsByRule = React.useMemo(() => {
    const map = new Map<string, RuleViolationView[]>();
    for (const violation of violations) {
      // Rule cards + mini-timelines only count the aggregation window.
      if (violation.occurredAt.slice(0, 10) < windowStart) continue;
      const list = map.get(violation.ruleId) ?? [];
      list.push(violation);
      map.set(violation.ruleId, list);
    }
    return map;
  }, [violations, windowStart]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Discipline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The engine that watches your process: rules, violations and the Cosmoz score.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add rule
        </Button>
      </header>

      {isLoading ? (
        <DisciplineSkeleton />
      ) : isError ? (
        <ErrorDiscipline onRetry={retry} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <ScoreGauge score={scoreQuery.data} isLoading={scoreQuery.isLoading} />

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <section aria-label="Discipline rules" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Rules
                  <span className="ml-2 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {rules.filter((rule) => rule.isActive).length}/{rules.length} active
                  </span>
                </h2>
              </div>
              {rules.length === 0 ? (
                <Card className="bg-surface">
                  <CardContent className="flex flex-col items-center py-10 text-center">
                    <ShieldCheck className="size-8 text-muted-foreground" aria-hidden="true" />
                    <h3 className="mt-3 font-heading text-base font-semibold">No rules yet</h3>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Add your first guardrail — max trades per day, loss limits, cooldowns. The
                      engine enforces them on every capture.
                    </p>
                    <Button variant="outline" className="mt-5" onClick={() => setFormOpen(true)}>
                      <Plus className="size-4" aria-hidden="true" />
                      Add rule
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      violations={violationsByRule.get(rule.id) ?? []}
                      windowStart={windowStart}
                      windowDays={WINDOW_DAYS}
                    />
                  ))}
                </div>
              )}
            </section>

            <section
              aria-label="Mistake ledger"
              className="h-fit rounded-xl border border-border bg-surface"
            >
              <header className="border-b border-border px-4 py-3">
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Mistake Ledger
                </h2>
                <p className="text-xs text-muted-foreground">
                  Frequency and R cost per mistake — window starting {windowStart !== "" ? formatDateKeyShort(windowStart) : "—"}.
                </p>
              </header>
              <div className="p-4">
                {ledgerQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-2/3" />
                  </div>
                ) : ledgerQuery.data ? (
                  <MistakeLedger entries={ledgerQuery.data.entries} />
                ) : null}
              </div>
            </section>
          </div>

          <section aria-label="Violation log" className="rounded-xl border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Violation log
                </h2>
                <p className="text-xs text-muted-foreground">
                  Every breach with its frozen context —{" "}
                  <span className="font-mono tabular-nums">
                    {violationsQuery.data?.windowCount ?? 0}
                  </span>{" "}
                  in the last 30 days.
                </p>
              </div>
            </header>
            <div className="p-4">
              <ViolationTable violations={violations} />
            </div>
          </section>
        </div>
      )}

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
