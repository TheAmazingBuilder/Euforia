"use client";

import * as React from "react";
import { BellRing } from "lucide-react";
import type { Alert } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMarkAlertRead } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** Severity → dot color. Profit/loss colors only touch P&L semantics; alert
 * severities use the discipline palette (warning amber, loss red, accent). */
const SEVERITY_DOT: Record<Alert["severity"], string> = {
  NOTIFY: "bg-accent",
  WARN: "bg-warning",
  ALERT: "bg-loss",
  LOCK: "bg-loss",
};

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface AlertsFeedProps {
  alerts: Alert[];
  unreadCount: number;
}

/** Recent discipline & execution alerts with unread state + mark-as-read. */
export function AlertsFeed({ alerts, unreadCount }: AlertsFeedProps) {
  const markRead = useMarkAlertRead();
  const recent = React.useMemo(
    () => alerts.filter((alert) => alert.dismissedAt === null).slice(0, 6),
    [alerts],
  );

  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <BellRing className="size-4 text-accent" aria-hidden="true" />
          Discipline &amp; execution alerts
        </CardTitle>
        <CardDescription>Live feed from the discipline engine.</CardDescription>
        {unreadCount > 0 ? (
          <span
            className="mt-1 w-fit rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-accent"
            aria-label={`${unreadCount} unread alerts`}
          >
            {unreadCount} unread
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts — all quiet on the discipline front.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {recent.map((alert) => {
              const unread = alert.readAt === null;
              return (
                <li
                  key={alert.id}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3",
                    unread
                      ? "border-border bg-surface-raised/70"
                      : "border-border/50 bg-surface-raised/30",
                  )}
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[alert.severity])}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {alert.title}
                        {unread ? (
                          <span className="sr-only"> (unread)</span>
                        ) : null}
                      </p>
                      {unread ? (
                        <span
                          className="mt-1 size-1.5 shrink-0 rounded-full bg-accent"
                          aria-hidden="true"
                        />
                      ) : null}
                      <time
                        dateTime={alert.createdAt}
                        className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
                      >
                        {timeFormatter.format(new Date(alert.createdAt))}
                      </time>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {alert.message}
                    </p>
                    {unread ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1.5 h-6 px-2 text-xs text-accent hover:text-accent"
                        onClick={() => markRead.mutate(alert.id)}
                        disabled={markRead.isPending}
                      >
                        Mark as read
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
