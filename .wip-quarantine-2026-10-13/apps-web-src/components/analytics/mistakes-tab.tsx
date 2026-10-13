"use client";

import * as React from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import type { AnalyticsResponse } from "@cosmoz/shared";
import { formatNumber, formatR } from "@cosmoz/shared";

import { MistakeLedger } from "@/components/discipline/mistake-ledger";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Mistakes tab (Phase 9): the ALL-TIME mistake ledger (the discipline screen
 * shows the rolling 30-day window) with a cost summary band, and the What-If
 * teaser — mistakes are patterns, the simulator quantifies them.
 */

interface MistakesTabProps {
  analytics: AnalyticsResponse;
  onOpenWhatIf: () => void;
}

export function MistakesTab({ analytics, onOpenWhatIf }: MistakesTabProps) {
  const entries = analytics.mistakes;

  const totalOccurrences = React.useMemo(
    () => entries.reduce((sum, entry) => sum + entry.count, 0),
    [entries],
  );
  const netR = React.useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.rCost), 0),
    [entries],
  );
  const costliest = React.useMemo(
    () =>
      entries.reduce<AnalyticsResponse["mistakes"][number] | null>(
        (worst, entry) =>
          worst === null || Math.abs(Number(entry.rCost)) > Math.abs(Number(worst.rCost))
            ? entry
            : worst,
        null,
      ),
    [entries],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {entries.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <Card className="bg-surface">
            <CardContent className="space-y-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Occurrences
              </p>
              <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
                {formatNumber(String(totalOccurrences), 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                across{" "}
                <span className="font-mono tabular-nums">{entries.length}</span> distinct
                patterns · all time
              </p>
            </CardContent>
          </Card>
          <Card className="bg-surface">
            <CardContent className="space-y-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Net R cost
              </p>
              <p
                className={`font-mono text-3xl font-semibold tabular-nums tracking-tight ${
                  netR < 0 ? "text-loss" : "text-profit"
                }`}
              >
                {formatR(netR)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Σ R over trades carrying a tagged mistake
              </p>
            </CardContent>
          </Card>
          <Card className="col-span-2 bg-surface xl:col-span-1">
            <CardContent className="space-y-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Costliest pattern
              </p>
              <p className="truncate font-heading text-lg font-semibold tracking-tight">
                {costliest?.label ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {costliest ? (
                  <>
                    <span className="font-mono tabular-nums">{costliest.count}</span>× ·{" "}
                    <span
                      className={`font-mono tabular-nums ${
                        Number(costliest.rCost) < 0 ? "text-loss" : "text-profit"
                      }`}
                    >
                      {formatR(costliest.rCost)}
                    </span>
                  </>
                ) : (
                  "no tagged mistake on record"
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            All-time mistake ledger
          </CardTitle>
          <CardDescription>
            Every tagged pattern with its frequency and the R it cost — the discipline
            screen shows the rolling 30-day view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MistakeLedger entries={entries} />
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardContent className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
              <FlaskConical className="size-4 text-accent" aria-hidden="true" />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold">Quantify the pattern</p>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                The What-If simulator replays your closed trades with a rule applied —
                filter what you would have skipped and read the delta on the
                cumulative-R curve, in your browser.
              </p>
            </div>
          </div>
          <Button variant="outline" className="shrink-0" onClick={onOpenWhatIf}>
            Open What-If
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
