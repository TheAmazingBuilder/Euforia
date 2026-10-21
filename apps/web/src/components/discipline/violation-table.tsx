"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink } from "lucide-react";
import {
  describeViolationContext,
  RULE_TYPE_LABELS,
  type RuleViolationView,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/discipline/severity-badge";
import { apiErrorMessage } from "@/lib/api/client";
import { useAcknowledgeViolation } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Violation log table (Phase 8): date, rule, frozen context snippet
 * ("4th trade of the day, limit 3"), link to the related trade and the
 * acknowledge action. Pending rows are visually flagged; acknowledging
 * PATCHes the mock API and refetches the score.
 */

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date) +
    ` · ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

export function ViolationTable({
  violations,
}: {
  violations: RuleViolationView[];
}) {
  const acknowledge = useAcknowledgeViolation();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const acknowledgeRow = async (violation: RuleViolationView) => {
    setPendingId(violation.id);
    try {
      await acknowledge.mutateAsync({
        violationId: violation.id,
        input: { note: "Acknowledged from the violation log." },
      });
      toast.success("Violation acknowledged", {
        description: RULE_TYPE_LABELS[violation.ruleType],
      });
    } catch (error) {
      toast.error("Could not acknowledge the violation", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    } finally {
      setPendingId(null);
    }
  };

  if (violations.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        No violations recorded — the discipline engine watches every trade.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Date</th>
            <th scope="col" className="py-2 pr-3 font-medium">Rule</th>
            <th scope="col" className="py-2 pr-3 font-medium">Context</th>
            <th scope="col" className="py-2 pr-3 font-medium">Severity</th>
            <th scope="col" className="py-2 pr-3 font-medium">Trade</th>
            <th scope="col" className="py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {violations.map((violation) => {
            const isPending = violation.acknowledgedAt === null;
            const busy = pendingId === violation.id && acknowledge.isPending;
            return (
              <tr
                key={violation.id}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  !isPending && "opacity-70",
                )}
              >
                <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-foreground">
                  {formatDay(violation.occurredAt)}
                </td>
                <td className="py-2.5 pr-3 text-xs font-medium text-foreground">
                  {RULE_TYPE_LABELS[violation.ruleType]}
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                  {describeViolationContext(violation.ruleType, violation.context)}
                </td>
                <td className="py-2.5 pr-3">
                  <SeverityBadge severity={violation.ruleSeverity} />
                </td>
                <td className="py-2.5 pr-3">
                  {violation.tradeId !== null ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-accent hover:text-accent"
                    >
                      <Link href="/trades">
                        View
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {isPending ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => void acknowledgeRow(violation)}
                      disabled={busy}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Acknowledge
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3.5 text-profit" aria-hidden="true" />
                      Acknowledged
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
