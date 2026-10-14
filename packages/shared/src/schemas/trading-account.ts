import { z } from "zod";

import {
  accountTypeSchema,
  brokerSchema,
  currencySchema,
  directionSchema,
} from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";
import {
  brokerOrderSchema,
  brokerPositionSchema,
} from "./broker";
import { propFirmConfigSchema } from "./account";

/**
 * Accounts / Trading Connectivity contract (Phase 3) — READ-ONLY by design.
 *
 * Concepts kept STRICTLY separate (Phase 3 mandate §3):
 *   Application identity  ≠ Trading account identity
 *                          ≠ Trading connection credentials
 *                          ≠ Trading account snapshot
 *
 * Lifecycle separation (§15): connection status (can Cosmoz authenticate
 * with the provider?) is a DIFFERENT axis from synchronization status
 * (how fresh is the persisted external state?). They are never merged.
 *
 * Execution red line (§47): there is intentionally NO schema and NO endpoint
 * for order placement / modification / position closing. The provider
 * interface itself is read-oriented; V1 permissions are READ_* only.
 */

// ── Lifecycle enums ──────────────────────────────────────────────────────────

/**
 * Connection lifecycle — "can Cosmoz talk to the provider right now?".
 * (The pre-existing `connectionStatusSchema` in enums.ts belongs to the
 * journal domain and merges SYNCING into connection; that conflation is
 * exactly what the Phase 3 mandate §15 forbids for this context, so the
 * trading connectivity contract declares its own orthogonal enums.)
 */
export const tradingConnectionStatusSchema = z.enum([
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "ERROR",
]);
export type TradingConnectionStatus = z.infer<typeof tradingConnectionStatusSchema>;

/**
 * Synchronization lifecycle — "how fresh is the persisted external state?".
 * DELAYED is reserved for future per-object freshness granularity.
 */
export const synchronizationStatusSchema = z.enum([
  "UNKNOWN",
  "SYNCING",
  "LIVE",
  "DELAYED",
  "STALE",
  "ERROR",
]);
export type SynchronizationStatus = z.infer<typeof synchronizationStatusSchema>;

/** One synchronization attempt over one account.
 * PARTIAL (Phase 03): ≥1 supported segment succeeded AND ≥1 failed — the
 * segment-level semantics live in the sync domain (doc B §8.2); the wire
 * carries the final status only. */
export const tradingSyncRunStatusSchema = z.enum([
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  /** Phase 05: a run left RUNNING by a crashed/restarted process — marked
   * during the stale-run recovery sweep so the per-account single-RUNNING
   * invariant (partial unique index) unblocks without human intervention. */
  "CANCELLED",
]);
export type TradingSyncRunStatus = z.infer<typeof tradingSyncRunStatusSchema>;

/** What started the run. SCHEDULED (Phase 05) = the background scheduler's
 * periodic refresh of an eligible connection. */
export const tradingSyncTriggerSchema = z.enum(["INITIAL", "MANUAL", "SCHEDULED"]);
export type TradingSyncTrigger = z.infer<typeof tradingSyncTriggerSchema>;

// ── Connection methods / permissions ─────────────────────────────────────────

/**
 * How Cosmoz authenticates with a provider. V1 implements API_KEY only —
 * the domain is extensible (OAUTH / BROKER_API / PLATFORM_BRIDGE / …) but
 * no method is declared before an actual provider requires it (§12).
 */
export const tradingConnectionMethodSchema = z.enum(["API_KEY"]);
export type TradingConnectionMethod = z.infer<typeof tradingConnectionMethodSchema>;

/** V1 provider permissions — READ-ONLY. Execution permissions are never declared. */
export const tradingProviderPermissionSchema = z.enum([
  "READ_ACCOUNT",
  "READ_BALANCE",
  "READ_EQUITY",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_DEALS",
  "READ_HISTORY",
]);
export type TradingProviderPermission = z.infer<typeof tradingProviderPermissionSchema>;

/** Explicit provider capabilities (§45) — adapters declare what they support.
 * V1 (6 booleans) remains the shape of adapters that have not migrated yet;
 * helpers below read BOTH shapes during the per-adapter migration
 * (adapters migrate one by one — doc B §4.2). */
export const tradingProviderCapabilitiesSchema = z.object({
  account: z.boolean(),
  snapshot: z.boolean(),
  positions: z.boolean(),
  orders: z.boolean(),
  deals: z.boolean(),
  history: z.boolean(),
});
export type TradingProviderCapabilities = z.infer<typeof tradingProviderCapabilitiesSchema>;

// ── Capability model V2 (Phase 03 — frozen design doc B §4.2) ───────────────

/** Three-state support level. UNKNOWN is never coerced to true or false
 * (doc A §4.4) — it blocks the corresponding operation path with an honest
 * error until evidence resolves it. */
export const capabilitySupportSchema = z.enum(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
export type CapabilitySupport = z.infer<typeof capabilitySupportSchema>;

/** One capability declaration — support level plus honest metadata. */
export const providerCapabilitySchema = z.object({
  support: capabilitySupportSchema,
  /** How the capability is exercised, when SUPPORTED. */
  retrieval: z.enum(["POLL", "STREAM", "POLL_AND_STREAM", "ON_CONNECT"]).optional(),
  /** Required connection-level permissions, e.g. ["READ_POSITIONS"]. */
  requiresPermissions: z.array(z.string()).optional(),
  /** Evidence anchor: official docs section or Phase 00 audit reference. */
  evidence: z.string().optional(),
  /** Honest limitation text shown by the UI when relevant. */
  limitation: z.string().optional(),
});
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

/**
 * Capability V2 — replaces the 6 booleans for adapters that consume it.
 * The 13 keys are the domain's capability vocabulary: sync segments gate on
 * balanceEquity / openPositions / orders / deals; the rest is metadata the
 * UI may render honestly. TEMPORARILY_UNAVAILABLE is an operational state
 * on the SYNC axis and deliberately has NO entry here (doc B §4.2).
 */
export const tradingProviderCapabilitiesV2Schema = z.object({
  accountDiscovery: providerCapabilitySchema,
  accountMetadata: providerCapabilitySchema,
  balanceEquity: providerCapabilitySchema,
  marginInfo: providerCapabilitySchema,
  openPositions: providerCapabilitySchema,
  orders: providerCapabilitySchema,
  deals: providerCapabilitySchema,
  /** Historical records scope (depth/breadth) — distinct from the deals feed. */
  historyDepth: providerCapabilitySchema,
  streamingAccountUpdates: providerCapabilitySchema,
  streamingPositions: providerCapabilitySchema,
  streamingOrderDealUpdates: providerCapabilitySchema,
  connectionValidation: providerCapabilitySchema,
  credentialRevocation: providerCapabilitySchema,
});
export type TradingProviderCapabilitiesV2 = z.infer<typeof tradingProviderCapabilitiesV2Schema>;

/** All V2 capability keys, in declaration order — enforcement iterates these. */
export const CAPABILITY_KEYS = Object.keys(
  tradingProviderCapabilitiesV2Schema.shape,
) as Array<keyof TradingProviderCapabilitiesV2>;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/**
 * Connection-scoped (NOT global) capability override — conditions like
 * region, subscription, or account permissions attach HERE, per mandate §9.3.
 * The schema lands in Phase 03 with the enforcement path; the first
 * connection-scoped producer arrives when a real provider restriction
 * justifies one (no speculative storage — mandate §8.10).
 */
export const connectionCapabilityOverrideSchema = z.object({
  capability: z.enum(CAPABILITY_KEYS as [CapabilityKey, ...CapabilityKey[]]),
  support: capabilitySupportSchema,
  /** Why this connection differs from the global declaration. */
  reason: z.string().min(1),
});
export type ConnectionCapabilityOverride = z.infer<typeof connectionCapabilityOverrideSchema>;

/** The descriptor accepts either capabilities shape during the migration. */
export const tradingProviderCapabilitiesAnySchema = z.union([
  tradingProviderCapabilitiesV2Schema,
  tradingProviderCapabilitiesSchema,
]);
export type TradingProviderCapabilitiesAny = z.infer<typeof tradingProviderCapabilitiesAnySchema>;

/** Type guard — true when the descriptor declares the V2 shape. */
export function isCapabilitiesV2(
  capabilities: TradingProviderCapabilitiesAny,
): capabilities is TradingProviderCapabilitiesV2 {
  return "balanceEquity" in capabilities;
}

/**
 * Read one capability's support level from EITHER shape (migration bridge).
 * V1 booleans map to SUPPORTED/UNSUPPORTED — V1 cannot express UNKNOWN, so
 * a V1 descriptor answers UNKNOWN for any key outside its 6 booleans.
 */
export function capabilitySupportLevel(
  capabilities: TradingProviderCapabilitiesAny,
  key: CapabilityKey,
): CapabilitySupport {
  if (isCapabilitiesV2(capabilities)) return capabilities[key].support;
  const v1 = capabilities as TradingProviderCapabilities;
  switch (key) {
    case "accountMetadata":
      return v1.account ? "SUPPORTED" : "UNSUPPORTED";
    case "balanceEquity":
      return v1.snapshot ? "SUPPORTED" : "UNSUPPORTED";
    case "openPositions":
      return v1.positions ? "SUPPORTED" : "UNSUPPORTED";
    case "orders":
      return v1.orders ? "SUPPORTED" : "UNSUPPORTED";
    case "deals":
      return v1.deals ? "SUPPORTED" : "UNSUPPORTED";
    case "historyDepth":
      return v1.history ? "SUPPORTED" : "UNSUPPORTED";
    default:
      // accountDiscovery / marginInfo / streaming* / connectionValidation /
      // credentialRevocation have no V1 equivalent — honest UNKNOWN.
      return "UNKNOWN";
  }
}

/** Provider registry descriptor (§44) — metadata only, no secrets. */
export const tradingProviderDescriptorSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  /** Platform family, expressed as a Cosmoz broker enum value. */
  platform: brokerSchema,
  supportedEnvironments: z.array(accountTypeSchema).min(1),
  supportedConnectionMethods: z.array(tradingConnectionMethodSchema).min(1),
  supportedPermissions: z.array(tradingProviderPermissionSchema),
  capabilities: tradingProviderCapabilitiesAnySchema,
  /** Mock providers are visibly labeled and gated per environment (§57). */
  isMock: z.boolean(),
});
export type TradingProviderDescriptor = z.infer<typeof tradingProviderDescriptorSchema>;

export const tradingProviderListResponseSchema = z.object({
  providers: z.array(tradingProviderDescriptorSchema),
});
export type TradingProviderListResponse = z.infer<typeof tradingProviderListResponseSchema>;

// ── Connect / reconnect inputs ───────────────────────────────────────────────

/**
 * Credentials payload. V1: API key secret, transported over TLS, encrypted
 * at rest (AES-256-GCM), never returned by any endpoint, never logged (§22).
 */
export const tradingCredentialsInputSchema = z.object({
  method: tradingConnectionMethodSchema,
  secret: z.string().trim().min(1).max(512),
});
export type TradingCredentialsInput = z.infer<typeof tradingCredentialsInputSchema>;

/**
 * Connect a trading account: registers the account AND its connection in
 * one operation (V1 connect = test → retrieve metadata → persist → initial
 * synchronization). Environment (DEMO/LIVE/PROP_FIRM) is explicit — never
 * inferred from naming (§21).
 */
export const tradingAccountConnectInputSchema = z.object({
  providerId: z.string().trim().min(1).max(64),
  environment: accountTypeSchema,
  /** Provider-side account identifier (e.g. MT5 login number). */
  externalAccountId: z.string().trim().min(1).max(64),
  /** Optional human label; defaults to "<provider> <environment>". */
  displayName: z.string().trim().min(1).max(64).optional(),
  credentials: tradingCredentialsInputSchema,
});
export type TradingAccountConnectInput = z.infer<typeof tradingAccountConnectInputSchema>;

/** Reconnect an existing account with fresh credentials. */
export const tradingReconnectInputSchema = z.object({
  credentials: tradingCredentialsInputSchema,
});
export type TradingReconnectInput = z.infer<typeof tradingReconnectInputSchema>;

// ── Broker identification (Phase 07 — universal broker layer) ────────────────

/**
 * HOW a broker was identified — honest confidence ladder (strongest first):
 *  PROVIDER_REPORTED: the provider's own response stated the broker identity
 *    (e.g. Deriv `landing_company_name`). Strongest evidence.
 *  PATTERN_MATCH: the external account id / endpoint matched a documented
 *    catalog pattern (e.g. OANDA "101-004-…" id format).
 *  PLATFORM_KNOWN: only the provider/platform is known (from the registry
 *    descriptor); the broker entity behind it is NOT claimed.
 *  UNKNOWN: nothing could be identified — never fabricated.
 */
export const brokerIdentificationConfidenceSchema = z.enum([
  "PROVIDER_REPORTED",
  "PATTERN_MATCH",
  "PLATFORM_KNOWN",
  "UNKNOWN",
]);
export type BrokerIdentificationConfidence = z.infer<typeof brokerIdentificationConfidenceSchema>;

/** Whether (and how) this broker can be connected through Euforia today. */
export const brokerConnectorStatusSchema = z.enum([
  "CONNECTOR_AVAILABLE",
  "CONNECTOR_NOT_IMPLEMENTED",
  "MANUAL_ONLY",
]);
export type BrokerConnectorStatus = z.infer<typeof brokerConnectorStatusSchema>;

/**
 * Connect-time broker identification (Phase 07). Produced by the broker
 * identification layer, persisted on the TradingAccount at connect time, and
 * served read-only afterwards. `signals` carries the exact evidence strings;
 * nothing here is ever inferred from the account NAME (user-editable label).
 */
export const brokerIdentificationSchema = z.object({
  /** Catalog slug ("oanda", "deriv", …) — "unknown" when unmatched. */
  brokerId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  platform: brokerSchema,
  confidence: brokerIdentificationConfidenceSchema,
  connectorStatus: brokerConnectorStatusSchema,
  /** Registry providerId when a connector exists, else null. */
  providerId: z.string().max(64).nullable(),
  /** Human-readable evidence strings (no secrets, no raw payloads). */
  signals: z.array(z.string().min(1).max(256)).max(16),
  identifiedAt: isoDateTimeSchema,
});
export type BrokerIdentification = z.infer<typeof brokerIdentificationSchema>;

/** One catalog entry — identity metadata ONLY, no capability claims. */
export const brokerCatalogEntrySchema = z.object({
  brokerId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  /** Platform families this broker operates on (Cosmoz broker vocabulary). */
  platforms: z.array(brokerSchema).min(1),
  connectorStatus: brokerConnectorStatusSchema,
  providerId: z.string().max(64).nullable(),
  /** Well-known aliases used by identification (display only). */
  aliases: z.array(z.string().min(1).max(64)).max(8),
  /** Honest one-line note (e.g. why no connector exists yet). */
  notes: z.string().max(256),
});
export type BrokerCatalogEntry = z.infer<typeof brokerCatalogEntrySchema>;

/**
 * The broker catalog (Phase 07): the universal "any broker" registry.
 * `catalogVersion` identifies the catalog snapshot that served the response —
 * connect-time identifications reference the version that produced them.
 */
export const brokerCatalogResponseSchema = z.object({
  catalogVersion: z.string().min(1).max(32),
  brokers: z.array(brokerCatalogEntrySchema),
});
export type BrokerCatalogResponse = z.infer<typeof brokerCatalogResponseSchema>;

/**
 * Identification hints (POST /trading-accounts/brokers/identify). No secrets
 * are accepted — identification is rule-based, makes NO outbound call, and
 * never uses the values beyond catalog matching (SSRF-safe by construction).
 */
export const brokerIdentifyInputSchema = z
  .object({
    providerId: z.string().trim().min(1).max(64).optional(),
    externalAccountId: z.string().trim().min(1).max(64).optional(),
    /** Provider endpoint/server hint (host or server name) — matched, never dialed. */
    endpoint: z.string().trim().min(1).max(253).optional(),
    environment: accountTypeSchema.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "At least one identification hint is required",
  });
export type BrokerIdentifyInput = z.infer<typeof brokerIdentifyInputSchema>;

export const brokerIdentifyResponseSchema = z.object({
  identification: brokerIdentificationSchema,
});
export type BrokerIdentifyResponse = z.infer<typeof brokerIdentifyResponseSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

/**
 * Connection view — NO credentials, only a masked hint (last characters)
 * suitable for display. `lastError` is sanitized, credential-free text.
 */
export const tradingConnectionViewSchema = z.object({
  status: tradingConnectionStatusSchema,
  method: tradingConnectionMethodSchema,
  permissions: z.array(tradingProviderPermissionSchema),
  credentialsHint: z.string(),
  lastConnectedAt: isoDateTimeSchema.nullable(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
});
export type TradingConnectionView = z.infer<typeof tradingConnectionViewSchema>;

/** One synchronization run — observability record (§50). The per-segment
 * timestamps (Phase 05) are the per-RESOURCE freshness anchor: a non-null
 * timestamp = that segment ran and persisted during THIS run (null = failed
 * or capability-skipped). They extend the run view additively. */
export const tradingSyncRunViewSchema = z.object({
  id: uuidSchema,
  status: tradingSyncRunStatusSchema,
  trigger: tradingSyncTriggerSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  durationMs: z.number().int().nullable(),
  positionsUpserted: z.number().int(),
  ordersUpserted: z.number().int(),
  dealsUpserted: z.number().int(),
  errorCode: z.string().nullable(),
  // ── Phase 05: per-segment observation timestamps (additive, optional to
  // keep the wire compatible with the already-shipped consumers) ──
  snapshotAt: isoDateTimeSchema.nullable().optional(),
  positionsAt: isoDateTimeSchema.nullable().optional(),
  ordersAt: isoDateTimeSchema.nullable().optional(),
  dealsAt: isoDateTimeSchema.nullable().optional(),
});
export type TradingSyncRunView = z.infer<typeof tradingSyncRunViewSchema>;

/**
 * Per-RESOURCE freshness (Phase 05 §11): one timestamp does not describe
 * every synchronized resource — each segment carries its own last successful
 * refresh time. State is derived server-side from explicit rules:
 *   FRESH  ≤ freshness TTL · STALE > TTL · NEVER = no successful refresh yet.
 * Account-level failure semantics stay on the synchronization status axis.
 */
export const resourceFreshnessSchema = z.object({
  at: isoDateTimeSchema.nullable(),
  state: z.enum(["FRESH", "STALE", "NEVER"]),
});
export type ResourceFreshness = z.infer<typeof resourceFreshnessSchema>;

export const tradingResourceFreshnessSchema = z.object({
  snapshot: resourceFreshnessSchema,
  positions: resourceFreshnessSchema,
  orders: resourceFreshnessSchema,
  deals: resourceFreshnessSchema,
});
export type TradingResourceFreshness = z.infer<typeof tradingResourceFreshnessSchema>;

export const tradingSynchronizationViewSchema = z.object({
  status: synchronizationStatusSchema,
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastRun: tradingSyncRunViewSchema.nullable(),
  /** Per-resource freshness (Phase 05, additive optional). */
  resources: tradingResourceFreshnessSchema.optional(),
});
export type TradingSynchronizationView = z.infer<typeof tradingSynchronizationViewSchema>;

/** Bounded synchronization-history list (Phase 05 §16) — keyset-paginated,
 * newest first. `nextCursor` is the oldest returned run's startedAt; pass it
 * as `before` to fetch the previous page. null = end of history. */
export const tradingSyncRunsResponseSchema = z.object({
  runs: z.array(tradingSyncRunViewSchema),
  nextCursor: isoDateTimeSchema.nullable(),
});
export type TradingSyncRunsResponse = z.infer<typeof tradingSyncRunsResponseSchema>;

/** Latest account snapshot (mutable external state — §25). */
export const tradingAccountSnapshotViewSchema = z.object({
  balance: decimalStringSchema.nullable(),
  equity: decimalStringSchema.nullable(),
  unrealizedPnl: decimalStringSchema.nullable(),
  margin: decimalStringSchema.nullable(),
  freeMargin: decimalStringSchema.nullable(),
  marginLevel: decimalStringSchema.nullable(),
  currency: currencySchema,
  syncedAt: isoDateTimeSchema,
});
export type TradingAccountSnapshotView = z.infer<typeof tradingAccountSnapshotViewSchema>;

/**
 * Full account details (identity + connection + synchronization + latest
 * snapshot). Reuses the journal account identity fields so the same entity
 * feeds `GET /accounts` (journal contract) and this richer detail view.
 */
export const tradingAccountDetailsSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1),
  type: accountTypeSchema,
  broker: brokerSchema,
  currency: currencySchema,
  startingBalance: decimalStringSchema,
  isDefault: z.boolean(),
  propConfig: propFirmConfigSchema.nullable(),
  externalAccountId: z.string().min(1),
  provider: tradingProviderDescriptorSchema,
  /** Phase 07 — connect-time broker identification (absent for legacy rows). */
  brokerIdentification: brokerIdentificationSchema.nullable().optional(),
  connection: tradingConnectionViewSchema.nullable(),
  synchronization: tradingSynchronizationViewSchema,
  snapshot: tradingAccountSnapshotViewSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TradingAccountDetails = z.infer<typeof tradingAccountDetailsSchema>;

export const tradingAccountDetailsResponseSchema = z.object({
  account: tradingAccountDetailsSchema,
});
export type TradingAccountDetailsResponse = z.infer<typeof tradingAccountDetailsResponseSchema>;

// ── Operation responses ──────────────────────────────────────────────────────

/** Connection health check — named checks, honest per-check results. */
export const tradingConnectionTestResponseSchema = z.object({
  ok: z.boolean(),
  checks: z.array(
    z.object({
      name: z.enum(["authentication", "connectivity", "providerResponse", "permissions"]),
      ok: z.boolean(),
      detail: z.string(),
    }),
  ),
});
export type TradingConnectionTestResponse = z.infer<typeof tradingConnectionTestResponseSchema>;

/**
 * Disconnect ≠ delete (§52): history (positions, orders, deals, runs, the
 * journal account itself) is preserved; only the credentials are destroyed.
 */
export const tradingDisconnectResponseSchema = z.object({
  accountId: uuidSchema,
  status: z.literal("DISCONNECTED"),
  historyPreserved: z.literal(true),
});
export type TradingDisconnectResponse = z.infer<typeof tradingDisconnectResponseSchema>;

export const tradingAccountSyncResponseSchema = z.object({
  accountId: uuidSchema,
  synchronization: tradingSynchronizationViewSchema,
  run: tradingSyncRunViewSchema,
});
export type TradingAccountSyncResponse = z.infer<typeof tradingAccountSyncResponseSchema>;

// ── Normalized external state (wire shapes) ──────────────────────────────────

/**
 * Positions / orders reuse the Session-Live broker schemas verbatim — same
 * business concepts, one wire shape (§11: the rest of the application never
 * sees provider-specific types).
 */
export const tradingPositionsResponseSchema = z.object({
  positions: z.array(brokerPositionSchema),
});
export type TradingPositionsResponse = z.infer<typeof tradingPositionsResponseSchema>;

export const tradingOrdersResponseSchema = z.object({
  orders: z.array(brokerOrderSchema),
});
export type TradingOrdersResponse = z.infer<typeof tradingOrdersResponseSchema>;

/** Completed trading activity (deals), normalized (§28). Symbol is nullable: balance operations (deposits/withdrawals) have none. */
export const tradingDealSchema = z.object({
  id: uuidSchema,
  externalDealId: z.string().min(1),
  symbol: z.string().nullable(),
  side: directionSchema,
  volume: decimalStringSchema,
  price: decimalStringSchema.nullable(),
  profit: decimalStringSchema.nullable(),
  commission: decimalStringSchema.nullable(),
  swap: decimalStringSchema.nullable(),
  executedAt: isoDateTimeSchema,
});
export type TradingDeal = z.infer<typeof tradingDealSchema>;

export const tradingDealsResponseSchema = z.object({
  deals: z.array(tradingDealSchema),
});
export type TradingDealsResponse = z.infer<typeof tradingDealsResponseSchema>;

// ── Stable error codes (§36 — provider failures are normalized) ──────────────

/**
 * Stable machine codes for the accounts domain. Values surface in the
 * error envelope `code` field; raw provider messages never do.
 */
export const TRADING_ERROR_CODES = {
  /** Provider rejected the credentials (client-fixable → 422). */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** Provider unreachable / outage (→ 502). */
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  /** Provider call exceeded the configured timeout (→ 502). */
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  /** Provider cannot serve this account (e.g. unsupported account type → 502). */
  UNSUPPORTED_ACCOUNT: "UNSUPPORTED_ACCOUNT",
  /** The operation is not part of this provider's declared capabilities
   * (capability gating, Phase 03 — doc B §10: client-pickable → 422). */
  UNSUPPORTED_CAPABILITY: "UNSUPPORTED_CAPABILITY",
  /** providerId is not in the registry (client-fixable → 422). */
  UNSUPPORTED_PROVIDER: "UNSUPPORTED_PROVIDER",
  /** Provider refused access for this principal (→ 502). */
  UNAUTHORIZED_PROVIDER_ACCESS: "UNAUTHORIZED_PROVIDER_ACCESS",
  /** Synchronization could not complete (→ 502 when triggered). */
  SYNC_FAILED: "SYNC_FAILED",
  /** Provider asked us to slow down (→ 429). */
  RATE_LIMITED: "RATE_LIMITED",
  /** Provider response failed normalization/validation (→ 502). */
  INVALID_PROVIDER_RESPONSE: "INVALID_PROVIDER_RESPONSE",
  /** Account has no active connection — reconnect first (→ 422). */
  NOT_CONNECTED: "NOT_CONNECTED",
  /** A synchronization run is already running for this account (→ 409). */
  SYNC_ALREADY_RUNNING: "SYNC_ALREADY_RUNNING",
  /** The same external account is already connected by this user (→ 409). */
  DUPLICATE_ACCOUNT: "DUPLICATE_ACCOUNT",
  /** Connection already active — disconnect first (→ 409). */
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
} as const;

export type TradingErrorCode = (typeof TRADING_ERROR_CODES)[keyof typeof TRADING_ERROR_CODES];

// ── Update (PATCH /accounts/:accountId) ──────────────────────────────────────

/**
 * Journal-side edits only: the account identity (provider, environment,
 * external id, currency, starting balance) is provider-anchored and never
 * client-mutable — a rename is the one documented user edit (§21: labels
 * never impersonate the provider's own data).
 */
export const tradingAccountUpdateInputSchema = z.object({
  /** Human label; provider/environment defaults preserved when omitted. */
  name: z.string().trim().min(1).max(64).optional(),
});
export type TradingAccountUpdateInput = z.infer<typeof tradingAccountUpdateInputSchema>;
