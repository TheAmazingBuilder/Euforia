"use client";

import * as React from "react";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { useNowMs } from "@/lib/realtime/use-now";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ORYON_HISTORY_RANGES,
  type OryonHistoryRangeId,
} from "@/lib/oryon/temporal/history-ranges";

/**
 * Oryon history range strip (TradingView parity) — `1D · 5D · 1M · 3M ·
 * 6M · YTD · 1Y · 5Y · All` plus the calendar "go to date" popover.
 *
 * CONTRACT (the user's explicit split): this strip sets the VISIBLE
 * HISTORICAL span of the chart; it never touches the bar timeframe (the
 * interval selector lives on the top toolbar). The resolution happens at
 * the workspace level (onSelectRange / onSelectDate read the ACTIVE
 * panel's engine at click time) - this component is a pure control strip.
 *
 * Calendar: a dependency-free month grid (no new packages). Picking a day
 * starts the visible range at that day's UTC midnight and ends at the
 * latest bar — clamped by the workspace to the bars the chart actually
 * holds (a date before the loaded history lands on its first bar, stated
 * in the popover footer).
 */

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export function OryonHistoryRange({
  active,
  onSelect,
  onSelectDate,
}: {
  /** The last applied preset (calendar jumps clear it — custom range). */
  active: OryonHistoryRangeId | null;
  onSelect: (id: OryonHistoryRangeId) => void;
  onSelectDate: (dateMs: number) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.toolbar;

  return (
    <div
      role="group"
      aria-label={S.historyRange}
      data-testid="oryon-history-range"
      className="flex items-center gap-0.5"
    >
      {ORYON_HISTORY_RANGES.map((id) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            aria-label={`${S.historyRange} ${id}`}
            title={`${S.historyRange}: ${id}`}
            data-testid={`oryon-range-${id}`}
            onClick={() => onSelect(id)}
            className={cn(
              "min-w-7 rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold leading-none transition-colors",
              isActive
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            {id === "ALL" ? "All" : id}
          </button>
        );
      })}

      <OryonRangeCalendar onSelectDate={onSelectDate} />
    </div>
  );
}

/** Dependency-free month grid — picks the day the visible range starts at. */
function OryonRangeCalendar({ onSelectDate }: { onSelectDate: (dateMs: number) => void }) {
  const dict = useDict();
  const S = dict.oryon.toolbar;

  const [open, setOpen] = React.useState(false);
  // The grid's month (UTC month START, as epoch ms) is session state of
  // the popover — re-seeded on open.
  const [month, setMonth] = React.useState(() => startOfUtcMonth(Date.now()).getTime());

  const monthLabel = React.useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(month),
      ),
    [month],
  );

  // UTC day cells: the chart's candle opens are UTC epochs, the jump math
  // is UTC (history-ranges.ts) — the grid must speak the same calendar.
  const days = React.useMemo(() => buildUtcMonthGrid(month), [month]);
  // Today's highlight on the 60 s cadence (the sanctioned now hook — no
  // impure Date.now() during render; before the first tick no day is
  // highlighted, which is the honest SSR state).
  const nowMs = useNowMs(60_000);
  const todayKey = nowMs === null ? "" : utcDayKey(nowMs);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMonth(startOfUtcMonth(Date.now()).getTime());
      }}
    >
      <PopoverTrigger
        aria-label={S.calendarJump}
        aria-expanded={open}
        title={S.calendarJumpHint}
        data-testid="oryon-range-calendar"
        className={cn(
          "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold leading-none transition-colors",
          open
            ? "bg-primary/12 text-primary"
            : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
        )}
      >
        <CalendarDays className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        data-oryon-ui=""
        data-testid="oryon-range-calendar-popover"
        className="w-60 p-3"
      >
        <p className="mb-2 text-xs font-semibold text-foreground">{S.calendarJump}</p>

        <div className="mb-1.5 flex items-center justify-between">
          <button
            type="button"
            aria-label={S.calendarPrevMonth}
            data-testid="oryon-range-calendar-prev"
            onClick={() => setMonth((m) => addUtcMonths(m, -1))}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </button>
          <span className="font-mono text-xs font-medium capitalize text-foreground" data-testid="oryon-range-calendar-month">
            {monthLabel}
          </span>
          <button
            type="button"
            aria-label={S.calendarNextMonth}
            data-testid="oryon-range-calendar-next"
            onClick={() => setMonth((m) => addUtcMonths(m, 1))}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={S.calendarJump}>
          {WEEKDAY_LABELS.map((label) => (
            <span
              key={label}
              className="flex h-5 items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              aria-hidden
            >
              {label}
            </span>
          ))}
          {days.map((day) => {
            if (day === null) return <span key={`empty-${day}`} aria-hidden />;
            const key = utcDayKey(day.getTime());
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                data-testid={`oryon-range-day-${key}`}
                aria-label={new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(day)}
                onClick={() => {
                  onSelectDate(day.getTime());
                  setOpen(false);
                }}
                className={cn(
                  "flex h-6 items-center justify-center rounded-md font-mono text-[10px] tabular-nums transition-colors",
                  isToday
                    ? "bg-accent/15 font-semibold text-accent"
                    : "text-foreground/85 hover:bg-surface-raised",
                )}
              >
                {day.getUTCDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <button
            type="button"
            data-testid="oryon-range-calendar-today"
            onClick={() => {
              onSelectDate(Date.now());
              setOpen(false);
            }}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            {S.calendarToday}
          </button>
          <p className="min-w-0 flex-1 text-right text-[9px] leading-snug text-muted-foreground">
            {S.calendarNoData}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── UTC month-grid math (pure, dependency-free) ─────────────────────────────

function startOfUtcMonth(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addUtcMonths(ms: number, delta: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
}

/** `YYYY-MM-DD` for a UTC instant (stable day identity for tests + today). */
function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * 42 cells (6 weeks, Monday-first) covering `month`'s UTC days; leading
 * and trailing nulls pad the grid. Pure UTC — no display-zone drift.
 */
function buildUtcMonthGrid(monthMs: number): (Date | null)[] {
  const first = new Date(monthMs);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // getUTCDay(): Sun=0 → Monday-first offset.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
