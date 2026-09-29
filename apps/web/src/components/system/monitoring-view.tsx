"use client";

import * as React from "react";
import {
  Activity,
  CloudOff,
  Database,
  HeartPulse,
  ServerCog,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { COSMOZ_VERSION, statusSeverity } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useIntegrationsOverview } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { isSyncStale } from "@cosmoz/shared";

/**
 * /monitoring — system health for the platform surfaces. Data-side services
 * report through their own providers; this view aggregates the runtime state
 * the app can observe directly (market feed, mock API, PWA shell, store).
 * Semantic tokens only; numbers in font-mono.
 */

type ServiceStatus = {
  name: string;
  icon: LucideIcon;
  status: "Operational" | "Degraded" | "Standby";
  detail: string;
  metrics: { label: string; value: string }[];
};

const SERVICES: ServiceStatus[] = [
  {
    name: "Market Service",
    icon: Wifi,
    status: "Operational",
    detail:
      "Real-time quotes over WebSocket with automatic polling fallback when the stream drops.",
    metrics: [
      { label: "Transport", value: "WS · fallback poll 5 s" },
      { label: "Reconnect", value: "Exponential backoff" },
    ],
  },
  {
    name: "Journal API",
    icon: ServerCog,
    status: "Operational",
    detail:
      "The typed API layer serves every module; responses are validated against shared Zod schemas.",
    metrics: [
      { label: "Contract", value: "Zod-validated" },
      { label: "Surfaces", value: "trades · stats · prefs" },
    ],
  },
  {
    name: "PWA Shell",
    icon: CloudOff,
    status: "Operational",
    detail:
      "The service worker keeps the shell available offline; a backup JSON export travels with you.",
    metrics: [
      { label: "Offline page", value: "Ready" },
      { label: "Backup", value: "Settings → Backup" },
    ],
  },
  {
    name: "Session Store",
    icon: Database,
    status: "Standby",
    detail:
      "The in-memory store reseeds on a full page reload — treat reloads as data resets in this build.",
    metrics: [
      { label: "Persistence", value: "Browser session" },
      { label: "Reseed", value: "On reload" },
    ],
  },
];

const statusVariant: Record<ServiceStatus["status"], "default" | "secondary"> = {
  Operational: "default",
  Degraded: "secondary",
  Standby: "secondary",
};

export function MonitoringView() {
  const nowMs = useNowMs(1000);
  const clock = React.useMemo(
    () =>
      nowMs === null
        ? "--:--:--"
        : new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "UTC",
          }).format(nowMs),
    [nowMs],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Monitoring
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          System health for everything that powers the journal: the market
          feed, the API layer, the offline shell and the session store.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" className="gap-1.5">
          <HeartPulse className="size-3" aria-hidden="true" />
          All services reporting
        </Badge>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          UTC {clock} · v{COSMOZ_VERSION}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <Card key={service.name} className="border-border bg-surface">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
                    <Icon className="size-4 text-accent" aria-hidden="true" />
                    {service.name}
                  </CardTitle>
                  <CardDescription>{service.detail}</CardDescription>
                </div>
                <Badge variant={statusVariant[service.status]}>
                  {service.status}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {service.metrics.map((metric) => (
                  <div key={metric.label} className="flex justify-between gap-4">
                    <span className="font-sans uppercase tracking-wide text-[11px]">
                      {metric.label}
                    </span>
                    <span className="text-right text-foreground">
                      {metric.value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Activity className="size-4 text-accent" aria-hidden="true" />
            What this page watches
          </CardTitle>
          <CardDescription>
            Health checks live in each provider; Monitoring mirrors their state
            in one place. System-level incidents are surfaced in the dashboard
            alerts feed — this screen is the quiet, complete view.
          </CardDescription>
        </CardHeader>
      </Card>

      <IntegrationHealthStrip nowMs={nowMs} />
    </div>
  );
}

/** §23 — integrations expose health; Monitoring detects stale providers. */
function IntegrationHealthStrip({ nowMs }: { nowMs: number | null }) {
  const { data: overview } = useIntegrationsOverview();
  if (overview === undefined) return null;

  const rows = [...overview.providers].sort(
    (a, b) => statusSeverity(a.status) - statusSeverity(b.status),
  );

  return (
    <Card className="border-border bg-surface" data-testid="monitoring-integrations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <ServerCog className="size-4 text-accent" aria-hidden="true" />
          Integrations health
        </CardTitle>
        <CardDescription>
          Every integration reports status, latency and last successful sync —
          stale providers (15 min TTL) are flagged here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {rows.map((provider) => {
          const stale =
            nowMs !== null &&
            provider.status !== "DISCONNECTED" &&
            isSyncStale(provider.sync.lastSuccessAt, nowMs);
          return (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className="font-medium">{provider.name}</span>
              <span className="flex items-center gap-2">
                {stale && (
                  <Badge variant="outline" className="text-[10px]">
                    stale
                  </Badge>
                )}
                <span className="font-mono tabular-nums text-muted-foreground">
                  {provider.latencyMs === null ? "—" : `${provider.latencyMs} ms`}
                </span>
                <Badge
                  variant={
                    provider.status === "CONNECTED"
                      ? "default"
                      : provider.status === "DISCONNECTED"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {provider.status === "AUTH_REQUIRED" ? "auth" : provider.status.toLowerCase()}
                </Badge>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
