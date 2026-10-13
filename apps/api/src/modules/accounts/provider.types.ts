/**
 * Trading provider abstraction (Phase 3 §9–§14).
 *
 * The core domain NEVER depends on MT5 / IC Markets / cTrader / any SDK —
 * it depends on this interface and on the normalized Euforia shapes below.
 * Provider-specific code stays inside its adapter boundary; provider-specific
 * types never leak past it (§11).
 *
 * READ-ONLY BY CONSTRUCTION (§47): the interface intentionally exposes NO
 * placeOrder / modifyOrder / cancelOrder / closePosition methods — not even
 * unused ones. V1 permissions are READ_* only.
 *
 * Statelessness note: V1 adapters authenticate per call (API_KEY method),
 * so the prompt's connect()/disconnect()/getConnectionStatus() capabilities
 * are realized by the connection lifecycle in the application layer (test +
 * fetch on connect, credentials wipe on disconnect, status derived from the
 * TradingConnection row). Session-oriented providers (e.g. an MT5 bridge)
 * will extend the interface with explicit session semantics when a real
 * integration requires it — documented, not speculative (§14).
 */
import type {
  TradingProviderDescriptor,
} from "../../shared/contracts";

/** Normalized credentials view handed to adapters — decrypted, never logged. */
export interface ProviderCredentials {
  method: "API_KEY";
  secret: string;
}

/**
 * Request context for data-fetching calls: WHICH external account to read.
 * Euforia owns the mapping account↔externalAccountId (persisted on connect);
 * adapters receive it as input, never guess it.
 *
 * `environment` (Phase 03) — the account's declared environment, so adapters
 * that route per environment (OANDA practice vs live hosts) resolve the
 * endpoint WITHOUT widening the 6-method port (doc A §4.3). Adapters that
 * do not care (mock) ignore it. PROP_FIRM arrives for providers that serve
 * prop-firm entities; OANDA rejects it honestly (UNSUPPORTED_ACCOUNT).
 */
export interface ProviderRequestContext {
  credentials: ProviderCredentials;
  /** The provider-side account identifier stored on the TradingAccount. */
  externalAccountId: string;
  /** Account environment (TradingAccount.type) — endpoint routing input. */
  environment: "DEMO" | "LIVE" | "PROP_FIRM";
}

/** Normalized provider account metadata (fetchAccountInfo). */
export interface NormalizedAccountInfo {
  externalAccountId: string;
  currency: string;
  leverage: string | null;
  /** Provider-side server/platform label (e.g. "ICMarketsSC-MT5"). */
  server: string | null;
}

/** Normalized account snapshot (fetchSnapshot) — nullable = not available, never invented. */
export interface NormalizedSnapshot {
  balance: string | null;
  equity: string | null;
  margin: string | null;
  freeMargin: string | null;
  marginLevel: string | null;
}

/** Normalized position (fetchPositions) — decimal strings, UTC ISO timestamps. */
export interface NormalizedPosition {
  externalPositionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: string;
  entryPrice: string;
  currentPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  profit: string | null;
  swap: string | null;
  commission: string | null;
  /** Provider-side open time, UTC ISO. */
  openedAt: string;
}

/** Normalized pending order (fetchOrders) — read-only. */
export interface NormalizedOrder {
  externalOrderId: string;
  symbol: string;
  /** Broker verb, e.g. "BUY_LIMIT", "SELL_STOP". */
  type: string;
  volume: string;
  price: string;
  stopLoss: string | null;
  takeProfit: string | null;
  status: string;
  /** Provider-side timestamps, UTC ISO. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** Normalized completed deal (fetchDeals). Symbol null = balance operation.
 * positionId (Phase 4 §9/§17) links the deal to the provider-side position
 * it belongs to (MT5 netting semantics) — nullable when the provider does
 * not expose it (balance operations always have none). */
export interface NormalizedDeal {
  externalDealId: string;
  symbol: string | null;
  side: "BUY" | "SELL";
  volume: string;
  price: string | null;
  profit: string | null;
  commission: string | null;
  swap: string | null;
  /** Provider-side position identifier this deal belongs to, when exposed. */
  positionId: string | null;
  /** Provider-side execution time, UTC ISO. */
  executedAt: string;
}

/**
 * Normalized provider failure. `code` is one of the stable TRADING_ERROR_CODES
 * provider codes; the message is SANITIZED — it must be safe to expose and
 * must never contain credentials or raw provider internals (§23/§36).
 *
 * UNSUPPORTED_CAPABILITY (Phase 03): an operation outside the adapter's
 * declared capabilities throws it — the sync orchestration treats it as a
 * capability FACT (skipped segment, doc B §8.2), never a run failure.
 */
export class ProviderError extends Error {
  constructor(
    readonly code:
      | "INVALID_CREDENTIALS"
      | "PROVIDER_UNAVAILABLE"
      | "CONNECTION_TIMEOUT"
      | "UNSUPPORTED_ACCOUNT"
      | "UNSUPPORTED_CAPABILITY"
      | "UNAUTHORIZED_PROVIDER_ACCESS"
      | "RATE_LIMITED"
      | "INVALID_PROVIDER_RESPONSE",
    message: string,
    options?: { cause?: unknown; /** Provider-advertised retry delay (RATE_LIMITED Retry-After). */ retryAfterSeconds?: number },
  ) {
    super(message, options ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }

  /** Seconds the provider asked us to wait (RATE_LIMITED only, else undefined). */
  readonly retryAfterSeconds?: number;
}

/** The ONLY provider contract the application layer depends on. */
export interface TradingProviderAdapter {
  /** Immutable metadata — registry, capability gating and UI all read this. */
  readonly descriptor: TradingProviderDescriptor;

  /** Lightweight credential check. Throws ProviderError on failure. */
  testConnection(credentials: ProviderCredentials): Promise<void>;

  /**
   * External account identity/metadata for the account identified by the
   * context (at connect time: the user-supplied login; later: the stored
   * externalAccountId). Throws ProviderError on failure.
   */
  fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo>;

  /** Current balance/equity/margin snapshot. Throws ProviderError on failure. */
  fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot>;

  /** Open positions (empty array = none). Throws ProviderError on failure. */
  fetchPositions(context: ProviderRequestContext): Promise<NormalizedPosition[]>;

  /** Pending orders (empty array = none). Throws ProviderError on failure. */
  fetchOrders(context: ProviderRequestContext): Promise<NormalizedOrder[]>;

  /** Recent completed deals (empty array = none). Throws ProviderError on failure. */
  fetchDeals(context: ProviderRequestContext): Promise<NormalizedDeal[]>;
}

/**
 * Run an adapter call under the configured timeout (§16: resilient to
 * provider failures; a hung provider becomes CONNECTION_TIMEOUT).
 * The timer is cleared on settlement to avoid leaking handles.
 */
export function withProviderTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ProviderError("CONNECTION_TIMEOUT", "The trading provider did not respond in time."),
      );
    }, timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
