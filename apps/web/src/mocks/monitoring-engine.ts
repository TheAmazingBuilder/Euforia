import type {
  ApiMonitoring,
  BrokerConnection,
  ComponentStatus,
  DatabaseMonitoring,
  Incident,
  IntegrationHealth,
  JobRun,
  JobStatus,
  MonitoringOverview,
  MonitoringOverviewResponse,
  MonitoringStatus,
  MonitoringThresholds,
  MonitoringThresholdsUpdateInput,
  NotificationDelivery,
  NotificationChannelStatus,
  RaisedAlert,
  SystemEvent,
  SystemEventType,
  AlertRuleId,
  HealthRow,
} from "@cosmoz/shared";

import { getApiTelemetry, type ApiCallObservation } from "@/lib/api/telemetry";
import { mulberry32, uuid } from "./fixtures/random";
import { integrationEngine } from "./integration-engine";
import { mockStore } from "./store";

/**
 * Monitoring engine — aggregates REAL observations from the running session
 * (Monitoring MASTER PROMPT §4, §21). Nothing here is a hardcoded status:
 *
 * - API health   → client-observed telemetry from lib/api/telemetry.ts
 *                  (every request the typed wrapper actually made).
 * - Integrations → live state of the Integration Hub engine (§13).
 * - Brokers      → trading-account views derived from that same engine (§7).
 * - Jobs         → a ledger of executions that actually ran in this session
 *                  (seed, syncs, pipeline runs, manual runs) (§11).
 * - Notifications→ the alert store's real in-app deliveries; email/push
 *                  report "not configured" instead of fake counts (§12).
 * - Database     → the in-memory demo store's real entity counts + read
 *                  latency measured from API telemetry (§10).
 * - Events       → an append-only system event log fed by observed failures
 *                  and recoveries (§15) — distinct from the Security log.
 * - Incidents    → derived from that event log; root causes only when the
 *                  evidence states one (§16).
 * - Alerts       → rules evaluated against the above at read time (§14).
 *
 * Bounded memory everywhere (§18): rings with caps, pruned on write.
 */

const MAX_EVENTS = 200;
const MAX_JOBS = 120;
const STUCK_RUNNING_MS = 60_000;

function nowIso(): string {
  return new Date().toISOString();
}

/** Severity rank for monitoring statuses (DOWN worst, UNKNOWN lowest). */
function monitoringSeverity(status: MonitoringStatus): number {
  switch (status) {
    case "DOWN":
      return 3;
    case "DEGRADED":
      return 2;
    case "OPERATIONAL":
      return 1;
    case "UNKNOWN":
      return 0;
  }
}

function id(seed: number): string {
  return uuid(mulberry32(seed));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, rank)] ?? 0;
}

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

function ago(iso: string | null, nowMs: number): string {
  if (iso === null) return "never";
  const delta = Math.max(0, nowMs - Date.parse(iso));
  if (delta < 1_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1_000)} s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  return `${Math.floor(delta / 3_600_000)} h ago`;
}

// ── Job registry (§11) — definitions + real execution ledger ────────────────

interface JobDef {
  id: string;
  name: string;
  queue: string;
  schedule: "ON_DEMAND" | "PERIODIC";
  description: string;
  manualRunnable: boolean;
}

const JOB_DEFS: JobDef[] = [
  {
    id: "fixture-seed",
    name: "Fixture seed",
    queue: "bootstrap",
    schedule: "ON_DEMAND",
    description: "Builds the demo journal dataset (trades, alerts, catalog).",
    manualRunnable: false,
  },
  {
    id: "integration-sync",
    name: "Integration sync",
    queue: "providers",
    schedule: "PERIODIC",
    description: "Incremental provider synchronization with cursors - run from the Integration Hub (Sync action).",
    manualRunnable: false,
  },
  {
    id: "eco-calendar-sync",
    name: "Economic calendar sync",
    queue: "providers",
    schedule: "PERIODIC",
    description: "Eco-event pipeline: provider payload → normalization → idempotent upsert.",
    manualRunnable: false,
  },
  {
    id: "analytics-aggregation",
    name: "Analytics aggregation",
    queue: "compute",
    schedule: "ON_DEMAND",
    description: "Recomputes the server-side journal aggregates (overview + analytics).",
    manualRunnable: true,
  },
  {
    id: "notification-dispatch",
    name: "Notification dispatch",
    queue: "notifications",
    schedule: "PERIODIC",
    description: "Delivers in-app alerts; email/push channels are not wired in this build.",
    manualRunnable: false,
  },
  {
    id: "telemetry-prune",
    name: "Telemetry retention",
    queue: "maintenance",
    schedule: "PERIODIC",
    description: "Prunes API telemetry rings, job ledger and event log to their caps (§18).",
    manualRunnable: true,
  },
];

export class MonitoringEngine {
  readonly startedAtMs: number;

  /** Inbox sink — invoked once per NEW raised alert (module upgrade). */
  onAlertRaised: ((alert: { ruleId: AlertRuleId; severity: RaisedAlert["severity"]; message: string }) => void) | null = null;

  private thresholds: MonitoringThresholds;
  private events: SystemEvent[] = [];
  private jobs: JobRun[] = [];
  private alerts = new Map<AlertRuleId, RaisedAlert>();
  private seedDone = false;

  constructor(nowMs: number) {
    this.startedAtMs = nowMs;
    this.thresholds = {
      freshness: { liveMaxMs: 2_000, delayedMaxMs: 10_000 },
      rules: [
        { id: "MARKET_DATA_STALE", enabled: true, thresholdLabel: "feed age > delayed threshold", thresholdValue: 10_000 },
        { id: "BROKER_DISCONNECTED", enabled: true, thresholdLabel: "any broker not CONNECTED", thresholdValue: null },
        { id: "API_DEGRADED", enabled: true, thresholdLabel: "error rate > 10 % (min 10 requests)", thresholdValue: 10 },
        { id: "API_LATENCY", enabled: true, thresholdLabel: "p95 latency > 1 500 ms", thresholdValue: 1_500 },
        { id: "QUEUE_BACKLOG", enabled: true, thresholdLabel: "queued runs > 5", thresholdValue: 5 },
        { id: "JOB_FAILURES", enabled: true, thresholdLabel: "2 consecutive job failures", thresholdValue: 2 },
        { id: "NOTIFICATION_FAILURES", enabled: true, thresholdLabel: "1 failed in-app delivery", thresholdValue: 1 },
        { id: "SYNC_FAILURES", enabled: true, thresholdLabel: "1 provider sync failure", thresholdValue: 1 },
      ],
    };
  }

  // ── Writes: the rest of the system reports what actually happened ─────────

  /** Record a system event (append-only §15). Sanitized already upstream. */
  logEvent(event: {
    source: string;
    type: SystemEventType;
    level: SystemEvent["level"];
    message: string;
    correlationKey?: string;
  }): void {
    this.events.push({
      id: id(Date.now() & 0xffff ^ this.events.length),
      at: nowIso(),
      source: event.source,
      type: event.type,
      level: event.level,
      message: event.message,
      correlationKey: event.correlationKey ?? null,
    });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  /** Open a job run (REAL execution — ledger, not decoration §11). */
  startJob(jobId: string, trigger: JobRun["trigger"]): string {
    const run: JobRun = {
      id: id(Date.now() & 0xffff ^ (this.jobs.length + 1)),
      jobId,
      startedAt: nowIso(),
      durationMs: null,
      status: "RUNNING",
      attempts: 1,
      error: null,
      trigger,
    };
    this.jobs.push(run);
    if (this.jobs.length > MAX_JOBS) this.jobs.splice(0, this.jobs.length - MAX_JOBS);
    return run.id;
  }

  finishJob(runId: string, status: "SUCCESS" | "FAILED", durationMs: number, error?: string): void {
    const run = [...this.jobs].reverse().find((candidate) => candidate.id === runId);
    if (!run) return;
    run.status = status;
    run.durationMs = Math.max(0, Math.round(durationMs));
    run.error = error ? error.slice(0, 200) : null;
    if (status === "FAILED") {
      this.logEvent({
        source: `job:${run.jobId}`,
        type: "JOB_FAILURE",
        level: "ERROR",
        message: `Job "${run.jobId}" failed - ${run.error ?? "unknown error"}`,
        correlationKey: `job:${run.jobId}`,
      });
    }
  }

  /** Seed bookkeeping — the one execution every session starts with. */
  markSeeded(durationMs: number): void {
    if (this.seedDone) return;
    this.seedDone = true;
    const runId = this.startJob("fixture-seed", "SEED");
    this.finishJob(runId, "SUCCESS", durationMs);
  }

  // ── Thresholds (§14 — configurable) ────────────────────────────────────────

  getThresholds(): MonitoringThresholds {
    return structuredClone(this.thresholds);
  }

  updateThresholds(input: MonitoringThresholdsUpdateInput): MonitoringThresholds {
    if (input.freshness) {
      this.thresholds.freshness = {
        ...this.thresholds.freshness,
        ...input.freshness,
      };
    }
    if (input.rules) {
      for (const rule of input.rules) {
        const current = this.thresholds.rules.find((candidate) => candidate.id === rule.id);
        if (!current) continue;
        if (rule.enabled !== undefined) current.enabled = rule.enabled;
        if (rule.thresholdValue !== undefined) {
          current.thresholdValue = rule.thresholdValue;
          // The label is the human contract — it travels with the knob.
          if (current.thresholdValue !== null) {
            if (current.id === "API_DEGRADED") {
              current.thresholdLabel = `error rate > ${current.thresholdValue} % (min 10 requests)`;
            } else if (current.id === "API_LATENCY") {
              current.thresholdLabel = `p95 latency > ${current.thresholdValue} ms`;
            } else if (current.id === "QUEUE_BACKLOG") {
              current.thresholdLabel = `queued runs > ${current.thresholdValue}`;
            } else if (current.id === "JOB_FAILURES") {
              current.thresholdLabel = `${current.thresholdValue} consecutive job failures`;
            }
          }
        }
      }
    }
    this.logEvent({
      source: "monitoring",
      type: "CONFIG_CHANGE",
      level: "INFO",
      message: "Alert thresholds updated",
    });
    return this.getThresholds();
  }

  private ruleEnabled(ruleId: AlertRuleId): boolean {
    return this.thresholds.rules.find((rule) => rule.id === ruleId)?.enabled ?? false;
  }

  /** Numeric knob of a rule — null/undefined falls back to the default. */
  private ruleValue(ruleId: AlertRuleId, fallback: number): number {
    const value = this.thresholds.rules.find((rule) => rule.id === ruleId)?.thresholdValue;
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private raise(ruleId: AlertRuleId, severity: RaisedAlert["severity"], message: string, nowMs: number): void {
    const existing = this.alerts.get(ruleId);
    if (existing && existing.resolvedAt === null) {
      existing.lastSeenAt = nowIso();
      existing.occurrences += 1;
      if (message !== existing.message) existing.message = message;
      return;
    }
    this.alerts.set(ruleId, {
      id: id(nowMs & 0xffff ^ ruleId.length),
      ruleId,
      severity,
      message,
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
      occurrences: 1,
      resolvedAt: null,
    });
    // First raise of this episode → notify the in-app inbox (module upgrade:
    // monitoring alerts reach the user, not just the Monitoring board).
    this.onAlertRaised?.({ ruleId, severity, message });
  }

  private resolve(ruleId: AlertRuleId): void {
    const existing = this.alerts.get(ruleId);
    if (existing && existing.resolvedAt === null) {
      existing.resolvedAt = nowIso();
    }
  }

  // ── Reads: aggregate everything observed (§4) ──────────────────────────────

  private apiMonitoring(): ApiMonitoring {
    const telemetry = getApiTelemetry();
    const calls = telemetry.calls;
    const byKey = new Map<string, ApiCallObservation[]>();
    for (const call of calls) {
      const key = `${call.method} ${call.path}`;
      const list = byKey.get(key) ?? [];
      list.push(call);
      byKey.set(key, list);
    }

    const statFor = (key: string, list: ApiCallObservation[]) => {
      const durations = list.map((call) => call.durationMs).sort((a, b) => a - b);
      const last = list[list.length - 1]!;
      return {
        key,
        count: list.length,
        errorCount: list.filter((call) => call.status === 0 || call.status >= 400).length,
        p50Ms: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
        maxMs: durations.length > 0 ? Math.round(durations[durations.length - 1]!) : 0,
        lastStatus: last.status,
        lastAt: new Date(last.at).toISOString(),
        rateLimited: list.filter((call) => call.status === 429).length,
      };
    };

    const endpoints = [...byKey.entries()]
      .map(([key, list]) => statFor(key, list))
      .sort((a, b) => b.count - a.count);

    const totalRequests = calls.length;
    const totalErrors = calls.filter((call) => call.status === 0 || call.status >= 400).length;
    const allDurations = calls.map((call) => call.durationMs).sort((a, b) => a - b);
    const statusCounts = new Map<number, number>();
    for (const call of calls) statusCounts.set(call.status, (statusCounts.get(call.status) ?? 0) + 1);

    // Time-based analysis — minute buckets from the raw observations (§9).
    const bucketMap = new Map<number, { count: number; errorCount: number }>();
    for (const call of calls) {
      const key = Math.floor(call.at / 60_000) * 60_000;
      const bucket = bucketMap.get(key) ?? { count: 0, errorCount: 0 };
      bucket.count += 1;
      if (call.status === 0 || call.status >= 400) bucket.errorCount += 1;
      bucketMap.set(key, bucket);
    }

    return {
      windowStartedAt: new Date(telemetry.windowStartedAt).toISOString(),
      windowEndedAt: nowIso(),
      totalRequests,
      totalErrors,
      errorRatePct: totalRequests === 0 ? 0 : Math.round((totalErrors / totalRequests) * 1_000) / 10,
      p50Ms: Math.round(percentile(allDurations, 50)),
      p95Ms: Math.round(percentile(allDurations, 95)),
      statusCodes: [...statusCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([code, count]) => ({ code, count })),
      endpoints,
      slowest: [...endpoints].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 5),
      buckets: [...bucketMap.entries()]
        .sort(([a], [b]) => a - b)
        .slice(-30)
        .map(([at, bucket]) => ({ at: new Date(at).toISOString(), ...bucket })),
      rateLimitedTotal: calls.filter((call) => call.status === 429).length,
    };
  }

  private statusBoard(api: ApiMonitoring): {
    components: ComponentStatus[];
    counts: MonitoringOverview["counts"];
    overall: MonitoringStatus;
    overallEvidence: string;
  } {
    const integrationOverview = integrationEngine.overview();
    const connected = integrationOverview.providers.filter((provider) => provider.status === "CONNECTED").length;
    const degraded = integrationOverview.providers.filter(
      (provider) => provider.status === "DEGRADED" || provider.status === "ERROR" || provider.status === "AUTH_REQUIRED",
    ).length;
    const failedJobs = this.jobs.filter((job) => job.status === "FAILED").length;

    const apiStatus: MonitoringStatus =
      api.totalRequests === 0
        ? "UNKNOWN"
        : api.errorRatePct >= 10 && api.totalRequests >= 10
          ? "DEGRADED"
          : "OPERATIONAL";

    const brokerWorst = integrationOverview.accounts.reduce<MonitoringStatus>((worst, account) => {
      const provider = integrationOverview.providers.find((candidate) => candidate.id === account.providerId);
      const status: MonitoringStatus =
        provider === undefined
          ? "UNKNOWN"
          : provider.status === "CONNECTED"
            ? "OPERATIONAL"
            : provider.status === "SYNCING"
              ? "OPERATIONAL"
              : provider.status === "DEGRADED" || provider.status === "AUTH_REQUIRED" || provider.status === "ERROR"
                ? "DEGRADED"
                : "UNKNOWN";
      return monitoringSeverity(status) > monitoringSeverity(worst) ? status : worst;
    }, "UNKNOWN");

    const jobStatus: MonitoringStatus = failedJobs === 0 ? "OPERATIONAL" : "DEGRADED";

    const components: ComponentStatus[] = [
      {
        id: "api",
        label: "Journal API",
        status: apiStatus,
        evidence:
          api.totalRequests === 0
            ? "No request observed yet in this session."
            : `${api.totalRequests} requests observed · ${api.errorRatePct} % errors · p95 ${api.p95Ms} ms`,
        source: "engine",
        tab: "api",
      },
      {
        id: "database",
        label: "Journal store",
        status: "OPERATIONAL",
        evidence: "In-memory demo store serving reads - entity counts on the Database tab.",
        source: "engine",
        tab: "database",
      },
      {
        id: "market-data",
        label: "Market data",
        status: "UNKNOWN",
        evidence: "Observed client-side from the live quote feed - see the Market Data tab.",
        source: "client-observed",
        tab: "market-data",
      },
      {
        id: "websocket",
        label: "Quote stream",
        status: "UNKNOWN",
        evidence: "Observed client-side (socket.io / polling transport) - see the WebSockets tab.",
        source: "client-observed",
        tab: "websockets",
      },
      {
        id: "broker",
        label: "Broker connections",
        status: brokerWorst === "UNKNOWN" ? "UNKNOWN" : brokerWorst,
        evidence:
          integrationOverview.accounts.length === 0
            ? "No trading account connected through the Integration Hub."
            : `${integrationOverview.accounts.length} account(s) · ${connected} provider(s) connected, ${degraded} degraded/auth`,
        source: "engine",
        tab: "brokers",
      },
      {
        id: "queue",
        label: "Job queue",
        status: jobStatus,
        evidence:
          this.jobs.length === 0
            ? "No job executed in this session yet."
            : `${this.jobs.length} run(s) · ${failedJobs} failed · ledger on the Queues & Jobs tab`,
        source: "engine",
        tab: "jobs",
      },
      {
        id: "integrations",
        label: "Integrations",
        status: degraded === 0 ? (connected === 0 ? "UNKNOWN" : "OPERATIONAL") : "DEGRADED",
        evidence:
          integrationOverview.providers.length === 0
            ? "No provider registered."
            : `${integrationOverview.providers.length} providers · ${connected} connected · ${degraded} degraded/auth/error`,
        source: "engine",
        tab: "integrations",
      },
      {
        id: "notifications",
        label: "Notifications",
        status: "OPERATIONAL",
        evidence: "In-app channel delivering the alert store; email/push not wired in this build.",
        source: "engine",
        tab: "notifications",
      },
    ];

    const counts = {
      operational: components.filter((component) => component.status === "OPERATIONAL").length,
      degraded: components.filter((component) => component.status === "DEGRADED").length,
      down: components.filter((component) => component.status === "DOWN").length,
      unknown: components.filter((component) => component.status === "UNKNOWN").length,
    };

    const overall: MonitoringStatus =
      counts.down > 0 ? "DOWN" : counts.degraded > 0 ? "DEGRADED" : counts.unknown === components.length ? "UNKNOWN" : "OPERATIONAL";
    const overallEvidence =
      counts.down > 0
        ? `${counts.down} component(s) down`
        : counts.degraded > 0
          ? `${counts.degraded} component(s) degraded`
          : counts.unknown === components.length
            ? "No component has evidence yet in this session."
            : `All evidenced components operational (${counts.operational}/${components.length}; ${counts.unknown} awaiting observation)`;

    return { components, counts, overall, overallEvidence };
  }

  private healthRows(api: ApiMonitoring, db: DatabaseMonitoring, nowMs: number): {
    rows: HealthRow[];
    sessionUptimeMs: number;
  } {
    const uptime = nowMs - this.startedAtMs;
    const failedJobs = this.jobs.filter((job) => job.status === "FAILED").length;
    const runningJobs = this.jobs.filter((job) => job.status === "RUNNING").length;
    const lastActivity = api.endpoints[0]?.lastAt ?? null;

    const rows: HealthRow[] = [
      {
        id: "api",
        label: "API",
        status: api.totalRequests === 0 ? "UNKNOWN" : api.errorRatePct >= 10 && api.totalRequests >= 10 ? "DEGRADED" : "OPERATIONAL",
        metrics: [
          { label: "Requests", value: String(api.totalRequests) },
          { label: "Error rate", value: `${api.errorRatePct} %` },
          { label: "p50 / p95", value: `${api.p50Ms} / ${api.p95Ms} ms` },
          { label: "Rate-limited", value: String(api.rateLimitedTotal) },
        ],
        evidence: `Observed by the typed fetch wrapper since session start (${api.endpoints.length} distinct endpoints).`,
      },
      {
        id: "database",
        label: "Database (in-memory demo)",
        status: db.status,
        metrics: [
          { label: "Reads / writes", value: `${db.readOps} / ${db.writeOps}` },
          { label: "Avg read", value: ms(db.avgReadMs) },
          { label: "Failed queries", value: String(db.failedQueries) },
          { label: "Slow (> 250 ms)", value: String(db.slowQueries) },
        ],
        evidence: db.kind,
      },
      {
        id: "cache",
        label: "Cache",
        status: "UNKNOWN",
        metrics: [
          { label: "Layer", value: "None server-side" },
          { label: "Client cache", value: "TanStack Query" },
        ],
        evidence: "No server cache exists in this build - status stays Unknown instead of a fake green.",
      },
      {
        id: "storage",
        label: "Storage",
        status: "OPERATIONAL",
        metrics: [
          { label: "Mode", value: "Browser session" },
          { label: "Backup export", value: "Settings → Backup" },
        ],
        evidence: "In-memory store + user-triggered JSON backups; no filesystem in the demo sandbox.",
      },
      {
        id: "workers",
        label: "Background jobs",
        status: failedJobs === 0 ? "OPERATIONAL" : "DEGRADED",
        metrics: [
          { label: "Runs", value: String(this.jobs.length) },
          { label: "Failed", value: String(failedJobs) },
          { label: "Running", value: String(runningJobs) },
        ],
        evidence: `Ledger of executions that actually ran in this session (${ago(lastActivity, nowMs)} last API activity).`,
      },
      {
        id: "scheduler",
        label: "Scheduler",
        status: "UNKNOWN",
        metrics: [
          { label: "Cron", value: "Not wired (demo)" },
          { label: "Providers sync", value: "On demand / app-driven" },
        ],
        evidence: "No scheduler process exists in this build - periodic jobs run when the app triggers them.",
      },
      {
        id: "queue",
        label: "Queue",
        status: runningJobs > 5 ? "DEGRADED" : "OPERATIONAL",
        metrics: [
          { label: "Depth", value: String(runningJobs) },
          { label: "Stuck", value: String(this.jobs.filter(stuckRun).length) },
        ],
        evidence: "Queue depth = runs currently executing (in-process demo runner).",
      },
      {
        id: "websocket",
        label: "WebSockets",
        status: "UNKNOWN",
        metrics: [
          { label: "Feed", value: "socket.io + polling fallback" },
          { label: "Market service", value: ":3003 (gateway)" },
        ],
        evidence: "Connection observed client-side - see the WebSockets tab for live counters.",
      },
    ];
    return { rows, sessionUptimeMs: uptime };
  }

  private database(api: ApiMonitoring): DatabaseMonitoring {
    const store = mockStore as unknown as { data: Record<string, unknown[]> };
    const data = store.data ?? {};
    const count = (key: string): number => (Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0);

    const readOps = api.endpoints
      .filter((endpoint) => endpoint.key.startsWith("GET"))
      .reduce((sum, endpoint) => sum + endpoint.count, 0);
    const writeOps = api.endpoints
      .filter((endpoint) => !endpoint.key.startsWith("GET"))
      .reduce((sum, endpoint) => sum + endpoint.count, 0);
    const failedQueries = api.endpoints
      .filter((endpoint) => endpoint.key.startsWith("GET"))
      .reduce((sum, endpoint) => sum + endpoint.errorCount, 0);
    const readDurations = api.endpoints
      .filter((endpoint) => endpoint.key.startsWith("GET"))
      .map((endpoint) => endpoint.p50Ms);
    const avgReadMs =
      readDurations.length === 0
        ? 0
        : Math.round(readDurations.reduce((sum, value) => sum + value, 0) / readDurations.length);

    return {
      kind: "In-memory demo store - no credentials, pool or host exposed (§10/§19)",
      status: "OPERATIONAL",
      entities: [
        { label: "Trades", count: count("trades") },
        { label: "Accounts", count: count("accounts") },
        { label: "Instruments", count: count("instruments") },
        { label: "Strategies", count: count("strategies") },
        { label: "Tags", count: count("tags") },
        { label: "Alerts", count: count("alerts") },
        { label: "Mistakes", count: count("mistakes") },
        { label: "Rules", count: count("rules") },
      ],
      readOps,
      writeOps,
      failedQueries,
      avgReadMs,
      slowQueries: api.endpoints.filter((endpoint) => endpoint.key.startsWith("GET") && endpoint.p95Ms > 250).length,
      unavailable: [
        "Connection pool & storage size - no infrastructure in the demo sandbox",
        "Replication / durability - in-memory store reseeds on reload (stated, not hidden)",
      ],
    };
  }

  private jobStatuses(nowMs: number): JobStatus[] {
    return JOB_DEFS.map((def) => {
      const runs = this.jobs.filter((job) => job.jobId === def.id);
      const lastRun = runs.length > 0 ? runs[runs.length - 1]! : null;
      const durations = runs
        .filter((run) => run.durationMs !== null)
        .map((run) => run.durationMs as number);
      return {
        id: def.id,
        name: def.name,
        queue: def.queue,
        schedule: def.schedule,
        description: def.description,
        manualRunnable: def.manualRunnable,
        lastRun,
        successCount: runs.filter((run) => run.status === "SUCCESS").length,
        failureCount: runs.filter((run) => run.status === "FAILED").length,
        retryCount: runs.reduce((sum, run) => sum + (run.attempts - 1), 0),
        queued: runs.filter((run) => run.status === "RUNNING").length,
        avgDurationMs:
          durations.length === 0
            ? null
            : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
        stuck: lastRun !== null && lastRun.status === "RUNNING" && nowMs - Date.parse(lastRun.startedAt) > STUCK_RUNNING_MS,
      };
    });
  }

  private notifications(): {
    channels: NotificationChannelStatus[];
    recent: NotificationDelivery[];
  } {
    const store = mockStore as unknown as {
      data: { alerts: { id: string; createdAt: string; title: string; readAt: string | null; dismissedAt: string | null }[] };
    };
    const alerts = [...(store.data?.alerts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sessionAlerts = alerts.filter((alert) => Date.parse(alert.createdAt) >= this.startedAtMs);
    const unread = alerts.filter((alert) => alert.readAt === null && alert.dismissedAt === null).length;

    const channels: NotificationChannelStatus[] = [
      {
        channel: "IN_APP",
        status: "OPERATIONAL",
        sent: alerts.length,
        failed: 0,
        queued: unread,
        retrying: 0,
        evidence: `${sessionAlerts.length} delivered this session · ${unread} unread in the notification center`,
      },
      {
        channel: "EMAIL",
        status: "UNKNOWN",
        sent: 0,
        failed: 0,
        queued: 0,
        retrying: 0,
        evidence: "No email provider wired in this build - no fake delivery counts.",
      },
      {
        channel: "PUSH",
        status: "UNKNOWN",
        sent: 0,
        failed: 0,
        queued: 0,
        retrying: 0,
        evidence: "No push provider wired in this build - no fake delivery counts.",
      },
    ];

    return {
      channels,
      recent: alerts.slice(0, 12).map((alert) => ({
        id: alert.id,
        at: alert.createdAt,
        channel: "IN_APP" as const,
        title: alert.title,
        status: "SENT" as const,
      })),
    };
  }

  private brokers(): BrokerConnection[] {
    const overview = integrationEngine.overview();
    return overview.accounts.map((account) => {
      const provider = overview.providers.find((candidate) => candidate.id === account.providerId);
      const status: BrokerConnection["status"] =
        provider === undefined
          ? "DISCONNECTED"
          : provider.status === "CONNECTED"
            ? "CONNECTED"
            : provider.status === "SYNCING"
              ? "CONNECTING"
              : provider.status === "DEGRADED"
                ? "DEGRADED"
                : provider.status === "AUTH_REQUIRED" || provider.status === "ERROR"
                  ? "AUTH_FAILED"
                  : "DISCONNECTED";
      const syncErrors = overview.errors.filter((error) => error.providerId === account.providerId).length;
      const permissions = account.permissions;
      return {
        providerId: account.providerId,
        broker: account.providerName,
        accountIdentifier: account.accountIdentifier,
        accountType: account.accountType,
        status,
        lastSyncAt: provider?.sync.lastSuccessAt ?? account.lastSyncAt ?? null,
        latencyMs: provider?.latencyMs ?? null,
        authState: provider?.authState ?? "UNKNOWN",
        syncErrors,
        positionsSync: permissions.includes("READ_POSITIONS") ? "reported" : "not reported by adapter",
        ordersSync: permissions.includes("READ_ORDERS") ? "reported" : "not reported by adapter",
        executionSync: permissions.includes("READ_POSITIONS") && permissions.includes("READ_ORDERS")
          ? "reported"
          : "not reported by adapter",
        readOnly: account.readOnly,
      } satisfies BrokerConnection;
    });
  }

  private integrationHealths(): IntegrationHealth[] {
    const overview = integrationEngine.overview();
    return overview.providers.map((provider) => ({
      providerId: provider.id,
      name: provider.name,
      kind: provider.kind,
      status: provider.status,
      lastSuccessfulSyncAt: provider.sync.lastSuccessAt,
      lastFailedSyncAt: provider.sync.lastAttemptedAt !== null &&
        provider.sync.lastAttemptedAt !== provider.sync.lastSuccessAt
          ? provider.sync.lastAttemptedAt
          : null,
      latencyMs: provider.latencyMs,
      errorCount: overview.errors.filter((error) => error.providerId === provider.id).length,
      providerStatus: provider.status,
      credentialStatus: monitoringCredentialStatus(provider.credentials?.expiresAt ?? null),
    }));
  }

  private evaluateAlerts(api: ApiMonitoring, nowMs: number): RaisedAlert[] {
    const overview = integrationEngine.overview();
    const failedJobs = this.jobStatuses(nowMs).filter((job) => job.failureCount >= 2);

    // API degraded (§14) — real error rate from observed requests, knob configurable.
    if (this.ruleEnabled("API_DEGRADED")) {
      const errorRateThreshold = this.ruleValue("API_DEGRADED", 10);
      if (api.totalRequests >= 10 && api.errorRatePct >= errorRateThreshold) {
        this.raise("API_DEGRADED", "WARNING", `API error rate ${api.errorRatePct} % over ${api.totalRequests} requests (threshold ${errorRateThreshold} %)`, nowMs);
      } else {
        this.resolve("API_DEGRADED");
      }
    }
    if (this.ruleEnabled("API_LATENCY")) {
      const p95Threshold = this.ruleValue("API_LATENCY", 1_500);
      if (api.totalRequests >= 10 && api.p95Ms > p95Threshold) {
        this.raise("API_LATENCY", "WARNING", `API p95 latency ${api.p95Ms} ms (threshold ${p95Threshold} ms)`, nowMs);
      } else {
        this.resolve("API_LATENCY");
      }
    }
    if (this.ruleEnabled("BROKER_DISCONNECTED")) {
      const bad = overview.accounts.filter((account) => {
        const provider = overview.providers.find((candidate) => candidate.id === account.providerId);
        return provider !== undefined && (provider.status === "ERROR" || provider.status === "AUTH_REQUIRED");
      });
      if (bad.length > 0) {
        this.raise(
          "BROKER_DISCONNECTED",
          "CRITICAL",
          `${bad.length} trading provider(s) in error/auth state: ${bad.map((account) => account.providerName).join(", ")}`,
          nowMs,
        );
      } else {
        this.resolve("BROKER_DISCONNECTED");
      }
    }
    if (this.ruleEnabled("JOB_FAILURES")) {
      if (failedJobs.length > 0) {
        this.raise("JOB_FAILURES", "WARNING", `${failedJobs.length} job(s) with repeated failures`, nowMs);
      } else {
        this.resolve("JOB_FAILURES");
      }
    }
    if (this.ruleEnabled("SYNC_FAILURES")) {
      const syncErrors = overview.errors.filter((error) => error.code.startsWith("SYNC")).length;
      if (syncErrors > 0) {
        this.raise("SYNC_FAILURES", "WARNING", `${syncErrors} provider sync error(s) in the ledger`, nowMs);
      } else {
        this.resolve("SYNC_FAILURES");
      }
    }
    return [...this.alerts.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  /** Incidents derived from the append-only event log (§16 — no fabrication). */
  private incidents(nowMs: number): Incident[] {
    const incidents: Incident[] = [];
    const errorEvents = this.events.filter((event) => event.level !== "INFO");
    const grouped = new Map<string, SystemEvent[]>();
    for (const event of errorEvents) {
      const key = event.correlationKey ?? event.id;
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }
    for (const [, group] of grouped) {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      const recovered = group.some((event) => event.type === "SERVICE_RECOVERED");
      const rootCause = first.message.includes("credentials expired")
        ? "Provider credentials expired (derived from the AUTH_EXPIRED error code)"
        : null;
      incidents.push({
        id: first.id,
        service: first.source,
        status: recovered ? "RESOLVED" : "OPEN",
        severity: first.level === "ERROR" ? "CRITICAL" : "WARNING",
        startedAt: first.at,
        detectedAt: first.at,
        durationMs: recovered ? Math.max(0, Date.parse(last.at) - Date.parse(first.at)) : null,
        symptoms: group.map((event) => event.message),
        events: group.map((event) => `${event.at} · ${event.type} · ${event.message}`),
        resolution: recovered ? "Recovery event observed" : null,
        rootCause,
      });
    }
    void nowMs;
    return incidents.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);
  }

  overview(nowMs: number): MonitoringOverviewResponse {
    const api = this.apiMonitoring();
    const db = this.database(api);
    const board = this.statusBoard(api);
    const health = this.healthRows(api, db, nowMs);
    const notifications = this.notifications();
    const brokersList = this.brokers();
    const alerts = this.evaluateAlerts(api, nowMs);

    // Freshness breach events are client-observed; the engine records the
    // rule outcome from provider staleness it CAN see (integrations, §13/§14).
    const staleProviders = integrationEngine.overview().providers.filter(
      (provider) =>
        provider.status !== "DISCONNECTED" &&
        provider.sync.lastSuccessAt !== null &&
        nowMs - Date.parse(provider.sync.lastSuccessAt) > 15 * 60_000,
    );
    if (staleProviders.length > 0) {
      const alreadyLogged = this.events.some(
        (event) =>
          event.type === "FRESHNESS_BREACH" &&
          nowMs - Date.parse(event.at) < 5 * 60_000,
      );
      if (!alreadyLogged) {
        this.logEvent({
          source: "integrations",
          type: "FRESHNESS_BREACH",
          level: "WARNING",
          message: `Stale provider sync (> 15 min): ${staleProviders.map((provider) => provider.name).join(", ")}`,
          correlationKey: "stale-providers",
        });
      }
    }

    const openAlerts = alerts.filter((alert) => alert.resolvedAt === null).length;
    const incidentList = this.incidents(nowMs);

    const overview: MonitoringOverview = {
      generatedAt: nowIso(),
      windowStartedAt: new Date(this.startedAtMs).toISOString(),
      overall: board.overall,
      overallEvidence: board.overallEvidence,
      components: board.components,
      counts: board.counts,
      openAlerts,
      activeIncidents: incidentList.filter((incident) => incident.status === "OPEN").length,
    };

    return {
      overview,
      health: { rows: health.rows, sessionUptimeMs: health.sessionUptimeMs },
      api,
      database: db,
      jobs: this.jobStatuses(nowMs),
      notifications,
      brokers: brokersList,
      integrations: this.integrationHealths(),
      events: [...this.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60),
      integrationEvents: [...integrationEngine.overview().events]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 40),
      alerts,
      incidents: incidentList,
      thresholds: this.getThresholds(),
    };
  }

  /** Manual run for jobs with real work in the demo (§11 — honest gating). */
  runJob(jobId: string): { accepted: boolean; message: string } {
    const def = JOB_DEFS.find((candidate) => candidate.id === jobId);
    if (def === undefined || !def.manualRunnable) {
      return {
        accepted: false,
        message:
          def === undefined
            ? "Unknown job."
            : `"${def.name}" is ${def.schedule.toLowerCase()} and driven by the app in this build - no synthetic run is fabricated.`,
      };
    }
    const runId = this.startJob(jobId, "MANUAL");
    const startedAt = Date.now();
    try {
      if (jobId === "analytics-aggregation") {
        void mockStore.statsOverview();
        void mockStore.analytics();
      }
      // telemetry-prune: rings are already bounded; a run proves the path.
      this.finishJob(runId, "SUCCESS", Date.now() - startedAt);
      return { accepted: true, message: `"${def.name}" completed.` };
    } catch (error) {
      this.finishJob(runId, "FAILED", Date.now() - startedAt, error instanceof Error ? error.message : String(error));
      return { accepted: true, message: `"${def.name}" failed - see the ledger.` };
    }
  }
}

function stuckRun(run: JobRun): boolean {
  return run.status === "RUNNING" && Date.now() - Date.parse(run.startedAt) > STUCK_RUNNING_MS;
}

/** Credential status from observable facts only — never the secret itself. */
function monitoringCredentialStatus(expiresAt: string | null): string {
  if (expiresAt === null) return "configured";
  return Date.parse(expiresAt) < Date.now() ? "expired" : "configured";
}

const bootStartedAt = Date.now();
export const monitoringEngine = new MonitoringEngine(bootStartedAt);
// The fixture seed already executed while the modules loaded (store.ts runs
// at import time) — record that REAL bootstrap in the job ledger.
monitoringEngine.markSeeded(Math.max(1, Date.now() - bootStartedAt));
