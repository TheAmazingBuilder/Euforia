"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import type {
  ApiWindow,
  IntegrationHealthRow,
  JobRunRecord,
  MonitoringSnapshot,
  SystemEventRecord,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLiveQuotes, useFeedStats } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { useUpdateAlertRule, useUpdateFreshness } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import {
  ageLabel,
  ageLabel as age,
  classifyFreshness,
  EVENT_KIND_META,
  EvidenceLine,
  formatBytes,
  formatDateTime,
  FreshnessBadge,
  HealthPill,
  LevelBadge,
  MetricCell,
  Panel,
  SeverityBadge,
  StatusCodeBars,
} from "./monitoring-bits";

const CATEGORY_LABEL: Record<string, string> = {
  TRADING_ACCOUNT: "Trading account",
  BROKER: "Broker",
  EXCHANGE: "Exchange",
  MARKET_DATA: "Market data",
  ECONOMIC_DATA: "Economic data",
  MARKET_NEWS: "Market news",
  CHARTING: "Charting",
  COMMUNICATION: "Communication",
  NOTIFICATIONS: "Notifications",
  EXTERNAL_SERVICE: "External service",
};

// ── §5 System Health ─────────────────────────────────────────────────────────

export function SystemSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  return (
    <div className="space-y-6">
      <Panel title="Components — probes and evidence" testId="monitoring-system-components">
        <div className="divide-y divide-border border-y border-border">
          {snapshot.system.map((component) => (
            <div key={component.id} className="py-4" data-testid={`monitoring-system-${component.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{component.name}</p>
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {component.kind}
                </span>
                <HealthPill status={component.status} />
              </div>
              <EvidenceLine>{component.evidence}</EvidenceLine>
              <div className="mt-2.5 grid grid-cols-3 gap-4 sm:max-w-md">
                <MetricCell label="LATENCY" value={component.latencyMs !== null ? `${component.latencyMs} ms` : "—"} />
                <MetricCell label="ERR 1H" value={component.errorRatePct !== null ? `${component.errorRatePct.toFixed(2)}%` : "—"} />
                <MetricCell label="UPTIME" value={component.uptimePct !== null ? `${component.uptimePct.toFixed(2)}%` : "—"} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{component.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── §6 Market Data (+ §17 freshness config) ─────────────────────────────────

function FreshnessEditor({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const updateFreshness = useUpdateFreshness();
  const [live, setLive] = React.useState(String(snapshot.freshness.liveMaxMs));
  const [delayed, setDelayed] = React.useState(String(snapshot.freshness.delayedMaxMs));

  const save = () => {
    const liveMs = Number(live);
    const delayedMs = Number(delayed);
    if (!Number.isFinite(liveMs) || !Number.isFinite(delayedMs) || liveMs <= 0 || delayedMs <= liveMs) return;
    updateFreshness.mutate({ liveMaxMs: liveMs, delayedMaxMs: delayedMs });
  };

  const invalid = Number(delayed) <= Number(live);

  return (
    <div className="border border-border bg-surface p-4" data-testid="monitoring-freshness-editor">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Freshness thresholds</p>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Matched to the provider cadence — the feed broadcasts every {(snapshot.freshness.sourceCadenceMs / 1000).toFixed(2)}s.
            Stale data is flagged STALE, never rendered as live. Updated {formatDateTime(snapshot.freshness.updatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="ledger-label block text-[10px]">LIVE ≤ (ms)</span>
            <Input value={live} onChange={(event) => setLive(event.target.value)} inputMode="numeric" className="h-8 w-24 font-mono text-sm" />
          </label>
          <label className="space-y-1">
            <span className="ledger-label block text-[10px]">DELAYED ≤ (ms)</span>
            <Input value={delayed} onChange={(event) => setDelayed(event.target.value)} inputMode="numeric" className={cn("h-8 w-28 font-mono text-sm", invalid && "border-loss")} />
          </label>
          <Button size="sm" onClick={save} disabled={invalid || updateFreshness.isPending} className="h-8">
            <RefreshCw className={cn("size-3.5", updateFreshness.isPending && "animate-spin")} aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MarketDataSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const { quotes } = useLiveQuotes();
  const now = useNowMs();
  const rows = React.useMemo(
    () => [...quotes.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [quotes],
  );

  return (
    <div className="space-y-6">
      <FreshnessEditor snapshot={snapshot} />

      <Panel title="Providers — live health probe (GET /health)">
        <div className="divide-y divide-border border-y border-border" data-testid="monitoring-market-providers">
          {snapshot.market.providers.map((provider) => (
            <div key={provider.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{provider.name}</p>
                <HealthPill status={provider.status} />
                {provider.note ? (
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {provider.note}
                  </span>
                ) : null}
              </div>
              <EvidenceLine>{provider.evidence}</EvidenceLine>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{provider.transport}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Symbol freshness — computed client-side every second"
        right={<span className="font-mono text-[11px] tabular-nums text-muted-foreground">{rows.length} symbol(s) streaming</span>}
      >
        {rows.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground" data-testid="monitoring-market-empty">
            No quotes received yet — the feed is still connecting. Nothing is claimed live before the first tick.
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border" data-testid="monitoring-market-quotes">
            {rows.map((quote) => {
              const ageMs = now !== null ? now - quote.ts : null;
              const phase = classifyFreshness(ageMs, snapshot.freshness);
              return (
                <div key={quote.symbol} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6", phase === "stale" && "bg-loss/5")}>
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="font-mono text-sm font-semibold text-foreground">{quote.symbol}</span>
                    <FreshnessBadge phase={phase} />
                    <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {quote.source}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 sm:w-[380px]">
                    <MetricCell label="LAST" value={quote.price.toLocaleString("en-US", { maximumFractionDigits: quote.price < 10 ? 4 : 2 })} />
                    <MetricCell label="LAST UPDATE" value={ageLabel(ageMs)} tone={phase === "stale" ? "loss" : phase === "delayed" ? "warning" : "muted"} />
                    <MetricCell label="FRESHNESS" value={phase === "live" ? `< ${snapshot.freshness.liveMaxMs / 1000}s` : phase === "delayed" ? "< " + snapshot.freshness.delayedMaxMs / 1000 + "s" : "> " + snapshot.freshness.delayedMaxMs / 1000 + "s"} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── §7 Broker Connections ────────────────────────────────────────────────────

function StreamCell({ label, stream }: { label: string; stream: { status: string; lastAt: string | null; detail: string } }) {
  const tone = stream.status === "synced" ? "text-profit" : stream.status === "degraded" ? "text-warning" : "text-muted-foreground";
  return (
    <div className="min-w-0">
      <p className="ledger-label text-[10px]">{label}</p>
      <p className={cn("mt-0.5 font-mono text-xs font-semibold uppercase", tone)}>{stream.status}</p>
      <p className="font-mono text-[10px] text-muted-foreground">{stream.lastAt ? formatDateTime(stream.lastAt) : "—"}</p>
    </div>
  );
}

export function BrokersSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const now = useNowMs();
  return (
    <div className="space-y-6">
      <Panel
        title="Trading account adapters"
        right={
          <Link href="/integrations" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            Manage in Integration Hub <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        }
      >
        <div className="divide-y divide-border border-y border-border" data-testid="monitoring-brokers">
          {snapshot.brokers.map((broker) => (
            <div key={broker.providerId} className="py-4" data-testid={`monitoring-broker-${broker.providerId}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{broker.providerName}</p>
                <span className="font-mono text-[11px] text-muted-foreground">{broker.accountLabel}</span>
                <HealthPill status={broker.status} />
                <Badge variant="outline" className="font-mono text-[10px]">{broker.integrationStatus}</Badge>
                <Badge variant="outline" className={cn("font-mono text-[10px]", broker.authStatus === "expired" && "border-warning/40 text-warning", broker.authStatus === "none" && "text-muted-foreground")}>
                  auth: {broker.authStatus}
                </Badge>
              </div>
              <EvidenceLine>{broker.evidence}</EvidenceLine>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <MetricCell label="LAST SYNC" value={broker.lastSyncAt !== null && now !== null ? age(now - Date.parse(broker.lastSyncAt)) : "—"} />
                <MetricCell label="LATENCY" value={broker.latencyMs !== null ? `${broker.latencyMs} ms` : "—"} />
                <MetricCell label="SYNC FAILURES" value={broker.syncFailures} tone={broker.syncFailures > 0 ? "warning" : "muted"} />
                <div />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 border-t border-dashed border-border pt-3">
                <StreamCell label="POSITIONS" stream={broker.positions} />
                <StreamCell label="ORDERS" stream={broker.orders} />
                <StreamCell label="EXECUTIONS" stream={broker.executions} />
              </div>
              {broker.lastError ? (
                <p className="mt-2.5 border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">{broker.lastError}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Stream statuses are derived from the incremental sync cursor of each adapter — a disconnected adapter reports
        <span className="font-mono"> unavailable</span>, never a guessed stream state. Account identifiers are masked (§19).
      </p>
    </div>
  );
}

// ── §8 WebSockets ────────────────────────────────────────────────────────────

export function WebSocketsSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const now = useNowMs();
  const stats = useFeedStats();
  const live = snapshot.websockets[0];
  if (!live) return null;
  const stateLabel = stats.transport === "socket" ? "socket.io" : stats.transport === "polling" ? "polling fallback" : "disconnected";
  const stateTone = stats.phase === "live" ? "profit" : stats.phase === "offline" ? "loss" : stats.phase === "reconnecting" ? "warning" : "muted";

  return (
    <div className="space-y-6">
      <Panel title="Live channels">
        <div className="border-y border-border py-4" data-testid="monitoring-websockets">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-sm font-semibold text-foreground">{live.name}</p>
            <HealthPill status={live.status} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{live.endpoint} — {live.purpose}</p>
          <EvidenceLine>{live.evidence}</EvidenceLine>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <MetricCell label="TRANSPORT" value={stateLabel} tone={stateTone} />
            <MetricCell label="HEARTBEAT" value={live.heartbeatMs !== null ? `${live.heartbeatMs}ms` : "—"} />
            <MetricCell label="LAST MESSAGE" value={now !== null && stats.lastMessageAt > 0 ? age(now - stats.lastMessageAt) : "—"} />
            <MetricCell label="MESSAGES" value={stats.messagesReceived.toLocaleString("en-US")} />
            <MetricCell label="RECONNECTS" value={stats.reconnectAttempts} tone={stats.reconnectAttempts > 0 ? "warning" : "muted"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCell label="DROPPED CONNECTIONS" value={stats.droppedConnections} tone={stats.droppedConnections > 0 ? "warning" : "muted"} />
            <MetricCell label="PHASE" value={stats.phase} tone={stateTone} />
            <div />
            <div />
          </div>
          {live.note ? <p className="mt-2 text-xs text-muted-foreground">{live.note}</p> : null}
        </div>
      </Panel>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The client counts real transport events: every reconnect attempt, every dropped connection and every
        message batch is measured from the socket — the console never asserts a heartbeat it did not observe.
      </p>
    </div>
  );
}

// ── §9 API ───────────────────────────────────────────────────────────────────

export function ApiSection({ snapshot, window: apiWindow, onWindowChange }: {
  snapshot: MonitoringSnapshot;
  window: ApiWindow;
  onWindowChange: (window: ApiWindow) => void;
}) {
  const windows: ApiWindow[] = ["5m", "1h", "24h"];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ledger-label">Request ledger — window</p>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5" role="group" aria-label="Analysis window">
          {windows.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onWindowChange(option)}
              aria-pressed={apiWindow === option}
              className={cn(
                "rounded px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                apiWindow === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5" data-testid="monitoring-api-kpis">
        <div className="bg-surface p-4"><MetricCell label="REQUESTS" value={snapshot.api.requestCount} /></div>
        <div className="bg-surface p-4"><MetricCell label="ERROR RATE" value={`${snapshot.api.errorRatePct.toFixed(2)}%`} tone={snapshot.api.errorRatePct > 5 ? "loss" : snapshot.api.errorRatePct > 0 ? "warning" : "profit"} /></div>
        <div className="bg-surface p-4"><MetricCell label="P50" value={`${Math.round(snapshot.api.p50Ms)} ms`} /></div>
        <div className="bg-surface p-4"><MetricCell label="P95" value={`${Math.round(snapshot.api.p95Ms)} ms`} tone={snapshot.api.p95Ms > 800 ? "warning" : "muted"} /></div>
        <div className="bg-surface p-4"><MetricCell label="RATE-LIMITED" value={snapshot.api.rateLimitedCount} tone={snapshot.api.rateLimitedCount > 0 ? "warning" : "muted"} /></div>
      </div>

      <Panel title="Status code distribution">
        <StatusCodeBars statusCodes={snapshot.api.statusCodes} />
      </Panel>

      <Panel title="Endpoints — grouped by shape, ids collapsed">
        <EndpointTable rows={snapshot.api.endpoints} testId="monitoring-api-endpoints" emptyLabel="No requests crossed the worker ledger in this window yet." />
      </Panel>

      <Panel title="Slowest endpoints — p95">
        <EndpointTable rows={snapshot.api.slowEndpoints} testId="monitoring-api-slow" emptyLabel="Nothing measured in this window." />
      </Panel>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Telemetry comes from the request lifecycle of the worker itself — every request timed from start to
        response. Patterns are normalized (ids → <span className="font-mono">:id</span>) so the table can never leak record identifiers.
      </p>
    </div>
  );
}

function EndpointTable({ rows, testId, emptyLabel }: {
  rows: { pattern: string; count: number; errorCount: number; p50Ms: number; p95Ms: number; lastStatus: number }[];
  testId: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto border-y border-border" data-testid={testId}>
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Pattern</th>
            <th className="py-2 pr-3 text-right font-semibold">Count</th>
            <th className="py-2 pr-3 text-right font-semibold">Errors</th>
            <th className="py-2 pr-3 text-right font-semibold">p50</th>
            <th className="py-2 pr-3 text-right font-semibold">p95</th>
            <th className="py-2 text-right font-semibold">Last</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
          {rows.map((row) => (
            <tr key={row.pattern}>
              <td className="py-2 pr-3 font-semibold text-foreground">{row.pattern}</td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{row.count}</td>
              <td className={cn("py-2 pr-3 text-right", row.errorCount > 0 ? "text-loss" : "text-muted-foreground")}>{row.errorCount}</td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{Math.round(row.p50Ms)}ms</td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{Math.round(row.p95Ms)}ms</td>
              <td className="py-2 text-right">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", row.lastStatus < 400 ? "bg-profit/10 text-profit" : row.lastStatus < 500 ? "bg-warning/10 text-warning" : "bg-loss/10 text-loss")}>
                  {row.lastStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── §10 Database ─────────────────────────────────────────────────────────────

export function DatabaseSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const database = snapshot.database;
  const usagePct = database.storage.usageBytes !== null && database.storage.quotaBytes !== null && database.storage.quotaBytes > 0
    ? (database.storage.usageBytes / database.storage.quotaBytes) * 100
    : null;
  return (
    <div className="space-y-6" data-testid="monitoring-database">
      <Panel title="Persistence layer">
        <div className="border-y border-border py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-sm font-semibold text-foreground">{database.engine}</p>
            <HealthPill status={database.status} />
          </div>
          <EvidenceLine>{database.evidence}</EvidenceLine>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCell label="POOL" value={`${database.pool.active}/${database.pool.max}`} />
            <MetricCell label="READ PROBE" value={`${database.readLatencyMs} ms`} />
            <MetricCell label="WRITE PROBE" value={`${database.writeLatencyMs} ms`} />
            <MetricCell label="FAILED OPS" value={database.failedOperations} tone={database.failedOperations > 0 ? "warning" : "muted"} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{database.detail}</p>
        </div>
      </Panel>

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel title="Records under management">
          <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3">
            {Object.entries(database.records).map(([key, value]) => (
              <div key={key} className="bg-surface p-4">
                <MetricCell label={key.replace(/([A-Z])/g, " $1").toUpperCase()} value={value} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Storage quota (browser)">
          <div className="border-y border-border py-4">
            <div className="flex items-baseline justify-between gap-3">
              <MetricCell label="USED" value={formatBytes(database.storage.usageBytes)} />
              <MetricCell label="QUOTA" value={formatBytes(database.storage.quotaBytes)} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Storage usage">
              <div className="h-full bg-accent" style={{ width: usagePct !== null ? `${Math.min(100, Math.max(1.5, usagePct))}%` : "0%" }} />
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              {usagePct !== null ? `${usagePct.toFixed(2)}% of the browser quota` : "Quota estimate unavailable in this browser — reported as unknown, not guessed."}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── §11 Queues & Jobs ────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: JobRunRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        status === "succeeded" && "border-profit/40 bg-profit/10 text-profit",
        status === "failed" && "border-loss/40 bg-loss/10 text-loss",
        status === "retrying" && "border-warning/40 bg-warning/10 text-warning",
        (status === "queued" || status === "running") && "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export function JobsSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  return (
    <div className="space-y-6">
      <Panel title="Queues — depth and health" testId="monitoring-queues">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.queues.queues.map((queue) => (
            <div key={queue.name} className="bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{queue.name}</p>
                <span className={cn("font-mono text-lg font-bold tabular-nums", queue.depth > 0 ? "text-warning" : "text-foreground")}>{queue.depth}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{queue.note}</p>
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">processing {queue.processingMs ?? "—"}ms · {queue.failed} failed (1h)</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Scheduled jobs">
        <div className="divide-y divide-border border-y border-border" data-testid="monitoring-scheduled">
          {snapshot.queues.scheduledJobs.map((job) => (
            <div key={job.name} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{job.name}</p>
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{job.schedule}</span>
                <HealthPill status={job.status} />
              </div>
              <EvidenceLine>{job.evidence}</EvidenceLine>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                last {job.lastRunAt ? formatDateTime(job.lastRunAt) : "—"} · next {job.nextRunAt ? formatDateTime(job.nextRunAt) : "—"}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Recent runs — job ledger" right={<span className="font-mono text-[11px] text-muted-foreground">{snapshot.queues.stuckJobs} stuck</span>}>
        <div className="overflow-x-auto border-y border-border" data-testid="monitoring-job-runs">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Job</th>
                <th className="py-2 pr-3 font-semibold">Queue</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 text-right font-semibold">Attempts</th>
                <th className="py-2 pr-3 text-right font-semibold">Duration</th>
                <th className="py-2 font-semibold">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {snapshot.queues.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="py-2 pr-3">
                    <p className="font-mono text-xs font-semibold text-foreground">{run.jobName}</p>
                    {run.error ? <p className="mt-0.5 max-w-md truncate text-[11px] text-loss" title={run.error}>{run.error}</p> : null}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{run.queue}</td>
                  <td className="py-2 pr-3"><JobStatusBadge status={run.status} /></td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted-foreground">{run.attempts}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted-foreground">{run.durationMs !== null ? `${run.durationMs}ms` : "—"}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">{run.finishedAt ? formatDateTime(run.finishedAt) : "running…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ── §12 Notifications ────────────────────────────────────────────────────────

export function NotificationsSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  return (
    <div className="space-y-6" data-testid="monitoring-notifications">
      <Panel title="Delivery channels">
        <div className="divide-y divide-border border-y border-border">
          {snapshot.notifications.map((channel) => (
            <div key={channel.channel} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold capitalize text-foreground">{channel.channel}</p>
                <span className="font-mono text-[11px] text-muted-foreground">{channel.transport}</span>
                <HealthPill status={channel.status} />
              </div>
              <EvidenceLine>{channel.evidence}</EvidenceLine>
              <div className="mt-2.5 grid grid-cols-3 gap-4 sm:grid-cols-6">
                <MetricCell label="SENT" value={channel.sent} tone="profit" />
                <MetricCell label="FAILED" value={channel.failed} tone={channel.failed > 0 ? "loss" : "muted"} />
                <MetricCell label="QUEUED" value={channel.queued} tone={channel.queued > 0 ? "warning" : "muted"} />
                <MetricCell label="RETRYING" value={channel.retrying} tone={channel.retrying > 0 ? "warning" : "muted"} />
                <MetricCell label="LAST DELIVERY" value={channel.lastDeliveryAt ? formatDateTime(channel.lastDeliveryAt) : "—"} />
                <div />
              </div>
              {channel.lastError ? (
                <p className="mt-2.5 border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">{channel.lastError}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-xs leading-relaxed text-muted-foreground">
        A silent alerting path is a broken safety net — delivery failures are monitored with the same rigor as
        the events they announce. Delivery payloads never contain journal content.
      </p>
    </div>
  );
}

// ── §13 Integrations ─────────────────────────────────────────────────────────

export function IntegrationsSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  return (
    <div className="space-y-6" data-testid="monitoring-integrations">
      <Panel
        title="Provider health — all categories"
        right={
          <Link href="/integrations" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            Open Integration Hub <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        }
      >
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Provider</th>
                <th className="py-2 pr-3 font-semibold">Category</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Last success</th>
                <th className="py-2 pr-3 font-semibold">Last failure</th>
                <th className="py-2 pr-3 text-right font-semibold">Latency</th>
                <th className="py-2 pr-3 text-right font-semibold">Errors</th>
                <th className="py-2 font-semibold">Credentials</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {snapshot.integrations.map((row) => (
                <IntegrationRow key={row.providerId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function IntegrationRow({ row }: { row: IntegrationHealthRow }) {
  const statusTone =
    row.status === "CONNECTED" || row.status === "SYNCING" ? "text-profit"
    : row.status === "DEGRADED" ? "text-warning"
    : row.status === "ERROR" || row.status === "AUTH_REQUIRED" ? "text-loss"
    : "text-muted-foreground";
  return (
    <tr>
      <td className="py-2 pr-3">
        <p className="text-sm font-semibold text-foreground">{row.name}</p>
        {row.lastError ? <p className="mt-0.5 max-w-xs truncate text-[11px] text-muted-foreground" title={row.lastError}>{row.lastError}</p> : null}
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{CATEGORY_LABEL[row.category] ?? row.category}</td>
      <td className={cn("py-2 pr-3 font-mono text-xs font-semibold", statusTone)}>{row.status}</td>
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{row.lastSuccessAt ? formatDateTime(row.lastSuccessAt) : "—"}</td>
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{row.lastFailedAt ? formatDateTime(row.lastFailedAt) : "—"}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.latencyMs !== null ? `${row.latencyMs}ms` : "—"}</td>
      <td className={cn("py-2 pr-3 text-right font-mono text-xs tabular-nums", row.errorCount > 0 ? "text-warning" : "text-muted-foreground")}>{row.errorCount}</td>
      <td className="py-2">
        <span className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
          row.credentialStatus === "ok" && "bg-profit/10 text-profit",
          row.credentialStatus === "expired" && "bg-warning/10 text-warning",
          row.credentialStatus === "none" && "bg-muted text-muted-foreground",
        )}>
          {row.credentialStatus}
        </span>
      </td>
    </tr>
  );
}

// ── §15 System Events ────────────────────────────────────────────────────────

export function EventsSection({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const [kindFilter, setKindFilter] = React.useState<"all" | SystemEventRecord["kind"]>("all");
  const kinds = React.useMemo(() => {
    const present = new Set(snapshot.events.map((event) => event.kind));
    return [...present];
  }, [snapshot.events]);
  const filtered = kindFilter === "all" ? snapshot.events : snapshot.events.filter((event) => event.kind === kindFilter);

  return (
    <div className="space-y-6" data-testid="monitoring-events">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setKindFilter("all")}
          className={cn("rounded-md border px-2.5 py-1 font-mono text-xs", kindFilter === "all" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
        >
          all
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter(kind)}
            className={cn("rounded-md border px-2.5 py-1 font-mono text-xs", kindFilter === kind ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {EVENT_KIND_META[kind].label.toLowerCase()}
          </button>
        ))}
      </div>

      <Panel title="System event feed — append-only, distinct from the Security audit trail">
        {filtered.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">No events of this kind on record.</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {filtered.map((event) => (
              <div key={event.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={event.level} />
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{EVENT_KIND_META[event.kind].label}</span>
                  <p className="min-w-0 flex-1 text-sm text-foreground">{event.message}</p>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDateTime(event.at)}</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">source: {event.source}</p>
                {event.detail ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.detail}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── §14 Alert rules (rendered inside Overview) ───────────────────────────────

export function AlertRuleRow({ rule, snapshot }: { rule: MonitoringSnapshot["alerting"]["rules"][number]; snapshot: MonitoringSnapshot }) {
  const updateAlertRule = useUpdateAlertRule();
  const active = snapshot.alerting.active.find((alert) => alert.kind === rule.kind);
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4" data-testid={`monitoring-rule-${rule.kind}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(checked) => updateAlertRule.mutate({ kind: rule.kind, input: { enabled: checked } })}
          aria-label={`${rule.enabled ? "Disable" : "Enable"} rule ${rule.label}`}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{rule.label}</p>
            <span className="font-mono text-[11px] text-muted-foreground">
              {rule.thresholdMetric} {rule.thresholdValue >= 1_000 ? rule.thresholdValue.toLocaleString("en-US") : rule.thresholdValue} {rule.thresholdUnit}
            </span>
            {active ? <SeverityBadge severity={active.severity} /> : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rule.description}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            channels: {rule.channels.join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}
