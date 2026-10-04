/**
 * Monitoring application service (Phase 17) — thin operational
 * observability over the existing architecture.
 *
 * OWNERSHIP: Monitoring OWNS the aggregation below. It does NOT own the
 * things it observes (§3/§24/§26/§35):
 *   - broker/sync health  → consumed from AccountsRepository (canonical)
 *   - email delivery      → consumed from MailerService telemetry
 *   - API metrics         → observed on the shared telemetry ring (infra)
 *   - security events     → Security stays authoritative (Phase 16)
 *   - trading analytics   → Analytics' business, never computed here (§36)
 *
 * Everything except the per-user threshold document is DERIVED at read time
 * from bounded in-memory windows (§40/§45): alert episodes (per-user),
 * the system-event ring (per-user, cap 200) and the telemetry ring
 * (process-wide, cap 500). A restart honestly resets transient windows;
 * persisted thresholds survive (that is what the user explicitly configured).
 *
 * All data is scoped to the authenticated caller (§34) — monitoring never
 * exposes another user's operational data.
 */
import { Injectable } from "@nestjs/common";
import { apiTelemetry } from "../../infrastructure/telemetry/api-telemetry";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import type {
  ApiCallRecord,
} from "../../infrastructure/telemetry/api-telemetry";
import type {
  AlertRuleId,
  ApiMonitoring,
  BrokerConnection,
  ComponentStatus,
  HealthRow,
  Incident,
  JobStatus,
  MonitoringOverviewResponse,
  MonitoringStatus,
  MonitoringThresholds,
  MonitoringThresholdsUpdateInput,
  NotificationChannelStatus,
  NotificationDelivery,
  RaisedAlert,
  SystemEvent,
} from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { MailerService } from "../identity/mailer.service";
import { MonitoringRepository } from "./monitoring.repository";
import {
  applyConditionToEpisode,
  computeApiMonitoring,
  defaultThresholds,
  deriveApiStatus,
  evaluateAlertRules,
  groupIncidents,
  mapBrokerStatus,
  mergeThresholdPatch,
  SLOW_QUERY_MS,
  type EpisodeState,
} from "./monitoring.logic";

const EVENT_RING_CAP = 200;
const EVENTS_RETURNED = 60;
const STUCK_RUNNING_MS = 60_000;
const KNOWN_JOBS = new Set(["trading-sync", "email-dispatch"]);

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

interface AlertEpisode {
  alert: RaisedAlert;
}

@Injectable()
export class MonitoringService {
  /** Per-user transient alert episodes (§39 dedupe) — session-scoped. */
  private readonly alertEpisodes = new Map<string, Map<AlertRuleId, AlertEpisode>>();
  /** Per-user append-only system-event ring (§15) — session-scoped, bounded. */
  private readonly eventRings = new Map<string, SystemEvent[]>();
  /** Derived-event dedupe (one entry per failed sync run, per user). */
  private readonly seenDerivedKeys = new Map<string, Set<string>>();

  constructor(
    private readonly monitoringRepository: MonitoringRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly mailer: MailerService,
  ) {}

  // ── GET /monitoring/overview ────────────────────────────────────────────────

  async overview(userId: string): Promise<MonitoringOverviewResponse> {
    const now = new Date();
    const thresholds = (await this.monitoringRepository.getThresholds(userId)) ?? defaultThresholds();

    const { calls } = apiTelemetry.snapshot();
    const userCalls = calls.filter((call) => call.userId === userId);
    const api = computeApiMonitoring(userCalls, now);

    const [databaseUp, entities, accounts, syncRuns, mailTelemetry] = await Promise.all([
      this.monitoringRepository.ping(),
      this.databaseEntities(userId),
      this.accountsRepository.listAccountsByUser(userId),
      this.accountsRepository.listRecentSyncRunsForUser(userId),
      Promise.resolve(this.mailer.deliveryTelemetry()),
    ]);

    // ── Brokers (§26 — canonical Accounts state, mapped) ──────────────────────
    const runsByAccount = new Map<string, typeof syncRuns>();
    for (const run of syncRuns) {
      const list = runsByAccount.get(run.accountId);
      if (list) list.push(run);
      else runsByAccount.set(run.accountId, [run]);
    }
    const connections = await Promise.all(
      accounts.map((account) => this.accountsRepository.findConnectionByAccountId(account.id)),
    );
    const brokers: BrokerConnection[] = accounts.map((account, index) =>
      this.toBrokerConnection(account, connections[index] ?? null, runsByAccount.get(account.id) ?? []),
    );

    // ── Jobs (§21/§22 — observed work, no fabricated runs) ────────────────────
    const jobs = this.jobStatuses(syncRuns, mailTelemetry);

    // ── Notifications (§25 — mailer is the only real channel) ─────────────────
    const notifications = this.notificationChannels(mailTelemetry);

    // ── Alerts (§37–§39 — real signals only, per-user episodes) ───────────────
    const failedRuns = syncRuns.filter((run) => run.status === "FAILED");
    const degradedBrokers = brokers
      .filter((broker) => broker.status === "DEGRADED" || broker.status === "AUTH_FAILED")
      .map((broker) => `${broker.broker} (${broker.status})`);
    const conditions = evaluateAlertRules(
      {
        api,
        degradedBrokers,
        syncFailures: failedRuns.length,
        jobFailures: failedRuns.length,
        notificationFailures: mailTelemetry.failed,
      },
      thresholds,
    );
    const alerts = this.reconcileAlerts(userId, conditions, now);

    // ── System events (§15 — monitoring-owned ring + derived sync failures) ───
    for (const run of failedRuns) {
      this.pushDerivedEvent(userId, `sync:${run.id}`, {
        at: iso(run.startedAt),
        source: "accounts",
        type: "SYNC_FAILURE",
        level: "WARNING",
        message: `Provider sync failed — ${run.errorCode ?? "unspecified error"}.`,
        correlationKey: `sync:${run.id}`,
      });
    }
    const events = this.eventList(userId, EVENTS_RETURNED);
    const incidents: Incident[] = groupIncidents(this.eventRing(userId));

    // ── Database panel (§11 — operational facts only) ─────────────────────────
    const database = {
      kind: "PostgreSQL",
      status: (databaseUp ? "OPERATIONAL" : "DOWN") as MonitoringStatus,
      entities: databaseUp ? entities : [],
      readOps: userCalls.filter((call) => call.routeKey.startsWith("GET ")).length,
      writeOps: userCalls.filter((call) => !call.routeKey.startsWith("GET ")).length,
      failedQueries: userCalls.filter(
        (call) => call.routeKey.startsWith("GET ") && call.statusCode >= 500,
      ).length,
      avgReadMs: this.avgReadMs(userCalls),
      slowQueries: this.slowReadEndpoints(userCalls),
      unavailable: [
        "per-query latency instrumentation",
        "connection-pool saturation",
        "query plans",
        "cache layer (none in this build)",
      ],
    };

    // ── Status board (§4 — every row carries evidence) ────────────────────────
    const components = this.statusBoard(api, database.status, brokers, jobs, notifications.channels);
    const counts = {
      operational: components.filter((c) => c.status === "OPERATIONAL").length,
      degraded: components.filter((c) => c.status === "DEGRADED").length,
      down: components.filter((c) => c.status === "DOWN").length,
      unknown: components.filter((c) => c.status === "UNKNOWN").length,
    };
    const overall = this.overallStatus(components);

    const health = this.healthRows(api, database, jobs);

    return {
      overview: {
        generatedAt: iso(now),
        windowStartedAt: iso(apiTelemetry.bootAt),
        overall: overall.status,
        overallEvidence: overall.evidence,
        components,
        counts,
        openAlerts: alerts.filter((alert) => alert.resolvedAt === null).length,
        activeIncidents: incidents.filter((incident) => incident.status === "OPEN").length,
      },
      health,
      api,
      database,
      jobs,
      notifications,
      brokers,
      // Integrations is a separate bounded context (backend not implemented
      // yet) — honestly empty, never fabricated (§23/§57).
      integrations: [],
      events,
      integrationEvents: [],
      alerts,
      incidents,
      thresholds,
    };
  }

  // ── PATCH /monitoring/thresholds ────────────────────────────────────────────

  async updateThresholds(
    userId: string,
    patch: MonitoringThresholdsUpdateInput,
  ): Promise<{ thresholds: MonitoringThresholds }> {
    const current = (await this.monitoringRepository.getThresholds(userId)) ?? defaultThresholds();
    const merged = mergeThresholdPatch(current, patch);
    await this.monitoringRepository.saveThresholds(userId, merged);
    const changed = patch.rules?.map((rule) => rule.id).join(", ") ?? "";
    this.pushEvent(userId, {
      source: "monitoring",
      type: "CONFIG_CHANGE",
      level: "INFO",
      message:
        changed.length > 0
          ? `Alert thresholds updated (${changed}).`
          : "Freshness thresholds updated.",
      correlationKey: null,
    });
    return { thresholds: merged };
  }

  // ── POST /monitoring/jobs/:jobId/run (§22/§50 — observational) ─────────────

  requestJobRun(jobId: string): { accepted: boolean; run: null; message: string } {
    // Monitoring NEVER fabricates a run and NEVER triggers domain work:
    // every job in this build is app-driven from its owning module (§50).
    const message = KNOWN_JOBS.has(jobId)
      ? `"${jobId}" is app-driven — trigger it from its owning module. Monitoring stays observational.`
      : "Unknown job.";
    return { accepted: false, run: null, message };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async databaseEntities(userId: string) {
    try {
      return await this.monitoringRepository.countUserEntities(userId);
    } catch {
      // A failing count must not fail the whole overview — DOWN shows in the
      // database status itself (ping drives that, not this).
      return [];
    }
  }

  private avgReadMs(calls: readonly ApiCallRecord[]): number {
    const reads = calls.filter((call) => call.routeKey.startsWith("GET "));
    if (reads.length === 0) return 0;
    return Math.round(reads.reduce((sum, call) => sum + call.durationMs, 0) / reads.length);
  }

  private slowReadEndpoints(calls: readonly ApiCallRecord[]): number {
    const byKey = new Map<string, number[]>();
    for (const call of calls) {
      if (!call.routeKey.startsWith("GET ")) continue;
      const list = byKey.get(call.routeKey);
      if (list) list.push(call.durationMs);
      else byKey.set(call.routeKey, [call.durationMs]);
    }
    let slow = 0;
    for (const durations of byKey.values()) {
      const ordered = [...durations].sort((a, b) => a - b);
      const p95 = ordered[Math.ceil(0.95 * ordered.length) - 1] ?? 0;
      if (p95 > SLOW_QUERY_MS) slow += 1;
    }
    return slow;
  }

  private toBrokerConnection(
    account: { broker: string; type: string; providerId: string; externalAccountId: string },
    connection: Awaited<ReturnType<AccountsRepository["findConnectionByAccountId"]>>,
    runs: Array<{ id: string; status: string; startedAt: Date; durationMs: number | null; errorCode: string | null }>,
  ): BrokerConnection {
    const successful = runs.find((run) => run.status === "SUCCESS");
    const failed = runs.find((run) => run.status === "FAILED");
    const status = connection
      ? mapBrokerStatus({
          status: connection.status,
          lastError: connection.lastError,
          lastFailedRunErrorCode: failed?.errorCode ?? null,
        })
      : "DISCONNECTED";
    return {
      providerId: account.providerId,
      broker: account.broker,
      accountIdentifier: account.externalAccountId,
      accountType: account.type,
      status,
      lastSyncAt: connection?.lastSyncAt ? iso(connection.lastSyncAt) : null,
      latencyMs: successful?.durationMs ?? null,
      authState:
        status === "AUTH_FAILED"
          ? "auth-failed"
          : connection
            ? "ok"
            : "none",
      syncErrors: runs.filter((run) => run.status === "FAILED").length,
      positionsSync: successful ? "reported" : "not reported by adapter",
      ordersSync: successful ? "reported" : "not reported by adapter",
      executionSync: successful ? "reported" : "not reported by adapter",
      readOnly: true,
    };
  }

  private jobStatuses(
    syncRuns: Array<{ id: string; status: string; startedAt: Date; finishedAt: Date | null; durationMs: number | null; trigger: string; errorCode: string | null }>,
    mailTelemetry: { sent: number; failed: number; recent: Array<{ id: string; at: Date; kind: string; status: "SENT" | "FAILED" }> },
  ): JobStatus[] {
    const completed = syncRuns.filter((run) => run.status !== "RUNNING");
    const durations = completed
      .map((run) => run.durationMs)
      .filter((duration): duration is number => duration !== null);
    const stuck =
      syncRuns.find(
        (run) => run.status === "RUNNING" && Date.now() - run.startedAt.getTime() > STUCK_RUNNING_MS,
      ) !== undefined;

    const tradingSync: JobStatus = {
      id: "trading-sync",
      name: "Trading account synchronization",
      queue: "providers",
      schedule: "ON_DEMAND",
      description:
        "Provider synchronization, triggered by the Accounts module on connect and manual refresh (canonical run ledger).",
      manualRunnable: false,
      lastRun: syncRuns[0]
        ? {
            id: syncRuns[0].id,
            jobId: "trading-sync",
            startedAt: iso(syncRuns[0].startedAt),
            durationMs: syncRuns[0].durationMs,
            status: syncRuns[0].status as "RUNNING" | "SUCCESS" | "FAILED",
            attempts: 1,
            error: syncRuns[0].errorCode,
            trigger: syncRuns[0].trigger === "MANUAL" ? ("MANUAL" as const) : ("SYSTEM" as const),
          }
        : null,
      successCount: syncRuns.filter((run) => run.status === "SUCCESS").length,
      failureCount: syncRuns.filter((run) => run.status === "FAILED").length,
      retryCount: 0,
      queued: syncRuns.filter((run) => run.status === "RUNNING").length,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
          : null,
      stuck,
    };

    const emailLast = mailTelemetry.recent[0] ?? null;
    const emailDispatch: JobStatus = {
      id: "email-dispatch",
      name: "Transactional email delivery",
      queue: "notifications",
      schedule: "ON_DEMAND",
      description:
        "Verification / reset / email-change messages through the configured mail transport (identity-owned).",
      manualRunnable: false,
      lastRun: emailLast
        ? {
            id: emailLast.id,
            jobId: "email-dispatch",
            startedAt: iso(emailLast.at),
            durationMs: null,
            status: emailLast.status === "SENT" ? ("SUCCESS" as const) : ("FAILED" as const),
            attempts: 1,
            error: null,
            trigger: "SYSTEM" as const,
          }
        : null,
      successCount: mailTelemetry.sent,
      failureCount: mailTelemetry.failed,
      retryCount: 0,
      queued: 0,
      avgDurationMs: null,
      stuck: false,
    };

    return [tradingSync, emailDispatch];
  }

  private notificationChannels(mailTelemetry: {
    sent: number;
    failed: number;
    recent: Array<{ id: string; at: Date; kind: string; status: "SENT" | "FAILED" }>;
  }): { channels: NotificationChannelStatus[]; recent: NotificationDelivery[] } {
    const emailStatus: MonitoringStatus =
      mailTelemetry.failed > 0 ? "DEGRADED" : mailTelemetry.sent > 0 ? "OPERATIONAL" : "UNKNOWN";
    return {
      channels: [
        {
          channel: "IN_APP",
          status: "UNKNOWN",
          sent: 0,
          failed: 0,
          queued: 0,
          retrying: 0,
          evidence: "in-app delivery is a frontend capability in this build — no server-side Nofy context yet",
        },
        {
          channel: "EMAIL",
          status: emailStatus,
          sent: mailTelemetry.sent,
          failed: mailTelemetry.failed,
          queued: 0,
          retrying: 0,
          evidence:
            mailTelemetry.sent + mailTelemetry.failed === 0
              ? "no email dispatched in this process yet"
              : `${mailTelemetry.sent} sent via the configured transport (${mailTelemetry.failed} failed)`,
        },
        {
          channel: "PUSH",
          status: "UNKNOWN",
          sent: 0,
          failed: 0,
          queued: 0,
          retrying: 0,
          evidence: "no push provider configured in this build",
        },
      ],
      recent: mailTelemetry.recent.slice(0, 12).map((record) => ({
        id: record.id,
        at: iso(record.at),
        channel: "EMAIL" as const,
        title: record.kind,
        status: record.status,
      })),
    };
  }

  private reconcileAlerts(userId: string, conditions: ReturnType<typeof evaluateAlertRules>, now: Date): RaisedAlert[] {
    const episodes = this.alertEpisodes.get(userId) ?? new Map<AlertRuleId, EpisodeState>();
    const ruleIds = new Set<AlertRuleId>([
      ...episodes.keys(),
      ...conditions.map((condition) => condition.ruleId),
    ]);
    for (const ruleId of ruleIds) {
      const condition = conditions.find((candidate) => candidate.ruleId === ruleId);
      const result = applyConditionToEpisode(episodes.get(ruleId), condition, now);
      episodes.set(ruleId, result.episode);
      if (result.raised) {
        this.pushEvent(userId, {
          source: "monitoring",
          type: "SERVICE_DEGRADED",
          level: condition!.severity === "CRITICAL" ? "ERROR" : "WARNING",
          message: condition!.message,
          correlationKey: `alert:${ruleId}`,
        });
      }
      if (result.resolved) {
        this.pushEvent(userId, {
          source: "monitoring",
          type: "SERVICE_RECOVERED",
          level: "INFO",
          message: `${ruleId} condition cleared.`,
          correlationKey: `alert:${ruleId}`,
        });
      }
    }
    this.alertEpisodes.set(userId, episodes);
    return [...episodes.values()]
      .map((episode) => episode.alert)
      .filter((alert) => alert.occurrences > 0)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  private eventRing(userId: string): SystemEvent[] {
    const ring = this.eventRings.get(userId);
    if (ring) return ring;
    const created: SystemEvent[] = [];
    this.eventRings.set(userId, created);
    return created;
  }

  private pushEvent(
    userId: string,
    event: { source: string; type: SystemEvent["type"]; level: SystemEvent["level"]; message: string; correlationKey: string | null },
  ): void {
    const ring = this.eventRing(userId);
    ring.push({
      id: crypto.randomUUID(),
      at: iso(new Date()),
      source: event.source,
      type: event.type,
      level: event.level,
      message: event.message,
      correlationKey: event.correlationKey,
    });
    if (ring.length > EVENT_RING_CAP) {
      ring.splice(0, ring.length - EVENT_RING_CAP);
    }
  }

  /** Derived events enter the ring once per real-world cause (§39 dedupe). */
  private pushDerivedEvent(
    userId: string,
    derivedKey: string,
    event: { at: string; source: string; type: SystemEvent["type"]; level: SystemEvent["level"]; message: string; correlationKey: string },
  ): void {
    let seen = this.seenDerivedKeys.get(userId);
    if (!seen) {
      seen = new Set<string>();
      this.seenDerivedKeys.set(userId, seen);
    }
    if (seen.has(derivedKey)) return;
    seen.add(derivedKey);
    const ring = this.eventRing(userId);
    ring.push({
      id: crypto.randomUUID(),
      at: event.at,
      source: event.source,
      type: event.type,
      level: event.level,
      message: event.message,
      correlationKey: event.correlationKey,
    });
    ring.sort((a, b) => a.at.localeCompare(b.at));
    if (ring.length > EVENT_RING_CAP) {
      ring.splice(0, ring.length - EVENT_RING_CAP);
    }
  }

  private eventList(userId: string, take: number): SystemEvent[] {
    return [...this.eventRing(userId)].reverse().slice(0, take);
  }

  private statusBoard(
    api: ApiMonitoring,
    databaseStatus: MonitoringStatus,
    brokers: BrokerConnection[],
    jobs: JobStatus[],
    channels: NotificationChannelStatus[],
  ): ComponentStatus[] {
    const apiStatus = deriveApiStatus(api);
    const degraded = brokers.filter(
      (broker) => broker.status === "DEGRADED" || broker.status === "AUTH_FAILED",
    );
    const brokerStatus: MonitoringStatus =
      degraded.length > 0
        ? "DEGRADED"
        : brokers.length > 0
          ? "OPERATIONAL"
          : "UNKNOWN";
    const stuckJobs = jobs.filter((job) => job.stuck).length;
    const queueStatus: MonitoringStatus = stuckJobs > 0 ? "DEGRADED" : "UNKNOWN";
    const email = channels.find((channel) => channel.channel === "EMAIL");
    const notificationStatus: MonitoringStatus =
      email?.status === "DEGRADED"
        ? "DEGRADED"
        : email?.status === "OPERATIONAL"
          ? "OPERATIONAL"
          : "UNKNOWN";

    const components: ComponentStatus[] = [
      { id: "api", label: "API", status: apiStatus.status, evidence: apiStatus.evidence, source: "engine", tab: "api" },
      {
        id: "database",
        label: "Database",
        status: databaseStatus,
        evidence: databaseStatus === "OPERATIONAL" ? "database reachable (readiness ping)" : "database unreachable",
        source: "engine",
        tab: "database",
      },
      {
        id: "market-data",
        label: "Market data",
        status: "UNKNOWN",
        evidence: "feed freshness is measured in your browser",
        source: "client-observed",
        tab: "market-data",
      },
      {
        id: "websocket",
        label: "WebSocket",
        status: "UNKNOWN",
        evidence: "realtime health is measured in your browser (market feed)",
        source: "client-observed",
        tab: "websockets",
      },
      {
        id: "broker",
        label: "Brokers",
        status: brokerStatus,
        evidence:
          degraded.length > 0
            ? degraded.map((broker) => `${broker.broker} ${broker.status}`).join(", ")
            : brokers.length > 0
              ? `${brokers.filter((broker) => broker.status === "CONNECTED").length}/${brokers.length} connection(s) connected`
              : "no trading accounts connected yet",
        source: "engine",
        tab: "brokers",
      },
      {
        id: "queue",
        label: "Queue",
        status: queueStatus,
        evidence:
          stuckJobs > 0
            ? `${stuckJobs} synchronization run(s) stuck RUNNING > 60 s`
            : "no background queue in this build — work runs request-scoped",
        source: "engine",
        tab: "jobs",
      },
      {
        id: "integrations",
        label: "Integrations",
        status: "UNKNOWN",
        evidence: "Integrations context not implemented server-side yet",
        source: "engine",
        tab: "integrations",
      },
      {
        id: "notifications",
        label: "Notifications",
        status: notificationStatus,
        evidence: email?.evidence ?? "no delivery observations",
        source: "engine",
        tab: "notifications",
      },
    ];
    return components;
  }

  private overallStatus(components: ComponentStatus[]): { status: MonitoringStatus; evidence: string } {
    if (components.some((component) => component.status === "DOWN")) {
      return { status: "DOWN", evidence: "a required dependency is unreachable (see the status board)" };
    }
    const degraded = components.filter((component) => component.status === "DEGRADED");
    if (degraded.length > 0) {
      return { status: "DEGRADED", evidence: `degraded: ${degraded.map((c) => c.id).join(", ")}` };
    }
    if (components.every((component) => component.status === "UNKNOWN")) {
      return { status: "UNKNOWN", evidence: "insufficient observations yet — interact with the platform to collect some" };
    }
    return { status: "OPERATIONAL", evidence: "all observed components operational" };
  }

  private healthRows(
    api: ApiMonitoring,
    database: { status: MonitoringStatus; readOps: number; failedQueries: number; avgReadMs: number },
    jobs: JobStatus[],
  ): { rows: HealthRow[]; sessionUptimeMs: number } {
    const apiStatus = deriveApiStatus(api);
    const queued = jobs.reduce((sum, job) => sum + job.queued, 0);
    return {
      rows: [
        {
          id: "api",
          label: "API",
          status: apiStatus.status,
          metrics: [
            { label: "Requests", value: String(api.totalRequests) },
            { label: "Errors", value: `${api.totalErrors} (${api.errorRatePct}%)` },
            { label: "p50", value: `${api.p50Ms} ms` },
            { label: "p95", value: `${api.p95Ms} ms` },
          ],
          evidence: apiStatus.evidence,
        },
        {
          id: "database",
          label: "Database",
          status: database.status,
          metrics: [
            { label: "Kind", value: "PostgreSQL" },
            { label: "Read ops", value: String(database.readOps) },
            { label: "Failed queries", value: String(database.failedQueries) },
            { label: "Avg read", value: `${database.avgReadMs} ms` },
          ],
          evidence: database.status === "OPERATIONAL" ? "readiness ping ok" : "readiness ping failed",
        },
        {
          id: "cache",
          label: "Cache",
          status: "UNKNOWN",
          metrics: [
            { label: "Backend", value: "none in this build" },
            { label: "Hit rate", value: "not observable" },
            { label: "Miss rate", value: "not observable" },
            { label: "Latency", value: "not observable" },
          ],
          evidence: "no cache layer exists in this build — none was created for monitoring (§29)",
        },
        {
          id: "storage",
          label: "Storage",
          status: "UNKNOWN",
          metrics: [
            { label: "Backend", value: "none in this build" },
            { label: "Objects", value: "0" },
            { label: "Latency", value: "not observable" },
            { label: "Errors", value: "0" },
          ],
          evidence: "no object storage is attached to this API build",
        },
        {
          id: "workers",
          label: "Workers",
          status: "UNKNOWN",
          metrics: [
            { label: "Fleet", value: "request-scoped" },
            { label: "Busy", value: "not observable" },
            { label: "Idle", value: "not observable" },
            { label: "Restarts", value: "0" },
          ],
          evidence: "no background worker fleet — work runs inside the request lifecycle",
        },
        {
          id: "scheduler",
          label: "Scheduler",
          status: "UNKNOWN",
          metrics: [
            { label: "Jobs", value: "0" },
            { label: "Interval", value: "none" },
            { label: "Last tick", value: "never" },
            { label: "Next tick", value: "never" },
          ],
          evidence: "no scheduler in this build (retention cron remains deferred)",
        },
        {
          id: "queue",
          label: "Queue",
          status: jobs.some((job) => job.stuck) ? "DEGRADED" : "UNKNOWN",
          metrics: [
            { label: "Queued", value: String(queued) },
            { label: "Stuck", value: String(jobs.filter((job) => job.stuck).length) },
            { label: "Failed (window)", value: String(jobs.reduce((sum, job) => sum + job.failureCount, 0)) },
            { label: "Depth", value: "request-scoped" },
          ],
          evidence:
            jobs.some((job) => job.stuck)
              ? "a synchronization run exceeded the 60 s RUNNING window"
              : "no background queue in this build — sync runs are request-scoped",
        },
        {
          id: "websocket",
          label: "WebSocket",
          status: "UNKNOWN",
          metrics: [
            { label: "Gateway", value: "not implemented" },
            { label: "Connections", value: "0" },
            { label: "Messages", value: "0" },
            { label: "Reconnects", value: "0" },
          ],
          evidence: "no server-side WebSocket gateway in this build — realtime is client-observed",
        },
      ],
      sessionUptimeMs: Math.max(0, Date.now() - apiTelemetry.bootAt.getTime()),
    };
  }
}

// AuthPrincipal is re-exported for typing symmetry with the controller.
export type { AuthPrincipal };
