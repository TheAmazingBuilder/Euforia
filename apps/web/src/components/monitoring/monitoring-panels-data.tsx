"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BellRing,
  Database,
  FileClock,
  ListChecks,
  PlugZap,
  ScrollText,
  Settings2,
  Siren as SirenIcon,
  Timer,
} from "lucide-react";
import type { MonitoringOverviewResponse } from "@cosmoz/shared";
import type { AlertRule } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  EvidenceNote,
  MetricLine,
  StatusBadge,
  ageFromIso,
  ageLabel,
  durationLabel,
  useNowClock,
} from "./monitoring-primitives";
import { PanelCard } from "./monitoring-panels";

/**
 * Monitoring panels, part 2 (MASTER PROMPT §9–§16): API, Database,
 * Queues & Jobs, Notifications, Integration Health, Audit / System Events
 * (with incidents and the configurable alert rules §14).
 */

type Overview = MonitoringOverviewResponse;

// ── API monitoring (§9) ──────────────────────────────────────────────────────

export function ApiPanel({ api }: { api: Overview["api"] }) {
  const nowMs = useNowClock();
  const maxBucket = Math.max(1, ...api.buckets.map((bucket) => bucket.count));
  return (
    <div className="space-y-4" data-testid="monitoring-api">
      <PanelCard
        icon={Activity}
        title="Traffic observed this session"
        description="Every request the typed API client actually made — counts, latency and errors as the browser measured them."
        testId="monitoring-api-stats"
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <MetricLine label="Requests" value={String(api.totalRequests)} />
          <MetricLine label="Errors" value={`${api.totalErrors} (${api.errorRatePct} %)`} />
          <MetricLine label="p50 latency" value={`${api.p50Ms} ms`} />
          <MetricLine label="p95 latency" value={`${api.p95Ms} ms`} />
          <MetricLine label="Rate-limited (429)" value={String(api.rateLimitedTotal)} />
          <MetricLine
            label="Window"
            value={`${ageLabel(ageFromIso(api.windowStartedAt, nowMs))} → now`}
          />
        </div>

        {/* Time-based analysis — per-minute buckets (§9) */}
        {api.buckets.length > 0 && (
          <div className="pt-2">
            <p className="pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Requests per minute (errors in red)
            </p>
            <div className="flex h-16 items-end gap-1" data-testid="monitoring-api-buckets">
              {api.buckets.map((bucket) => (
                <div
                  key={bucket.at}
                  title={`${bucket.at} — ${bucket.count} requests, ${bucket.errorCount} errors`}
                  className="flex h-full flex-1 flex-col justify-end gap-px"
                >
                  {bucket.errorCount > 0 && (
                    <div
                      className="rounded-sm bg-destructive/70"
                      style={{ height: `${(bucket.errorCount / maxBucket) * 100}%` }}
                    />
                  )}
                  <div
                    className="rounded-sm bg-accent/60"
                    style={{ height: `${((bucket.count - bucket.errorCount) / maxBucket) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {api.statusCodes.map((status) => (
            <Badge
              key={status.code}
              variant={status.code >= 400 || status.code === 0 ? "destructive" : "outline"}
              className="font-mono text-[10px]"
            >
              {status.code === 0 ? "network" : status.code}: {status.count}
            </Badge>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        icon={Timer}
        title="Endpoints"
        description="Per-endpoint health with real latency percentiles."
        testId="monitoring-api-endpoints"
      >
        <div className="grid gap-1.5">
          {api.endpoints.map((endpointStat) => (
            <div
              key={endpointStat.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
              data-testid="api-endpoint-row"
            >
              <span className="font-mono text-xs font-medium">{endpointStat.key}</span>
              <span className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                <span>{endpointStat.count} calls</span>
                <span className={endpointStat.errorCount > 0 ? "text-destructive" : undefined}>
                  {endpointStat.errorCount} err
                </span>
                <span>p50 {endpointStat.p50Ms} ms</span>
                <span>p95 {endpointStat.p95Ms} ms</span>
                <Badge
                  variant={endpointStat.lastStatus === 0 || endpointStat.lastStatus >= 400 ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {endpointStat.lastStatus === 0 ? "net" : endpointStat.lastStatus}
                </Badge>
              </span>
            </div>
          ))}
        </div>
        {api.slowest.length > 0 && (
          <EvidenceNote>
            Slowest by p95: {api.slowest.map((endpointStat) => `${endpointStat.key} (${endpointStat.p95Ms} ms)`).join(" · ")}
          </EvidenceNote>
        )}
      </PanelCard>
    </div>
  );
}

// ── Database monitoring (§10) ────────────────────────────────────────────────

export function DatabasePanel({ db }: { db: Overview["database"] }) {
  return (
    <div className="space-y-4" data-testid="monitoring-database">
      <PanelCard
        icon={Database}
        title={db.kind}
        description="Infrastructure-free monitoring: what the demo build can genuinely observe, nothing more."
        testId="monitoring-db-entities"
        action={<StatusBadge status={db.status} />}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <MetricLine label="Read operations" value={String(db.readOps)} />
          <MetricLine label="Write operations" value={String(db.writeOps)} />
          <MetricLine label="Avg read latency" value={`${db.avgReadMs} ms`} />
          <MetricLine label="Failed queries" value={String(db.failedQueries)} />
          <MetricLine label="Slow queries (p95 > 250 ms)" value={String(db.slowQueries)} />
        </div>
        <div>
          <p className="pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Entities</p>
          <div className="flex flex-wrap gap-1.5">
            {db.entities.map((entity) => (
              <Badge key={entity.label} variant="outline" className="gap-1.5 font-mono text-[11px]">
                {entity.label}: {entity.count}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border/70 p-3">
          <p className="pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Not observable in this build (stated, not faked)
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
            {db.unavailable.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </PanelCard>
    </div>
  );
}

// ── Queues & Jobs (§11) ──────────────────────────────────────────────────────

export function JobsPanel({
  jobs,
  onRun,
  runningJobId,
}: {
  jobs: Overview["jobs"];
  onRun: (jobId: string) => void;
  runningJobId: string | null;
}) {
  const nowMs = useNowClock();
  return (
    <div className="space-y-4" data-testid="monitoring-jobs">
      <PanelCard
        icon={ListChecks}
        title="Job ledger"
        description="Executions that actually ran in this session — seed, provider syncs, pipeline runs and manual runs."
      >
        {jobs.map((job) => (
          <div
            key={job.id}
            className="rounded-lg border border-border/60 p-3"
            data-testid={`job-row-${job.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                {job.name}
                <Badge variant="outline" className="text-[10px]">{job.schedule}</Badge>
                <Badge variant="outline" className="text-[10px]">{job.queue}</Badge>
                {job.stuck && <Badge variant="destructive" className="text-[10px]">STUCK</Badge>}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={!job.manualRunnable || runningJobId !== null}
                title={
                  job.manualRunnable
                    ? "Run this job now"
                    : "Driven by the app in this build — no synthetic run is fabricated"
                }
                onClick={() => onRun(job.id)}
                data-testid={`job-run-${job.id}`}
              >
                {runningJobId === job.id ? "Running…" : job.manualRunnable ? "Run" : "App-driven"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
              <MetricLine
                label="Last run"
                value={
                  job.lastRun === null
                    ? "never"
                    : `${job.lastRun.status} · ${ageLabel(ageFromIso(job.lastRun.startedAt, nowMs))}`
                }
              />
              <MetricLine
                label="Success / failed"
                value={`${job.successCount} / ${job.failureCount}`}
              />
              <MetricLine
                label="Avg duration"
                value={durationLabel(job.avgDurationMs)}
              />
            </div>
            {job.lastRun?.error && (
              <p className="mt-1 font-mono text-[11px] text-destructive">{job.lastRun.error}</p>
            )}
          </div>
        ))}
        <EvidenceNote>
          Queue depth = runs currently executing; a RUNNING run older than 60 s is flagged stuck (§11). Failed runs land in the event log.
        </EvidenceNote>
      </PanelCard>
    </div>
  );
}

// ── Notifications (§12) ──────────────────────────────────────────────────────

export function NotificationsPanel({ notifications }: { notifications: Overview["notifications"] }) {
  const nowMs = useNowClock();
  return (
    <div className="space-y-4" data-testid="monitoring-notifications">
      <PanelCard
        icon={BellRing}
        title="Channels"
        description="Delivery state per channel — unwired channels stay Unknown instead of fake-green."
      >
        {notifications.channels.map((channel) => (
          <div key={channel.channel} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{channel.channel.replace("_", "-")}</span>
              <StatusBadge status={channel.status} />
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-4">
              <MetricLine label="Sent" value={String(channel.sent)} />
              <MetricLine label="Queued" value={String(channel.queued)} />
              <MetricLine label="Failed" value={String(channel.failed)} />
              <MetricLine label="Retrying" value={String(channel.retrying)} />
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{channel.evidence}</p>
          </div>
        ))}
      </PanelCard>

      <PanelCard
        icon={FileClock}
        title="Recent in-app deliveries"
        description="The notification center's latest items — the in-app channel's real traffic."
      >
        {notifications.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivery recorded yet.</p>
        ) : (
          <div className="grid gap-1.5">
            {notifications.recent.map((delivery) => (
              <div key={delivery.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{delivery.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {ageLabel(ageFromIso(delivery.at, nowMs))}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{delivery.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

// ── Integration health (§13) ─────────────────────────────────────────────────

export function IntegrationsHealthPanel({ integrations }: { integrations: Overview["integrations"] }) {
  const nowMs = useNowClock();
  return (
    <div className="space-y-4" data-testid="monitoring-integrations-health">
      <PanelCard
        icon={PlugZap}
        title="Provider health"
        description="Live from the Integration Hub engine — Monitoring never keeps its own copy."
        action={
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
            <Link href="/integrations">
              Manage
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        {integrations.map((integration) => (
          <div key={integration.providerId} className="rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                {integration.name}
                <Badge variant="outline" className="text-[10px]">{integration.kind.toLowerCase()}</Badge>
              </span>
              <span className="flex items-center gap-2">
                <Badge
                  variant={
                    integration.status === "CONNECTED"
                      ? "default"
                      : integration.status === "DISCONNECTED"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {integration.status === "AUTH_REQUIRED" ? "auth required" : integration.status.toLowerCase()}
                </Badge>
              </span>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <MetricLine
                label="Last successful sync"
                value={
                  integration.lastSuccessfulSyncAt === null
                    ? "never"
                    : ageLabel(ageFromIso(integration.lastSuccessfulSyncAt, nowMs))
                }
              />
              <MetricLine
                label="Last failed attempt"
                value={
                  integration.lastFailedSyncAt === null
                    ? "—"
                    : ageLabel(ageFromIso(integration.lastFailedSyncAt, nowMs))
                }
              />
              <MetricLine label="Latency" value={integration.latencyMs === null ? "—" : `${integration.latencyMs} ms`} />
              <MetricLine label="Errors (ledger)" value={String(integration.errorCount)} />
              <MetricLine label="Provider status" value={integration.providerStatus} muted />
              <MetricLine label="Credential status" value={integration.credentialStatus} muted />
            </div>
          </div>
        ))}
        <EvidenceNote>
          Credential status comes from expiry facts only — secret material never leaves the vault (§13, §19).
        </EvidenceNote>
      </PanelCard>
    </div>
  );
}

// ── Audit / System events (§15) + incidents (§16) + alert rules (§14) ───────

export function EventsPanel({
  data,
  onToggleRule,
  toggling,
}: {
  data: Overview;
  onToggleRule: (rule: AlertRule, enabled: boolean) => void;
  toggling: boolean;
}) {
  const nowMs = useNowClock();
  return (
    <div className="space-y-4" data-testid="monitoring-events">
      {/* Alert rules — configurable (§14) */}
      <PanelCard
        icon={Settings2}
        title="Alert rules"
        description="Toggle the conditions Monitoring watches — persisted in the engine, evaluated against live telemetry."
      >
        <div className="grid gap-1.5" data-testid="monitoring-alert-rules">
          {data.thresholds.rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              data-testid={`rule-row-${rule.id}`}
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-medium">{rule.id}</p>
                <p className="truncate text-xs text-muted-foreground">{rule.thresholdLabel}</p>
              </div>
              <Switch
                checked={rule.enabled}
                disabled={toggling}
                onCheckedChange={(checked) => onToggleRule(rule, checked)}
                aria-label={`Toggle rule ${rule.id}`}
              />
            </div>
          ))}
        </div>
        <EvidenceNote>
          Freshness thresholds: LIVE ≤ {(data.thresholds.freshness.liveMaxMs / 1_000).toFixed(0)} s · STALE &gt;{" "}
          {(data.thresholds.freshness.delayedMaxMs / 1_000).toFixed(0)} s (§17 — tuned per data source).
        </EvidenceNote>
      </PanelCard>

      {/* Incidents (§16) */}
      <PanelCard
        icon={SirenIcon}
        title="Incidents"
        description="Derived from the event log — root causes appear only when the evidence states one."
      >
        {data.incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incident recorded in this session.</p>
        ) : (
          <div className="grid gap-2">
            {data.incidents.map((incident) => (
              <div key={incident.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium">{incident.service}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge variant={incident.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-[10px]">
                      {incident.severity}
                    </Badge>
                    <Badge variant={incident.status === "OPEN" ? "destructive" : "outline"} className="text-[10px]">
                      {incident.status}
                    </Badge>
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  <MetricLine label="Start" value={ageLabel(ageFromIso(incident.startedAt, nowMs))} />
                  <MetricLine label="Detection" value={ageLabel(ageFromIso(incident.detectedAt, nowMs))} />
                  <MetricLine
                    label="Duration"
                    value={incident.durationMs === null ? "ongoing" : durationLabel(incident.durationMs)}
                  />
                </div>
                <div className="mt-2 space-y-1">
                  {incident.symptoms.slice(0, 3).map((symptom, index) => (
                    <p key={index} className="text-xs text-muted-foreground">• {symptom}</p>
                  ))}
                </div>
                <p className="mt-2 text-xs">
                  <span className="font-medium">Resolution: </span>
                  {incident.resolution ?? "open — awaiting a recovery event"}
                </p>
                <p className="text-xs">
                  <span className="font-medium">Root cause: </span>
                  {incident.rootCause ?? "under investigation — no automated root cause in the evidence"}
                </p>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      {/* Raised alerts */}
      <PanelCard
        icon={SirenIcon}
        title="Raised alerts"
        description="Deduplicated by rule — occurrences count while a condition persists."
        testId="monitoring-raised-alerts"
      >
        {data.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alert raised in this session.</p>
        ) : (
          <div className="grid gap-1.5">
            {data.alerts.map((alert) => (
              <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs">{alert.ruleId}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {alert.occurrences}× · last {ageLabel(ageFromIso(alert.lastSeenAt, nowMs))}
                  </span>
                  <Badge variant={alert.resolvedAt === null ? "secondary" : "outline"} className="text-[10px]">
                    {alert.resolvedAt === null ? "OPEN" : "resolved"}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      {/* System event log (§15) — append-only */}
      <PanelCard
        icon={ScrollText}
        title="System events"
        description="Append-only — connection changes, failures, recoveries and config changes. Distinct from the Security audit log."
        testId="monitoring-system-events"
      >
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No system event yet in this session.</p>
        ) : (
          <div className="grid gap-1">
            {data.events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-1 text-xs last:border-0">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cnDot(event.level)}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">{event.at.slice(11, 19)} UTC</span>
                  <span className="font-mono text-[11px] font-medium">{event.type}</span>
                  <span className="text-muted-foreground">{event.message}</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{event.source}</span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      {/* Integration events — the other real log (§13/§15) */}
      <PanelCard
        icon={FileClock}
        title="Integration events"
        description="The Integration Hub's own audit trail, mirrored here for the full system picture."
      >
        {data.integrationEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No integration event recorded.</p>
        ) : (
          <div className="grid gap-1">
            {data.integrationEvents.map((event) => (
              <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-1 text-xs last:border-0">
                <span>
                  <span className="font-mono text-[11px] text-muted-foreground">{event.occurredAt.slice(11, 19)} UTC</span>{" "}
                  <span className="font-mono text-[11px] font-medium">{event.type}</span>{" "}
                  <span className="text-muted-foreground">{event.message}</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{event.providerName}</span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function cnDot(level: string): string {
  return cn(
    "inline-block size-1.5 rounded-full",
    level === "ERROR" ? "bg-destructive" : level === "WARNING" ? "bg-amber-500" : "bg-muted-foreground",
  );
}
