"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  DatabaseBackup,
  Download,
  KeyRound,
  ListChecks,
  ShieldCheck,
  Settings2,
  UserRound,
} from "lucide-react";
import type { SecurityEventType } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSecurityLog } from "@/lib/api/queries";

/**
 * Activity log — the account's audit trail as a ledger: one row per event,
 * hairline rules, a colored type mark per row and a scope filter
 * (All / Trading / Security / System). Relative timestamps for the recent
 * past, absolute dates beyond.
 */

type Scope = "all" | "trading" | "security" | "system";

const TYPE_MARKS: Record<
  SecurityEventType,
  { Icon: React.ComponentType<{ className?: string }>; tintClass: string; ringClass: string }
> = {
  trade: { Icon: ArrowLeftRight, tintClass: "text-accent", ringClass: "bg-accent/12" },
  grade: { Icon: CheckCircle2, tintClass: "text-profit", ringClass: "bg-profit/12" },
  security: { Icon: KeyRound, tintClass: "text-warning", ringClass: "bg-warning/12" },
  system: { Icon: Settings2, tintClass: "text-chart-2", ringClass: "bg-chart-2/12" },
};

const EVENT_ICONS: { match: RegExp; Icon: React.ComponentType<{ className?: string }> }[] = [
  { match: /Backup exported/, Icon: DatabaseBackup },
  { match: /CSV import/, Icon: Download },
  { match: /Signed in|Password/, Icon: ShieldCheck },
  { match: /Strategy|journal|Risk defaults|Daily journal/, Icon: ListChecks },
  { match: /User|Profile/, Icon: UserRound },
];

function eventIcon(type: SecurityEventType, label: string) {
  const override = EVENT_ICONS.find(({ match }) => match.test(label));
  return override ? override.Icon : TYPE_MARKS[type].Icon;
}

const SCOPES: { value: Scope; label: string; types: SecurityEventType[] | null }[] = [
  { value: "all", label: "All", types: null },
  { value: "trading", label: "Trading", types: ["trade", "grade"] },
  { value: "security", label: "Security", types: ["security"] },
  { value: "system", label: "System", types: ["system"] },
];

function relativeTime(iso: string, nowMs: number): string {
  const delta = nowMs - Date.parse(iso);
  if (!Number.isFinite(delta)) return iso;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function LogSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading activity log">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ActivityLog() {
  const log = useSecurityLog();
  const [scope, setScope] = React.useState<Scope>("all");
  const [nowMs] = React.useState(() => Date.now());

  const events = React.useMemo(() => {
    const all = log.data?.events ?? [];
    const scopeDef = SCOPES.find((s) => s.value === scope);
    if (!scopeDef?.types) return all;
    return all.filter((event) => scopeDef.types!.includes(event.type));
  }, [log.data, scope]);

  const counts = React.useMemo(() => {
    const all = log.data?.events ?? [];
    return {
      trading: all.filter((e) => e.type === "trade" || e.type === "grade").length,
      security: all.filter((e) => e.type === "security").length,
      system: all.filter((e) => e.type === "system").length,
    } as Record<Exclude<Scope, "all">, number>;
  }, [log.data]);

  if (log.isLoading) return <LogSkeleton />;

  if (log.isError || !log.data) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        The activity log could not be loaded — retry from the top bar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scope filter */}
      <div
        role="tablist"
        aria-label="Log scopes"
        className="flex w-fit overflow-hidden rounded-lg border border-border bg-surface"
      >
        {SCOPES.map((scopeDef) => {
          const active = scope === scopeDef.value;
          const count =
            scopeDef.value === "all"
              ? log.data.events.length
              : counts[scopeDef.value];
          return (
            <button
              key={scopeDef.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setScope(scopeDef.value)}
              className={cn(
                "px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {scopeDef.label}
              <span
                className={cn(
                  "ml-1.5 font-mono text-[11px] tabular-nums",
                  active ? "opacity-70" : "text-muted-foreground/70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ledger */}
      <ol className="overflow-hidden rounded-xl bg-surface ring-1 ring-foreground/10">
        {events.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            No events in this scope yet.
          </li>
        ) : (
          events.map((event) => {
            const mark = TYPE_MARKS[event.type];
            const Icon = eventIcon(event.type, event.label);
            return (
              <li
                key={event.id}
                className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 sm:px-5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ring-1 ring-foreground/10",
                    mark.ringClass,
                  )}
                >
                  <Icon className={cn("size-4", mark.tintClass)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {event.label}
                  </p>
                  {event.detail ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {event.detail}
                    </p>
                  ) : null}
                </div>
                <time
                  dateTime={event.createdAt}
                  className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                  title={new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.createdAt))}
                >
                  {relativeTime(event.createdAt, nowMs)}
                </time>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
