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
  DealsSyncResult,
  NormalizedAccountInfo,
  NormalizedOrder,
  NormalizedSnapshot,
  PositionsSyncResult,
  ProviderCredentials,
  ProviderRequestContext,
  TradingProviderAdapter,
} from "../../provider.types";
import { ProviderError } from "../../provider.types";
import {
  accountInfoFromSummary,
  dealsFromTransactions,
  maxTransactionId,
  oandaOrdersResponseSchema,
  oandaSummarySchema,
  oandaTradesResponseSchema,
  oandaTransactionsPagesSchema,
  type OandaTransactionRow,
  oandaTransactionsResponseSchema,
  ordersFromPending,
  positionsFromTrades,
  snapshotFromSummary,
} from "./oanda-mapping";

/** Official v20 hosts (developer.oanda.com) — routing by account environment. */
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";
const OANDA_LIVE_HOST = "https://api-fxtrade.oanda.com";

/** Page size for the initial time-based /transactions query (v20 page max). */
const TRANSACTIONS_PAGE_SIZE = 1000;
/** Full-refresh page size for /trades and /pendingOrders (v20 documented
 * maximum — the ENDPOINT default is 50, which silently truncated the open
 * set; fixed in Phase 05 per spec §8.1). */
const LIST_PAGE_SIZE = 500;
/** Safety caps — bounded page/row budgets (spec §20: no unbounded pulls).
 * Hitting a cap yields an honestly INCOMPLETE result, never a silent guess:
 * positions closure is skipped and the deals checkpoint does not advance
 * past the rows actually observed. */
const MAX_LIST_PAGES = 20; // 20 × 500 = 10 000 trades/orders per run
const MAX_DEALS_PAGES = 5; // initial pull: 5 idrange pages per run
const MAX_DEAL_ROWS = 10_000; // incremental pull: rows processed per run

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
   * Returns the parsed body PLUS the documented Link rel="next" pagination
   * link when present (Phase 05 pagination, same-origin guarded downstream).
   */
  private async requestWithMeta<T>(
    context: ProviderRequestContext,
    path: string,
    schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  ): Promise<{ data: T; linkNext: string | null }> {
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

    const linkNext = parseNextLink(response.headers.get("link"));

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
    return { data: parsed.data, linkNext };
  }

  private async request<T>(
    context: ProviderRequestContext,
    path: string,
    schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  ): Promise<T> {
    return (await this.requestWithMeta(context, path, schema)).data;
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

  async fetchPositions(context: ProviderRequestContext): Promise<PositionsSyncResult> {
    this.assertSupported("openPositions");
    // count=500 (documented maximum — the endpoint default is 50) + follow
    // the documented Link rel="next" pagination until exhausted (spec §8.1:
    // never assume the first response is the full dataset). A page or cap
    // boundary yields complete=false → the orchestrator skips closure.
    const trades = await this.followPaginatedList(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/trades?state=OPEN&count=${LIST_PAGE_SIZE}`,
      oandaTradesResponseSchema,
      (payload) => payload.trades,
      MAX_LIST_PAGES,
    );
    return {
      positions: positionsFromTrades(trades.rows),
      complete: trades.complete,
    };
  }

  async fetchOrders(context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    this.assertSupported("orders");
    const orders = await this.followPaginatedList(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/pendingOrders?count=${LIST_PAGE_SIZE}`,
      oandaOrdersResponseSchema,
      (payload) => payload.orders,
      MAX_LIST_PAGES,
    );
    // Upsert-only resource: no closure decision depends on completeness
    // (an order absent from the pending set has a terminal state — filled
    // vs cancelled — that the pending listing does not expose; correlation
    // is a documented DEFERRED item, never guessed).
    return ordersFromPending(orders.rows).orders;
  }

  /**
   * Deals with documented incremental checkpoint semantics (Phase 05, spec
   * §8 — OANDA v20 verified 2026-10-13):
   *
   *   cursor present → GET /transactions/sinceid?id={cursor} — "return all
   *     Transactions newer than the TransactionID" (rows inline).
   *   no cursor      → GET /transactions?pageSize=1000 — the time-based
   *     listing returns PAGE URLS (idrange), not rows; follow up to
   *     MAX_DEALS_PAGES of them in order.
   *
   * observedThrough = max transaction id OBSERVED (ALL rows — including the
   * bookkeeping classes the deal mapping filters out — otherwise a run over
   * an all-bookkeeping page could never advance the checkpoint). Bounded:
   * page caps + a row cap; exceeding one returns complete=false with the
   * rows observed so far, and the checkpoint covers exactly those rows.
   */
  async fetchDeals(context: ProviderRequestContext): Promise<DealsSyncResult> {
    this.assertSupported("deals");
    const cursor = context.dealsCursor ?? null;

    if (cursor !== null) {
      // Incremental: the documented sinceid cursor. Validate the cursor
      // shape BEFORE building the request — a corrupted checkpoint is an
      // INVALID_PROVIDER_RESPONSE-class input error, never a silently
      // wrong query (§8.2: treat cursors as provider-specific data).
      if (!/^\d{1,15}$/.test(cursor)) {
        throw new ProviderError(
          "INVALID_PROVIDER_RESPONSE",
          "The stored synchronization checkpoint is not usable. Reconnect or run a full refresh.",
        );
      }
      const payload = await this.request(
        context,
        `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/transactions/sinceid?id=${cursor}`,
        oandaTransactionsResponseSchema,
      );
      const rows = payload.transactions;
      if (rows.length <= MAX_DEAL_ROWS) {
        return {
          deals: dealsFromTransactions(rows),
          observedThrough: maxTransactionId(rows.map((row) => row.id)),
          complete: true,
        };
      }
      // Row cap hit: process the FIRST MAX_DEAL_ROWS rows in provider order,
      // keep the checkpoint strictly inside what was observed/persistable.
      const kept = rows.slice(0, MAX_DEAL_ROWS);
      return {
        deals: dealsFromTransactions(kept),
        observedThrough: maxTransactionId(kept.map((row) => row.id)),
        complete: false,
      };
    }

    // Initial pull (no checkpoint): the time-based listing default window is
    // account-creation → now (documented). The response carries page URLs —
    // never rows. Follow the FIRST MAX_DEALS_PAGES pages in order; if more
    // pages exist the run is honestly incomplete AND the checkpoint covers
    // exactly the observed rows — the next scheduled run resumes from there
    // (sinceid) and catch-up progresses run over run without unbounded pulls.
    const listing = await this.request(
      context,
      `/v3/accounts/${encodeURIComponent(context.externalAccountId)}/transactions?pageSize=${TRANSACTIONS_PAGE_SIZE}`,
      oandaTransactionsPagesSchema,
    );
    if (listing.pages.length === 0) {
      return { deals: [], observedThrough: null, complete: true };
    }
    const rows: OandaTransactionRow[] = [];
    let visited = 0;
    let complete = true;
    for (const pageUrl of listing.pages) {
      if (visited >= MAX_DEALS_PAGES) {
        complete = false;
        break;
      }
      const path = safeProviderPagePath(pageUrl, this.baseUrl(context));
      const page = await this.request(context, path, oandaTransactionsResponseSchema);
      visited += 1;
      for (const row of page.transactions) {
        if (rows.length >= MAX_DEAL_ROWS) {
          complete = false;
          break;
        }
        rows.push(row);
      }
      if (!complete) break;
    }
    complete = complete && visited >= listing.pages.length;
    return {
      deals: dealsFromTransactions(rows),
      observedThrough: maxTransactionId(rows.map((row) => row.id)),
      complete,
    };
  }

  /**
   * Follow a v20 list endpoint's documented Link rel="next" pagination
   * (developer.oanda.com: "A link to the next page ... if the results were
   * paginated"). Stops at `maxPages` — a cap boundary is an honest
   * complete=false, never a silent truncation presented as the full set.
   */
  private async followPaginatedList<TPayload,TRow>(
    context: ProviderRequestContext,
    firstPath: string,
    schema: { safeParse(value: unknown): { success: boolean; data?: TPayload } },
    rowsOf: (payload: TPayload) => TRow[],
    maxPages: number,
  ): Promise<{ rows: TRow[]; complete: boolean }> {
    const rows: TRow[] = [];
    let path: string | null = firstPath;
    let visited = 0;
    while (path !== null) {
      if (visited >= maxPages) {
        return { rows, complete: false };
      }
      const result: { data: TPayload; linkNext: string | null } = await this.requestWithMeta(
        context,
        path,
        schema,
      );
      rows.push(...rowsOf(result.data));
      visited += 1;
      const next: string | null = result.linkNext;
      path = next === null ? null : safeProviderPagePath(next, this.baseUrl(context));
    }
    return { rows, complete: true };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const oandaAccountsListSchema = { safeParse(value: unknown) {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as { accounts?: unknown }).accounts)
  ) ? { success: true as const, data: value as { accounts: unknown[] } }
    : { success: false as const, data: undefined as never };
} };

/**
 * Parse the documented Link pagination header: `<url>; rel="next"`.
 * Returns ONLY the rel="next" target; anything else is ignored (absence of
 * the header/link = last page — the documented end-of-pagination signal).
 */
export function parseNextLink(linkHeader: string | null): string | null {
  if (linkHeader === null) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  return match?.[1] ?? null;
}

/**
 * Same-origin guard for provider-issued pagination URLs (Link header and
 * ListTransactions `pages`). Provider pages point at idrange queries on the
 * SAME configured host; anything else (different host, non-http(s), no
 * /v3/ path) is refused — we never fetch a provider-supplied URL outside
 * the configured endpoint (SSRF posture, spec §14).
 */
export function safeProviderPagePath(pageUrl: string, baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl, baseUrl);
  } catch {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The trading provider returned an unexpected response.");
  }
  const base = new URL(baseUrl);
  if (parsed.protocol !== base.protocol || parsed.host !== base.host || !parsed.pathname.startsWith("/v3/")) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The trading provider returned an unexpected response.");
  }
  return `${parsed.pathname}${parsed.search}`;
}

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
