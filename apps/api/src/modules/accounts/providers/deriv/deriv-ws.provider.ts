/**
 * DerivWsProviderAdapter (Phase 07 — second REAL adapter, master prompt §7).
 *
 * Official Deriv WebSocket API v3, READ-ONLY subset, API-token authorization
 * (fits the existing API_KEY credential method — no schema change). The
 * endpoint is the documented `wss://ws.derivws.com/websockets/v3?app_id=…`;
 * the app id identifies the REGISTERING application (official prerequisite —
 * deployments set ACCOUNTS_DERIV_APP_ID; the dev default is Deriv's public
 * example id, documented in env.schema.ts). DEMO/LIVE share one endpoint:
 * the token authorizes exactly the account that created it (per-credential
 * authorization = one account, documented), and `is_virtual` distinguishes
 * the account class. PROP_FIRM is honestly rejected (no such Deriv entity).
 *
 * Read-only red line (§47/§3.1): this adapter implements EXACTLY the 6 read
 * methods of TradingProviderAdapter. Outbound REQUESTS are whitelisted to
 * { authorize, balance, portfolio, profit_table, statement, ping,
 * website_status, logout } — Deriv's execution verbs (buy, sell, cancel,
 * proposal, contract_update, …) are NOT part of the whitelist and no code
 * path can emit them. A structural test (deriv-ws-provider.spec.ts) pins
 * the whitelist contents.
 *
 * Connection model: one SHORT-LIVED WebSocket per adapter call (authorize →
 * work → close), mirroring the stateless per-request posture of the OANDA
 * adapter. Deriv keeps sessions alive for its own streaming products; Euforia
 * polls (Phase 05 scheduler) and deliberately does NOT hold sockets open —
 * no keep-alive machinery, no half-open state, bounded server usage.
 *
 * Error translation (doc B §4.3 normative table + official error catalog):
 *   InvalidToken / AuthorizationRequired → INVALID_CREDENTIALS (422 + ERROR)
 *   PermissionDenied                     → UNAUTHORIZED_PROVIDER_ACCESS
 *   RateLimitExceeded                    → RATE_LIMITED (transient retry)
 *   InvalidAppID (deployment config)     → INVALID_PROVIDER_RESPONSE
 *   WS handshake failure / early close   → PROVIDER_UNAVAILABLE
 *   hard transport timer                 → CONNECTION_TIMEOUT (socket destroyed)
 *   malformed JSON / schema / echo mismatch → INVALID_PROVIDER_RESPONSE
 * Provider error text is NEVER surfaced — messages are canned and sanitized
 * (mandate §9.5); only the stable code crosses upward.
 */
import WebSocket from "ws";
import type { TradingProviderDescriptor } from "../../../../shared/contracts";
import { capabilitySupportLevel } from "../../../../shared/contracts";
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
  accountInfoFromAuthorize,
  dealsFromProfitTable,
  derivAuthorizeSchema,
  derivBalanceSchema,
  derivErrorSchema,
  derivPortfolioSchema,
  derivProfitTableSchema,
  isValidDealsCursor,
  positionsFromPortfolio,
  snapshotFromBalance,
  type DerivAuthorizePayload,
  type DerivBalancePayload,
  type DerivPortfolioPayload,
  type DerivProfitTablePayload,
} from "./deriv-mapping";

/** Official documented endpoint (developers.deriv.com — WebSockets). */
const DERIV_DEFAULT_WS_URL = "wss://ws.derivws.com/websockets/v3";

/**
 * READ-ONLY REQUEST WHITELIST (red line). Every outbound message name MUST
 * be in this set. Deliberately absent: buy, sell, cancel, proposal,
 * proposal_open_contract, contract_update, transfer_*, payment_*, topup,
 * api_token (admin), and every other write/admin verb.
 */
export const DERIV_READ_REQUEST_NAMES: ReadonlySet<string> = new Set([
  "authorize", // session authorization (scope NA) — the token probe
  "balance", // account balance (scope: Read)
  "portfolio", // open contracts (scope: trading_information)
  "profit_table", // settled contracts summary (scope: trading_information)
  "statement", // account statement summary (scope: Read + trading_information)
  "ping", // keepalive/health (unauthenticated)
  "website_status", // documented dynamic rate-limit surface (api_call_limits)
  "logout", // end the session cleanly
]);

/** Safety caps — bounded page/row budgets (spec §20: no unbounded pulls). */
const PROFIT_TABLE_PAGE_SIZE = 500; // documented maximum per call (default 50)
const MAX_DEALS_PAGES = 10; // initial pull / incremental run: ≤ 5000 rows
const MAX_POSITION_ROWS = 1000; // portfolio is a single documented full set

function capability(
  capabilities: TradingProviderDescriptor["capabilities"],
  key: Parameters<typeof capabilitySupportLevel>[1],
) {
  return capabilitySupportLevel(capabilities, key);
}

export interface DerivAdapterOptions {
  /** WS endpoint override (tests/fixture server); null = official endpoint. */
  wsUrlOverride?: string | null;
  /** Registered application id (developers.deriv.com); dev default documented. */
  appId?: string;
  /**
   * Transport-level hard timer (ms) — Phase 04 posture carried over: fires
   * ABOVE the orchestrator watchdog (withProviderTimeout → CONNECTION_TIMEOUT)
   * and DESTROYS the socket so a hung provider cannot leak a connection.
   */
  requestTimeoutMs?: number;
}

/** One authorized v3 session — authorize once, issue read calls, close. */
interface DerivCall {
  <T>(requestName: string, payload: Record<string, unknown>): Promise<T>;
}

export class DerivWsProviderAdapter implements TradingProviderAdapter {
  readonly descriptor: TradingProviderDescriptor = {
    providerId: "deriv-ws",
    providerName: "Deriv WebSocket API",
    platform: "DERIV",
    supportedEnvironments: ["DEMO", "LIVE"],
    supportedConnectionMethods: ["API_KEY"],
    // Least-privilege: users create a Read-scope API token (official scope
    // "Read — view market data and account information"). NO READ_ORDERS —
    // the orders capability is honestly UNSUPPORTED (see capabilities).
    supportedPermissions: [
      "READ_ACCOUNT",
      "READ_BALANCE",
      "READ_POSITIONS",
      "READ_DEALS",
      "READ_HISTORY",
    ],
    capabilities: {
      accountDiscovery: {
        support: "UNKNOWN",
        evidence: "A Deriv API token authorizes exactly the account that created it (authorize response); account_list lists the user's other accounts but V1 links ONE account per connection.",
        limitation: "Multi-account discovery is a deferred product decision (U3) — the token-scoped account id must be supplied by the user, like OANDA.",
      },
      accountMetadata: {
        support: "SUPPORTED",
        retrieval: "POLL",
        requiresPermissions: ["READ_ACCOUNT"],
        evidence: "developers.deriv.com — Account Management / authorize (loginid, currency, is_virtual, landing company). Docs accessed 2026-10-14.",
      },
      balanceEquity: {
        support: "SUPPORTED",
        retrieval: "POLL",
        requiresPermissions: ["READ_BALANCE"],
        evidence: "developers.deriv.com — Account Management / Balance (scope Read). Docs accessed 2026-10-14.",
        limitation: "Deriv reports ONE balance number — equity/margin arrive as null and are never approximated from balance.",
      },
      marginInfo: {
        support: "UNSUPPORTED",
        evidence: "The v3 balance/authorize responses carry no margin fields.",
        limitation: "Honest absence — margin metrics are not reported for Deriv options/multiplier accounts.",
      },
      openPositions: {
        support: "SUPPORTED",
        retrieval: "POLL",
        requiresPermissions: ["READ_POSITIONS"],
        evidence: "developers.deriv.com — Account Management / Portfolio: 'Get a list of all open positions for the authorized account… returns only open (active) contracts'. Docs accessed 2026-10-14.",
      },
      orders: {
        support: "UNSUPPORTED",
        evidence: "The v3 API exposes no read for resting/pending orders — Deriv orders are immediate contract purchases.",
        limitation: "The connector declares no orders capability and never presents an empty list as a successful complete query.",
      },
      deals: {
        support: "SUPPORTED",
        retrieval: "POLL",
        requiresPermissions: ["READ_DEALS", "READ_HISTORY"],
        evidence: "developers.deriv.com — Account Management / Profit table: 'Retrieve a summary of account profit/loss', pagination limit+offset, default 50, max 500/call. Docs accessed 2026-10-14.",
        limitation: "Settled-contract rows only; incremental sync resumes from the newest observed sell_time (epoch checkpoint).",
      },
      historyDepth: {
        support: "UNKNOWN",
        evidence: "The profit_table retention window is not documented by the provider.",
        limitation: "History is bounded by the connector's pagination caps — honestly incomplete beyond them; never presented as a complete lifetime record.",
      },
      streamingAccountUpdates: {
        support: "UNSUPPORTED",
        evidence: "The provider offers WS subscriptions (balance/transaction streams); this connector implements polling only in Phase 07.",
        limitation: "Nothing claims real-time freshness — the UI copy and freshness model stay polling-based (Phase 05).",
      },
      streamingPositions: {
        support: "UNSUPPORTED",
        evidence: "proposal_open_contract streaming exists but is not implemented — polling via portfolio.",
        limitation: "Positions refresh on synchronization runs only.",
      },
      streamingOrderDealUpdates: {
        support: "UNSUPPORTED",
        evidence: "transaction streaming exists but is not implemented — polling via profit_table.",
        limitation: "Deals refresh on synchronization runs only.",
      },
      connectionValidation: {
        support: "SUPPORTED",
        retrieval: "ON_CONNECT",
        requiresPermissions: ["READ_ACCOUNT"],
        evidence: "authorize is the documented session authorization probe; an invalid token answers InvalidToken.",
      },
      credentialRevocation: {
        support: "SUPPORTED",
        retrieval: "POLL",
        requiresPermissions: ["READ_ACCOUNT"],
        evidence: "Tokens are created/revoked in the Deriv dashboard; a revoked token answers InvalidToken on the next call.",
        limitation: "Revocation detection is pull-based (next adapter call), not push.",
      },
    },
    isMock: false,
  };

  constructor(private readonly options: DerivAdapterOptions = {}) {}

  // ── Endpoint resolution ─────────────────────────────────────────────────────

  /** Resolved WS endpoint — override wins (tests/edge), else the official URL. */
  private resolveUrl(): string {
    const override = this.options.wsUrlOverride;
    if (override && override.length > 0) return override;
    const appId = this.options.appId ?? "1089";
    return `${DERIV_DEFAULT_WS_URL}?app_id=${encodeURIComponent(appId)}`;
  }

  private requireSupportedEnvironment(environment: ProviderRequestContext["environment"]): void {
    if (!this.descriptor.supportedEnvironments.includes(environment)) {
      // Mirrors the OANDA PROP_FIRM posture: honest rejection, no guessing.
      throw new ProviderError(
        "UNSUPPORTED_ACCOUNT",
        "The provider does not support this account environment.",
      );
    }
  }

  // ── Session plumbing (one socket per call, hard-timed, always closed) ──────

  /**
   * Open a WebSocket, authorize with the token, run `work` with a typed
   * `call` helper, then close. Guarantees: exactly one in-flight request at
   * a time (req_id correlation), whitelist enforcement, hard transport timer
   * that destroys the socket, and a close in every path (finally).
   */
  private withSession<T>(
    credentials: ProviderCredentials,
    work: (call: DerivCall, authorize: DerivAuthorizePayload) => Promise<T>,
  ): Promise<T> {
    const hardTimeoutMs = this.options.requestTimeoutMs ?? 12_000;
    return new Promise<T>((outerResolve, outerReject) => {
      let settled = false;
      let nextReqId = 1;
      const pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
      >();

      const finish = (error?: Error, value?: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        for (const p of pending.values()) {
          p.reject(error ?? new Error("session closed"));
        }
        pending.clear();
        try {
          socket?.close();
        } catch {
          // already closed — nothing to release
        }
        if (error) outerReject(error);
        else outerResolve(value as T);
      };

      const hardTimer = setTimeout(() => {
        finish(
          new ProviderError(
            "CONNECTION_TIMEOUT",
            "The trading provider did not respond in time.",
          ),
        );
      }, hardTimeoutMs);

      let socket: WebSocket | undefined;
      try {
        socket = new WebSocket(this.resolveUrl());
      } catch {
        finish(
          new ProviderError(
            "PROVIDER_UNAVAILABLE",
            "The trading provider could not be reached.",
          ),
        );
        return;
      }

      const sendRaw = (message: Record<string, unknown>): number => {
        const reqId = nextReqId++;
        try {
          socket?.send(JSON.stringify({ ...message, req_id: reqId }));
        } catch {
          finish(
            new ProviderError(
              "PROVIDER_UNAVAILABLE",
              "The trading provider could not be reached.",
            ),
          );
        }
        return reqId;
      };

      const call: DerivCall = async <T>(requestName: string, payload: Record<string, unknown>) => {
        // RED LINE — no message may leave outside the read whitelist.
        if (!DERIV_READ_REQUEST_NAMES.has(requestName)) {
          throw new ProviderError(
            "UNSUPPORTED_CAPABILITY",
            "The requested provider operation is not part of the declared read-only capabilities.",
          );
        }
        if (settled) {
          throw new ProviderError(
            "PROVIDER_UNAVAILABLE",
            "The trading provider could not be reached.",
          );
        }
        return new Promise<T>((resolve, reject) => {
          const reqId = sendRaw({ [requestName]: 1, ...payload });
          pending.set(reqId, {
            resolve: resolve as (value: unknown) => void,
            reject,
          });
        });
      };

      socket.on("open", () => {
        const reqId = sendRaw({ authorize: credentials.secret });
        pending.set(reqId, {
          resolve: undefined as unknown as (value: unknown) => void,
          reject: undefined as unknown as (error: Error) => void,
        });
        pending.delete(reqId); // authorize handled by the message router below
        authorizeRequested = true;
      });

      let authorizeRequested = false;
      let authorizeSettled: ((p: { ok: true; payload: DerivAuthorizePayload } | { ok: false; error: ProviderError }) => void) | null =
        null;
      const authorizePromise = () =>
        new Promise<{ ok: true; payload: DerivAuthorizePayload } | { ok: false; error: ProviderError }>(
          (resolve) => {
            authorizeSettled = resolve;
          },
        );

      socket.on("message", (data: WebSocket.RawData) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(data));
        } catch {
          finish(
            new ProviderError(
              "INVALID_PROVIDER_RESPONSE",
              "The trading provider returned a malformed response.",
            ),
          );
          return;
        }

        // Authorize responses (no req_id waiter registered) route here.
        if (authorizeRequested && authorizeSettled) {
          const errorCheck = derivErrorSchema.safeParse(parsed);
          if (errorCheck.success) {
            const resolver = authorizeSettled;
            authorizeSettled = null;
            resolver({ ok: false, error: mapDerivError(errorCheck.data.error.code) });
            return;
          }
          const authCheck = derivAuthorizeSchema.safeParse(parsed);
          if (authCheck.success) {
            const resolver = authorizeSettled;
            authorizeSettled = null;
            resolver({ ok: true, payload: authCheck.data });
            return;
          }
          const resolver = authorizeSettled;
          authorizeSettled = null;
          resolver({
            ok: false,
            error: new ProviderError(
              "INVALID_PROVIDER_RESPONSE",
              "The trading provider returned a malformed response.",
            ),
          });
          return;
        }

        // Regular calls route by req_id.
        const reqId = (parsed as { req_id?: number } | null)?.req_id;
        if (typeof reqId === "number" && pending.has(reqId)) {
          const waiter = pending.get(reqId)!;
          pending.delete(reqId);
          const errorCheck = derivErrorSchema.safeParse(parsed);
          if (errorCheck.success) {
            waiter.reject(mapDerivError(errorCheck.data.error.code));
            return;
          }
          waiter.resolve(parsed);
          return;
        }
        // Unsolicited frames are ignored (subscription noise never exists in
        // this client — nothing was subscribed — so this is pure tolerance).
      });

      socket.on("error", () => {
        finish(
          new ProviderError(
            "PROVIDER_UNAVAILABLE",
            "The trading provider could not be reached.",
          ),
        );
      });

      socket.on("close", () => {
        if (!settled && authorizeSettled) {
          const resolver = authorizeSettled;
          authorizeSettled = null;
          resolver({
            ok: false,
            error: new ProviderError(
              "PROVIDER_UNAVAILABLE",
              "The trading provider could not be reached.",
            ),
          });
        }
        // A close after settle is the normal lifecycle; a close before any
        // settle with pending calls fails them via finish() below.
        if (!settled && pending.size > 0) {
          finish(
            new ProviderError(
              "PROVIDER_UNAVAILABLE",
              "The trading provider could not be reached.",
            ),
          );
        }
      });

      // Driver: authorize → work → settle.
      void (async () => {
        const authResult = await authorizePromise();
        if (!authResult.ok) {
          finish(authResult.error);
          return;
        }
        try {
          const value = await work(call, authResult.payload);
          finish(undefined, value);
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new ProviderError(
                  "INVALID_PROVIDER_RESPONSE",
                  "The trading provider returned a malformed response.",
                ),
          );
        }
      })();
    });
  }

  // ── Shared per-call steps ───────────────────────────────────────────────────

  /**
   * Authorize + account binding: the v3 session is bound to the token's own
   * account, so the echoed loginid MUST equal the requested external id and
   * the account class MUST match the declared environment — any divergence
   * is an honest UNSUPPORTED_ACCOUNT, never a silent cross-account read.
   */
  private assertAuthorizedAccount(
    authorize: DerivAuthorizePayload,
    context: ProviderRequestContext,
  ): void {
    if (authorize.authorize.loginid !== context.externalAccountId) {
      throw new ProviderError(
        "UNSUPPORTED_ACCOUNT",
        "The provider account does not match the connected account id.",
      );
    }
    const isDemo = authorize.authorize.is_virtual;
    if ((context.environment === "DEMO" && !isDemo) || (context.environment === "LIVE" && isDemo)) {
      throw new ProviderError(
        "UNSUPPORTED_ACCOUNT",
        "The declared environment does not match the provider account class.",
      );
    }
  }

  private static mapMappingFailure(error: unknown, fallback: string): ProviderError {
    // Mapping failures carry sanitized markers only (no provider payload).
    return new ProviderError("INVALID_PROVIDER_RESPONSE", fallback, { cause: error });
  }

  // ── The 6-method port ───────────────────────────────────────────────────────

  async testConnection(credentials: ProviderCredentials): Promise<void> {
    const guard = capability(this.descriptor.capabilities, "connectionValidation");
    if (guard !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "The requested provider operation is not part of the declared read-only capabilities.",
      );
    }
    await this.withSession(credentials, async () => undefined);
  }

  async fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo> {
    this.requireSupportedEnvironment(context.environment);
    const guard = capability(this.descriptor.capabilities, "accountMetadata");
    if (guard !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "The requested provider operation is not part of the declared read-only capabilities.",
      );
    }
    return this.withSession(context.credentials, async (_call, authorize) => {
      this.assertAuthorizedAccount(authorize, context);
      return accountInfoFromAuthorize(authorize);
    });
  }

  async fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot> {
    this.requireSupportedEnvironment(context.environment);
    const guard = capability(this.descriptor.capabilities, "balanceEquity");
    if (guard !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "The requested provider operation is not part of the declared read-only capabilities.",
      );
    }
    return this.withSession(context.credentials, async (call, authorize) => {
      this.assertAuthorizedAccount(authorize, context);
      const raw = await call<unknown>("balance", {});
      const parsed = derivBalanceSchema.safeParse(raw);
      if (!parsed.success) {
        throw DerivWsProviderAdapter.mapMappingFailure(
          parsed.error,
          "The trading provider returned a malformed response.",
        );
      }
      const balance: DerivBalancePayload = parsed.data;
      if (balance.balance.loginid !== context.externalAccountId) {
        throw new ProviderError(
          "UNSUPPORTED_ACCOUNT",
          "The provider account does not match the connected account id.",
        );
      }
      return snapshotFromBalance(balance);
    });
  }

  async fetchPositions(context: ProviderRequestContext): Promise<PositionsSyncResult> {
    this.requireSupportedEnvironment(context.environment);
    const guard = capability(this.descriptor.capabilities, "openPositions");
    if (guard !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "The requested provider operation is not part of the declared read-only capabilities.",
      );
    }
    return this.withSession(context.credentials, async (call, authorize) => {
      this.assertAuthorizedAccount(authorize, context);
      const raw = await call<unknown>("portfolio", {});
      const parsed = derivPortfolioSchema.safeParse(raw);
      if (!parsed.success) {
        throw DerivWsProviderAdapter.mapMappingFailure(
          parsed.error,
          "The trading provider returned a malformed response.",
        );
      }
      const portfolio: DerivPortfolioPayload = parsed.data;
      let positions;
      try {
        positions = positionsFromPortfolio(portfolio);
      } catch (error) {
        throw DerivWsProviderAdapter.mapMappingFailure(
          error,
          "The trading provider returned a malformed response.",
        );
      }
      // Bounded-row posture: the documented response IS the full open set,
      // but a pathological account must not blow the run — truncate honestly.
      if (positions.length > MAX_POSITION_ROWS) {
        return { positions: positions.slice(0, MAX_POSITION_ROWS), complete: false };
      }
      // Documented semantics: portfolio returns ALL open (active) contracts.
      return { positions, complete: true };
    });
  }

  async fetchOrders(_context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    // Honest capability fact: Deriv exposes NO resting-order read. The
    // orchestrator skips this segment from the descriptor (capability gate);
    // the adapter-level throw is defense in depth against direct misuse.
    throw new ProviderError(
      "UNSUPPORTED_CAPABILITY",
      "The requested provider operation is not part of the declared read-only capabilities.",
    );
  }

  async fetchDeals(context: ProviderRequestContext): Promise<DealsSyncResult> {
    this.requireSupportedEnvironment(context.environment);
    const guard = capability(this.descriptor.capabilities, "deals");
    if (guard !== "SUPPORTED") {
      throw new ProviderError(
        "UNSUPPORTED_CAPABILITY",
        "The requested provider operation is not part of the declared read-only capabilities.",
      );
    }
    const cursor = context.dealsCursor ?? null;
    if (!isValidDealsCursor(cursor)) {
      // A corrupted checkpoint is a DATA error, not a provider error — fail
      // loud so it surfaces (mirrors the OANDA cursor-shape validation).
      throw new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned a malformed response.",
      );
    }
    return this.withSession(context.credentials, async (call, authorize) => {
      this.assertAuthorizedAccount(authorize, context);
      return this.pullDeals(call, cursor);
    });
  }

  /**
   * Profit-table pagination (documented limit+offset, DESC by sell_time).
   * Incremental (cursor present): walk pages newest→older, keep rows with
   * sell_time >= cursor (boundary ties re-upserted idempotently), stop when
   * a row is strictly older than the cursor. Checkpoint semantics: the
   * returned observedThrough NEVER covers rows that were not observed —
   * a page-cap hit reports the OLDEST observed sell_time and complete:false.
   *
   * Correct checkpoint semantics: the cursor is a FLOOR ("everything up to
   * it was observed in previous runs"), so once rows ≥ cursor are observed
   * in THIS run, observedThrough advances to the NEWEST observed epoch —
   * the gap between the old cursor and that point is fully covered by the
   * DESC scan. The cursor value is returned only when nothing was observed
   * (checkpoint kept). A page-cap hit is the ONE case where the scan did
   * NOT reach its natural stop: observedThrough falls back to the OLDEST
   * observed epoch (complete:false), never skipping unobserved rows.
   */
  private async pullDeals(call: DerivCall, cursor: string | null): Promise<DealsSyncResult> {
    const cursorValue = cursor !== null ? Number(cursor) : null;
    const collected: ReturnType<typeof dealsFromProfitTable> = [];
    let oldestObservedEpoch: number | null = null;
    let newestObservedEpoch: number | null = null;
    let capReached = false;

    for (let page = 0; page < MAX_DEALS_PAGES; page += 1) {
      const raw = await call<unknown>("profit_table", {
        description: 0,
        limit: PROFIT_TABLE_PAGE_SIZE,
        offset: page * PROFIT_TABLE_PAGE_SIZE,
        sort: "DESC",
      });
      const parsed = derivProfitTableSchema.safeParse(raw);
      if (!parsed.success) {
        throw DerivWsProviderAdapter.mapMappingFailure(
          parsed.error,
          "The trading provider returned a malformed response.",
        );
      }
      const payload: DerivProfitTablePayload = parsed.data;
      const rows = payload.profit_table.transactions;
      if (rows.length === 0) break;

      let pageHasOlderThanCursor = false;
      for (const row of rows) {
        const sellEpochRaw = typeof row.sell_time === "number" ? row.sell_time : Number(row.sell_time);
        if (!Number.isFinite(sellEpochRaw) || sellEpochRaw <= 0) {
          throw DerivWsProviderAdapter.mapMappingFailure(
            row.transaction_id,
            "The trading provider returned a malformed response.",
          );
        }
        if (cursorValue !== null && sellEpochRaw < cursorValue) {
          pageHasOlderThanCursor = true;
          break;
        }
        oldestObservedEpoch =
          oldestObservedEpoch === null ? sellEpochRaw : Math.min(oldestObservedEpoch, sellEpochRaw);
        newestObservedEpoch =
          newestObservedEpoch === null ? sellEpochRaw : Math.max(newestObservedEpoch, sellEpochRaw);
        let mapped;
        try {
          mapped = dealsFromProfitTable({ profit_table: { transactions: [row] } });
        } catch (error) {
          throw DerivWsProviderAdapter.mapMappingFailure(
            error,
            "The trading provider returned a malformed response.",
          );
        }
        collected.push(...mapped);
      }

      if (pageHasOlderThanCursor) {
        break; // natural stop: the checkpoint floor was reached
      }
      if (rows.length < PROFIT_TABLE_PAGE_SIZE) break; // exhausted provider set
      if (page === MAX_DEALS_PAGES - 1) capReached = true; // cap, not exhaustion
    }

    // observedThrough must never cover unobserved rows:
    //  - cap reached → the scan did NOT reach its natural stop: the OLDEST
    //    row actually observed this run (complete:false)
    //  - otherwise, everything from the top of the DESC scan down to the
    //    stop point was observed, and everything below it was covered by
    //    previous runs (the cursor floor) → the NEWEST observed epoch
    //  - nothing observed at all → keep the existing checkpoint
    let observedThrough: string | null = null;
    if (capReached && oldestObservedEpoch !== null) {
      observedThrough = String(oldestObservedEpoch);
    } else if (newestObservedEpoch !== null) {
      observedThrough = String(newestObservedEpoch);
    } else if (cursorValue !== null) {
      observedThrough = String(cursorValue); // nothing new; keep the checkpoint
    }
    const complete = !capReached;
    return { deals: collected, observedThrough, complete };
  }
}

/** Official error-code catalog → stable provider error (messages canned). */
function mapDerivError(code: string): ProviderError {
  switch (code) {
    case "InvalidToken":
    case "AuthorizationRequired":
      return new ProviderError(
        "INVALID_CREDENTIALS",
        "The provider rejected the credentials.",
      );
    case "PermissionDenied":
      return new ProviderError(
        "UNAUTHORIZED_PROVIDER_ACCESS",
        "The provider refused access for this credential.",
      );
    case "RateLimitExceeded":
      return new ProviderError(
        "RATE_LIMITED",
        "The trading provider asked to slow down.",
      );
    case "InvalidAppID":
    case "AppIdDisabled":
      // Deployment configuration problem — honest, stable, non-secret.
      return new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned a malformed response.",
      );
    default:
      return new ProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "The trading provider returned a malformed response.",
      );
  }
}
