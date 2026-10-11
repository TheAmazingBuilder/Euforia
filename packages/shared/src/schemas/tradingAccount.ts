import { z } from "zod";

import {
  accountTypeSchema,
  brokerSchema,
  currencySchema,
  directionSchema,
} from "../enums";
import {
  decimalStringSchema,
  isoDateTimeSchema,
  uuidSchema,
} from "./primitives";
import { integrationPermissionSchema } from "./integration";
import { brokerOrderSchema, brokerPositionSchema } from "./broker";
import { propFirmConfigSchema } from "./account";

/**
 * Accounts module contracts — the ACCOUNT-CENTRIC view of trading
 * connectivity (prompt §27: connection status ≠ synchronization status).
 *
 * Boundary: the Integration Hub (/integrations) owns PROVIDER connections
 * (credentials vault, test/sync lifecycle per provider). Accounts owns the
 * per-TRADING-ACCOUNT state: which journal account is connected to what,
 * with which environment, permissions, snapshot and synchronized data.
 *
 * READ-ONLY invariant: no schema here models order submission, modification
 * or position closing — same red line as schemas/broker.ts.
 */

/** Connection lifecycle of one trading account (prompt §27). */
export const accountConnectionStateSchema = z.enum([
  "CONNECTED",
  "CONNECTING",
  "DISCONNECTED",
  "ERROR",
]);
export type AccountConnectionState = z.infer<typeof accountConnectionStateSchema>;

/**
 * Synchronization health of one trading account (prompt §26). LIVE must be
 * EARNED by a recent lastSyncedAt — never claimed because the account was
 * once connected.
 */
export const accountSyncStatusSchema = z.enum([
  "LIVE",
  "SYNCING",
  "DELAYED",
  "STALE",
  "DISCONNECTED",
  "ERROR",
  "UNKNOWN",
]);
export type AccountSyncStatus = z.infer<typeof accountSyncStatusSchema>;

/** Environment of a connection — Demo uses virtual funds, Live real capital. */
export const accountEnvironmentSchema = z.enum(["DEMO", "LIVE"]);
export type AccountEnvironment = z.infer<typeof accountEnvironmentSchema>;

/** Provider platform — the wizard's step-1 choice (prompt §12). */
export const accountProviderPlatformSchema = z.enum([
  "MT5",
  "MT4",
  "CTRADER",
  "DERIV",
  "BINANCE",
  "OTHER",
]);
export type AccountProviderPlatform = z.infer<typeof accountProviderPlatformSchema>;

/** Catalog availability — Coming Soon providers are never connectable. */
export const accountProviderAvailabilitySchema = z.enum([
  "AVAILABLE",
  "COMING_SOON",
]);
export type AccountProviderAvailability = z.infer<
  typeof accountProviderAvailabilitySchema
>;

/** One credential input rendered by the connection-method form (prompt §15). */
export const accountCredentialFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "password"]),
  placeholder: z.string().nullable(),
  required: z.boolean(),
  hint: z.string().nullable(),
});
export type AccountCredentialField = z.infer<typeof accountCredentialFieldSchema>;

/**
 * Connection method — comes from PROVIDER METADATA, never hardcoded
 * username+password (prompt §15).
 */
export const accountConnectionMethodSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  fields: z.array(accountCredentialFieldSchema),
  note: z.string().nullable(),
});
export type AccountConnectionMethod = z.infer<typeof accountConnectionMethodSchema>;

/**
 * Trading provider — provider-agnostic catalog entry (prompt §10). The UI
 * renders from this metadata; no `if (provider === …)` branches in screens.
 */
export const accountProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: accountProviderPlatformSchema,
  /** Journal-account broker enum the platform maps to. */
  broker: brokerSchema,
  availability: accountProviderAvailabilitySchema,
  environments: z.array(accountEnvironmentSchema),
  methods: z.array(accountConnectionMethodSchema),
  /** Permissions a successful connection grants — READ_* only. */
  capabilities: z.array(integrationPermissionSchema),
  tagline: z.string().nullable(),
});
export type AccountProvider = z.infer<typeof accountProviderSchema>;

/**
 * Account snapshot — mutable financial state SEPARATED from account
 * identity (prompt §37). Every metric nullable: unavailable ≠ invented
 * (same honesty rule as brokerAccountSnapshotSchema).
 */
export const tradingAccountSnapshotSchema = z.object({
  balance: decimalStringSchema.nullable(),
  equity: decimalStringSchema.nullable(),
  usedMargin: decimalStringSchema.nullable(),
  freeMargin: decimalStringSchema.nullable(),
  marginLevel: decimalStringSchema.nullable(),
  /** Provider leverage, e.g. "1:500". */
  leverage: z.string().nullable(),
  unrealizedPnl: decimalStringSchema.nullable(),
  /** When the snapshot was captured (data freshness, prompt §55). */
  capturedAt: isoDateTimeSchema.nullable(),
});
export type TradingAccountSnapshot = z.infer<typeof tradingAccountSnapshotSchema>;

/** Connection details of one trading account. Secrets NEVER appear here. */
export const tradingAccountConnectionSchema = z.object({
  state: accountConnectionStateSchema,
  methodId: z.string().nullable(),
  methodLabel: z.string().nullable(),
  server: z.string().nullable(),
  /** Masked credential hint, e.g. "••••5678" — never the secret. */
  credentialsHint: z.string().nullable(),
  connectedAt: isoDateTimeSchema.nullable(),
  /** Human-readable, credential-free explanation of a failed state. */
  lastError: z.string().nullable(),
  errorCode: z.string().nullable(),
});
export type TradingAccountConnection = z.infer<typeof tradingAccountConnectionSchema>;

/** Synchronization details of one trading account. */
export const tradingAccountSyncSchema = z.object({
  status: accountSyncStatusSchema,
  lastSyncedAt: isoDateTimeSchema.nullable(),
  lastAttemptedAt: isoDateTimeSchema.nullable(),
  /** Records pulled by the most recent completed sync. */
  recordsSynced: z.number().int().min(0).nullable(),
});
export type TradingAccountSync = z.infer<typeof tradingAccountSyncSchema>;

/**
 * Permission scope of a connection — REUSES the Integration Hub permission
 * vocabulary so the whole app speaks one permission language. V1 invariant:
 * read-only always; execution is structurally impossible (`readOnly: true`
 * literal — widening requires a dedicated guarded contract, cf. broker.ts).
 */
export const tradingAccountPermissionsSchema = z.object({
  granted: z.array(integrationPermissionSchema),
  readOnly: z.literal(true),
});
export type TradingAccountPermissions = z.infer<
  typeof tradingAccountPermissionsSchema
>;

/**
 * The account-centric aggregate: journal account identity (Account model)
 * + connectivity + synchronized state. This is the row of /accounts.
 */
export const connectedAccountViewSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  type: accountTypeSchema,
  broker: brokerSchema,
  /** Provider catalog id when connected through the wizard (null: manual). */
  providerId: z.string().nullable(),
  platform: accountProviderPlatformSchema.nullable(),
  currency: currencySchema,
  startingBalance: decimalStringSchema,
  isDefault: z.boolean(),
  propConfig: propFirmConfigSchema.nullable(),
  /** Masked account number, e.g. "••••••5678" — full number never leaves the mock adapter. */
  accountNumberMasked: z.string().nullable(),
  server: z.string().nullable(),
  connection: tradingAccountConnectionSchema,
  sync: tradingAccountSyncSchema,
  snapshot: tradingAccountSnapshotSchema,
  permissions: tradingAccountPermissionsSchema,
  createdAt: isoDateTimeSchema,
});
export type ConnectedAccountView = z.infer<typeof connectedAccountViewSchema>;

/** History entry kinds — orders, executions/deals, balance operations are DISTINCT concepts (prompt §25). */
export const accountHistoryKindSchema = z.enum(["DEAL", "ORDER", "BALANCE"]);
export type AccountHistoryKind = z.infer<typeof accountHistoryKindSchema>;

/**
 * Normalized history entry — one shape for deals, orders and balance
 * operations; nullable fields adapt per kind. Read-only.
 */
export const tradingAccountHistoryEntrySchema = z.object({
  id: z.string(),
  kind: accountHistoryKindSchema,
  time: isoDateTimeSchema,
  symbol: z.string().nullable(),
  direction: directionSchema.nullable(),
  volume: decimalStringSchema.nullable(),
  price: decimalStringSchema.nullable(),
  /** Signed amount in account currency (deal P&L, deposit/withdrawal). */
  amount: decimalStringSchema.nullable(),
  balanceAfter: decimalStringSchema.nullable(),
  comment: z.string().nullable(),
});
export type TradingAccountHistoryEntry = z.infer<
  typeof tradingAccountHistoryEntrySchema
>;

// ── Responses ────────────────────────────────────────────────────────────────

export const connectedAccountsOverviewResponseSchema = z.object({
  accounts: z.array(connectedAccountViewSchema),
  summary: z.object({
    total: z.number().int().min(0),
    connected: z.number().int().min(0),
    liveSync: z.number().int().min(0),
    needsAttention: z.number().int().min(0),
  }),
});
export type ConnectedAccountsOverviewResponse = z.infer<
  typeof connectedAccountsOverviewResponseSchema
>;

export const connectedAccountDetailResponseSchema = z.object({
  account: connectedAccountViewSchema,
});
export type ConnectedAccountDetailResponse = z.infer<
  typeof connectedAccountDetailResponseSchema
>;

export const accountPositionsResponseSchema = z.object({
  positions: z.array(brokerPositionSchema),
});
export type AccountPositionsResponse = z.infer<typeof accountPositionsResponseSchema>;

export const accountOrdersResponseSchema = z.object({
  orders: z.array(brokerOrderSchema),
});
export type AccountOrdersResponse = z.infer<typeof accountOrdersResponseSchema>;

export const accountHistoryResponseSchema = z.object({
  entries: z.array(tradingAccountHistoryEntrySchema),
});
export type AccountHistoryResponse = z.infer<typeof accountHistoryResponseSchema>;

export const accountProvidersResponseSchema = z.object({
  providers: z.array(accountProviderSchema),
});
export type AccountProvidersResponse = z.infer<typeof accountProvidersResponseSchema>;

// ── Connect flow (wizard) ────────────────────────────────────────────────────

/**
 * POST /accounts/test — connection validation BEFORE creating anything.
 * Credentials travel once, to the (mock) backend boundary, and are NEVER
 * persisted — the engine keeps only a masked hint.
 */
export const accountTestInputSchema = z.object({
  providerId: z.string().min(1),
  methodId: z.string().min(1),
  environment: accountEnvironmentSchema,
  credentials: z.record(z.string()),
});
export type AccountTestInput = z.infer<typeof accountTestInputSchema>;

export const accountTestStepStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "OK",
  "FAILED",
]);
export type AccountTestStepStatus = z.infer<typeof accountTestStepStatusSchema>;

export const accountTestStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: accountTestStepStatusSchema,
  detail: z.string().nullable(),
});
export type AccountTestStep = z.infer<typeof accountTestStepSchema>;

export const accountTestResponseSchema = z.object({
  ok: z.boolean(),
  errorCode: z.string().nullable(),
  steps: z.array(accountTestStepSchema),
});
export type AccountTestResponse = z.infer<typeof accountTestResponseSchema>;

/**
 * POST /accounts/connect — creates the journal Account AND its connection.
 * The engine returns the created view; the wizard then polls the detail
 * endpoint through CONNECTING → SYNCING → LIVE.
 */
export const accountConnectInputSchema = z.object({
  providerId: z.string().min(1),
  methodId: z.string().min(1),
  environment: accountEnvironmentSchema,
  credentials: z.record(z.string()),
  /** Display name — auto-suggested from provider + environment when omitted. */
  name: z.string().min(1).max(60).optional(),
});
export type AccountConnectInput = z.infer<typeof accountConnectInputSchema>;

export const accountConnectResponseSchema = z.object({
  account: connectedAccountViewSchema,
});
export type AccountConnectResponse = z.infer<typeof accountConnectResponseSchema>;

export const accountSyncResponseSchema = z.object({
  account: connectedAccountViewSchema,
});
export type AccountSyncResponse = z.infer<typeof accountSyncResponseSchema>;

export const accountActionResponseSchema = z.object({
  account: connectedAccountViewSchema,
});
export type AccountActionResponse = z.infer<typeof accountActionResponseSchema>;

/** PATCH /accounts/:id — rename / set default (prompt §30). */
export const accountUpdateInputSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  isDefault: z.boolean().optional(),
});
export type AccountUpdateInput = z.infer<typeof accountUpdateInputSchema>;

/**
 * DELETE semantics of POST /accounts/:id/disconnect — the response carries
 * the data-retention note (prompt §31/§32): Cosmoz journal data survives.
 */
export const accountDisconnectResponseSchema = z.object({
  ok: z.boolean(),
  note: z.string(),
});
export type AccountDisconnectResponse = z.infer<typeof accountDisconnectResponseSchema>;
