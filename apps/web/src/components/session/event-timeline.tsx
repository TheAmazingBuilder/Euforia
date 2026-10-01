"use client";

import type { SessionEvent } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Today's event timeline (right sidebar) — entries, exits, SL/TP
 * modifications and alerts, all assembled server-side (GET /session/timeline).
 * Dot colors are token-based: accent = entry, muted = exit, warning = plan
 * modification, severity-mapped for alerts.
 */

function dotClass(event: SessionEvent): string {
  if (event.kind === "ENTRY") return "bg-accent";
  if (event.kind === "EXIT") return "bg-muted-foreground/60";
  if (event.kind === "SL_MODIFIED" || event.kind === "TP_MODIFIED") return "bg-warning";
  // Alerts — mapped by severity.
  if (event.severity === "WARN") return "bg-warning";
  if (event.severity === "ALERT" || event.severity === "LOCK") return "bg-destructive";
  return "bg-accent";
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function EventTimeline({ events }: { events: SessionEvent[] }) {
  const { dict } = useI18n();
  const S = dict.session;

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {S.timeline.empty}
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4" aria-label={S.timeline.aria}>
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-background",
              dotClass(event),
            )}
          />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium leading-snug text-foreground">{event.label}</span>
            <time className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {timeOf(event.at)}
            </time>
          </div>
          {event.detail !== null ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{event.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
