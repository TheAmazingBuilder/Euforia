"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  TriangleAlert,
} from "lucide-react";
import type { EcoEvent, Impact } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEcoEvents } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Economic calendar (Priorité 3, feature 10) — day view with a week strip,
 * impact/currency filters and beat/miss colouring on released values.
 * The coaching angle: high-impact windows ahead today surface a risk banner
 * (process first — plan the volatility or stand aside).
 */

const USER_TZ = "America/Toronto";
const DAY_MS = 86_400_000;

const IMPACT_ORDER: Impact[] = ["LOW", "MEDIUM", "HIGH"];

/** Impact → filled-bar styling (ForexFactory-style 3-bar scale). */
const IMPACT_FILL: Record<Impact, string> = {
  HIGH: "bg-loss",
  MEDIUM: "bg-warning",
  LOW: "bg-muted-foreground/40",
};

const IMPACT_LABEL: Record<Impact, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Toronto-time date key for an ISO instant (matches the fixtures). */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Parse a YYYY-MM-DD key into a fixed noon-UTC anchor (DST-safe ±1 day). */
function keyToAnchor(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

function anchorToKey(anchorMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(anchorMs));
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: USER_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const dayTitleFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: USER_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  weekday: "short",
});

/** Compact relative countdown — "in 2h 15m", "in 8m". */
function countdown(iso: string, nowMs: number): string | null {
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return null;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `in ${Math.floor(hours / 24)} d`;
}

/** ImpactBars — 3 vertical bars, filled per tier. */
function ImpactBars({ impact }: { impact: Impact }) {
  const level = IMPACT_ORDER.indexOf(impact) + 1;
  return (
    <span
      className="flex items-end gap-[2px]"
      title={`${IMPACT_LABEL[impact]} impact`}
      aria-label={`${IMPACT_LABEL[impact]} impact`}
    >
      {IMPACT_ORDER.map((tier, index) => (
        <span
          key={tier}
          aria-hidden="true"
          className={cn(
            "w-[3px] rounded-full",
            index === 0 ? "h-1.5" : index === 1 ? "h-2.5" : "h-3.5",
            index < level ? IMPACT_FILL[impact] : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

function CurrencyBadge({ currency }: { currency: string }) {
  return (
    <span className="inline-flex min-w-9 justify-center rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
      {currency}
    </span>
  );
}

/** Actual vs forecast colouring — beat = profit, miss = loss, equal = muted. */
function ActualValue({ event }: { event: EcoEvent }) {
  if (event.actual === null) {
    return <span className="font-mono text-muted-foreground">—</span>;
  }
  if (event.forecast === null || event.actual === event.forecast) {
    return <span className="font-mono tabular-nums text-foreground">{event.actual}</span>;
  }
  const better = Number(event.actual) > Number(event.forecast);
  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        better ? "text-profit" : "text-loss",
      )}
    >
      {event.actual}
    </span>
  );
}

/** Hydration-safe clock: null on server render, ticking after mount. */
function useNow(): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    // Deferred first tick — no synchronous setState inside the effect.
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

export function EcoCalendarView() {
  const { data, isLoading, isError } = useEcoEvents();
  const now = useNow();

  const events = React.useMemo(() => data?.events ?? [], [data]);
  const todayKey = React.useMemo(
    () => dayKey(new Date().toISOString()),
    [], // stable per mount - the calendar is a day-scoped screen
  );
  const [selectedKey, setSelectedKey] = React.useState(todayKey);
  const [impactFilter, setImpactFilter] = React.useState<"ALL" | Impact>("ALL");
  const [currencyFilter, setCurrencyFilter] = React.useState<string>("ALL");

  const currencies = React.useMemo(
    () => [...new Set(events.map((event) => event.currency))].sort(),
    [events],
  );

  const selectedAnchor = keyToAnchor(selectedKey);

  // Events of the selected day, after filters.
  const dayEvents = React.useMemo(
    () =>
      events
        .filter((event) => dayKey(event.scheduledAt) === selectedKey)
        .filter((event) => impactFilter === "ALL" || event.impact === impactFilter)
        .filter((event) => currencyFilter === "ALL" || event.currency === currencyFilter)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [events, selectedKey, impactFilter, currencyFilter],
  );

  // Week strip: the 7 days around the selected anchor (Mon..Sun window).
  const weekDays = React.useMemo(() => {
    const anchor = new Date(selectedAnchor);
    const weekday = anchor.getUTCDay(); // 0=Sun
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const monday = selectedAnchor + mondayOffset * DAY_MS;
    return Array.from({ length: 7 }, (_, index) => {
      const dayAnchor = monday + index * DAY_MS;
      const key = anchorToKey(dayAnchor);
      const dayEventsRaw = events.filter((event) => dayKey(event.scheduledAt) === key);
      const highCount = dayEventsRaw.filter((event) => event.impact === "HIGH").length;
      return { key, anchor: dayAnchor, count: dayEventsRaw.length, highCount };
    });
  }, [events, selectedAnchor]);

  // Risk banner: today's high-impact events still ahead.
  const upcomingHighToday = React.useMemo(() => {
    if (now === null) return [];
    return events.filter(
      (event) =>
        event.impact === "HIGH" &&
        new Date(event.scheduledAt).getTime() > now &&
        dayKey(event.scheduledAt) === todayKey,
    );
  }, [events, now, todayKey]);

  const selectedIsToday = selectedKey === todayKey;

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Unable to load the economic calendar - please retry.
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="eco-calendar">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Economic calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Macro releases that move your instruments - plan the volatility, don&apos;t react to it.
        </p>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Week selector">
        {weekDays.map((day) => {
          const isSelected = day.key === selectedKey;
          const isToday = day.key === todayKey;
          const date = new Date(day.anchor);
          return (
            <button
              key={day.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedKey(day.key)}
              data-testid="week-day"
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isSelected
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-accent/40",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  isSelected ? "text-accent" : "text-muted-foreground",
                )}
              >
                {weekdayFormatter.format(date).slice(0, 3)}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums",
                  isSelected ? "text-accent" : "text-foreground",
                  isToday && !isSelected && "text-accent",
                )}
              >
                {new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric" }).format(date)}
              </span>
              <span className="flex h-1.5 items-center gap-[3px]" aria-hidden="true">
                {day.highCount > 0 ? (
                  <span className="size-1.5 rounded-full bg-loss" />
                ) : day.count > 0 ? (
                  <span className="size-1.5 rounded-full bg-warning" />
                ) : (
                  <span className="size-1.5 rounded-full bg-border" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day navigator + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous day"
            onClick={() => setSelectedKey(anchorToKey(selectedAnchor - DAY_MS))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="min-w-44 text-center font-heading text-sm font-semibold text-foreground first-letter:uppercase">
            {dayTitleFormatter.format(new Date(selectedAnchor))}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next day"
            onClick={() => setSelectedKey(anchorToKey(selectedAnchor + DAY_MS))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          {!selectedIsToday ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-7 px-2 text-xs text-accent hover:text-accent"
              onClick={() => setSelectedKey(todayKey)}
            >
              Today
            </Button>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Impact segmented filter */}
          <div
            className="flex rounded-lg border border-border bg-surface p-0.5"
            role="group"
            aria-label="Impact filter"
          >
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setImpactFilter(value)}
                aria-pressed={impactFilter === value}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  impactFilter === value
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "ALL" ? "All" : IMPACT_LABEL[value]}
              </button>
            ))}
          </div>

          {/* Currency chips */}
          <div className="flex gap-1" role="group" aria-label="Currency filter">
            {["ALL", ...currencies].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCurrencyFilter(value)}
                aria-pressed={currencyFilter === value}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition-colors",
                  currencyFilter === value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "ALL" ? "ALL" : value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Risk banner — today's remaining high-impact windows */}
      {selectedIsToday && upcomingHighToday.length > 0 ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3"
          data-testid="risk-banner"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">
              {upcomingHighToday.length} high-impact release
              {upcomingHighToday.length === 1 ? "" : "s"} ahead today
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {upcomingHighToday
                .slice(0, 2)
                .map(
                  (event) =>
                    `${event.title} - ${timeFormatter.format(new Date(event.scheduledAt))}`,
                )
                .join(" · ")}
              . Expect volatility: widen no stop, halve the size, or stand aside - that is the plan.
            </p>
          </div>
        </div>
      ) : null}

      {/* Day events */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : dayEvents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-12 text-center">
          <CalendarDays className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No releases match the filters</p>
          <p className="text-xs text-muted-foreground">
            Weekends are quiet - try another day or widen the impact filter.
          </p>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-xl border border-border bg-surface"
          data-testid="eco-event-list"
        >
          {dayEvents.map((event, index) => {
            const released = event.actual !== null;
            const justNow =
              now !== null &&
              new Date(event.scheduledAt).getTime() <= now &&
              !released;
            return (
              <li
                key={event.id}
                data-testid="eco-event"
                className={cn(
                  "flex items-center gap-3 px-4 py-3 sm:gap-4",
                  index > 0 && "border-t border-border",
                  justNow && "bg-warning/[0.06]",
                )}
              >
                {/* Time */}
                <time
                  dateTime={event.scheduledAt}
                  className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground"
                >
                  {timeFormatter.format(new Date(event.scheduledAt))}
                </time>

                {/* Impact + currency */}
                <ImpactBars impact={event.impact} />
                <CurrencyBadge currency={event.currency} />

                {/* Title + status */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {released ? (
                      <>
                        <FlaskConical className="size-3" aria-hidden="true" />
                        Released
                      </>
                    ) : justNow ? (
                      <>
                        <Clock className="size-3 text-warning" aria-hidden="true" />
                        Just hit the tape
                      </>
                    ) : now !== null ? (
                      <>
                        <Clock className="size-3" aria-hidden="true" />
                        {countdown(event.scheduledAt, now) ?? "Scheduled"}
                      </>
                    ) : null}
                  </p>
                </div>

                {/* Values — desktop grid */}
                <div className="hidden items-center gap-5 sm:flex">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Actual
                    </p>
                    <p className="text-sm">
                      <ActualValue event={event} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Forecast
                    </p>
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">
                      {event.forecast ?? "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Previous
                    </p>
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">
                      {event.previous ?? "-"}
                    </p>
                  </div>
                </div>

                {/* Mobile: actual only */}
                <div className="text-right sm:hidden">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Act.</p>
                  <p className="text-sm">
                    <ActualValue event={event} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer note */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        All times are Toronto time. Beat/miss colouring compares the released value with the
        forecast - green above, red below. Mocked dataset in this build.
      </p>
    </div>
  );
}
