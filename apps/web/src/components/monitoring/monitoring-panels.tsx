"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Database,
  Gauge,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Siren,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type {
  BrokerConnection,
  MarketFeedStatus,
  MonitoringOverviewResponse,
  WebsocketStatus,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EvidenceNote,
  FreshnessBadge,
  MetricLine,
  StatusBadge,
  ageFromIso,
  ageLabel,
  durationLabel,
  statusVariant,
  useNowClock,
} from "./monitoring-primitives";
import { DemoDataChip } from "@/components/demo-data-chip";

/**
 * Monitoring panels, part 1 (MASTER PROMPT §4–§8): Overview, System Health,
 * Market Data, WebSockets, Broker Connections. Market Data and WebSockets
 * render CLIENT-OBSERVED telemetry (the browser's own quote feed); the rest
 * render the engine's aggregate of observed state.
 */

type Overview = MonitoringOverviewResponse;

function PanelCard({
  icon: Icon,
  title,
  description,
  children,
  testId,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-surface" data-testid={testId}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Icon className="size-4 text-accent" aria-hidden="true" />
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

// ── Overview (§4) ────────────────────────────────────────────────────────────

export function OverviewPanel({
  data,
  marketStatus,
  wsStatus,
  goTo,
}: {
  data: Overview;
  marketStatus: { status: Overview["overview"]["overall"]; evidence: string };
  wsStatus: { status: Overview["overview"]["overall"]; evidence: string };
  goTo: (tab: string) => void;
}) {
  const nowMs = useNowClock();
  const { overview, alerts, incidents } = data;
  const components = overview.components.map((component) => {
    if (component.id === "market-data") {
      return { ...component, status: marketStatus.status, evidence: marketStatus.evidence };
    }
    if (component.id === "websocket") {
      return { ...component, status: wsStatus.status, evidence: wsStatus.evidence };
    }
    return component;
  });

  const openAlerts = alerts.filter((alert) => alert.resolvedAt === null);
  const activeIncidents = incidents.filter((incident) => incident.status === "OPEN");

  return (
    <div className="space-y-4">
      {/* Status board — every row carries its evidence (§4) */}
      <PanelCard
        icon={Gauge}
        title="Status board"
        description="Every status is backed by the observation shown beneath it - nothing is claimed without evidence."
        testId="monitoring-status-board"
      >
        <div className="grid gap-2">
          {components.map((component) => (
            <div
              key={component.id}
              className="rounded-lg border border-border/60 p-3"
              data-testid={`status-row-${component.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {component.label}
                  {component.source === "client-observed" && (
                    <Badge variant="outline" className="text-[10px]">
                      observed in your browser
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={component.status} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => goTo(component.tab)}
                  >
                    Inspect
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Button>
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                {component.evidence}
              </p>
            </div>
          ))}
        </div>
      </PanelCard>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Open alerts (§14) */}
        <PanelCard
          icon={Siren}
          title="Alerts"
          description={`Rule outcomes against the live telemetry · ${openAlerts.length} open`}
          testId="monitoring-alerts"
        >
          {openAlerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
              No alert condition holds right now.
            </div>
          ) : (
            <div className="grid gap-2">
              {openAlerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{alert.ruleId}</span>
                    <Badge
                      variant={alert.severity === "CRITICAL" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {alert.occurrences}× · last seen {ageLabel(ageFromIso(alert.lastSeenAt, nowMs))}
                  </p>
                </div>
              ))}
            </div>
          )}
          <EvidenceNote>
            Rules and thresholds are configurable in the System Events tab (§14).
          </EvidenceNote>
        </PanelCard>

        {/* Incidents (§16) */}
        <PanelCard
          icon={BellRing}
          title="Incidents"
          description={`${activeIncidents.length} active · derived from the event log, root causes only when evidenced`}
          testId="monitoring-incidents"
        >
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incident recorded in this session.</p>
          ) : (
            <div className="grid gap-2">
              {incidents.slice(0, 3).map((incident) => (
                <div key={incident.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{incident.service}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={incident.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-[10px]">
                        {incident.severity}
                      </Badge>
                      <Badge variant={incident.status === "OPEN" ? "destructive" : "outline"} className="text-[10px]">
                        {incident.status}
                      </Badge>
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    started {ageLabel(ageFromIso(incident.startedAt, nowMs))} ·{" "}
                    {incident.durationMs === null ? "ongoing" : `lasted ${durationLabel(incident.durationMs)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

// ── System Health (§5) ───────────────────────────────────────────────────────

export function SystemHealthPanel({ data }: { data: Overview }) {
  const uptime = durationLabel(data.health.sessionUptimeMs);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[11px]" data-testid="monitoring-uptime">
          Session uptime {uptime}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Counters cover this browser session (the demo store reseeds on reload - stated, not hidden).
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2" data-testid="monitoring-health-rows">
        {data.health.rows.map((row) => (
          <Card key={row.id} className="border-border bg-surface">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <CardTitle className="font-heading text-sm font-semibold">{row.label}</CardTitle>
              <StatusBadge status={row.status} />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-1.5">
                {row.metrics.map((metric) => (
                  <MetricLine key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
              <EvidenceNote>{row.evidence}</EvidenceNote>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Market Data (§6, §17) — client-observed feed ─────────────────────────────

export function MarketDataPanel({
  feed,
  providerHealth,
}: {
  feed: MarketFeedStatus;
  providerHealth: {
    ok: boolean;
    providers: { id: string; source: string; status: Record<string, unknown> }[];
  } | null;
}) {
  // Granular per-symbol degradation (module upgrade) — name the affected
  // symbols explicitly instead of a single feed-level verdict.
  const degraded = feed.symbols.filter((symbol) => symbol.freshness === "STALE" || symbol.freshness === "DELAYED");
  const staleSymbols = feed.symbols.filter((symbol) => symbol.freshness === "STALE");
  const liveCount = feed.symbols.filter((symbol) => symbol.freshness === "LIVE").length;

  return (
    <div className="space-y-4" data-testid="monitoring-market">
      <PanelCard
        icon={RadioTower}
        title="Quote feed"
        description="Observed live in your browser - the same stream Session Live consumes."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={feed.phase === "live" ? "default" : feed.phase === "offline" ? "destructive" : "secondary"}>
            {feed.phase}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            transport: {feed.transport}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            thresholds: LIVE ≤ {(feed.thresholds.liveMaxMs / 1_000).toFixed(0)}s · STALE &gt; {(feed.thresholds.delayedMaxMs / 1_000).toFixed(0)}s
          </Badge>
        </div>
        {feed.symbols.length > 0 && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              degraded.length === 0 ? "border-border bg-surface-raised text-muted-foreground" : "border-warning/40 bg-warning/10 text-warning",
            )}
            data-testid="market-symbol-degradation"
          >
            <p className="font-semibold">
              {liveCount}/{feed.symbols.length} symbols LIVE
              {staleSymbols.length > 0 ? ` · ${staleSymbols.length} STALE` : degraded.length > 0 ? ` · ${degraded.length - staleSymbols.length} DELAYED` : ""}
            </p>
            {degraded.length > 0 ? (
              <p className="mt-0.5 leading-relaxed">
                Degraded: {degraded.map((symbol) => `${symbol.symbol} (${symbol.freshness.toLowerCase()}, last tick ${ageLabel(symbol.ageMs)} ago)`).join(" · ")}. All other symbols unaffected - per-symbol degradation, not a feed outage.
              </p>
            ) : (
              <p className="mt-0.5">Every subscribed symbol is inside the LIVE window.</p>
            )}
          </div>
        )}
        <EvidenceNote>
          Freshness classes are computed per tick from the thresholds configured for this data source (§17) - stale data is never presented as live.
        </EvidenceNote>
      </PanelCard>

      {/* Provider health straight from the market service's own probe */}
      <PanelCard
        icon={ServerCog}
        title="Market service providers"
        description="Reported by the market service's /health probe - not synthesized."
      >
        {providerHealth === null ? (
          <p className="text-sm text-muted-foreground" data-testid="market-health-unreachable">
            Market service unreachable from this browser - no provider status is claimed.
          </p>
        ) : (
          <div className="grid gap-2">
            {providerHealth.providers.map((provider) => {
              const transport = typeof provider.status.transport === "string" ? provider.status.transport : "unknown";
              return (
                <div key={provider.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {provider.source}
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {transport}
                      {transport === "down" ? "" : ` · ${Array.isArray(provider.status.symbols) ? (provider.status.symbols as unknown[]).length : 0} symbol(s)`}
                    </span>
                  </span>
                  <Badge variant={transport === "down" ? "destructive" : "default"}>{transport === "down" ? "down" : "up"}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </PanelCard>

      {/* Per-symbol freshness (§6 example: symbol · LIVE · last update · latency) */}
      <PanelCard
        icon={Wifi}
        title="Symbols"
        description="Last update age and freshness class per symbol."
      >
        {feed.symbols.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tick observed yet in this session - the feed may still be connecting.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {feed.symbols.map((symbol) => (
              <div
                key={symbol.symbol}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                data-testid="market-symbol-row"
              >
                <span className="flex min-w-32 items-center gap-2 text-sm font-medium">
                  {symbol.symbol}
                  <Badge variant="outline" className="text-[10px]">{symbol.source}</Badge>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {symbol.price === null ? "-" : symbol.price.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="market-symbol-age">
                    Last update: {ageLabel(symbol.ageMs)}
                  </span>
                  <FreshnessBadge freshness={symbol.freshness} data-testid="market-symbol-freshness" />
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

// ── WebSockets (§8) — client-observed counters ───────────────────────────────

export function WebsocketsPanel({
  ws,
  thresholds,
}: {
  ws: WebsocketStatus;
  thresholds: { liveMaxMs: number; delayedMaxMs: number };
}) {
  return (
    <div className="space-y-4" data-testid="monitoring-ws">
      <PanelCard
        icon={Wifi}
        title="Quote stream connection"
        description="socket.io with a 2 s polling fallback - the browser reports what it actually experiences."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ws.connected === true ? "default" : ws.connected === false ? "secondary" : "outline"}>
            {ws.phase}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">transport: {ws.transport}</Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            heartbeat: broadcast 750 ms / poll 2 000 ms
          </Badge>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <MetricLine label="Reconnect attempts" value={String(ws.reconnectAttempts)} />
          <MetricLine label="Dropped connections" value={String(ws.droppedConnections)} />
          <MetricLine label="Last message" value={ageLabel(ws.lastMessageAgeMs)} />
          <MetricLine
            label="Poll RTT (fallback)"
            value={ws.lastPollRttMs === null ? "-" : `${ws.lastPollRttMs} ms`}
          />
          <MetricLine label="Subscribed symbols" value={String(ws.subscriptions)} />
          <MetricLine label="Staleness threshold" value={`${(thresholds.delayedMaxMs / 1_000).toFixed(0)} s`} />
        </div>
        <EvidenceNote>
          Counters come from the connection handlers in this browser session - reconnects and drops increment only when they actually happen (§8, §21).
        </EvidenceNote>
      </PanelCard>
    </div>
  );
}

// ── Broker connections (§7) ──────────────────────────────────────────────────

const brokerStatusVariant: Record<BrokerConnection["status"], "default" | "secondary" | "destructive" | "outline"> = {
  CONNECTED: "default",
  CONNECTING: "secondary",
  DEGRADED: "secondary",
  DISCONNECTED: "outline",
  AUTH_FAILED: "destructive",
};

export function BrokersPanel({ brokers }: { brokers: BrokerConnection[] }) {
  const nowMs = useNowClock();
  return (
    <div className="space-y-4" data-testid="monitoring-brokers">
      {/* Chain-B hygiene (Phase 02): broker telemetry derives from the
         simulated Integration Hub engine in mock mode - marked, never
         indistinguishable from real provider telemetry. */}
      {brokers.length > 0 ? <DemoDataChip testId="monitoring-brokers-demo-chip" /> : null}
      {brokers.length === 0 ? (
        <PanelCard icon={Database} title="Broker connections" description="No trading account is connected through the Integration Hub.">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/integrations">
              Open the Integration Hub
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </Button>
        </PanelCard>
      ) : (
        brokers.map((broker) => (
          <PanelCard
            key={broker.providerId}
            icon={ServerCog}
            title={`${broker.broker} · ${broker.accountIdentifier}`}
            description={`${broker.accountType}${broker.readOnly ? " · read-only" : ""}`}
            testId={`broker-row-${broker.providerId}`}
            action={<Badge variant={brokerStatusVariant[broker.status]}>{broker.status.replace("_", " ")}</Badge>}
          >
            <div className="grid gap-1.5 sm:grid-cols-2">
              <MetricLine label="Last sync" value={ageLabel(ageFromIso(broker.lastSyncAt, nowMs))} />
              <MetricLine label="Latency" value={broker.latencyMs === null ? "-" : `${broker.latencyMs} ms`} />
              <MetricLine label="Authentication" value={broker.authState} />
              <MetricLine label="Sync errors (ledger)" value={String(broker.syncErrors)} />
              <MetricLine label="Positions sync" value={broker.positionsSync} muted />
              <MetricLine label="Orders sync" value={broker.ordersSync} muted />
              <MetricLine label="Execution sync" value={broker.executionSync} muted />
            </div>
            <EvidenceNote>
              Sync surfaces are stated only when the adapter reports them - statuses derive from the Integration Hub engine live state (§7).
            </EvidenceNote>
          </PanelCard>
        ))
      )}
    </div>
  );
}

export { PanelCard, statusVariant };
