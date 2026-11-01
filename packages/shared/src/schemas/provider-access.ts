import { z } from "zod";

/**
 * Shared, read-only vocabulary for external provider connections.
 *
 * This file deliberately contains no provider registry, connection lifecycle,
 * persistence or HTTP surface. Accounts owns trading-provider connections;
 * Security consumes only a masked view of those connections.
 */
export const providerConnectionStatusSchema = z.enum([
  "CONNECTED",
  "SYNCING",
  "DEGRADED",
  "DISCONNECTED",
  "AUTH_REQUIRED",
  "ERROR",
]);
export type ProviderConnectionStatus = z.infer<typeof providerConnectionStatusSchema>;

export const providerConnectionKindSchema = z.enum([
  "BROKER",
  "EXCHANGE",
  "MARKET_DATA",
  "ECONOMIC",
  "NEWS",
  "CHARTING",
  "NOTIFICATION",
  "EXTERNAL",
]);
export type ProviderConnectionKind = z.infer<typeof providerConnectionKindSchema>;

export const providerPermissionSchema = z.enum([
  "READ_ACCOUNT",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_EXECUTIONS",
  "READ_MARKET_DATA",
  "READ_ECONOMIC_DATA",
  "READ_NEWS",
  "WEBHOOK_INBOUND",
]);
export type ProviderPermission = z.infer<typeof providerPermissionSchema>;
