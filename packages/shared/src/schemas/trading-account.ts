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

/** One synchronization attempt over one account. */
export const tradingSyncRunStatusSchema = z.enum([
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
]);
export type TradingSyncRunStatus = z.infer<typeof tradingSyncRunStatusSchema>;

/** What started the run. */
export const tradingSyncTriggerSchema = z.enum(["INITIAL", "MANUAL"]);
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

/** Explicit provider capabilities (§45) — adapters declare what they support. */
export const tradingProviderCapabilitiesSchema = z.object({
  account: z.boolean(),
  snapshot: z.boolean(),
  positions: z.boolean(),
  orders: z.boolean(),
  deals: z.boolean(),
  history: z.boolean(),
});
export type TradingProviderCapabilities = z.infer<typeof tradingProviderCapabilitiesSchema>;

/** Provider registry descriptor (§44) — metadata only, no secrets. */
export const tradingProviderDescriptorSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  /** Platform family, expressed as a Cosmoz broker enum value. */
  platform: brokerSchema,
  supportedEnvironments: z.array(accountTypeSchema).min(1),
  supportedConnectionMethods: z.array(tradingConnectionMethodSchema).min(1),
  supportedPermissions: z.array(tradingProviderPermissionSchema),
  capabilities: tradingProviderCapabilitiesSchema,
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

/** One synchronization run — observability record (§50). */
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
});
export type TradingSyncRunView = z.infer<typeof tradingSyncRunViewSchema>;

export const tradingSynchronizationViewSchema = z.object({
  status: synchronizationStatusSchema,
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastRun: tradingSyncRunViewSchema.nullable(),
});
export type TradingSynchronizationView = z.infer<typeof tradingSynchronizationViewSchema>;

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
