import { z } from "zod";
import { impactSchema } from "../enums";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Integration Hub — the platform layer connecting Cosmoz to external
 * trading, market-data, economic-data, news, notification and productivity
 * services.
 *
 * Design rules (MASTER PROMPT §3–§31):
 * - Data categories stay CONCEPTUALLY SEPARATE: trading-account data (source
 *   of truth for positions/executions) ≠ market data ≠ economic data ≠ news.
 * - Providers are abstracted: Provider interface → Adapter → Normalization
 *   → application domain. The domain never depends on one provider's wire
 *   format.
 * - Secrets NEVER travel to the frontend: only vault references and masked
 *   hints.
 * - Permissions are explicit and READ-ONLY in this phase.
 * - Licensing is a first-class field: an unverified provider cannot be
 *   connected (§29).
 */

// ── Statuses (§5) ────────────────────────────────────────────────────────────

export const integrationStatusSchema = z.enum([
  "CONNECTED",
  "SYNCING",
  "DEGRADED",
  "DISCONNECTED",
  "AUTH_REQUIRED",
  "ERROR",
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationAuthStateSchema = z.enum(["OK", "MISSING", "EXPIRED"]);
export type IntegrationAuthState = z.infer<typeof integrationAuthStateSchema>;

export const integrationErrorCodeSchema = z.enum([
  "AUTH_FAILED",
  "RATE_LIMITED",
  "PROVIDER_OUTAGE",
  "MALFORMED_RESPONSE",
  "TIMEOUT",
  "PARTIAL_SYNC",
  "CREDENTIALS_EXPIRED",
  "DUPLICATE_EVENT",
]);
export type IntegrationErrorCode = z.infer<typeof integrationErrorCodeSchema>;

// ── Kinds & permissions (§3, §19) ────────────────────────────────────────────

export const integrationKindSchema = z.enum([
  "BROKER",
  "EXCHANGE",
  "MARKET_DATA",
  "ECONOMIC",
  "NEWS",
  "CHARTING",
  "NOTIFICATION",
  "EXTERNAL",
]);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

export const integrationPermissionSchema = z.enum([
  "READ_ACCOUNT",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_EXECUTIONS",
  "READ_MARKET_DATA",
  "READ_ECONOMIC_DATA",
  "READ_NEWS",
  "WEBHOOK_INBOUND",
]);
export type IntegrationPermission = z.infer<typeof integrationPermissionSchema>;

// ── Credentials as the vault sees them (§18 — never the secret) ─────────────

export const integrationCredentialsViewSchema = z.object({
  /** Reference into the Security vault — never the secret itself. */
  vaultRef: z.string().min(1),
  /** Human-safe masked hint, e.g. "••••4f2a". */
  maskedHint: z.string().min(1),
  expiresAt: isoDateTimeSchema.nullable(),
  lastRotatedAt: isoDateTimeSchema.nullable(),
});
export type IntegrationCredentialsView = z.infer<
  typeof integrationCredentialsViewSchema
>;

// ── Synchronization state (§13) ──────────────────────────────────────────────

export const integrationSyncStateSchema = z.object({
  lastAttemptedAt: isoDateTimeSchema.nullable(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  lastDurationMs: z.number().int().nonnegative().nullable(),
  recordsProcessed: z.number().int().nonnegative(),
  recordsFailed: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  /** Incremental-sync cursor (opaque, provider-defined). */
  cursor: z.string().nullable(),
  nextRetryAt: isoDateTimeSchema.nullable(),
});
export type IntegrationSyncState = z.infer<typeof integrationSyncStateSchema>;

// ── Errors (§15 — logged, observable, actionable, safe) ─────────────────────

export const integrationErrorSchema = z.object({
  id: uuidSchema,
  providerId: z.string().min(1),
  occurredAt: isoDateTimeSchema,
  code: integrationErrorCodeSchema,
  /** Sanitized message — no secrets, no raw provider tokens. */
  message: z.string().min(1),
  retryable: z.boolean(),
  /** What the user should do about it. */
  actionHint: z.string().min(1),
  retryAfterMs: z.number().int().nonnegative().nullable(),
});
export type IntegrationError = z.infer<typeof integrationErrorSchema>;

// ── Event log (§24 audit trail) ──────────────────────────────────────────────

export const integrationEventTypeSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "TEST_OK",
  "TEST_FAILED",
  "SYNCED",
  "SYNC_FAILED",
  "DEGRADED",
  "RECOVERED",
  "CREDENTIAL_ROTATED",
  "WEBHOOK_RECEIVED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_DUPLICATE",
]);
export type IntegrationEventType = z.infer<typeof integrationEventTypeSchema>;

export const integrationEventSchema = z.object({
  id: uuidSchema,
  occurredAt: isoDateTimeSchema,
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  type: integrationEventTypeSchema,
  message: z.string().min(1),
});
export type IntegrationEvent = z.infer<typeof integrationEventSchema>;

// ── Licensing (§29 — verified before implementation) ────────────────────────

export const integrationLicensingSchema = z.object({
  verified: z.boolean(),
  note: z.string().min(1),
});
export type IntegrationLicensing = z.infer<typeof integrationLicensingSchema>;

// ── Market-data capabilities (§8 — providers differ, honestly declared) ─────

export const marketDataCapabilitiesSchema = z.object({
  tick: z.boolean(),
  ohlc: z.boolean(),
  volume: z.boolean(),
  spread: z.boolean(),
  sessions: z.boolean(),
});
export type MarketDataCapabilities = z.infer<
  typeof marketDataCapabilitiesSchema
>;

// ── Provider (the registry entry the Hub renders) ────────────────────────────

export const integrationProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: integrationKindSchema,
  tagline: z.string().min(1),
  description: z.string().min(1),
  docsUrl: z.string().min(1).nullable(),
  capabilities: z.array(integrationPermissionSchema),
  /** Market-data providers only — null otherwise. */
  marketData: marketDataCapabilitiesSchema.nullable(),
  licensing: integrationLicensingSchema,
  status: integrationStatusSchema,
  authState: integrationAuthStateSchema,
  latencyMs: z.number().int().nonnegative().nullable(),
  sync: integrationSyncStateSchema,
  credentials: integrationCredentialsViewSchema.nullable(),
  connectedAt: isoDateTimeSchema.nullable(),
  readOnly: z.boolean(),
});
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

// ── Normalized trading account (§6 — numbers only when the adapter gives
//    them; never invented. Money stays decimal-as-string.) ───────────────────

export const tradingAccountViewSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  accountIdentifier: z.string().min(1),
  accountType: z.string().min(1),
  currency: z.string().length(3),
  balance: z.string().nullable(),
  equity: z.string().nullable(),
  positionsOpen: z.number().int().nonnegative().nullable(),
  permissions: z.array(integrationPermissionSchema),
  lastSyncAt: isoDateTimeSchema.nullable(),
  readOnly: z.boolean(),
});
export type TradingAccountView = z.infer<typeof tradingAccountViewSchema>;

// ── Normalized economic event with provenance (§9, §22) ─────────────────────

export const integrationEcoEventSchema = z.object({
  id: uuidSchema,
  /** Idempotency key — `${providerId}:${providerEventId}` (§14). */
  providerKey: z.string().min(1),
  providerId: z.string().min(1),
  title: z.string().min(1),
  country: z.string().min(2).max(56),
  currency: z.string().length(3),
  impact: impactSchema,
  scheduledAt: isoDateTimeSchema,
  previous: z.string().nullable(),
  forecast: z.string().nullable(),
  actual: z.string().nullable(),
  status: z.enum(["SCHEDULED", "RELEASED", "UPDATED"]),
});
export type IntegrationEcoEvent = z.infer<typeof integrationEcoEventSchema>;

// ── News items (§10 — separate from economic data, license-aware) ───────────

export const newsCategorySchema = z.enum([
  "FOREX",
  "GOLD",
  "CRYPTO",
  "INDICES",
  "CENTRAL_BANKS",
  "MACRO",
  "EQUITIES",
]);
export type NewsCategory = z.infer<typeof newsCategorySchema>;

export const newsItemSchema = z.object({
  id: uuidSchema,
  providerKey: z.string().min(1),
  headline: z.string().min(1),
  source: z.string().min(1),
  category: newsCategorySchema,
  publishedAt: isoDateTimeSchema,
  relatedSymbols: z.array(z.string().min(1)),
  relatedCurrencies: z.array(z.string().length(3)),
  /** Provider importance 1–3 (3 = highest). */
  importance: z.number().int().min(1).max(3),
  url: z.string().min(1),
  /** True for the development sample set — never redistributed content. */
  sample: z.boolean(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

// ── Webhooks (§12 — authenticated, replay-safe, idempotent) ──────────────────

export const webhookDeliverySchema = z.object({
  id: uuidSchema,
  receivedAt: isoDateTimeSchema,
  eventType: z.string().min(1),
  signatureValid: z.boolean(),
  accepted: z.boolean(),
  duplicate: z.boolean(),
  message: z.string().min(1),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookEndpointSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  /** Path-only URL — inbound webhooks land on the API base. */
  path: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED"]),
  /** Masked signing-secret hint — the secret itself lives in the vault. */
  secretMaskedHint: z.string().min(1),
  deliveries: z.array(webhookDeliverySchema),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

// ── Retention (§28) ──────────────────────────────────────────────────────────

export const retentionPolicySchema = z.object({
  marketDataDays: z.number().int().positive(),
  newsDays: z.number().int().positive(),
  economicHistoryDays: z.number().int().positive(),
  syncLogsDays: z.number().int().positive(),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// ── API responses ────────────────────────────────────────────────────────────

export const integrationsSummarySchema = z.object({
  connected: z.number().int().nonnegative(),
  syncing: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  disconnected: z.number().int().nonnegative(),
  authRequired: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
});
export type IntegrationsSummary = z.infer<typeof integrationsSummarySchema>;

export const integrationsOverviewResponseSchema = z.object({
  summary: integrationsSummarySchema,
  providers: z.array(integrationProviderSchema),
  accounts: z.array(tradingAccountViewSchema),
  ecoEvents: z.array(integrationEcoEventSchema),
  news: z.array(newsItemSchema),
  webhooks: z.array(webhookEndpointSchema),
  events: z.array(integrationEventSchema),
  errors: z.array(integrationErrorSchema),
  retention: retentionPolicySchema,
});
export type IntegrationsOverviewResponse = z.infer<
  typeof integrationsOverviewResponseSchema
>;

// ── Actions (§25–§27) ────────────────────────────────────────────────────────

/** Connect payload — a vault REFERENCE, never the secret material. */
export const integrationConnectInputSchema = z.object({
  vaultRef: z
    .string()
    .regex(/^vault:\/\/[\w-]+\/[\w-]+$/, "Expected vault://<box>/<key>"),
});
export type IntegrationConnectInput = z.infer<
  typeof integrationConnectInputSchema
>;

export const integrationTestResponseSchema = z.object({
  ok: z.boolean(),
  checks: z.array(
    z.object({
      name: z.enum(["authentication", "permissions", "connectivity", "providerResponse"]),
      ok: z.boolean(),
      detail: z.string().min(1),
    }),
  ),
});
export type IntegrationTestResponse = z.infer<
  typeof integrationTestResponseSchema
>;

export const integrationSyncResponseSchema = z.object({
  providerId: z.string().min(1),
  status: integrationStatusSchema,
  sync: integrationSyncStateSchema,
});
export type IntegrationSyncResponse = z.infer<
  typeof integrationSyncResponseSchema
>;

export const integrationDisconnectResponseSchema = z.object({
  providerId: z.string().min(1),
  status: integrationStatusSchema,
  /** Reassurance per §26: synced history is never deleted. */
  historyPreserved: z.literal(true),
});
export type IntegrationDisconnectResponse = z.infer<
  typeof integrationDisconnectResponseSchema
>;

/**
 * Inbound webhook PIPELINE TEST (§12, §32). The real inbound path verifies an
 * HMAC signature computed by the PROVIDER — the signing secret never reaches
 * the client. This simulate endpoint stands in for the provider: the engine
 * signs internally, then runs the full verification pipeline (timestamp
 * freshness → signature → idempotency). `mode` corrupts exactly one step so
 * each rejection path is demonstrable and testable.
 */
export const webhookSimulateInputSchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  /** "replay" reuses the previous accepted eventId → duplicate rejection. */
  mode: z.enum(["valid", "bad-signature", "stale-timestamp", "replay"]).default("valid"),
});
export type WebhookSimulateInput = z.infer<typeof webhookSimulateInputSchema>;

export const webhookDeliverResponseSchema = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  signatureValid: z.boolean(),
  message: z.string().min(1),
});
export type WebhookDeliverResponse = z.infer<typeof webhookDeliverResponseSchema>;
