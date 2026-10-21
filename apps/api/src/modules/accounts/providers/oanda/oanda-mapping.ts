/**
 * OANDA v20 REST payload mapping — ALL provider-specific code lives here
 * (doc A §4.1: provider-specific types, symbol maps, pagination, rate-limit
 * behavior and error translation stay inside the adapter boundary; nothing
 * here crosses normalization.ts upward).
 *
 * Evidence anchors (doc D §3, developer.oanda.com/rest-live-v20):
 *   - GET /v3/accounts/{id}/summary   → balance / NAV / margin (decimal STRINGS)
 *   - GET /v3/accounts/{id}/trades    → open trades (stable tradeID, openTime)
 *   - GET /v3/accounts/{id}/pendingOrders → working orders
 *   - GET /v3/accounts/{id}/transactions  → fills + fund transfers (deals)
 *
 * Honesty rules implemented here (doc B §6/§7/§11, mandate §9.5):
 *   - missing → null (never a zero, never a plausible value)
 *   - provider decimal STRINGS survive verbatim (v20 wire format); a number
 *     shaped value is converted through its exact string form
 *   - nanosecond provider timestamps are truncated to milliseconds UTC ISO
 *     (the shared wire format) — source precision note in the phase report
 *   - no symbol is mapped across different quote assets (BTC_USD stays
 *     "BTC_USD"; the catalog's BTCUSDT is a DIFFERENT instrument)
 */
import { z } from "zod";

import type {
  NormalizedAccountInfo,
  NormalizedDeal,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedSnapshot,
} from "../../provider.types";
import { ProviderError } from "../../provider.types";

// ── Money / timestamp primitives (adapter-internal) ──────────────────────────

/** OANDA v20 carries decimals as strings; some payloads may degrade to
 * numbers — accept both, convert numbers through their exact string form. */
const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

/** Nanosecond RFC3339 → millisecond UTC ISO (the Normalized* contract). */
const oandaTimeSchema = z
  .string()
  .min(1)
  .transform((value) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned an unexpected response.",
      );
    }
    return new Date(ms).toISOString();
  });

// ── /summary ─────────────────────────────────────────────────────────────────

export const oandaSummarySchema = z.object({
  account: z.object({
    id: z.string().min(1),
    currency: z.string().min(3).max(3),
    balance: moneySchema,
    nav: moneySchema,
    marginUsed: moneySchema,
    marginAvailable: moneySchema,
    marginRate: moneySchema,
  }),
});

/** /summary → NormalizedSnapshot.
 * marginLevel: OANDA does not report it directly (marginCloseoutPercent is a
 * DIFFERENT semantic) → honest null, limitation declared on marginInfo. */
export function snapshotFromSummary(
  summary: z.output<typeof oandaSummarySchema>,
): NormalizedSnapshot {
  return {
    balance: summary.account.balance,
    equity: summary.account.nav,
    margin: summary.account.marginUsed,
    freeMargin: summary.account.marginAvailable,
    marginLevel: null,
  };
}

/** Leverage derived from the provider-reported marginRate (1/marginRate) —
 * a deterministic derivation of a reported fact, not an invention. */
export function leverageFromMarginRate(marginRate: string): string | null {
  const rate = Number(marginRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const leverage = Number((1 / rate).toFixed(2));
  if (!Number.isFinite(leverage) || leverage <= 0) return null;
  return String(leverage);
}

export function accountInfoFromSummary(
  summary: z.output<typeof oandaSummarySchema>,
  externalAccountId: string,
): NormalizedAccountInfo {
  return {
    externalAccountId,
    currency: summary.account.currency,
    leverage: leverageFromMarginRate(summary.account.marginRate),
    server: null, // OANDA has no MT5-style server label — honest null
  };
}

// ── /trades (state=OPEN) → positions ─────────────────────────────────────────

/**
 * Positions source = open TRADES, not the netted /positions aggregate:
 * a v20 trade has a stable tradeID and openTime (the position aggregate has
 * NEITHER — §7.4 identity fallback applied with the provider's documented
 * per-trade identity instead). Multiple concurrent trades per symbol remain
 * separate rows (doc B §7.1).
 * stopLoss/takeProfit/currentPrice: the trades payload exposes ORDER IDs, not
 * prices → honest nulls, limitation declared on openPositions.
 */
const oandaOpenTradeSchema = z.object({
  id: z.string().min(1),
  instrument: z.string().min(1),
  price: moneySchema,
  openTime: oandaTimeSchema,
  state: z.string().min(1),
  currentUnits: moneySchema,
  unrealizedPL: moneySchema.optional(),
});

export const oandaTradesResponseSchema = z.object({
  trades: z.array(oandaOpenTradeSchema),
});

export function positionsFromTrades(
  trades: Array<z.output<typeof oandaOpenTradeSchema>>,
): NormalizedPosition[] {
  return trades.map((trade) => {
    const units = Number(trade.currentUnits);
    if (!Number.isFinite(units) || units === 0) {
      throw new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned an unexpected response.",
      );
    }
    return {
      externalPositionId: trade.id,
      symbol: mapOandaSymbol(trade.instrument),
      side: units > 0 ? "BUY" : "SELL",
      volume: String(Math.abs(units)),
      entryPrice: trade.price,
      currentPrice: null,
      stopLoss: null,
      takeProfit: null,
      profit: trade.unrealizedPL ?? null,
      swap: null, // OANDA reports financing per transaction, not per open trade
      commission: null,
      openedAt: trade.openTime,
    };
  });
}

// ── /pendingOrders → orders ──────────────────────────────────────────────────

/** Price-less orders (guaranteed-stop variants: distance, no price) are
 * EXCLUDED and declared as an orders-capability limitation — they are
 * provider-valid but not representable without inventing a price (§6). */
const oandaPendingOrderSchema = z.object({
  id: z.string().min(1),
  instrument: z.string().min(1),
  type: z.string().min(1),
  units: moneySchema,
  price: moneySchema.optional(),
  createTime: oandaTimeSchema,
  stopLossOnFill: z.object({ price: moneySchema }).optional(),
  takeProfitOnFill: z.object({ price: moneySchema }).optional(),
});

export const oandaOrdersResponseSchema = z.object({
  orders: z.array(oandaPendingOrderSchema),
});

export function ordersFromPending(
  orders: Array<z.output<typeof oandaPendingOrderSchema>>,
): { orders: NormalizedOrder[]; excludedCount: number } {
  const mapped: NormalizedOrder[] = [];
  let excludedCount = 0;
  for (const order of orders) {
    if (order.price === undefined) {
      excludedCount += 1;
      continue;
    }
    const units = Number(order.units);
    if (!Number.isFinite(units) || units === 0) {
      throw new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned an unexpected response.",
      );
    }
    const direction = units > 0 ? "BUY" : "SELL";
    mapped.push({
      externalOrderId: order.id,
      symbol: mapOandaSymbol(order.instrument),
      // Broker verb composed from two provider-verbatim facts (direction +
      // order type) — never collapsed into a canonical status (doc B §7.2).
      type: `${direction}_${order.type}`,
      volume: String(Math.abs(units)),
      price: order.price,
      stopLoss: order.stopLossOnFill?.price ?? null,
      takeProfit: order.takeProfitOnFill?.price ?? null,
      status: "PENDING", // the endpoint IS the pending set — provider fact
      createdAt: order.createTime,
      updatedAt: null,
    });
  }
  return { orders: mapped, excludedCount };
}

// ── /transactions → deals ────────────────────────────────────────────────────

/**
 * Deals = ORDER_FILL (trading activity) + TRANSFER_FUNDS (balance operations,
 * symbol null). Every other transaction class (ORDER_CANCEL, MARGIN_CALL_*,
 * CLIENT_STATE_*, …) is bookkeeping, not a deal — excluded by filter, not
 * silently swallowed: the exclusion set is documented here and in the report.
 */
const oandaTransactionSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  time: oandaTimeSchema,
  instrument: z.string().min(1).optional(),
  units: moneySchema.optional(),
  price: moneySchema.optional(),
  pl: moneySchema.optional(),
  commission: moneySchema.optional(),
  financing: moneySchema.optional(),
  amount: moneySchema.optional(),
  tradeOpened: z.object({ tradeID: z.string().min(1) }).optional(),
  tradeClosed: z.array(z.object({ tradeID: z.string().min(1) })).optional(),
  tradeReduced: z.object({ tradeID: z.string().min(1) }).optional(),
});

export const oandaTransactionsResponseSchema = z.object({
  transactions: z.array(oandaTransactionSchema),
});

/** One raw v20 transaction row (adapter-internal accumulator type). */
export type OandaTransactionRow = z.output<typeof oandaTransactionSchema>;

/**
 * The TIME-BASED ListTransactions response (developer.oanda.com
 * /rest-live-v20/transaction-ep/, verified 2026-10-13) does NOT carry the
 * rows inline: it carries `pages` — "The list of URLs that represent idrange
 * queries providing the data for each page in the query results" — plus the
 * count and the account's lastTransactionID. The rows themselves come from
 * each idrange URL (same shape as oandaTransactionsResponseSchema) or from
 * the documented /transactions/sinceid cursor endpoint (same row shape).
 */
export const oandaTransactionsPagesSchema = z.object({
  pages: z.array(z.string().min(1)),
  count: z.number().int().nonnegative(),
  lastTransactionID: z.string().min(1),
});

/**
 * Numeric comparison of provider transaction ids (they are sequential
 * integer strings per the documented idrange/sinceid semantics; realistic
 * ids are far below 2^53, so Number comparison is exact).
 */
export function maxTransactionId(ids: readonly string[]): string | null {
  let best: string | null = null;
  let bestValue = -1;
  for (const id of ids) {
    const value = Number(id);
    if (!Number.isSafeInteger(value) || value < 0) {
      // A non-numeric id breaks the documented cursor semantics — refuse to
      // guess: the caller then does NOT advance the checkpoint (§8.4).
      return null;
    }
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

export function dealsFromTransactions(
  transactions: Array<z.output<typeof oandaTransactionSchema>>,
): NormalizedDeal[] {
  const deals: NormalizedDeal[] = [];
  for (const tx of transactions) {
    if (tx.type === "ORDER_FILL") {
      if (tx.instrument === undefined || tx.units === undefined) {
        throw new ProviderError(
          "INVALID_PROVIDER_RESPONSE",
          "The trading provider returned an unexpected response.",
        );
      }
      const units = Number(tx.units);
      if (!Number.isFinite(units) || units === 0) {
        throw new ProviderError(
          "INVALID_PROVIDER_RESPONSE",
          "The trading provider returned an unexpected response.",
        );
      }
      deals.push({
        externalDealId: tx.id,
        symbol: mapOandaSymbol(tx.instrument),
        side: units > 0 ? "BUY" : "SELL",
        volume: String(Math.abs(units)),
        price: tx.price ?? null,
        profit: tx.pl ?? null,
        commission: tx.commission ?? null,
        swap: tx.financing ?? null,
        // MT5-netting-style link: the fill's provider-side trade (doc B §7.3).
        positionId:
          tx.tradeClosed?.[0]?.tradeID ?? tx.tradeOpened?.tradeID ?? tx.tradeReduced?.tradeID ?? null,
        executedAt: tx.time,
      });
      continue;
    }
    if (tx.type === "TRANSFER_FUNDS") {
      if (tx.amount === undefined) {
        throw new ProviderError(
          "INVALID_PROVIDER_RESPONSE",
          "The trading provider returned an unexpected response.",
        );
      }
      const amount = Number(tx.amount);
      deals.push({
        externalDealId: tx.id,
        symbol: null, // balance operation (deposit/withdrawal) — no instrument
        side: amount >= 0 ? "BUY" : "SELL",
        volume: "0.00", // same convention as the mock's balance ops
        price: null,
        profit: tx.amount,
        commission: null,
        swap: null,
        positionId: null,
        executedAt: tx.time,
      });
    }
    // every other transaction type: excluded by filter (documented)
  }
  return deals;
}

// ── Symbol mapping (doc A §4.5 — map where identical, verbatim otherwise) ────

/**
 * The application's instrument vocabulary (Instrument catalog, migration
 * 20261004120000). Only IDENTICAL instruments are mapped — BTC_USD must NOT
 * become the catalog's BTCUSDT (different quote asset → wrong-symbol join).
 * Unmapped OANDA symbols pass through verbatim ("EUR_GBP" stays "EUR_GBP").
 */
const OANDA_SYMBOL_MAP: Readonly<Record<string, string>> = Object.freeze({
  EUR_USD: "EURUSD",
  GBP_USD: "GBPUSD",
  USD_JPY: "USDJPY",
  XAU_USD: "XAUUSD",
});

export function mapOandaSymbol(providerSymbol: string): string {
  return OANDA_SYMBOL_MAP[providerSymbol] ?? providerSymbol;
}
