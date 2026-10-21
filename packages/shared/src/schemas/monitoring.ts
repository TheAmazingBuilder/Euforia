import { z } from "zod";

import {
  integrationEventSchema,
  integrationStatusSchema,
} from "./integration";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Monitoring & System Health module (MASTER PROMPT §1–§21).
 *
 * Design rules:
 * - Every status claims EVIDENCE. A component is never "operational" because
 *   a constant says so — the board carries the observation that justifies the
 *   status, or the status is UNKNOWN (§4).
 * - Freshness thresholds (LIVE/DELAYED/STALE) are configurable data, not
 *   hardcoded assumptions (§17).
 * - API telemetry is OBSERVED client-side by the typed fetch wrapper and
 *   aggregated by the engine — request counts, latencies and error rates are
 *   real measurements from the running session (§9, §21).
 * - Monitoring never exposes infrastructure secrets: no credentials, no
 *   connection strings, no raw error internals (§10, §19).
 * - The system event log is append-only and distinct from the Security audit
 *   log (§15); incidents are derived from events, root causes are never
 *   fabricated (§16).
 */

// ── Statuses (§4) ────────────────────────────────────────────────────────────

export const monitoringStatusSchema = z.enum([
  "OPERATIONAL",
  "DEGRADED",
  "DOWN",
  "UNKNOWN",
]);
export type MonitoringStatus = z.infer<typeof monitoringStatusSchema>;

/** Components observed on the status board. `source` states who observed it. */
export const statusSourceSchema = z.enum(["engine", "client-observed"]);
export type StatusSource = z.infer<typeof statusSourceSchema>;

export const componentStatusSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: monitoringStatusSchema,
  /** The observation that justifies the status — never a bare claim (§4). */
  evidence: z.string().min(1),
  /** "engine" = computed in the API layer; "client-observed" = the browser feed. */
  source: statusSourceSchema,
  /** Where to dig deeper (tab anchor). */
  tab: z.string().min(1),
});
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

// ── Data freshness (§6, §17) ─────────────────────────────────────────────────

export const freshnessSchema = z.enum(["LIVE", "DELAYED", "STALE", "UNKNOWN"]);
export type Freshness = z.infer<typeof freshnessSchema>;

export const freshnessThresholdsSchema = z.object({
  /** Age (ms) under which a feed is LIVE. Default 2 000 (§17 example). */
  liveMaxMs: z.number().int().positive().max(60_000),
  /** Age (ms) under which a feed is DELAYED. Above → STALE. Default 10 000. */
  delayedMaxMs: z.number().int().positive().max(600_000),
});
export type FreshnessThresholds = z.infer<typeof freshnessThresholdsSchema>;

/** Classify a tick age against the configured thresholds (pure, shared). */
export function classifyFreshness(
  ageMs: number | null,
  thresholds: FreshnessThresholds,
): Freshness {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "UNKNOWN";
  if (ageMs <= thresholds.liveMaxMs) return "LIVE";
  if (ageMs <= thresholds.delayedMaxMs) return "DELAYED";
  return "STALE";
}

// ── Alerting (§14) ───────────────────────────────────────────────────────────

export const alertSeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const alertRuleIdSchema = z.enum([
  "MARKET_DATA_STALE",
  "BROKER_DISCONNECTED",
  "API_DEGRADED",
  "API_LATENCY",
  "QUEUE_BACKLOG",
  "JOB_FAILURES",
  "NOTIFICATION_FAILURES",
  "SYNC_FAILURES",
]);
export type AlertRuleId = z.infer<typeof alertRuleIdSchema>;

/** Configurable rule set (§14 — alerts must be configurable). */
export const monitoringThresholdsSchema = z.object({
  freshness: freshnessThresholdsSchema,
  rules: z.array(
    z.object({
      id: alertRuleIdSchema,
      enabled: z.boolean(),
      /** Human-readable threshold line, e.g. "error rate > 5 % over 5 min". */
      thresholdLabel: z.string().min(1),
      /** Numeric knob (unit documented in thresholdLabel) where applicable. */
      thresholdValue: z.number().nullable(),
    }),
  ),
});
export type MonitoringThresholds = z.infer<typeof monitoringThresholdsSchema>;
export type AlertRule = MonitoringThresholds["rules"][number];

/** A raised alert — deduplicated by rule with occurrences (§14). */
export const raisedAlertSchema = z.object({
  id: uuidSchema,
  ruleId: alertRuleIdSchema,
  severity: alertSeveritySchema,
  message: z.string().min(1),
  firstSeenAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
  occurrences: z.number().int().positive(),
  /** Null while the condition holds. */
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type RaisedAlert = z.infer<typeof raisedAlertSchema>;

// ── System events (§15) + incidents (§16) ────────────────────────────────────

export const systemEventLevelSchema = z.enum(["INFO", "WARNING", "ERROR"]);
export type SystemEventLevel = z.infer<typeof systemEventLevelSchema>;

export const systemEventTypeSchema = z.enum([
  "CONNECTION_CHANGE",
  "SYNC_FAILURE",
  "PROVIDER_CHANGE",
  "CONFIG_CHANGE",
  "SYSTEM_ERROR",
  "SERVICE_DEGRADED",
  "SERVICE_RECOVERED",
  "JOB_FAILURE",
  "FRESHNESS_BREACH",
  "RATE_LIMIT",
]);
export type SystemEventType = z.infer<typeof systemEventTypeSchema>;

export const systemEventSchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  source: z.string().min(1),
  type: systemEventTypeSchema,
  level: systemEventLevelSchema,
  message: z.string().min(1),
  /** Links duplicated events from the same cause together. */
  correlationKey: z.string().nullable(),
});
export type SystemEvent = z.infer<typeof systemEventSchema>;

export const incidentStatusSchema = z.enum(["OPEN", "RESOLVED"]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

export const incidentSchema = z.object({
  id: uuidSchema,
  service: z.string().min(1),
  status: incidentStatusSchema,
  severity: alertSeveritySchema,
  startedAt: isoDateTimeSchema,
  detectedAt: isoDateTimeSchema,
  /** Null while open. */
  durationMs: z.number().int().nonnegative().nullable(),
  symptoms: z.array(z.string().min(1)),
  /** Chronological event lines feeding the incident. */
  events: z.array(z.string().min(1)),
  resolution: z.string().nullable(),
  /** Null unless derivable from evidence — never invented (§16). */
  rootCause: z.string().nullable(),
});
export type Incident = z.infer<typeof incidentSchema>;

// ── API monitoring (§9) ──────────────────────────────────────────────────────

export const apiEndpointStatSchema = z.object({
  /** "GET /trades" style key. */
  key: z.string().min(1),
  count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  lastStatus: z.number().int(),
  lastAt: isoDateTimeSchema,
  rateLimited: z.number().int().nonnegative(),
});
export type ApiEndpointStat = z.infer<typeof apiEndpointStatSchema>;

export const apiStatusBucketSchema = z.object({
  /** ISO minute start. */
  at: isoDateTimeSchema,
  count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
});
export type ApiStatusBucket = z.infer<typeof apiStatusBucketSchema>;

export const apiMonitoringSchema = z.object({
  windowStartedAt: isoDateTimeSchema,
  windowEndedAt: isoDateTimeSchema,
  totalRequests: z.number().int().nonnegative(),
  totalErrors: z.number().int().nonnegative(),
  errorRatePct: z.number().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  statusCodes: z.array(z.object({ code: z.number().int(), count: z.number().int().nonnegative() })),
  endpoints: z.array(apiEndpointStatSchema),
  slowest: z.array(apiEndpointStatSchema),
  /** Time-based analysis — one bucket per minute (§9). */
  buckets: z.array(apiStatusBucketSchema),
  rateLimitedTotal: z.number().int().nonnegative(),
});
export type ApiMonitoring = z.infer<typeof apiMonitoringSchema>;

// ── System health rows (§5) / database (§10) ─────────────────────────────────

export const healthRowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: monitoringStatusSchema,
  metrics: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })),
  evidence: z.string().min(1),
});
export type HealthRow = z.infer<typeof healthRowSchema>;

export const databaseMonitoringSchema = z.object({
  kind: z.string().min(1),
  status: monitoringStatusSchema,
  entities: z.array(z.object({ label: z.string().min(1), count: z.number().int().nonnegative() })),
  readOps: z.number().int().nonnegative(),
  writeOps: z.number().int().nonnegative(),
  failedQueries: z.number().int().nonnegative(),
  avgReadMs: z.number().nonnegative(),
  slowQueries: z.number().int().nonnegative(),
  /** What the demo build cannot observe — stated, not faked (§10). */
  unavailable: z.array(z.string().min(1)),
});
export type DatabaseMonitoring = z.infer<typeof databaseMonitoringSchema>;

// ── Queues & jobs (§11) ──────────────────────────────────────────────────────

export const jobScheduleKindSchema = z.enum(["ON_DEMAND", "PERIODIC"]);
export type JobScheduleKind = z.infer<typeof jobScheduleKindSchema>;

export const jobRunStatusSchema = z.enum(["RUNNING", "SUCCESS", "FAILED"]);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

export const jobRunSchema = z.object({
  id: uuidSchema,
  jobId: z.string().min(1),
  startedAt: isoDateTimeSchema,
  durationMs: z.number().int().nonnegative().nullable(),
  status: jobRunStatusSchema,
  attempts: z.number().int().positive(),
  /** Sanitized, secret-free (§19). */
  error: z.string().nullable(),
  trigger: z.enum(["SEED", "SYSTEM", "MANUAL"]),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const jobStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  queue: z.string().min(1),
  schedule: jobScheduleKindSchema,
  description: z.string().min(1),
  /** Whether the demo build can run it on demand (others stay honest). */
  manualRunnable: z.boolean(),
  lastRun: jobRunSchema.nullable(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  avgDurationMs: z.number().nullable(),
  /** RUNNING for longer than this is presented as stuck (§11). */
  stuck: z.boolean(),
});
export type JobStatus = z.infer<typeof jobStatusSchema>;

// ── Notifications (§12) ──────────────────────────────────────────────────────

export const notificationChannelSchema = z.enum(["IN_APP", "EMAIL", "PUSH"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationChannelStatusSchema = z.object({
  channel: notificationChannelSchema,
  status: monitoringStatusSchema,
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  evidence: z.string().min(1),
});
export type NotificationChannelStatus = z.infer<typeof notificationChannelStatusSchema>;

export const notificationDeliverySchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  channel: notificationChannelSchema,
  title: z.string().min(1),
  status: z.enum(["SENT", "QUEUED", "FAILED", "RETRYING"]),
});
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;

// ── Market data (§6) + WebSockets (§8) — client-observed shapes ─────────────

export const marketSymbolStatusSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().nullable(),
  /** Feed origin label — REAL or SIM, displayed honestly. */
  source: z.string().min(1),
  lastTickAt: isoDateTimeSchema.nullable(),
  ageMs: z.number().nullable(),
  freshness: freshnessSchema,
});
export type MarketSymbolStatus = z.infer<typeof marketSymbolStatusSchema>;

export const marketFeedStatusSchema = z.object({
  phase: z.enum(["connecting", "live", "reconnecting", "offline", "unknown"]),
  transport: z.enum(["socket", "polling", "none", "unknown"]),
  symbols: z.array(marketSymbolStatusSchema),
  thresholds: freshnessThresholdsSchema,
  observedAt: isoDateTimeSchema,
});
export type MarketFeedStatus = z.infer<typeof marketFeedStatusSchema>;

export const websocketStatusSchema = z.object({
  connected: z.boolean().nullable(),
  phase: z.enum(["connecting", "live", "reconnecting", "offline", "unknown"]),
  transport: z.enum(["socket", "polling", "none", "unknown"]),
  reconnectAttempts: z.number().int().nonnegative(),
  droppedConnections: z.number().int().nonnegative(),
  lastMessageAgeMs: z.number().nullable(),
  /** Round-trip measured on the polling fallback, when active. */
  lastPollRttMs: z.number().nullable(),
  subscriptions: z.number().int().nonnegative(),
});
export type WebsocketStatus = z.infer<typeof websocketStatusSchema>;

// ── Broker connections (§7) ──────────────────────────────────────────────────

export const brokerConnectionStatusSchema = z.enum([
  "CONNECTED",
  "CONNECTING",
  "DEGRADED",
  "DISCONNECTED",
  "AUTH_FAILED",
]);
export type BrokerConnectionStatus = z.infer<typeof brokerConnectionStatusSchema>;

export const brokerConnectionSchema = z.object({
  providerId: z.string().min(1),
  broker: z.string().min(1),
  accountIdentifier: z.string().min(1),
  accountType: z.string().min(1),
  status: brokerConnectionStatusSchema,
  lastSyncAt: isoDateTimeSchema.nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  authState: z.string().min(1),
  syncErrors: z.number().int().nonnegative(),
  /** Sync surfaces the adapter actually reports — "not reported" otherwise. */
  positionsSync: z.string().min(1),
  ordersSync: z.string().min(1),
  executionSync: z.string().min(1),
  readOnly: z.boolean(),
});
export type BrokerConnection = z.infer<typeof brokerConnectionSchema>;

// ── Integration health (§13) ─────────────────────────────────────────────────

export const integrationHealthSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  status: integrationStatusSchema,
  lastSuccessfulSyncAt: isoDateTimeSchema.nullable(),
  lastFailedSyncAt: isoDateTimeSchema.nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  errorCount: z.number().int().nonnegative(),
  providerStatus: z.string().min(1),
  credentialStatus: z.string().min(1),
});
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

// ── Overview aggregate (§4) + responses ──────────────────────────────────────

export const monitoringOverviewSchema = z.object({
  generatedAt: isoDateTimeSchema,
  /** Session start — the observation window for every counter. */
  windowStartedAt: isoDateTimeSchema,
  overall: monitoringStatusSchema,
  overallEvidence: z.string().min(1),
  components: z.array(componentStatusSchema),
  counts: z.object({
    operational: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    down: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  openAlerts: z.number().int().nonnegative(),
  activeIncidents: z.number().int().nonnegative(),
});
export type MonitoringOverview = z.infer<typeof monitoringOverviewSchema>;

export const systemHealthResponseSchema = z.object({
  rows: z.array(healthRowSchema),
  sessionUptimeMs: z.number().int().nonnegative(),
});
export type SystemHealthResponse = z.infer<typeof systemHealthResponseSchema>;

export const monitoringOverviewResponseSchema = z.object({
  overview: monitoringOverviewSchema,
  health: systemHealthResponseSchema,
  api: apiMonitoringSchema,
  database: databaseMonitoringSchema,
  jobs: z.array(jobStatusSchema),
  notifications: z.object({
    channels: z.array(notificationChannelStatusSchema),
    recent: z.array(notificationDeliverySchema),
  }),
  brokers: z.array(brokerConnectionSchema),
  integrations: z.array(integrationHealthSchema),
  events: z.array(systemEventSchema),
  integrationEvents: z.array(integrationEventSchema),
  alerts: z.array(raisedAlertSchema),
  incidents: z.array(incidentSchema),
  thresholds: monitoringThresholdsSchema,
});
export type MonitoringOverviewResponse = z.infer<typeof monitoringOverviewResponseSchema>;

export const monitoringThresholdsUpdateInputSchema = z.object({
  freshness: freshnessThresholdsSchema.partial().optional(),
  rules: z
    .array(
      z.object({
        id: alertRuleIdSchema,
        enabled: z.boolean().optional(),
        /** Custom numeric knob (p95 ms, error-rate %…) — null clears it. */
        thresholdValue: z.number().nullable().optional(),
      }),
    )
    .optional(),
});
export type MonitoringThresholdsUpdateInput = z.infer<
  typeof monitoringThresholdsUpdateInputSchema
>;

export const monitoringJobRunResponseSchema = z.object({
  accepted: z.boolean(),
  run: jobRunSchema.nullable(),
  message: z.string().min(1),
});
export type MonitoringJobRunResponse = z.infer<typeof monitoringJobRunResponseSchema>;
