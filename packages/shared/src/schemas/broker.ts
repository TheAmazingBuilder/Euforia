import { z } from "zod";

import { currencySchema, directionSchema } from "../enums";
import { decimalStringSchema, isoDateTimeSchema } from "./primitives";

/**
 * Broker monitoring contract - READ-ONLY by design. Session Live V1 never
 * sends anything to a broker: there is intentionally NO schema for order
 * submission here. Phase 2 (execution) must add its own guarded contracts
 * instead of widening these.
 */

/** Lifecycle of the broker connection surfaced by the Session Live. */
export const brokerConnectionStateSchema = z.enum([
  "NOT_CONFIGURED",
  "CONNECTING",
  "CONNECTED",
  "RECONNECTING",
  "ERROR",
]);
export type BrokerConnectionState = z.infer<typeof brokerConnectionStateSchema>;

/**
 * A real position as reported by the broker. The broker (MT5/…) is the ONLY
 * source of truth for positions - never a chart, never a journal entry.
 */
export const brokerPositionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: directionSchema,
  volume: decimalStringSchema,
  entryPrice: decimalStringSchema,
  /** null → feed gap; the UI renders N/A, never a guess. */
  currentPrice: decimalStringSchema.nullable(),
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  /** Unrealized P&L in account currency; null when the feed cannot price it. */
  unrealizedPnl: decimalStringSchema.nullable(),
  openedAt: isoDateTimeSchema,
});
export type BrokerPosition = z.infer<typeof brokerPositionSchema>;

/** Pending order - displayed read-only; no cancel/modify/execute path exists. */
export const brokerOrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  /** Broker verb, e.g. "BUY_LIMIT", "SELL_STOP". */
  type: z.string(),
  price: decimalStringSchema,
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  volume: decimalStringSchema,
  createdAt: isoDateTimeSchema,
});
export type BrokerOrder = z.infer<typeof brokerOrderSchema>;

/** Account snapshot - every metric nullable: unavailable ≠ invented. */
export const brokerAccountSnapshotSchema = z.object({
  broker: z.string(),
  accountNumber: z.string(),
  currency: currencySchema,
  balance: decimalStringSchema.nullable(),
  equity: decimalStringSchema.nullable(),
  unrealizedPnl: decimalStringSchema.nullable(),
  usedMargin: decimalStringSchema.nullable(),
  freeMargin: decimalStringSchema.nullable(),
  marginLevel: decimalStringSchema.nullable(),
});
export type BrokerAccountSnapshot = z.infer<typeof brokerAccountSnapshotSchema>;

/**
 * GET /broker/session - everything the Session Live needs about the real
 * trading account, in one read-only call (account + positions + orders).
 * `state` drives the UI: NOT_CONFIGURED/ERROR render honest empty states,
 * never placeholder numbers.
 */
export const brokerSessionResponseSchema = z.object({
  connected: z.boolean(),
  state: brokerConnectionStateSchema,
  /** Human-readable, credential-free explanation of the state. */
  reason: z.string().nullable(),
  account: brokerAccountSnapshotSchema.nullable(),
  positions: z.array(brokerPositionSchema),
  orders: z.array(brokerOrderSchema),
  /** Last successful broker sync (observability, §28). */
  lastSyncAt: isoDateTimeSchema.nullable(),
});
export type BrokerSessionResponse = z.infer<typeof brokerSessionResponseSchema>;

/** Origin of a private-positions stream snapshot - honest labeling, always. */
export const positionsStreamSourceSchema = z.enum(["sim"]);
export type PositionsStreamSource = z.infer<typeof positionsStreamSourceSchema>;

/**
 * WS event "positions" - the PRIVATE stream pushed ONLY into the
 * authenticated owner's `user:<id>` room (server-side scoping: never
 * addressed by client-named channels, never broadcast). SNAPSHOT semantics -
 * the full positions array on every emit, so applying it is idempotent
 * (reconnect/replay cannot duplicate positions). Reuses brokerPositionSchema:
 * the broker stays the only source of truth for position shape.
 */
export const brokerPositionsStreamEventSchema = z.object({
  source: positionsStreamSourceSchema,
  positions: z.array(brokerPositionSchema),
  /** Server epoch ms when this snapshot was emitted. */
  ts: z.number(),
});
export type BrokerPositionsStreamEvent = z.infer<typeof brokerPositionsStreamEventSchema>;
