"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { RuleViolationView } from "@cosmoz/shared";
import { RULE_TYPE_LABELS } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateKeyShort } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

interface ParetoEntry {
  ruleType: RuleViolationView["ruleType"];
  count: number;
  sharePct: number;
  cumulativePct: number;
  violations: RuleViolationView[];
}

/**
 * Violation Pareto (80/20) — the few rule types that produce most of the
 * breaches. Aggregated client-side from the SAME violation rows the log
 * table renders (one server payload, no second query). The « vital few »
 * (cumulative ≤ 80%) are highlighted; clicking a type drills through to
 * the actual trades (deep link into the /trades drawer).
 */
export function ViolationPareto({ violations }: { violations: RuleViolationView[] }) {
  const [expandedType, setExpandedType] = React.useState<string | null>(null);

  const entries = React.useMemo<ParetoEntry[]>(() => {
    const byType = new Map<string, RuleViolationView[]>();
    for (const violation of violations) {
      const bucket = byType.get(violation.ruleType) ?? [];
      bucket.push(violation);
      byType.set(violation.ruleType, bucket);
    }
    const total = violations.length || 1;
    let cumulative = 0;
    return [...byType.entries()]
      .map(([ruleType, group]) => {
        const sharePct = (group.length / total) * 100;
        cumulative += sharePct;
        return { ruleType: ruleType as ParetoEntry["ruleType"], count: group.length, sharePct, cumulativePct: cumulative, violations: group };
      })
      .sort((a, b) => b.count - a.count || a.ruleType.localeCompare(b.ruleType));
  }, [violations]);

  if (violations.length === 0) {
    return (
      <Card className="bg-surface" data-testid="violation-pareto">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base font-semibold">Violation Pareto (80/20)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            No violations in the window - nothing to rank. The Pareto appears with the first breach.
          </p>
        </CardContent>
      </Card>
    );
  }

  const topTwoPct = entries.slice(0, Math.min(2, entries.length)).reduce((sum, entry) => sum + entry.sharePct, 0);

  return (
    <Card className="bg-surface" data-testid="violation-pareto">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-heading text-base font-semibold">
          Violation Pareto (80/20)
          <Badge variant="outline" className="border-border px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
            top 2 = {Math.round(topTwoPct)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Ranked by frequency - the highlighted rows are the « vital few » that carry 80% of the
          breaches. Click a type to drill through to its trades.
        </p>
        {entries.map((entry) => {
          const isVital = entry.cumulativePct <= 80;
          const label = RULE_TYPE_LABELS[entry.ruleType] ?? entry.ruleType;
          const open = expandedType === entry.ruleType;
          return (
            <div key={entry.ruleType} className="rounded-lg border border-border" data-testid={`pareto-row-${entry.ruleType.toLowerCase()}`}>
              <button
                type="button"
                onClick={() => setExpandedType(open ? null : entry.ruleType)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground sm:w-40">{label}</span>
                <span className="h-2.5 min-w-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full", isVital ? "bg-loss" : "bg-loss/50")}
                    style={{ width: `${entry.sharePct}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">{entry.count}</span>
                <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(entry.cumulativePct)}% cum
                </span>
                {isVital ? (
                  <Badge variant="outline" className="hidden border-warning/40 px-1.5 py-0 text-[9px] text-warning sm:inline">
                    vital few
                  </Badge>
                ) : null}
                {open ? (
                  <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </button>

              {open ? (
                <ul className="space-y-1 border-t border-border px-3 py-2" data-testid="pareto-trades">
                  {entry.violations.map((violation) => (
                    <li key={violation.id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">
                        {formatDateKeyShort(violation.occurredAt.slice(0, 10))}
                      </span>
                      <span className="truncate text-muted-foreground">{violation.userNote ?? "no note"}</span>
                      {violation.tradeId !== null ? (
                        <Link
                          href={`/trades?trade=${violation.tradeId}`}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 text-accent underline-offset-2 hover:underline"
                          data-testid="pareto-trade-link"
                        >
                          open trade
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">no single trade</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
