"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  ShieldCheck,
  Target,
  TriangleAlert,
  Umbrella,
  XCircle,
} from "lucide-react";
import type { CalendarDayRow, Currency, GoalWithProgress } from "@cosmoz/shared";
import { formatMoneyCompact, formatNumber, formatR, formatSignedMoney, parseDecimal } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCalendarView,
  useDeleteCalendarBlock,
  useImportEcoBlockers,
  useUpsertCalendarBlock,
} from "@/lib/api/queries/calendar";
import { useGoals } from "@/lib/api/queries/tradeReview";
import { useEcoEvents } from "@/lib/api/queries/discipline";
import { useCurrentBalance } from "@/lib/api/queries/catalogs";
import { cn } from "@/lib/utils";

/**
 * Trading calendar (module upgrade) — the P&L + discipline OVERLAY on the
 * calendar days, the day's objective, planned days off EXCLUDED from the
 * stats, imported eco-calendar news blockers and a semester view with the
 * monthly targets. Every row/aggregate is SERVER-computed (GET
 * /calendar-view); the client only formats.
 */

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayTitleFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

function monthKeyOf(cursor: { year: number; month: number }): string {
  return `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
}

function shiftMonth(cursor: { year: number; month: number }, offset: number) {
  const shifted = new Date(Date.UTC(cursor.year, cursor.month + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

function monthRange(cursor: { year: number; month: number }): { from: string; to: string } {
  const from = `${monthKeyOf(cursor)}-01`;
  const to = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** Discipline dot tone (0–100 score) — process semantics, not P&L. */
function disciplineTone(score: string | null): string | null {
  const value = parseDecimal(score);
  if (value === null) return null;
  if (value >= 70) return "bg-profit";
  if (value >= 40) return "bg-warning";
  return "bg-loss";
}

/** One month grid of the trading overlay. */
function MonthGrid({
  cursor,
  days,
  selected,
  currency,
  onSelect,
}: {
  cursor: { year: number; month: number };
  days: Map<string, CalendarDayRow>;
  selected: string;
  currency: Currency;
  onSelect: (key: string) => void;
}) {
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthKeyOf(cursor)}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {weekday}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((key, index) => {
          if (key === null) {
            return <div key={`empty-${index}`} className="min-h-[58px] rounded-md border border-dashed border-border/50" aria-hidden="true" />;
          }
          const row = days.get(key);
          const pnl = row ? parseDecimal(row.pnlNet) ?? 0 : 0;
          const isSelected = key === selected;
          const isOff = row?.excludedFromStats === true;
          const isNews = row?.block?.kind === "NEWS";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={dayTitleFormatter.format(new Date(`${key}T00:00:00Z`))}
              data-testid="trading-day"
              className={cn(
                "group relative flex min-h-[58px] flex-col rounded-md border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isSelected ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/40",
                isOff && "border-dashed bg-surface-raised/50",
              )}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={cn("font-mono text-[10px] tabular-nums", isOff ? "text-muted-foreground/60" : "text-muted-foreground")}>
                  {Number(key.slice(8, 10))}
                </span>
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  {isOff && <Umbrella className="size-2.5 text-muted-foreground" />}
                  {isNews && <Flame className="size-2.5 text-warning" />}
                  {row !== undefined && row.ecoHighCount > 0 && !isNews && <span className="size-1.5 rounded-full bg-warning" />}
                </span>
              </span>
              {row !== undefined && row.tradesCount > 0 && !isOff ? (
                <span
                  className={cn(
                    "mt-0.5 truncate font-mono text-[11px] font-semibold tabular-nums",
                    pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {formatMoneyCompact(row.pnlNet, currency)}
                </span>
              ) : (
                <span className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/50">—</span>
              )}
              {row !== undefined && !isOff && (
                <span className="mt-auto flex items-center gap-1" aria-hidden="true">
                  {disciplineTone(row.disciplineScore) !== null && (
                    <span className={cn("size-1.5 rounded-full", disciplineTone(row.disciplineScore))} />
                  )}
                  {row.violationsCount > 0 && <TriangleAlert className="size-2.5 text-loss" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Day detail — P&L, discipline, the day's objective and the blockers. */
function DayPanel({
  dayKey,
  row,
  currency,
  balance,
  dailyLossLimitPct,
  weeklyGoals,
  ecoEvents,
  onMarkOff,
  onMarkNews,
  onUnmark,
  busy,
}: {
  dayKey: string;
  row: CalendarDayRow | undefined;
  currency: Currency;
  balance: number | null;
  dailyLossLimitPct: number;
  weeklyGoals: GoalWithProgress[];
  ecoEvents: { id: string; title: string; impact: string; scheduledAt: string }[];
  onMarkOff: () => void;
  onMarkNews: () => void;
  onUnmark: () => void;
  busy: boolean;
}) {
  const pnl = row ? parseDecimal(row.pnlNet) ?? 0 : 0;
  const rEarned = row ? parseDecimal(row.rEarned) ?? 0 : 0;
  const lossLimitMoney = balance !== null ? Math.round((balance * dailyLossLimitPct) / 100) : null;
  const limitBreached = lossLimitMoney !== null && pnl <= -lossLimitMoney;
  const dayEco = ecoEvents.filter((event) => event.scheduledAt.slice(0, 10) === dayKey);

  return (
    <Card className="bg-surface" data-testid="trading-day-panel">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-heading text-sm font-semibold capitalize text-foreground">
            {dayTitleFormatter.format(new Date(`${dayKey}T00:00:00Z`))}
          </p>
          <div className="flex gap-1">
            {row?.block !== undefined && row.block !== null ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={busy} onClick={onUnmark} data-testid="day-unmark">
                <XCircle className="size-3" aria-hidden="true" />
                Unmark
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={busy} onClick={onMarkOff} data-testid="day-mark-off">
                  <CalendarOff className="size-3" aria-hidden="true" />
                  Day off
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={busy} onClick={onMarkNews} data-testid="day-mark-news">
                  <Flame className="size-3" aria-hidden="true" />
                  News
                </Button>
              </>
            )}
          </div>
        </div>

        {row?.block !== undefined && row.block !== null && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
              row.block.kind === "OFF" ? "border-border bg-surface-raised text-muted-foreground" : "border-warning/40 bg-warning/10 text-warning",
            )}
            data-testid="day-block-note"
            role="note"
          >
            {row.block.kind === "OFF" ? <Umbrella className="size-3.5" aria-hidden="true" /> : <Flame className="size-3.5" aria-hidden="true" />}
            <span className="min-w-0 flex-1">{row.block.note}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider">{row.block.kind === "OFF" ? "excluded from stats" : "blocked"}</span>
          </div>
        )}

        {/* The day's numbers */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              { label: "P&L", value: formatSignedMoney(row?.pnlNet ?? "0", currency), tone: pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-muted-foreground" },
              { label: "R", value: formatR(row?.rEarned ?? "0"), tone: rEarned > 0 ? "text-profit" : rEarned < 0 ? "text-loss" : "text-muted-foreground" },
              { label: "Trades", value: String(row?.tradesCount ?? 0), tone: "text-foreground" },
              { label: "Violations", value: String(row?.violationsCount ?? 0), tone: (row?.violationsCount ?? 0) > 0 ? "text-loss" : "text-muted-foreground" },
            ] as const
          ).map((cell) => (
            <div key={cell.label} className="rounded-lg border border-border bg-surface-raised px-1 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{cell.label}</p>
              <p className={cn("font-mono text-xs font-semibold tabular-nums", cell.tone)}>{cell.value}</p>
            </div>
          ))}
        </div>

        {/* Objectif du jour — the daily loss-limit guard line */}
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2",
            limitBreached ? "border-loss/40 bg-loss/10" : "border-border bg-surface-raised",
          )}
          data-testid="daily-objective"
        >
          <Target className={cn("mt-0.5 size-3.5 shrink-0", limitBreached ? "text-loss" : "text-accent")} aria-hidden="true" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-foreground">Objectif du jour - stay inside the loss limit</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              Max loss: <span className="font-mono tabular-nums">{dailyLossLimitPct} %</span> of balance
              {lossLimitMoney !== null && (
                <>
                  {" "}≈ <span className="font-mono tabular-nums text-loss">−{formatNumber(lossLimitMoney, 0)} {currency}</span>
                </>
              )}
              . {limitBreached ? "Breached today - stop trading, journal the day." : "Today is inside the guard line."}
            </p>
          </div>
          {limitBreached ? <XCircle className="size-4 shrink-0 text-loss" aria-hidden="true" /> : <CheckCircle2 className="size-4 shrink-0 text-profit" aria-hidden="true" />}
        </div>

        {/* Weekly goals contribution */}
        <div className="space-y-1.5" data-testid="day-weekly-goals">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weekly goals in progress</p>
          {weeklyGoals.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No weekly goal set - <Link href="/goals" className="text-accent hover:underline">create one in Goals</Link>.
            </p>
          ) : (
            weeklyGoals.slice(0, 3).map(({ goal, progress }) => (
              <div key={goal.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px]">{goal.title}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      progress.status === "ON_TRACK" || progress.status === "ACHIEVED" ? "bg-profit" : progress.status === "AT_RISK" ? "bg-warning" : "bg-loss",
                    )}
                    style={{ width: `${progress.progressPct ?? 0}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {progress.progressPct === null ? "-" : `${Math.round(progress.progressPct)}%`}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Eco blockers of the day */}
        {dayEco.length > 0 && (
          <div className="space-y-1" data-testid="day-eco-blockers">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Eco-calendar releases</p>
            {dayEco.slice(0, 4).map((event) => (
              <p key={event.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", event.impact === "HIGH" ? "bg-loss" : "bg-warning")} aria-hidden="true" />
                <span className="font-mono tabular-nums">{event.scheduledAt.slice(11, 16)}</span>
                <span className="min-w-0 flex-1 truncate">{event.title}</span>
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Semester view — six month cards with the monthly target visualized. */
function SemesterView({
  semesterCursor,
  days,
  monthlyGoal,
  currency,
  onSelectMonth,
}: {
  semesterCursor: { year: number; month: number };
  days: Map<string, CalendarDayRow>;
  monthlyGoal: GoalWithProgress | null;
  currency: Currency;
  onSelectMonth: (cursor: { year: number; month: number }) => void;
}) {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(semesterCursor, index));

  return (
    <div className="space-y-3" data-testid="semester-view">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((cursor) => {
          const prefix = monthKeyOf(cursor);
          const monthDays = [...days.entries()].filter(([key]) => key.startsWith(prefix));
          const counted = monthDays.filter(([, row]) => !row.excludedFromStats);
          const totalPnl = counted.reduce((sum, [, row]) => sum + (parseDecimal(row.pnlNet) ?? 0), 0);
          const totalR = counted.reduce((sum, [, row]) => sum + (parseDecimal(row.rEarned) ?? 0), 0);
          const tradingDays = counted.filter(([, row]) => row.tradesCount > 0).length;
          const daysOff = monthDays.length - counted.length;
          const scored = counted.filter(([, row]) => row.disciplineScore !== null);
          const disciplineAvg =
            scored.length === 0 ? null : scored.reduce((sum, [, row]) => sum + (parseDecimal(row.disciplineScore) ?? 0), 0) / scored.length;

          // Target progress — only honest for money/R metrics.
          const actualForTarget = monthlyGoal?.goal.metric === "PROFIT_TARGET" ? totalPnl : monthlyGoal?.goal.metric === "R_EARNED" ? totalR : null;
          const target = monthlyGoal?.goal.target ?? null;
          const targetPct = actualForTarget !== null && target !== null && target !== 0 ? Math.max(0, Math.min(100, (actualForTarget / Math.abs(target)) * 100)) : null;

          return (
            <button
              key={prefix}
              type="button"
              onClick={() => onSelectMonth(cursor)}
              className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              data-testid={`semester-month-${prefix}`}
            >
              <div className="flex items-baseline justify-between">
                <p className="font-heading text-sm font-semibold text-foreground">
                  {monthFormatter.format(new Date(Date.UTC(cursor.year, cursor.month, 1)))}
                </p>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    totalPnl > 0 ? "text-profit" : totalPnl < 0 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {formatMoneyCompact(totalPnl.toFixed(2), currency)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">{formatR(totalR.toFixed(2))}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{tradingDays} trading days</span>
                {daysOff > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Umbrella className="size-3" aria-hidden="true" />
                      <span className="font-mono tabular-nums">{daysOff}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Monthly target bar */}
              <div className="mt-2.5">
                {monthlyGoal === null ? (
                  <p className="text-[11px] text-muted-foreground">
                    No monthly target - <Link href="/goals" className="text-accent hover:underline">set one in Goals</Link>
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {monthlyGoal.goal.title} · target{" "}
                        <span className="font-mono tabular-nums">
                          {monthlyGoal.goal.metric === "R_EARNED"
                            ? formatR(target!)
                            : monthlyGoal.goal.metric === "PROFIT_TARGET"
                              ? formatMoneyCompact(String(target!), currency)
                              : `${target} ${monthlyGoal.goal.metric.toLowerCase().replaceAll("_", " ")}`}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">{targetPct === null ? "-" : `${Math.round(targetPct)}%`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          targetPct !== null && targetPct >= 100 ? "bg-profit" : targetPct !== null && targetPct >= 55 ? "bg-accent" : "bg-warning",
                        )}
                        style={{ width: `${targetPct ?? 0}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {disciplineAvg !== null && (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  discipline <span className="font-mono tabular-nums">{formatNumber(disciplineAvg, 0)}</span>
                </p>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Days marked off are excluded from every figure above - planned rest is not trading data.
        {monthShortFormatter && " "}Click a month to open it in the month view.
      </p>
    </div>
  );
}

export function TradingCalendarView() {
  const today = new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = React.useState(() => ({ year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() }));
  const [view, setView] = React.useState<"month" | "semester">("month");
  const [selected, setSelected] = React.useState(today);

  // Month view: one server call for the displayed month. Semester view: one
  // call for the 6-month window — each enabled only for its own view.
  const monthRange_ = monthRange(cursor);
  const monthView = useCalendarView(monthRange_.from, monthRange_.to, view === "month");
  const semesterEnd = shiftMonth(cursor, 5);
  const semesterFrom = `${monthKeyOf(cursor)}-01`;
  const semesterTo = new Date(Date.UTC(semesterEnd.year, semesterEnd.month + 1, 0)).toISOString().slice(0, 10);
  const semesterView = useCalendarView(semesterFrom, semesterTo, view === "semester");

  const upsertBlock = useUpsertCalendarBlock();
  const deleteBlock = useDeleteCalendarBlock();
  const importEco = useImportEcoBlockers();
  const { data: goalsData } = useGoals();
  const { data: ecoData } = useEcoEvents();
  const balance = useCurrentBalance();

  const ecoEvents = React.useMemo(
    () =>
      (ecoData?.events ?? []).map((event) => ({
        id: event.id,
        title: event.title,
        impact: event.impact as string,
        scheduledAt: event.scheduledAt,
      })),
    [ecoData],
  );

  const monthlyGoal = React.useMemo(
    () => (goalsData?.goals ?? []).find(({ goal }) => goal.period === "MONTH" && goal.active) ?? null,
    [goalsData],
  );
  const weeklyGoals = React.useMemo(
    () => (goalsData?.goals ?? []).filter(({ goal }) => goal.period === "WEEK" && goal.active),
    [goalsData],
  );

  const active = view === "month" ? monthView : semesterView;
  const days = React.useMemo(() => {
    const map = new Map<string, CalendarDayRow>();
    for (const row of active.data?.days ?? []) map.set(row.date, row);
    return map;
  }, [active.data]);

  const selectedRow = days.get(selected);
  const summary = active.data?.summary;

  return (
    <div className="space-y-4" data-testid="trading-calendar">
      {/* Header + view switch */}
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">Trading calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            P&amp;L, discipline and blockers on every day - planned rest stays out of the stats.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Calendar view">
            {(["month", "semester"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                  view === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => importEco.mutate()}
            disabled={importEco.isPending}
            data-testid="import-eco-blockers"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Import blockers
          </Button>
        </div>
      </div>

      {importEco.isSuccess && (
        <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-muted-foreground" role="status" data-testid="import-eco-result">
          {importEco.data.message}
        </p>
      )}

      {/* Range summary — server-computed, days OFF excluded */}
      {summary !== undefined && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs" data-testid="calendar-summary">
          <span className="font-semibold text-foreground">{view === "month" ? "Month" : "Semester"}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{summary.tradingDays} trading days</span>
          <span className="font-mono tabular-nums text-profit">{formatMoneyCompact(summary.totalPnl, active.data?.currency ?? "USD")} net</span>
          <span className="font-mono tabular-nums text-muted-foreground">{formatR(summary.totalR)}</span>
          {summary.disciplineAvg !== null && (
            <span className="flex items-center gap-1 font-mono tabular-nums text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {formatNumber(summary.disciplineAvg, 0)}
            </span>
          )}
          {summary.violationsTotal > 0 && <span className="font-mono tabular-nums text-loss">{summary.violationsTotal} violations</span>}
          {summary.daysOff > 0 && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-muted-foreground">
              <Umbrella className="size-3.5" aria-hidden="true" />
              {summary.daysOff} off
            </span>
          )}
          {summary.blockedDays > 0 && <span className="font-mono tabular-nums text-warning">{summary.blockedDays} news-blocked</span>}
        </div>
      )}

      {active.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 rounded-lg" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : view === "month" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="bg-surface">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="Previous month">
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <span className="min-w-36 text-center font-mono text-xs capitalize tabular-nums" aria-live="polite">
                  {monthFormatter.format(new Date(Date.UTC(cursor.year, cursor.month, 1)))}
                </span>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="Next month">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <MonthGrid cursor={cursor} days={days} selected={selected} currency={active.data?.currency ?? "USD"} onSelect={setSelected} />
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Umbrella className="size-3" aria-hidden="true" /> day off (excluded from stats)</span>
                <span className="inline-flex items-center gap-1"><Flame className="size-3" aria-hidden="true" /> news blocker</span>
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-profit" aria-hidden="true" /> discipline ≥ 70</span>
                <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3" aria-hidden="true" /> violation(s)</span>
              </p>
            </CardContent>
          </Card>

          <DayPanel
            dayKey={selected}
            row={selectedRow}
            currency={active.data?.currency ?? "USD"}
            balance={balance === null ? null : parseDecimal(balance.balance)}
            dailyLossLimitPct={active.data?.dailyLossLimitPct ?? 3}
            weeklyGoals={weeklyGoals}
            ecoEvents={ecoEvents}
            onMarkOff={() => upsertBlock.mutate({ date: selected, kind: "OFF" })}
            onMarkNews={() => upsertBlock.mutate({ date: selected, kind: "NEWS" })}
            onUnmark={() => deleteBlock.mutate(selected)}
            busy={upsertBlock.isPending || deleteBlock.isPending}
          />
        </div>
      ) : (
        <SemesterView
          semesterCursor={cursor}
          days={days}
          monthlyGoal={monthlyGoal}
          currency={active.data?.currency ?? "USD"}
          onSelectMonth={(next) => {
            setCursor(next);
            setSelected(`${monthKeyOf(next)}-01`);
            setView("month");
          }}
        />
      )}

      <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        Every figure comes from the server (daily stats + the eco feed). Marking a day off immediately
        removes it from the range aggregates - the audit trail lives in the block note.
      </p>
    </div>
  );
}
