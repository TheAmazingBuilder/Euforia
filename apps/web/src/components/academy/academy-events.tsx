"use client";

import * as React from "react";
import { CalendarDays, Clock, GraduationCap, MonitorPlay, Presentation, Users, Video } from "lucide-react";
import type { AcademyEvent, AcademyEventType } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hueOf, tint } from "@/components/academy/academy-shared";
import { useAcademyCatalog, useAcademyEvents, useAcademyRegisterEvent } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Academy Events - the live-session calendar: workshops, webinars, open
 * Q&A and certification windows. Upcoming cards carry a seat gauge and a
 * one-tap register/leave toggle; past sessions expose the replay chip.
 */

const TYPE_ICON: Record<AcademyEventType, React.ComponentType<{ className?: string }>> = {
  WORKSHOP: Presentation,
  WEBINAR: Video,
  LIVE_QA: Users,
  EXAM: GraduationCap,
};

const TYPE_HUE: Record<AcademyEventType, string> = {
  WORKSHOP: "hsl(152 62% 42%)",
  WEBINAR: "hsl(212 72% 52%)",
  LIVE_QA: "hsl(268 62% 56%)",
  EXAM: "hsl(28 80% 46%)",
};

function dayLabel(iso: string, now: Date): { day: string; time: string } {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfThat.getTime() - startOfToday.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const datePart =
    dayDiff === 0
      ? "Today"
      : dayDiff === 1
        ? "Tomorrow"
        : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return { day: datePart, time };
}

function EventCard({
  event,
  categoryName,
  past,
}: {
  event: AcademyEvent;
  categoryName: string | null;
  past: boolean;
}) {
  const { dict } = useI18n();
  const E = dict.academy.events;
  const register = useAcademyRegisterEvent();

  const TypeIcon = TYPE_ICON[event.type];
  const typeHue = TYPE_HUE[event.type];
  const hue = event.categoryId ? hueOf(event.categoryId) : typeHue;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const full = seatsLeft <= 0;
  const starts = dayLabel(event.startsAt, NOW);

  return (
    <article
      className="group relative overflow-hidden rounded-xl border bg-surface transition-colors hover:border-accent/40"
      data-testid={`academy-event-${event.id}`}
      data-registered={event.registered ? "true" : "false"}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: hue }} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:gap-5">
        {/* Date block */}
        <div
          className="flex w-fit shrink-0 flex-col items-center rounded-lg border px-3 py-2 sm:w-20"
          style={{ borderColor: tint(hue, 45), background: tint(hue, 92) }}
        >
          <span className="font-mono text-sm font-bold tabular-nums text-foreground">{starts.time}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{starts.day}</span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ background: tint(typeHue, 88), color: typeHue }}
            >
              <TypeIcon className="size-3" aria-hidden="true" />
              {E.typeLabels[event.type]}
            </span>
            {categoryName ? (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {categoryName}
              </span>
            ) : null}
            {past ? (
              <Badge variant="outline" className="gap-1 border-accent/40 bg-accent/10 text-[11px] text-accent">
                <MonitorPlay className="size-3" aria-hidden="true" />
                {E.replay}
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-1.5 truncate font-heading text-sm font-semibold tracking-tight sm:text-base">
            {event.title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {event.host} · {event.hostRole}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {event.durationMin} {E.duration}
            </span>
          </p>
        </div>

        {/* Seat gauge + action */}
        {!past ? (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-36">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span data-testid={`academy-event-seats-${event.id}`}>
                {full ? (
                  <span className="font-semibold text-loss">{E.full}</span>
                ) : (
                  <>
                    <span className="font-mono font-bold tabular-nums text-foreground">{seatsLeft}</span>{" "}
                    {seatsLeft === 1 ? E.seatOne : E.seats}
                  </>
                )}
              </span>
              <span className="font-mono tabular-nums">
                {event.seatsTaken}/{event.seatsTotal}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round((event.seatsTaken / event.seatsTotal) * 100)}%`,
                  background: full ? "var(--loss)" : hue,
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={event.registered ? "outline" : "default"}
              disabled={full && !event.registered}
              onClick={() => register.mutate({ eventId: event.id })}
              data-testid={`academy-event-register-${event.id}`}
              className={cn("gap-1.5", full && !event.registered && "opacity-50")}
            >
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {event.registered ? E.unregister : E.register}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Module-scope "now" - one snapshot per mount of the panel (mock realism). */
const NOW = new Date();

export function AcademyEventsPanel() {
  const { dict } = useI18n();
  const E = dict.academy.events;
  const eventsQuery = useAcademyEvents();
  const catalogQuery = useAcademyCatalog();

  const categoryNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const category of catalogQuery.data?.categories ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [catalogQuery.data]);

  if (eventsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const upcoming = eventsQuery.data?.upcoming ?? [];
  const past = eventsQuery.data?.past ?? [];

  return (
    <div className="space-y-6" data-testid="academy-events-panel">
      <section aria-label={E.upcoming} className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-4 text-accent" aria-hidden="true" />
          {E.upcoming}
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{E.emptyUpcoming}</p>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} past={false} categoryName={event.categoryId ? categoryNames.get(event.categoryId) ?? null : null} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-label={E.past} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{E.past}</h2>
          <div className="grid gap-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} past={true} categoryName={event.categoryId ? categoryNames.get(event.categoryId) ?? null : null} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
