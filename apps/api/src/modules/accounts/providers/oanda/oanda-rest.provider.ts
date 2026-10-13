/**
 * OandaRestProviderAdapter (Phase 03 — first REAL adapter, doc E Phase 03).
 *
 * Official OANDA v20 REST API, READ-ONLY subset, Bearer personal access
 * token (fits the existing API_KEY credential method — no schema change,
 * doc D §4). Practice (fxpractice) and live (fxtrade) hosts are routed by
 * the account's declared environment; PROP_FIRM is honestly rejected.
 *
 * Read-only red line (§47): this adapter implements EXACTLY the 6 read
 * methods of TradingProviderAdapter — no execution call exists anywhere.
 * The OANDA API itself offers order endpoints; none is referenced here.
 *
 * Capability enforcement (doc A §4.3/§4.4): every method guards its own
 * capability — an operation whose declared support is not SUPPORTED throws
 * UNSUPPORTED_CAPABILITY instead of silently returning empty data.
 *
 * Error translation (doc B §4.3 normative table):
 *   HTTP 401 → INVALID_CREDENTIALS           (422 + connection ERROR)
 *   HTTP 403 → UNAUTHORIZED_PROVIDER_ACCESS  (502 + connection ERROR)
 *   HTTP 404 → UNSUPPORTED_ACCOUNT           (unknown external account id)
 *   HTTP 429 → RATE_LIMITED + Retry-After    (provider-advertised delay)
 *   HTTP 5xx → PROVIDER_UNAVAILABLE          (transient outage)
 *   fetch reject → PROVIDER_UNAVAILABLE      (network/DNS — timeout is the
 *                orchestrator's withProviderTimeout concern, CONNECTION_TIMEOUT)
 *   malformed JSON / schema / echo mismatch → INVALID_PROVIDER_RESPONSE
 * Provider error text is NEVER surfaced — messages are canned and sanitized
 * (mandate §9.5); only the stable code crosses upward.
 *
 * NO dependency installed: HTTP uses the runtime's global fetch (Node 20+),
 * the first deliberate outbound call from the accounts domain (audit §2.2
 * noted zero HTTP clients so far — this file is that boundary, documented
 * in the phase report per the standing invariant).
 */
import type { TradingProviderDescriptor } from "../../../../shared/contracts";
import { capabilitySupportLevel, currencySchema } from "../../../../shared/contracts";
import type {
  NormalizedAccountInfo,
  NormalizedDeal,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedSnapshot,
  ProviderCredentials,
  ProviderRequestContext,
  TradingProviderAdapter,
} from "../../provider.types";
import { ProviderError } from "../../provider.types";
import {
  accountInfoFromSummary,
  dealsFromTransactions,
  oandaOrdersResponseSchema,
  oandaSummarySchema,
  oandaTradesResponseSchema,
  oandaTransactionsResponseSchema,
  ordersFromPending,
  positionsFromTrades,
  snapshotFromSummary,
} from "./oanda-mapping";

/** Official v20 hosts (developer.oanda.com) — routing by account environment. */
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";
const OANDA_LIVE_HOST = "https://api-fxtrade.oanda.com";

/** Full-refresh page size for /transactions (v20 maximum page; U2 governs
 * any future depth decision — Phase 04 owns cursors if ever required). */
const TRANSACTIONS_PAGE_SIZE = 1000;

function capability(capabilities: TradingProviderDescriptor["capabilities"], key: Parameters<typeof capabilitySupportLevel>[1]) {
  return capabilitySupportLevel(capabilities, key);
}

export interface OandaAdapterOptions {
  /** Base-URL override (tests/fixture server, region edge); null = by environment. */
  restUrlOverride?: string | null;
  /**
   * Transport-level abort backstop (ms) — Phase 04 hardening (spec §6.1
   * "safe timeout and cancellation behavior"). Each request carries an
   * `AbortSignal.timeout(ms)` so a hung socket is ACTUALLY released, not
   * merely abandoned. Deliberately set ABOVE the orchestrator watchdog
   * (withProviderTimeout → CONNECTION_TIMEOUT): the watchdog stays the
   * authoritative error class; this backstop only guarantees the underlying
   * fetch settles when the caller stopped observing it.
   */
  requestTimeoutMs?: number;
}

export class OandaRestProviderAdapter implements TradingProviderAdapter {
  readonly descriptor: TradingProviderDescriptor = {
    providerId: "oanda-v20",
    providerName: "OANDA v20 REST",
    platform: "OANDA",
    supportedEnvironments: ["DEMO", "LIVE"],
    supportedConnectionMethods: ["API_KEY"],
    // Token-scoped, revocable, read-oriented usage (doc D §4) — the least-
    // privilege posture of the whole provider set.
    supportedPermissions: [
      "READ_ACCOUNT",
      "READ_BALANCE",
      "READ_EQUITY",
      "READ_POSITIONS",
      "READ_ORDERS",
      "READ_DEALS",
      "READ_HISTORY",
    ],
    // Capability V2 (doc B §4.2 frozen design) — the first descriptor to
    // consume the three-state model. Every UNKNOWN/UNSUPPORTED cell is a
    // documented fact, never a silent boolean.
    capabilities: {
      accountDiscovery: {
        support: "UNKNOWN",
        limitation:
          "The token-scoped account-list endpoint exists, but account discovery is an open product question (U3) — connect requires the external account id.",
      },
      accountMetadata: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "developer.oanda.com/rest-live-v20/account/ — GET /v3/accounts/{id}/summary",
        limitation: "Leverage is derived from the reported marginRate; no MT5-style server label exists.",
      },
      balanceEquity: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "developer.oanda.com/rest-live-v20/account/ — balance + NAV from /summary",
      },
      marginInfo: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "GET /v3/accounts/{id}/summary — marginUsed / marginAvailable",
        limitation: "marginLevel is not reported by OANDA — persisted as null (marginCloseoutPercent is a different semantic).",
      },
      openPositions: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "GET /v3/accounts/{id}/trades?state=OPEN (stable tradeID + openTime; the netted /positions aggregate exposes neither — §7.4 fallback)",
        limitation:
          "SL/TP prices and current price are not part of the open-trades payload (order IDs only) → null, never invented. Netting accounts may show multiple per-symbol rows (one per open trade).",
      },
      orders: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "GET /v3/accounts/{id}/pendingOrders",
        limitation:
          "Guaranteed-stop variants carry a distance instead of a price — such orders are excluded rather than represented with an invented price.",
      },
      deals: {
        support: "SUPPORTED",
        retrieval: "POLL",
        evidence: "GET /v3/accounts/{id}/transactions — ORDER_FILL + TRANSFER_FUNDS mapped; other transaction classes are bookkeeping and excluded by documented filter",
      },
      historyDepth: {
        support: "UNKNOWN",
        limitation: "Per-sync window bounded to the most recent 1000 transactions (v20 page max); exact practice-account depth unverified (U2).",
      },
      streamingAccountUpdates: {
        support: "UNSUPPORTED",
        limitation: "POLL-first strategy (doc D §5) — account-state streaming is not verified for v20 REST; data freshness is sync-anchored, never real-time.",
      },
      streamingPositions: { support: "UNSUPPORTED" },
      streamingOrderDealUpdates: { support: "UNSUPPORTED" },
      connectionValidation: {
        support: "SUPPORTED",
        retrieval: "ON_CONNECT",
        evidence: "GET /v3/accounts (token validity probe — the same endpoint the connection test uses)",
      },
      credentialRevocation: {
        support: "SUPPORTED",
        evidence: "OANDA FundMyAccount/Manage API — personal access tokens are user-revocable (doc D §4 least-privilege posture)",
      },
    },
    isMock: false,
  };

  private readonly restUrlOverride: string | null;
  private readonly requestTimeoutMs: number | undefined;

  constructor(options: OandaAdapterOptions = {}) {
    this.restUrlOverride = options.restUrlOverride ?? null;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  /** Endpoint host per account environment (practice vs live). */
  private baseUrl(context: ProviderRequestContext): string {
    if (this.restUrlOverride) return this.restUrlOverride;
    switch (context.environment) {
      case "DEMO":
        return OANDA_PRACTICE_HOST;
      case "LIVE":
        return OANDA_LIVE_HOST;
      case "PROP_FIRM":
        throw new ProviderError(
          "UNSUPPORTED_ACCOUNT",
          "The provider does not support this account environment.",
        );
    }
  }

  /**
   * One authenticated v20 call. Status-mapped to ProviderError codes; the
   * response body is parsed as JSON and validated by the CALLER's schema
   * (a shape-broken payload is INVALID_PROVIDER_RESPONSE, never a guess).
   */
  private async request<T>(
    context: ProviderRequestContext,
    path: string,
    schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  ): Promise<T> {
    // Resolved OUTSIDE the try — an environment rejection (PROP_FIRM) is an
    // honest UNSUPPORTED_ACCOUNT, never a swallowed network error.
    const url = `${this.baseUrl(context)}${path}`;
    // Transport backstop (Phase 04): the abort signal releases a hung socket;
    // an abort here surfaces as CONNECTION_TIMEOUT (the same class the
    // orchestrator's watchdog would report — never a fake success).
    const signal =
      this.requestTimeoutMs === undefined ? undefined : AbortSignal.timeout(this.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${context.credentials.secret}`,
          "Accept-Datetime-Format": "RFC3339",
        },
        signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        // Our own transport abort — sanitized, honest timeout class.
        throw new ProviderError("CONNECTION_TIMEOUT", "The trading provider did not respond in time.");
      }
      // Network/DNS failure — sanitized; timeouts stay the orchestrator's.
      throw new ProviderError("PROVIDER_UNAVAILABLE", "The trading provider is currently unavailable.");
    }

    if (!response.ok) {
      throw await statusToProviderError(response);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The trading provider returned an unexpected response.");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success || parsed.data === undefined) {
      throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The trading provider returned an unexpected response.");
    }
    return parsed.data;
  }

  /** Guard — the operation must be declared SUPPORTED before any call (doc A §4.3). */
  private assertSupported(key: Parameters<typeof capabilitySupportLevel>[1]): void {
    if (capability(this.descriptor.capabilities, key) !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "This provider does not declare support for the requested operation.",
      );
    }
  }

  async testConnection(credentials: ProviderCredentials): Promise<void> {
    if (capability(this.descriptor.capabilities, "connectionValidation") !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "This provider does not declare support for the requested operation.",
      );
    }
    // Token-validity probe: the token-scoped account list (status 200 = ok).
    // NO account id is read here — the discovery FEATURE stays U3-gated.
    const credentialsContext: ProviderRequestContext = {
      credentials,
      externalAccountId: "",
      environment: "DEMO",
    };
    await this.request(credentialsContext, "/v3/accounts", oandaAccountsListSchema);
  }

  async fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo> {
    this.assertSupported("accountMetadata");
    const summary = await this.request(context, summaryPath(context), oandaSummarySchema);
    assertEchoedAccount(context, summary.account.id);
    const info = accountInfoFromSummary(summary, context.externalAccountId);
    // The application's journal anchors on a closed currency vocabulary —
    // an account in a currency outside it is an honest UNSUPPORTED_ACCOUNT
    // (client-pickable), never a misleading INVALID_PROVIDER_RESPONSE.
    if (!currencySchema.safeParse(info.currency).success) {
      throw new ProviderError(
        "UNSUPPORTED_ACCOUNT",
        `The provider account currency ${info.currency} is not supported yet.`,
      );
    }
    return info;
  }

  async fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot> {
    this.assertSupported("balanceEquity");
    const summary = await this.request(context, summaryPath(context), oandaSummarySchema);
    assertEchoedAccount(context, summary.account.id);
    return snapshotFromSummary(summary);
  }

  async fetchPositions(context: ProviderRequestContext): Promise<NormalizedPosition[]> {
    this.assertSupported("openPositions");
    const payload = await this.request(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/trades?state=OPEN`,
      oandaTradesResponseSchema,
    );
    return positionsFromTrades(payload.trades);
  }

  async fetchOrders(context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    this.assertSupported("orders");
    const payload = await this.request(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/pendingOrders`,
      oandaOrdersResponseSchema,
    );
    return ordersFromPending(payload.orders).orders;
  }

  async fetchDeals(context: ProviderRequestContext): Promise<NormalizedDeal[]> {
    this.assertSupported("deals");
    const payload = await this.request(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/transactions?pageSize=${TRANSACTIONS_PAGE_SIZE}`,
      oandaTransactionsResponseSchema,
    );
    return dealsFromTransactions(payload.transactions);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const oandaAccountsListSchema = { safeParse(value: unknown) {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as { accounts?: unknown }).accounts)
  ) ? { success: true as const, data: value as { accounts: unknown[] } }
    : { success: false as const, data: undefined as never };
} };

function summaryPath(context: ProviderRequestContext): string {
  return `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/summary`;
}

/** The provider must answer ABOUT the requested account — a different id in
 * the payload means we are not talking about the stored account (defensive
 * identity check; a mismatch is a provider-contract violation). */
function assertEchoedAccount(context: ProviderRequestContext, echoedId: string): void {
  if (echoedId !== context.externalAccountId) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The trading provider returned an unexpected response.");
  }
}

/** Normative status → code mapping (doc B §4.3). Never reads the provider's
 * error body into the message — canned text only (mandate §9.5). */
async function statusToProviderError(response: Response): Promise<ProviderError> {
  switch (response.status) {
    case 401:
      return new ProviderError("INVALID_CREDENTIALS", "The provider rejected the credentials for this account.");
    case 403:
      return new ProviderError(
        "UNAUTHORIZED_PROVIDER_ACCESS",
        "The provider refused access to this account.",
      );
    case 404:
      return new ProviderError(
        "UNSUPPORTED_ACCOUNT",
        "The trading account was not found at the provider. Check the external account id.",
      );
    case 429: {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader === null ? undefined : Number(retryAfterHeader);
      return new ProviderError(
        "RATE_LIMITED",
        "The trading provider asked us to slow down.",
        { retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined },
      );
    }
    default:
      if (response.status >= 500) {
        return new ProviderError("PROVIDER_UNAVAILABLE", "The trading provider is currently unavailable.");
      }
      // 4xx other than the mapped classes (e.g. 400 malformed request on our
      // side) — not credential, not rate, not outage → provider-side contract.
      return new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned an unexpected response.",
      );
  }
}
