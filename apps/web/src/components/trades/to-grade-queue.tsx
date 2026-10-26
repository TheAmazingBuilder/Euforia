"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, GraduationCap } from "lucide-react";
import type { Instrument } from "@cosmoz/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstruments, useTrades } from "@/lib/api/queries";
import { isoToLocalInput } from "@/lib/utils/datetime";
import { openGate } from "@/lib/hooks/use-judgment-flow";

/**
 * The "To grade" queue (spec §5 graceful degradation): ungraded closed trades
 * are 100 % functional - they are only excluded from decision/outcome
 * analytics and listed here. Grading one opens the same Gate → Reveal flow.
 */

export interface ToGradeQueueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ToGradeQueue({ open, onOpenChange }: ToGradeQueueProps) {
  const { data: toGradeData } = useTrades({ graded: "false" });
  const { data: instrumentsData } = useInstruments();
  const instruments: Instrument[] = instrumentsData?.instruments ?? [];
  const trades = toGradeData?.trades ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
            <GraduationCap className="size-4 text-accent" aria-hidden="true" />
            To grade
            <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {trades.length}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Closed trades still awaiting a decision grade. Grading unlocks the reveal
            and feeds the decision analytics.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto p-2" data-testid="to-grade-queue">
          {trades.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing to grade - every closed trade has its decision recorded.
            </p>
          ) : (
            <ul className="space-y-1">
              {trades.map((trade) => {
                const instrument = instruments.find((item) => item.id === trade.instrumentId);
                return (
                  <li key={trade.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        openGate(trade.id);
                      }}
                      data-testid={`queue-item-${trade.id}`}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {trade.direction === "SELL" ? (
                        <ArrowDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {instrument?.symbol ?? "-"}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {trade.direction}
                          </span>
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {isoToLocalInput(trade.entryAt).replace("T", " ")}
                        </span>
                      </span>
                      {/* Decorative chip - the row itself is the button (no
                          nested <button>, invalid HTML / hydration error). */}
                      <span
                        aria-hidden="true"
                        className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground"
                      >
                        Grade
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
