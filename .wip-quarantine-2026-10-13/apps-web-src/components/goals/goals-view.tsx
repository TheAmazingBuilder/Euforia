"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, Target } from "lucide-react";
import type { Currency, GoalProgressRow, GoalSettings, GoalProgressStatus } from "@cosmoz/shared";
import { formatMoney, parseDecimal } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGoalProgress,
  useGoalSettings,
  useUpdateGoalSettings,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/** Token-driven status language — profit/accent/warning/loss, never hex. */
const STATUS_PILL: Record<GoalProgressStatus, string> = {
  ACHIEVED: "border-profit/40 bg-profit/10 text-profit",
  ON_TRACK: "border-accent/40 bg-accent/10 text-accent",
  AT_RISK: "border-warning/40 bg-warning/10 text-warning",
  OFF_TRACK: "border-loss/40 bg-loss/10 text-loss",
};

const STATUS_FILL: Record<GoalProgressStatus, string> = {
  ACHIEVED: "bg-profit",
  ON_TRACK: "bg-accent",
  AT_RISK: "bg-warning",
  OFF_TRACK: "bg-loss",
};

const STATUS_LABEL: Record<GoalProgressStatus, string> = {
  ACHIEVED: "Achieved",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
};

const selectClasses =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent";

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="ledger-label">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function StatusPill({ status }: { status: GoalProgressStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold leading-none",
        STATUS_PILL[status],
      )}
      role="status"
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Per-goal value formatting — money for P&L, units for the rest. */
function goalValueText(row: GoalProgressRow, currency: Currency): string {
  switch (row.key) {
    case "monthlyPnl":
      return formatMoney(row.actual, currency, { digits: 0 });
    case "winRate":
      return `${row.actual}%`;
    case "avgR":
      return `${row.actual > 0 ? "+" : ""}${row.actual.toFixed(2)}R`;
    case "greenDays":
      return `${row.actual} ${row.actual === 1 ? "day" : "days"}`;
    case "discipline":
      return `${row.actual}%`;
    case "maxTradesPerDay":
      return `${row.actual} ${row.actual === 1 ? "trade" : "trades"}`;
  }
}

function goalTargetText(row: GoalProgressRow, currency: Currency): string {
  switch (row.key) {
    case "monthlyPnl":
      return formatMoney(row.target, currency, { digits: 0 });
    case "winRate":
    case "discipline":
      return `${row.target}%`;
    case "avgR":
      return `${row.target.toFixed(2)}R`;
    case "greenDays":
      return `${row.target} ${row.target === 1 ? "day" : "days"}`;
    case "maxTradesPerDay":
      return `${row.target} ${row.target === 1 ? "trade" : "trades"}`;
  }
}

/** One goal cell — target vs actual, pace-fair bar, status. */
function GoalCell({ row, currency, pacePct, isCurrentMonth }: {
  row: GoalProgressRow;
  currency: Currency;
  pacePct: number;
  isCurrentMonth: boolean;
}) {
  // Higher-is-better goals fill towards 100% of target; behavior ceilings
  // (lower is better) fill with their USAGE of the limit.
  const fill = row.higherIsBetter
    ? Math.max(0, Math.min(1, row.pct)) * 100
    : (Math.max(0, Math.min(1.5, row.pct)) / 1.5) * 100;

  return (
    <article className="space-y-2" data-testid={`goal-cell-${row.key}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {row.label}
        </span>
        <StatusPill status={row.status} />
      </div>
      <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
        {goalValueText(row, currency)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          / {goalTargetText(row, currency)}
        </span>
      </p>
      <div
        className="goal-track relative"
        role="img"
        aria-label={`${row.label}: ${STATUS_LABEL[row.status]} — ${goalValueText(row, currency)} of ${goalTargetText(row, currency)}`}
      >
        <div
          className={cn("goal-fill", STATUS_FILL[row.status])}
          style={{ width: `${fill}%` }}
        />
        {row.higherIsBetter && isCurrentMonth ? (
          <span
            className="absolute bottom-[-3px] top-[-3px] w-px bg-foreground/50"
            style={{ left: `${Math.max(0, Math.min(1, pacePct)) * 100}%` }}
            title="Today's pace"
          />
        ) : null}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={row.note ?? undefined}>
        {row.note ?? "\u00A0"}
      </p>
    </article>
  );
}

/**
 * /goals — monthly targets vs real trading behavior. Targets are authored
 * (editable below); progress is computed SERVER-SIDE from DailyStat rows, so
 * the comparison can never be edited by hand. The vertical marker on each bar
 * is today's pace — the fair "on track" line for a running month.
 */
export function GoalsView() {
  const settings = useGoalSettings();
  const [selectedMonth, setSelectedMonth] = React.useState("");
  const progress = useGoalProgress(selectedMonth || undefined);
  const updateGoals = useUpdateGoalSettings();

  const [form, setForm] = React.useState<GoalSettings | null>(null);
  const [hydratedFrom, setHydratedFrom] = React.useState<GoalSettings | null>(null);
  if (settings.data !== undefined && settings.data !== hydratedFrom) {
    setHydratedFrom(settings.data);
    setForm(settings.data);
  }

  const dirty =
    form !== null &&
    settings.data !== undefined &&
    (form.monthlyPnlTarget !== settings.data.monthlyPnlTarget ||
      form.avgRTarget !== settings.data.avgRTarget ||
      form.winRateTargetPct !== settings.data.winRateTargetPct ||
      form.greenDaysTarget !== settings.data.greenDaysTarget ||
      form.disciplineTargetPct !== settings.data.disciplineTargetPct ||
      form.maxTradesPerDay !== settings.data.maxTradesPerDay);

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    updateGoals.mutate(
      {
        monthlyPnlTarget: form.monthlyPnlTarget,
        avgRTarget: form.avgRTarget,
        winRateTargetPct: form.winRateTargetPct,
        greenDaysTarget: form.greenDaysTarget,
        disciplineTargetPct: form.disciplineTargetPct,
        maxTradesPerDay: form.maxTradesPerDay,
      },
      {
        onSuccess: () =>
          toast.success("Goals saved", {
            description: "Your monthly targets are updated — progress re-evaluated.",
          }),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not save goals")),
      },
    );
  };

  const monthLabel = (monthKey: string): string => {
    const [y, m] = monthKey.split("-");
    return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  if (progress.isLoading || settings.isLoading || !progress.data || !form) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-none" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const data = progress.data;
  const isCurrentMonth = data.dayOfMonth < data.daysInMonth;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Goals</h1>
        <p className="text-sm text-muted-foreground">
          Monthly targets vs your real trading behavior — set the bar, then let the journal judge it.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Caption>
          {data.label.toUpperCase()} — DAY {data.dayOfMonth}/{data.daysInMonth}
        </Caption>
        <select
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          data-testid="goals-month"
          aria-label="Goal month"
          className={selectClasses}
        >
          {data.availableMonths.map((monthKey, index) => (
            <option key={monthKey} value={index === 0 ? "" : monthKey}>
              {monthLabel(monthKey)}
              {index === 0 ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* ── This month vs targets ─────────────────────────────────────────── */}
      <section className="ledger-band" data-testid="goals-progress-band">
        {data.rows.map((row) => (
          <div key={row.key} className="col-span-1 sm:col-span-4">
            <GoalCell
              row={row}
              currency={data.currency as Currency}
              pacePct={parseDecimal(data.pacePct) ?? 0}
              isCurrentMonth={isCurrentMonth}
            />
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground" data-testid="goals-pace-note">
        The vertical marker on each bar is today&rsquo;s pace (
        {Math.round((parseDecimal(data.pacePct) ?? 0) * 100)}% of the month elapsed) — at or
        beyond it means on track for a running month.
      </p>

      {/* ── Targets editor ────────────────────────────────────────────────── */}
      <Caption>MONTHLY TARGETS</Caption>
      <form
        onSubmit={onSave}
        className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 sm:p-6"
        data-testid="goals-form"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="goals-pnl">Monthly net P&amp;L target ({data.currency})</Label>
          <Input
            id="goals-pnl"
            inputMode="decimal"
            value={form.monthlyPnlTarget}
            onChange={(event) => setForm({ ...form, monthlyPnlTarget: event.target.value })}
            data-testid="goals-pnl"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goals-avgr">Average R target</Label>
          <Input
            id="goals-avgr"
            inputMode="decimal"
            value={form.avgRTarget}
            onChange={(event) => setForm({ ...form, avgRTarget: event.target.value })}
            data-testid="goals-avgr"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goals-wr">Win rate target (%)</Label>
          <Input
            id="goals-wr"
            type="number"
            min={0}
            max={100}
            value={form.winRateTargetPct}
            onChange={(event) => setForm({ ...form, winRateTargetPct: Number(event.target.value) })}
            data-testid="goals-wr"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goals-green">Green days target</Label>
          <Input
            id="goals-green"
            type="number"
            min={0}
            max={31}
            value={form.greenDaysTarget}
            onChange={(event) => setForm({ ...form, greenDaysTarget: Number(event.target.value) })}
            data-testid="goals-green"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goals-disc">Discipline score target (%)</Label>
          <Input
            id="goals-disc"
            type="number"
            min={0}
            max={100}
            value={form.disciplineTargetPct}
            onChange={(event) =>
              setForm({ ...form, disciplineTargetPct: Number(event.target.value) })
            }
            data-testid="goals-disc"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goals-maxtrades">Max trades per day (ceiling)</Label>
          <Input
            id="goals-maxtrades"
            type="number"
            min={1}
            max={50}
            value={form.maxTradesPerDay}
            onChange={(event) => setForm({ ...form, maxTradesPerDay: Number(event.target.value) })}
            data-testid="goals-maxtrades"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4 sm:col-span-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="size-3.5" aria-hidden="true" />
            Progress is computed from your journal — never editable by hand.
          </p>
          <Button
            type="submit"
            variant="success"
            disabled={!dirty || updateGoals.isPending}
            data-testid="goals-save"
          >
            {updateGoals.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Save targets
          </Button>
        </div>
      </form>
    </div>
  );
}
