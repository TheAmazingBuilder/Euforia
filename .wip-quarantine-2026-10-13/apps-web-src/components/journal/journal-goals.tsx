"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import type { JournalEntry } from "@cosmoz/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useJournalGoals, useUpdateJournalGoals } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** Toronto trading-date key for "today" (en-CA gives YYYY-MM-DD). */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type GoalRow = {
  id: "day" | "month" | "year";
  label: string;
  target: number;
  written: number;
  linked: number;
};

/**
 * Journal goals — the writing cadence against the plan: one ruled band, one
 * row per period (today / month / year), honest percentages, targets the
 * trader can retune. No confetti: a completed bar simply turns profit-green.
 */
export function JournalGoals({ entries }: { entries: JournalEntry[] }) {
  const { data: goals, isPending, isError } = useJournalGoals();
  const updateGoals = useUpdateJournalGoals();
  const [editOpen, setEditOpen] = React.useState(false);
  const [dayInput, setDayInput] = React.useState("1");
  const [monthInput, setMonthInput] = React.useState("20");
  const [yearInput, setYearInput] = React.useState("240");

  // Re-seed on open — documented "adjust state during render" pattern.
  const [lastOpen, setLastOpen] = React.useState(false);
  if (editOpen !== lastOpen) {
    setLastOpen(editOpen);
    if (editOpen && goals) {
      setDayInput(String(goals.entriesPerDay));
      setMonthInput(String(goals.entriesPerMonth));
      setYearInput(String(goals.entriesPerYear));
    }
  }

  const tk = todayKey();
  const countWhere = (predicate: (entry: JournalEntry) => boolean) =>
    entries.filter(predicate).length;

  const rows: GoalRow[] = [
    {
      id: "day",
      label: "Today",
      target: goals?.entriesPerDay ?? 0,
      written: countWhere((entry) => entry.date === tk),
      linked: countWhere((entry) => entry.date === tk && entry.relatedTradeId !== null),
    },
    {
      id: "month",
      label: "This month",
      target: goals?.entriesPerMonth ?? 0,
      written: countWhere((entry) => entry.date.slice(0, 7) === tk.slice(0, 7)),
      linked: countWhere(
        (entry) => entry.date.slice(0, 7) === tk.slice(0, 7) && entry.relatedTradeId !== null,
      ),
    },
    {
      id: "year",
      label: "This year",
      target: goals?.entriesPerYear ?? 0,
      written: countWhere((entry) => entry.date.slice(0, 4) === tk.slice(0, 4)),
      linked: countWhere(
        (entry) => entry.date.slice(0, 4) === tk.slice(0, 4) && entry.relatedTradeId !== null,
      ),
    },
  ];

  const parsedInputs = [dayInput, monthInput, yearInput].map((value) =>
    Number.parseInt(value, 10),
  );
  const inputsValid = parsedInputs.every((value) => Number.isInteger(value) && value >= 0);

  function handleSave() {
    if (!inputsValid) return;
    updateGoals.mutate(
      {
        entriesPerDay: parsedInputs[0],
        entriesPerMonth: parsedInputs[1],
        entriesPerYear: parsedInputs[2],
      },
      {
        onSuccess: () => {
          toast.success("Targets updated");
          setEditOpen(false);
        },
        onError: () => toast.error("The targets could not be saved"),
      },
    );
  }

  return (
    <section
      aria-label="Journal goals"
      data-testid="journal-goals"
      className="border-y border-border py-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="ledger-label">Goals — the cadence against the plan</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditOpen(true)}
          disabled={!goals}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          data-testid="journal-goals-edit"
          aria-haspopup="dialog"
        >
          <Pencil className="size-3" aria-hidden="true" />
          Edit targets
        </Button>
      </div>

      {isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The targets could not be loaded.
        </p>
      ) : isPending ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="grid grid-cols-[5.5rem_1fr] items-center gap-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-3.5" data-testid="journal-goals-rows">
          {rows.map((row) => {
            const pct =
              row.target > 0 ? Math.min(100, Math.round((row.written / row.target) * 100)) : 0;
            const done = row.target > 0 && row.written >= row.target;
            return (
              <div
                key={row.id}
                className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 sm:gap-6"
                data-testid={`journal-goal-${row.id}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {row.label}
                </p>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-border/60"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={row.target > 0 ? row.target : undefined}
                  aria-valuenow={row.written}
                  aria-label={`${row.label}: ${row.written} of ${row.target} entries`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500",
                      done ? "bg-profit" : "bg-foreground",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-right font-mono text-[11px] tabular-nums leading-4 text-muted-foreground">
                  <span className={cn("font-semibold", done ? "text-profit" : "text-foreground")}>
                    {row.written}&thinsp;/&thinsp;{row.target}
                  </span>
                  {row.linked > 0 ? (
                    <span className="hidden sm:inline"> · {row.linked} linked</span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-surface sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              Writing targets
            </DialogTitle>
            <DialogDescription className="text-sm">
              How often the pen must move — honest targets, not wishes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {(
              [
                { id: "day", label: "Entries per day", value: dayInput, set: setDayInput, max: 50 },
                { id: "month", label: "Entries per month", value: monthInput, set: setMonthInput, max: 500 },
                { id: "year", label: "Entries per year", value: yearInput, set: setYearInput, max: 5000 },
              ] as const
            ).map((field) => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <label
                  htmlFor={`journal-goals-${field.id}`}
                  className="text-sm font-medium text-foreground"
                >
                  {field.label}
                </label>
                <Input
                  id={`journal-goals-${field.id}`}
                  type="number"
                  min={0}
                  max={field.max}
                  step={1}
                  value={field.value}
                  onChange={(event) => field.set(event.target.value)}
                  className="h-9 w-full font-mono"
                  data-testid={`journal-goals-input-${field.id}`}
                />
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!inputsValid || updateGoals.isPending} data-testid="journal-goals-save">
              {updateGoals.isPending ? "Saving…" : "Save targets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
