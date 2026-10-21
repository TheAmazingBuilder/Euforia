import { z } from "zod";
import {
  accountTypeSchema,
  assetClassSchema,
  brokerSchema,
  connectionStatusSchema,
  currencySchema,
  importStatusSchema,
} from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";
import { accountSchema, propFirmConfigSchema } from "./account";

/**
 * Multi-portfolio domain — data-model.md "Domaine 2 — Comptes, Marchés & Imports".
 * A BrokerConnection links a journal account to a broker feed (API or bridge);
 * every pull (manual sync or auto-import) records an ImportBatch. Trades born
 * from a sync carry the batch id + a per-account unique externalRef, so
 * re-importing the same feed adds zero duplicates (idempotence rule).
 */

/** Where an import batch came from. CSV keeps its own source tag. */
export const importSourceSchema = z.enum([
  "CSV_MT5",
  "DERIV_API",
  "BINANCE_API",
  "MT5_SYNC",
  "CTRADER_SYNC",
  "OTHER_SYNC",
]);
export type ImportSource = z.infer<typeof importSourceSchema>;

export const brokerConnectionSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  /** Journal account the feed feeds into. */
  accountId: uuidSchema,
  /** MANUAL is the "no broker" value — never a connection provider. */
  provider: brokerSchema,
  /** Human label, e.g. "Deriv API — live". */
  label: z.string().min(1),
  status: connectionStatusSchema,
  /** When true the desk pulls new trades on load when the last sync is stale. */
  autoImport: z.boolean(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type BrokerConnection = z.infer<typeof brokerConnectionSchema>;

export const importBatchSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  accountId: uuidSchema,
  source: importSourceSchema,
  /** Filename for file imports, synthetic name for syncs ("auto-sync 2026-…"). */
  filename: z.string().min(1),
  status: importStatusSchema,
  rowsTotal: z.number().int().min(0),
  rowsImported: z.number().int().min(0),
  rowsSkipped: z.number().int().min(0),
  errorLog: z.array(z.string()),
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

// ── Desk overview (GET /portfolios/overview) ─────────────────────────────────

/** Account row enriched with server-computed desk aggregates. */
export const portfolioAccountRowSchema = accountSchema.extend({
  /** starting + realized P&L. */
  balance: decimalStringSchema,
  netPnl: decimalStringSchema,
  tradesOpen: z.number().int().min(0),
  tradesTotal: z.number().int().min(0),
  /** Win ratio in percent units (0–100); null when no closed trades. */
  winRate: decimalStringSchema.nullable(),
  /** Share of the desk balance, percent units (0–100). */
  allocationPct: decimalStringSchema,
});
export type PortfolioAccountRow = z.infer<typeof portfolioAccountRowSchema>;

export const portfolioTotalsSchema = z.object({
  balance: decimalStringSchema,
  startingBalance: decimalStringSchema,
  netPnl: decimalStringSchema,
  tradesTotal: z.number().int().min(0),
  openPositions: z.number().int().min(0),
  accountsCount: z.number().int().min(0),
  connectionsConnected: z.number().int().min(0),
  connectionsTotal: z.number().int().min(0),
});
export type PortfolioTotals = z.infer<typeof portfolioTotalsSchema>;

export const portfolioBrokerRowSchema = z.object({
  provider: brokerSchema,
  connections: z.number().int().min(0),
  tradesTotal: z.number().int().min(0),
  netPnl: decimalStringSchema,
});
export type PortfolioBrokerRow = z.infer<typeof portfolioBrokerRowSchema>;

export const portfolioAssetClassRowSchema = z.object({
  assetClass: assetClassSchema,
  /** Share of the desk's closed trades, percent units (0–100). */
  tradesPct: decimalStringSchema,
  pnlNet: decimalStringSchema,
  winRate: decimalStringSchema.nullable(),
});
export type PortfolioAssetClassRow = z.infer<typeof portfolioAssetClassRowSchema>;

export const portfolioOverviewResponseSchema = z.object({
  currency: currencySchema,
  totals: portfolioTotalsSchema,
  accounts: z.array(portfolioAccountRowSchema),
  byBroker: z.array(portfolioBrokerRowSchema),
  byAssetClass: z.array(portfolioAssetClassRowSchema),
});
export type PortfolioOverviewResponse = z.infer<typeof portfolioOverviewResponseSchema>;

// ── Account CRUD ─────────────────────────────────────────────────────────────

export const createAccountInputSchema = z.object({
  name: z.string().min(1).max(80),
  type: accountTypeSchema,
  broker: brokerSchema,
  currency: currencySchema,
  startingBalance: decimalStringSchema,
  isDefault: z.boolean().default(false),
  propConfig: propFirmConfigSchema.nullable().default(null),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  type: accountTypeSchema.optional(),
  broker: brokerSchema.optional(),
  currency: currencySchema.optional(),
  startingBalance: decimalStringSchema.optional(),
  isDefault: z.boolean().optional(),
  propConfig: propFirmConfigSchema.nullable().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

/** DELETE /accounts/:id — guarded by the server (default flag, open trades). */
export const deleteAccountResponseSchema = z.object({
  id: uuidSchema,
  deleted: z.literal(true),
});
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;

// ── Broker connection CRUD ───────────────────────────────────────────────────

export const createBrokerConnectionInputSchema = z.object({
  accountId: uuidSchema,
  provider: z.enum(["MT4", "MT5", "DERIV", "BINANCE", "CTRADER", "OTHER"]),
  label: z.string().min(1).max(80),
  autoImport: z.boolean().default(true),
});
export type CreateBrokerConnectionInput = z.infer<typeof createBrokerConnectionInputSchema>;

export const updateBrokerConnectionInputSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  autoImport: z.boolean().optional(),
});
export type UpdateBrokerConnectionInput = z.infer<typeof updateBrokerConnectionInputSchema>;

/** A connection row enriched with its journal account's display name. */
export const brokerConnectionRowSchema = brokerConnectionSchema.extend({
  accountName: z.string().min(1),
});
export type BrokerConnectionRow = z.infer<typeof brokerConnectionRowSchema>;

export const brokerConnectionsResponseSchema = z.object({
  connections: z.array(brokerConnectionRowSchema),
});
export type BrokerConnectionsResponse = z.infer<typeof brokerConnectionsResponseSchema>;

export const connectBrokerResponseSchema = z.object({
  connection: brokerConnectionRowSchema,
  /** The first pull's batch (rows may be 0 for an empty feed). */
  batch: importBatchSchema.extend({ accountName: z.string().min(1) }).nullable(),
  /** Rows imported / skipped by that first pull (toast copy). */
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type ConnectBrokerResponse = z.infer<typeof connectBrokerResponseSchema>;

export const syncConnectionResponseSchema = z.object({
  connection: brokerConnectionRowSchema,
  batch: importBatchSchema.extend({ accountName: z.string().min(1) }),
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type SyncConnectionResponse = z.infer<typeof syncConnectionResponseSchema>;

export const importBatchRowSchema = importBatchSchema.extend({
  accountName: z.string().min(1),
});
export type ImportBatchRow = z.infer<typeof importBatchRowSchema>;

export const importBatchesResponseSchema = z.object({
  batches: z.array(importBatchRowSchema),
});
export type ImportBatchesResponse = z.infer<typeof importBatchesResponseSchema>;
