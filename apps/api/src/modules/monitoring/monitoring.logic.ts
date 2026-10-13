/**
 * Monitoring domain logic (Phase 17) — PURE functions, no Nest, no Prisma.
 *
 * Every status carries EVIDENCE and every derivation is deterministic from
 * observed facts — the monitoring board never invents health (§4/§10).
 * Separated from the service so the rules are unit-testable without a
 * running application (§47).
 */
import type { ApiCallRecord } from "../../infrastructure/telemetry/api-telemetry";
import type {
  AlertRuleId,
  ApiEndpointStat,
  ApiMonitoring,
  BrokerConnectionStatus,
  Incident,
  MonitoringStatus,
  MonitoringThresholds,
  MonitoringThresholdsUpdateInput,
  RaisedAlert,
  SystemEvent,
} from "../../shared/contracts";
import { randomUUID } from "node:crypto";

// ── Thresholds (defaults mirror the shared contract examples) ────────────────

export const DEFAULT_FRESHNESS = { liveMaxMs: 2_000, delayedMaxMs: 10_000 } as const;

/** The 8 contract rules. MARKET_DATA_STALE and QUEUE_BACKLOG have no
 * server-side signal in this build (client-observed freshness; no queue) —
 * they stay configurable but never raise; NOTIFICATION_FAILURES, API_*
 * and broker/job/sync rules evaluate against real signals. */
export const RULE_DEFAULTS: Array<{
  id: AlertRuleId;
  enabled: boolean;
  thresholdLabel: string;
  thresholdValue: number | null;
}> = [
  { id: "MARKET_DATA_STALE", enabled: true, thresholdLabel: "feed age > delayed threshold", thresholdValue: 10_000 },
  { id: "BROKER_DISCONNECTED", enabled: true, thresholdLabel: "any broker not CONNECTED", thresholdValue: null },
  { id: "API_DEGRADED", enabled: true, thresholdLabel: "error rate > 10 % (min 10 requests)", thresholdValue: 10 },
  { id: "API_LATENCY", enabled: true, thresholdLabel: "p95 latency > 1 500 ms", thresholdValue: 1_500 },
  { id: "QUEUE_BACKLOG", enabled: true, thresholdLabel: "queued runs > 5", thresholdValue: 5 },
  { id: "JOB_FAILURES", enabled: true, thresholdLabel: "2 consecutive job failures", thresholdValue: 2 },
  { id: "NOTIFICATION_FAILURES", enabled: true, thresholdLabel: "1 failed email delivery", thresholdValue: 1 },
  { id: "SYNC_FAILURES", enabled: true, thresholdLabel: "1 provider sync failure", thresholdValue: 1 },
];

export function defaultThresholds(): MonitoringThresholds {
  return { freshness: { ...DEFAULT_FRESHNESS }, rules: RULE_DEFAULTS.map((rule) => ({ ...rule })) };
}

/** Labels that travel with their numeric knob when the user re-tunes them
 * (thousands separator matches the default labels' style, e.g. "1 500 ms"). */
function formatKnob(value: number): string {
  return new Intl.NumberFormat("en-US").format(value).replace(/,/g, " ");
}

function labelFor(ruleId: AlertRuleId, value: number | null): string {
  switch (ruleId) {
    case "API_DEGRADED":
      return `error rate > ${formatKnob(value ?? 10)} % (min 10 requests)`;
    case "API_LATENCY":
      return `p95 latency > ${formatKnob(value ?? 1_500)} ms`;
    case "QUEUE_BACKLOG":
      return `queued runs > ${formatKnob(value ?? 5)}`;
    case "JOB_FAILURES":
      return `${formatKnob(value ?? 2)} consecutive job failures`;
    case "NOTIFICATION_FAILURES":
      return `${formatKnob(value ?? 1)} failed email delivery`;
    case "SYNC_FAILURES":
      return `${formatKnob(value ?? 1)} provider sync failure`;
    default:
      return ruleId === "MARKET_DATA_STALE" ? "feed age > delayed threshold" : "any broker not CONNECTED";
  }
}

export function mergeThresholdPatch(
  current: MonitoringThresholds,
  patch: MonitoringThresholdsUpdateInput,
): MonitoringThresholds {
  const freshness = {
    liveMaxMs: patch.freshness?.liveMaxMs ?? current.freshness.liveMaxMs,
    delayedMaxMs: patch.freshness?.delayedMaxMs ?? current.freshness.delayedMaxMs,
  };
  const rules = current.rules.map((rule) => {
    const incoming = patch.rules?.find((candidate) => candidate.id === rule.id);
    if (!incoming) return rule;
    const thresholdValue =
      incoming.thresholdValue === undefined ? rule.thresholdValue : incoming.thresholdValue;
    return {
      ...rule,
      enabled: incoming.enabled ?? rule.enabled,
      thresholdValue,
      thresholdLabel: labelFor(rule.id, thresholdValue),
    };
  });
  return { freshness, rules };
}

// ── Percentiles (nearest-rank — §13) ─────────────────────────────────────────

export function percentile(durations: number[], p: number): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.min(index, sorted.length - 1)]!;
}

// ── API monitoring (§12/§14) ─────────────────────────────────────────────────

const BUCKET_WINDOW_MS = 30 * 60 * 1_000;
export const SLOW_QUERY_MS = 250;

/**
 * Aggregate the caller's OWN completed requests (§34) into the contract
 * shape. Error semantics (§14): an error is a ≥400 response — the
 * status-code histogram keeps 4xx (client) and 5xx (server) distinguishable,
 * and rate-limited (429) traffic is counted separately.
 */
export function computeApiMonitoring(calls: readonly ApiCallRecord[], now: Date): ApiMonitoring {
  const totalRequests = calls.length;
  const totalErrors = calls.filter((call) => call.statusCode >= 400).length;
  const rateLimitedTotal = calls.filter((call) => call.statusCode === 429).length;
  const durations = calls.map((call) => call.durationMs);

  const byKey = new Map<string, ApiCallRecord[]>();
  for (const call of calls) {
    const bucket = byKey.get(call.routeKey);
    if (bucket) bucket.push(call);
    else byKey.set(call.routeKey, [call]);
  }

  const endpoints: ApiEndpointStat[] = [...byKey.entries()].map(([key, group]) => ({
    key,
    count: group.length,
    errorCount: group.filter((call) => call.statusCode >= 400).length,
    p50Ms: percentile(group.map((call) => call.durationMs), 50),
    p95Ms: percentile(group.map((call) => call.durationMs), 95),
    maxMs: Math.max(...group.map((call) => call.durationMs)),
    lastStatus: group[0]!.statusCode,
    lastAt: group[0]!.at.toISOString().replace(/\.\d{3}Z$/, "Z"),
    rateLimited: group.filter((call) => call.statusCode === 429).length,
  }));
  endpoints.sort((a, b) => b.count - a.count);

  const statusCodes = new Map<number, number>();
  for (const call of calls) {
    statusCodes.set(call.statusCode, (statusCodes.get(call.statusCode) ?? 0) + 1);
  }

  // One bucket per minute for the last 30 minutes (§12) — derived from the
  // ring, so the window is also bounded by ring capacity (honest window).
  const buckets: Array<{ at: string; count: number; errorCount: number }> = [];
  const currentMinute = Math.floor(now.getTime() / 60_000);
  for (let offset = BUCKET_WINDOW_MS / 60_000 - 1; offset >= 0; offset -= 1) {
    const minuteStartMs = (currentMinute - offset) * 60_000;
    const inBucket = calls.filter((call) => {
      const ts = call.at.getTime();
      return ts >= minuteStartMs && ts < minuteStartMs + 60_000;
    });
    buckets.push({
      at: new Date(minuteStartMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
      count: inBucket.length,
      errorCount: inBucket.filter((call) => call.statusCode >= 400).length,
    });
  }

  return {
    windowStartedAt: new Date(currentMinute * 60_000 - BUCKET_WINDOW_MS + 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z"),
    windowEndedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    totalRequests,
    totalErrors,
    errorRatePct: totalRequests === 0 ? 0 : Math.round((totalErrors / totalRequests) * 1_000) / 10,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    statusCodes: [...statusCodes.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => a.code - b.code),
    endpoints,
    slowest: [...endpoints].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 5),
    buckets,
    rateLimitedTotal,
  };
}

export function deriveApiStatus(api: ApiMonitoring): { status: MonitoringStatus; evidence: string } {
  if (api.totalRequests === 0) {
    return { status: "UNKNOWN", evidence: "no requests observed in this window yet" };
  }
  if (api.totalRequests >= 10 && api.errorRatePct >= 10) {
    return {
      status: "DEGRADED",
      evidence: `${api.totalErrors}/${api.totalRequests} responses ≥400 (${api.errorRatePct}%)`,
    };
  }
  return {
    status: "OPERATIONAL",
    evidence: `${api.totalRequests} request(s), p95 ${api.p95Ms} ms`,
  };
}

// ── Broker connection health (§24/§26 — mapped from Accounts' facts) ────────

export interface ConnectionHealthFacts {
  status: string;
  lastError: string | null;
  lastFailedRunErrorCode: string | null;
}

export function mapBrokerStatus(facts: ConnectionHealthFacts): BrokerConnectionStatus {
  switch (facts.status) {
    case "CONNECTED":
      return "CONNECTED";
    case "CONNECTING":
      return "CONNECTING";
    case "DISCONNECTED":
      return "DISCONNECTED";
    case "ERROR":
      return facts.lastFailedRunErrorCode === "INVALID_CREDENTIALS" ||
        facts.lastFailedRunErrorCode === "UNAUTHORIZED_PROVIDER_ACCESS"
        ? "AUTH_FAILED"
        : "DEGRADED";
    default:
      return "DISCONNECTED";
  }
}

// ── Job ledger status mapping (Trading-sync runs → job runs) ────────────────

/**
 * Map an Accounts sync-run status onto the coarse job-run ledger vocabulary
 * (`jobRunStatusSchema` = RUNNING | SUCCESS | FAILED). The trading-sync job
 * has no scheduler in this build and its runs are written as
 * RUNNING | COMPLETED | FAILED (PARTIAL is reserved, Phase 03), while the
 * shared job contract speaks SUCCESS/FAILED — the same boundary mapping the
 * email-dispatch job applies to SENT/FAILED. Mapping:
 *   RUNNING   → RUNNING   (a run is in flight)
 *   COMPLETED → SUCCESS   (all segments persisted)
 *   FAILED    → FAILED
 *   PARTIAL   → FAILED    (failures existed — conservative health view; the
 *                         accounts domain preserves the finer status and the
 *                         errorCode travels in the job run's error field.
 *                         Revisit if PARTIAL production ships, Phase 03.)
 * Unknown values never pass through unchecked — they land on FAILED so the
 * board never mistakes an unrecognized status for a healthy one.
 */
export function toJobRunStatus(
  syncRunStatus: string,
): "RUNNING" | "SUCCESS" | "FAILED" {
  switch (syncRunStatus) {
    case "RUNNING":
      return "RUNNING";
    case "COMPLETED":
      return "SUCCESS";
    default:
      return "FAILED";
  }
}

// ── Alert evaluation (§37/§38/§39) — conditions only; episodes live in the
//    service. Only rules with REAL server-side signals evaluate here.

export interface AlertFacts {
  api: ApiMonitoring;
  degradedBrokers: string[];
  syncFailures: number;
  jobFailures: number;
  notificationFailures: number;
}

export interface AlertCondition {
  ruleId: AlertRuleId;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
}

export function evaluateAlertRules(facts: AlertFacts, thresholds: MonitoringThresholds): AlertCondition[] {
  const conditions: AlertCondition[] = [];
  const knob = (ruleId: AlertRuleId): number | null =>
    thresholds.rules.find((rule) => rule.id === ruleId)?.thresholdValue ?? null;
  const enabled = (ruleId: AlertRuleId): boolean =>
    thresholds.rules.find((rule) => rule.id === ruleId)?.enabled ?? false;

  if (enabled("API_DEGRADED")) {
    const limit = knob("API_DEGRADED") ?? 10;
    if (facts.api.totalRequests >= 10 && facts.api.errorRatePct >= limit) {
      conditions.push({
        ruleId: "API_DEGRADED",
        severity: "WARNING",
        message: `API error rate ${facts.api.errorRatePct}% exceeds the ${limit}% threshold.`,
      });
    }
  }
  if (enabled("API_LATENCY")) {
    const limit = knob("API_LATENCY") ?? 1_500;
    if (facts.api.totalRequests >= 10 && facts.api.p95Ms > limit) {
      conditions.push({
        ruleId: "API_LATENCY",
        severity: "WARNING",
        message: `API p95 latency ${facts.api.p95Ms} ms exceeds the ${limit} ms threshold.`,
      });
    }
  }
  if (enabled("BROKER_DISCONNECTED") && facts.degradedBrokers.length > 0) {
    conditions.push({
      ruleId: "BROKER_DISCONNECTED",
      severity: "CRITICAL",
      message: `Broker connection degraded: ${facts.degradedBrokers.join(", ")}.`,
    });
  }
  if (enabled("JOB_FAILURES")) {
    const limit = knob("JOB_FAILURES") ?? 2;
    if (facts.jobFailures >= limit) {
      conditions.push({
        ruleId: "JOB_FAILURES",
        severity: "WARNING",
        message: `${facts.jobFailures} job failure(s) recorded (threshold ${limit}).`,
      });
    }
  }
  if (enabled("NOTIFICATION_FAILURES")) {
    const limit = knob("NOTIFICATION_FAILURES") ?? 1;
    if (facts.notificationFailures >= limit) {
      conditions.push({
        ruleId: "NOTIFICATION_FAILURES",
        severity: "WARNING",
        message: `${facts.notificationFailures} email delivery failure(s) recorded.`,
      });
    }
  }
  if (enabled("SYNC_FAILURES")) {
    const limit = knob("SYNC_FAILURES") ?? 1;
    if (facts.syncFailures >= limit) {
      conditions.push({
        ruleId: "SYNC_FAILURES",
        severity: "WARNING",
        message: `${facts.syncFailures} provider sync failure(s) recorded (threshold ${limit}).`,
      });
    }
  }
  // MARKET_DATA_STALE / QUEUE_BACKLOG: no server-side signal in this build
  // (client-observed freshness; no queue) — documented, never fabricated.
  return conditions;
}

// ── Incidents (§43-style aggregation, contract §16) ─────────────────────────

export function groupIncidents(events: readonly SystemEvent[], limit = 8): Incident[] {
  const groups = new Map<string, SystemEvent[]>();
  for (const event of events) {
    const key = event.correlationKey ?? event.id;
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }
  const incidents: Incident[] = [];
  for (const [key, group] of groups) {
    const worsening = group.filter((event) => event.level !== "INFO");
    if (worsening.length === 0) continue;
    const ordered = [...group].sort((a, b) => a.at.localeCompare(b.at));
    const recovered = group.some((event) => event.type === "SERVICE_RECOVERED");
    const severity = worsening.some((event) => event.level === "ERROR") ? "CRITICAL" : "WARNING";
    const startedAt = ordered[0]!.at;
    const lastAt = ordered[ordered.length - 1]!.at;
    incidents.push({
      id: key.includes("alert:") ? key.replace("alert:", "") : randomUUID(),
      service: ordered[0]!.source,
      status: recovered ? "RESOLVED" : "OPEN",
      severity,
      startedAt,
      detectedAt: worsening[0]!.at,
      durationMs: recovered
        ? Math.max(0, Date.parse(lastAt) - Date.parse(startedAt))
        : null,
      symptoms: [...new Set(worsening.map((event) => event.message))],
      events: ordered.map((event) => `${event.at.slice(11, 19)} ${event.level} ${event.message}`),
      resolution: recovered ? "Condition cleared — service recovered." : null,
      rootCause: null, // never invented (§16)
    });
  }
  return incidents.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

// ── Alert episode bookkeeping (§39 dedupe) ──────────────────────────────────

export interface EpisodeState {
  alert: RaisedAlert;
}

export function applyConditionToEpisode(
  episode: EpisodeState | undefined,
  condition: AlertCondition | undefined,
  now: Date,
): { episode: EpisodeState; raised: boolean; resolved: boolean } {
  if (condition) {
    if (episode) {
      // A previously RESOLVED episode that re-fires is a NEW degradation
      // transition — the event ledger must log it (§39 state transitions).
      const reRaised = episode.alert.resolvedAt !== null;
      return {
        episode: {
          alert: {
            ...episode.alert,
            message: condition.message,
            lastSeenAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
            occurrences: episode.alert.occurrences + 1,
            resolvedAt: null,
          },
        },
        raised: reRaised,
        resolved: false,
      };
    }
    const nowIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    return {
      episode: {
        alert: {
          id: randomUUID(),
          ruleId: condition.ruleId,
          severity: condition.severity,
          message: condition.message,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
          occurrences: 1,
          resolvedAt: null,
        },
      },
      raised: true,
      resolved: false,
    };
  }
  if (episode && episode.alert.resolvedAt === null) {
    return {
      episode: { alert: { ...episode.alert, resolvedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z") } },
      raised: false,
      resolved: true,
    };
  }
  if (episode) return { episode, raised: false, resolved: false };
  // No episode, no condition — nothing to record.
  return {
    episode: {
      alert: {
        id: randomUUID(),
        ruleId: "API_DEGRADED",
        severity: "INFO",
        message: "(inactive)",
        firstSeenAt: "1970-01-01T00:00:00Z",
        lastSeenAt: "1970-01-01T00:00:00Z",
        occurrences: 0,
        resolvedAt: "1970-01-01T00:00:00Z",
      },
    },
    raised: false,
    resolved: false,
  };
}
