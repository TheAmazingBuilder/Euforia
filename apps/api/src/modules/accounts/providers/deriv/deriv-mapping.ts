/**
 * Deriv WS v3 mapping layer (Phase 07 - second REAL adapter).
 *
 * Response schemas + normalizers for the official Deriv WebSocket API v3
 * (wss://ws.derivws.com/websockets/v3 - developers.deriv.com,
 * doc-deriv.readme.io; docs accessed 2026-10-14). Every field not explicitly
 * required by the documented contract is OPTIONAL here: an unexpected shape
 * degrades to an honest null, never to an invented value (mandate §2 - no
 * fabricated data). Anything the domain REQUIRES but the provider did not
 * send becomes INVALID_PROVIDER_RESPONSE (fail loud, never fabricate).
 *
 * Financial precision (§10.1): Deriv transports money as JSON numbers
 * (binary doubles). The exact received value is re-serialized through
 * Decimal.js with NO arithmetic - the unavoidable binary-float transport
 * conversion is documented here and does not round (mandate §10.1: document
 * unavoidable precision conversions; preserve source precision).
 *
 * Timestamps: Deriv exposes epoch SECONDS (purchase_time, sell_time,
 * expiry_time). They are converted to UTC ISO 8601; the event-time vs
 * retrieval-time distinction is preserved by the domain (§10.2).
 *
 * Symbol semantics: Deriv instrument identifiers (e.g. "R_100", "BOOM500",
 * "frxEURUSD") are passed through VERBATIM when the provider reports them -
 * no renaming, no guessing from shortcodes (an undocumented parse would
 * fabricate data).
 */
import { z } from "zod";
import { Decimal } from "decimal.js";
import type {
  NormalizedAccountInfo,
  NormalizedDeal,
  NormalizedPosition,
  NormalizedSnapshot,
} from "../../provider.types";

// ── Primitive helpers ────────────────────────────────────────────────────────

/** JSON number|string → exact decimal string (no arithmetic, no rounding). */
export function toDecimalString(value: number | string): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Decimal(value).toFixed();
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    return new Decimal(trimmed).toFixed();
  } catch {
    return null;
  }
}

/** Epoch SECONDS (number or numeric string) → UTC ISO 8601, else null. */
export function epochSecondsToIso(value: number | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Guard against millisecond-shaped values (provider contract says seconds).
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Deriv money field - tolerant of number|string, strict about finiteness. */
const derivMoney = z.union([z.number(), z.string()]);

// ── Session envelope ─────────────────────────────────────────────────────────

/**
 * Every v3 response carries `msg_type` and (on failure) an `error` object
 * with a stable `code` (official error catalog: doc-deriv.readme.io/docs/
 * error-codes - InvalidToken, AuthorizationRequired, RateLimitExceeded,
 * InvalidAppID, PermissionDenied, …).
 */
export const derivErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().optional(),
  }),
  req_id: z.number().optional(),
});
export type DerivErrorPayload = z.infer<typeof derivErrorSchema>;

/**
 * `authorize` response (official docs: Account APIs - Authorize, scope NA;
 * response fields documented in the api-explorer). Required here: the
 * identity fields the domain needs (loginid, currency, is_virtual); the
 * balance field is tolerated but NOT relied on (dedicated `balance` call).
 * `landing_company_name` / `landing_company_full_name` are the
 * PROVIDER-REPORTED broker identity used by Phase 07 identification.
 */
export const derivAuthorizeSchema = z.object({
  authorize: z.object({
    loginid: z.string().min(1),
    currency: z.string().min(1),
    is_virtual: z.boolean(),
    balance: derivMoney.optional(),
    user_id: z.string().optional(),
    landing_company_name: z.string().optional(),
    landing_company_full_name: z.string().optional(),
    country: z.string().optional(),
    email: z.string().optional(),
    fullname: z.string().optional(),
  }),
  req_id: z.number().optional(),
});
export type DerivAuthorizePayload = z.infer<typeof derivAuthorizeSchema>;

/** `balance` response (official docs: Account APIs - Balance, scope Read). */
export const derivBalanceSchema = z.object({
  balance: z.object({
    balance: derivMoney,
    currency: z.string().min(1),
    loginid: z.string().min(1),
  }),
  req_id: z.number().optional(),
});
export type DerivBalancePayload = z.infer<typeof derivBalanceSchema>;

/**
 * `portfolio` response (official docs: "Get a list of all open positions for
 * the authorized account… returns only open (active) contracts"). The full
 * open set arrives in ONE response → the positions completeness fact is
 * TRUE (bounded by MAX_POSITION_ROWS in the adapter for pathological cases).
 */
export const derivPortfolioSchema = z.object({
  portfolio: z.object({
    contracts: z.array(
      z
        .object({
          contract_id: z.union([z.number(), z.string()]),
          contract_type: z.string().min(1),
          buy_price: derivMoney,
          purchase_time: z.union([z.number(), z.string()]),
          payout: derivMoney.optional(),
          expiry_time: z.union([z.number(), z.string()]).optional(),
          shortcode: z.string().optional(),
          underlying_symbol: z.string().optional(),
          currency: z.string().optional(),
          current_spot: derivMoney.optional(),
          profit: derivMoney.optional(),
        })
        .passthrough(),
    ),
  }),
  req_id: z.number().optional(),
});
export type DerivPortfolioPayload = z.infer<typeof derivPortfolioSchema>;

/**
 * `profit_table` response (official docs: "Retrieve a summary of account
 * profit/loss"; pagination limit+offset, default 50, MAX 500 per call).
 * Each settled row is a buy→sell contract summary; transaction_id is the
 * settled (sell) transaction identity - the deals idempotency key.
 */
export const derivProfitTableSchema = z.object({
  profit_table: z.object({
    count: z.number().int().optional(),
    transactions: z.array(
      z
        .object({
          transaction_id: z.string().min(1),
          contract_id: z.union([z.number(), z.string()]).optional(),
          buy_price: derivMoney.optional(),
          sell_price: derivMoney.optional(),
          payout: derivMoney.optional(),
          profit: derivMoney.optional(),
          purchase_time: z.union([z.number(), z.string()]).optional(),
          sell_time: z.union([z.number(), z.string()]),
          shortcode: z.string().optional(),
          app_id: z.union([z.number(), z.string()]).optional(),
        })
        .passthrough(),
    ),
  }),
  req_id: z.number().optional(),
});
export type DerivProfitTablePayload = z.infer<typeof derivProfitTableSchema>;

// ── Contract-direction mapping (documented semantics, fail loud) ────────────

/**
 * Deriv contract families whose market direction is DOCUMENTED (rise/fall,
 * multipliers, CFD buy/sell): CALL/UP-class profits when the market rises
 * (long → "BUY" side), PUT/DOWN-class when it falls (short → "SELL" side).
 * An UNKNOWN family fails the mapping loudly (INVALID_PROVIDER_RESPONSE)
 * instead of being silently mis-typed - a new contract family surfaces as a
 * visible failure, never as fabricated direction data.
 */
export const DERIV_CONTRACT_DIRECTION: Record<string, "BUY" | "SELL"> = {
  CALL: "BUY",
  PUT: "SELL",
  MULTUP: "BUY",
  MULTDOWN: "SELL",
  BUY: "BUY",
  SELL: "SELL",
  HIGHER: "BUY",
  LOWER: "SELL",
  ACCU: "BUY",
  TURBOUP: "BUY",
  TURBODOWN: "SELL",
  VANILLALONGCALL: "BUY",
  VANILLALONGPUT: "SELL",
};

export function directionForContractType(contractType: string): "BUY" | "SELL" | null {
  return DERIV_CONTRACT_DIRECTION[contractType.trim().toUpperCase()] ?? null;
}

// ── Normalizers (payload → normalized domain shapes) ─────────────────────────

export function accountInfoFromAuthorize(payload: DerivAuthorizePayload): NormalizedAccountInfo {
  const a = payload.authorize;
  const landingCompany = a.landing_company_full_name ?? a.landing_company_name ?? null;
  return {
    externalAccountId: a.loginid,
    currency: a.currency,
    leverage: null, // not reported by the v3 authorize response - never invented
    server: null, // the v3 session has no server/platform label - honest null
    brokerIdentity: {
      brokerName: landingCompany,
      accountClass: a.is_virtual ? "DEMO" : "REAL",
    },
  };
}

export function snapshotFromBalance(payload: DerivBalancePayload): NormalizedSnapshot {
  return {
    balance: toDecimalString(payload.balance.balance),
    // Deriv v3 `balance` reports ONE number - equity/margin are NOT reported.
    // Null, never approximated from balance (mandate §2: no fabrication).
    equity: null,
    margin: null,
    freeMargin: null,
    marginLevel: null,
  };
}

export function positionsFromPortfolio(
  payload: DerivPortfolioPayload,
): NormalizedPosition[] {
  return payload.portfolio.contracts.map((c) => {
    const side = directionForContractType(c.contract_type);
    if (!side) {
      throw new Error(
        `UNKNOWN_CONTRACT_FAMILY:${c.contract_type}:${String(c.contract_id)}`,
      );
    }
    const symbol = c.underlying_symbol ?? null;
    if (!symbol) {
      // The domain REQUIRES a symbol; the provider did not send one and we
      // refuse to parse it out of the shortcode (undocumented shape) - fail
      // loud so the gap surfaces instead of persisting a fabricated label.
      throw new Error(`MISSING_UNDERLYING_SYMBOL:${String(c.contract_id)}`);
    }
    const entry = toDecimalString(c.buy_price);
    if (!entry) throw new Error(`UNPARSABLE_BUY_PRICE:${String(c.contract_id)}`);
    const openedAt = epochSecondsToIso(c.purchase_time);
    if (!openedAt) throw new Error(`UNPARSABLE_PURCHASE_TIME:${String(c.contract_id)}`);
    return {
      externalPositionId: String(c.contract_id),
      symbol,
      side,
      // Contract-count semantics: one portfolio row = one contract. Deriv
      // does not report lot volume for options/multipliers - "1" is the
      // documented unit normalization, not a fabricated lot size.
      volume: "1",
      entryPrice: entry,
      currentPrice: c.current_spot !== undefined ? toDecimalString(c.current_spot) : null,
      stopLoss: null, // not part of the documented portfolio response
      takeProfit: null, // not part of the documented portfolio response
      profit: c.profit !== undefined ? toDecimalString(c.profit) : null,
      swap: null, // not reported
      commission: null, // buy_price already nets purchase cost - no separate fee field
      openedAt,
    } satisfies NormalizedPosition;
  });
}

export function dealsFromProfitTable(
  payload: DerivProfitTablePayload,
): NormalizedDeal[] {
  return payload.profit_table.transactions.map((t) => {
    const executedAt = epochSecondsToIso(t.sell_time);
    if (!executedAt) throw new Error(`UNPARSABLE_SELL_TIME:${t.transaction_id}`);
    const price = t.sell_price !== undefined ? toDecimalString(t.sell_price) : null;
    return {
      externalDealId: t.transaction_id,
      // Symbol is NOT part of the documented profit_table row; parsing the
      // shortcode would guess. null = the deal cannot claim an instrument -
      // honest absence (matches the OANDA balance-op convention upstream).
      symbol: null,
      // Every profit_table row IS a purchased contract (buy_price/payout
      // model) - the BUY side of a settled round-trip. The market direction
      // lives in the contract type and is deliberately NOT re-projected
      // onto the deal row (would fabricate direction the row doesn't carry).
      side: "BUY",
      volume: "1", // one settled contract per row (contract-count semantics)
      price,
      profit: t.profit !== undefined ? toDecimalString(t.profit) : null,
      commission: null, // Deriv nets fees into buy_price/payout - no separate field
      swap: null, // not reported
      // contract_id links the settled row to the portfolio position id.
      positionId: t.contract_id !== undefined ? String(t.contract_id) : null,
      executedAt,
    } satisfies NormalizedDeal;
  });
}

// ── Incremental cursor (sell_time epoch, documented shape) ───────────────────

/** Checkpoint shape: epoch seconds, ≤ 12 digits (guards DB-stored cursors). */
export const DERIV_DEALS_CURSOR_PATTERN = /^\d{1,12}$/;

export function isValidDealsCursor(cursor: string | null | undefined): boolean {
  if (!cursor) return true;
  return DERIV_DEALS_CURSOR_PATTERN.test(cursor);
}
