/**
 * Local Deriv WS v3 fixture server (Phase 07 test harness).
 *
 * Answers REALISTIC Deriv v3 payload shapes over a REAL WebSocket protocol
 * exchange (ws package, both sides) - the ONLY difference from production
 * being the transport endpoint. Used by the adapter unit spec and the e2e
 * spec (env-injected via ACCOUNTS_DERIV_WS_URL before buildTestApp).
 *
 * HONESTY LABEL: fixture evidence. This proves the ADAPTER + ORCHESTRATION +
 * PERSISTENCE pipeline; it is NEVER evidence of real Deriv connectivity
 * (that requires a user-created Deriv API token - the Phase 07 U4 runbook).
 *
 * The fixture also acts as a PROTOCOL SPY: it records every request name it
 * receives, and flags any name outside the documented read set as a RED-LINE
 * VIOLATION - tests assert zero violations.
 */
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

/** Names the connector may ever send (mirrors DERIV_READ_REQUEST_NAMES). */
const FIXTURE_READ_NAMES = new Set([
  "authorize",
  "balance",
  "portfolio",
  "profit_table",
  "statement",
  "ping",
  "website_status",
  "logout",
]);

export interface DerivFixtureState {
  /** Valid API token - anything else answers InvalidToken. */
  validToken: string;
  loginid: string;
  currency: string;
  isVirtual: boolean;
  landingCompanyName: string;
  landingCompanyFullName: string;
  balance: number;
  portfolio: Array<Record<string, unknown>>;
  /** DESC-by-sell_time master list (the fixture sorts defensively). */
  profitTable: Array<Record<string, unknown>>;
  /** Scenario switches. */
  rejectAuthorizeCode: string | null;
  rateLimitProfitTable: boolean;
  malformedPortfolio: boolean;
  malformedProfitTable: boolean;
  /** Protocol spy. */
  requests: Array<{ name: string; payload: Record<string, unknown> }>;
  /** Red-line violations (request names outside the read set). */
  violations: string[];
}

export function createDerivFixtureState(overrides: Partial<DerivFixtureState> = {}): DerivFixtureState {
  return {
    validToken: "fixture-deriv-read-token",
    loginid: "VRTC1234567",
    currency: "USD",
    isVirtual: true,
    landingCompanyName: "svg",
    landingCompanyFullName: "Deriv (SVG) Corp",
    balance: 10500.55,
    portfolio: [],
    profitTable: [],
    rejectAuthorizeCode: null,
    rateLimitProfitTable: false,
    malformedPortfolio: false,
    malformedProfitTable: false,
    requests: [],
    violations: [],
    ...overrides,
  };
}

/** Deterministic settled-contract row (sell_time in epoch seconds). */
export function profitRow(sellTime: number, index: number, profit = 12.34): Record<string, unknown> {
  return {
    transaction_id: `TXN-${String(index).padStart(6, "0")}-${sellTime}`,
    contract_id: 900000 + index,
    buy_price: 10.5,
    sell_price: profit > 0 ? 10.5 + profit : 10.5,
    payout: 20.84,
    profit,
    purchase_time: sellTime - 600,
    sell_time: sellTime,
    shortcode: `CALL_R_100_${(10.5).toFixed(2)}_${profit.toFixed(2)}`,
    app_id: 1089,
  };
}

export interface DerivFixture {
  url: string;
  port: number;
  state: DerivFixtureState;
  close(): Promise<void>;
}

export function startDerivFixture(state: DerivFixtureState): Promise<DerivFixture> {
  const server = createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("websocket endpoint only");
  });
  const wss = new WebSocketServer({ server });

  const send = (socket: WebSocket, body: unknown) => {
    socket.send(JSON.stringify(body));
  };

  wss.on("connection", (socket: InstanceType<typeof import("ws").WebSocket>) => {
    socket.on("message", (raw: unknown) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(raw));
      } catch {
        send(socket, { error: { code: "InvalidToken", message: "fixture unparseable" } });
        return;
      }
      const reqId = typeof message.req_id === "number" ? message.req_id : 0;
      const name = Object.keys(message).find(
        (k) => k !== "req_id" && k !== "markdown" && typeof (message as Record<string, unknown>)[k] !== "undefined",
      );
      if (!name) {
        send(socket, { error: { code: "InvalidToken", message: "fixture empty request" }, req_id: reqId });
        return;
      }
      // Deriv wire format: call parameters are SIBLINGS of the call key
      // (e.g. { profit_table: 1, limit: 500, offset: 0 }) - record the full
      // message as the payload.
      const payload = message;
      state.requests.push({ name, payload });
      if (!FIXTURE_READ_NAMES.has(name)) {
        state.violations.push(name); // RED LINE tripwire - tests assert empty
      }

      // ── authorize ────────────────────────────────────────────────────────
      if (name === "authorize") {
        if (state.rejectAuthorizeCode) {
          send(socket, { error: { code: state.rejectAuthorizeCode, message: "internal fixture detail never surfaced" }, req_id: reqId });
          return;
        }
        const token = payload.authorize;
        if (typeof token === "string" && token === state.validToken) {
          send(socket, {
            authorize: {
              loginid: state.loginid,
              currency: state.currency,
              is_virtual: state.isVirtual,
              balance: state.balance,
              user_id: "e0f1a2b3",
              landing_company_name: state.landingCompanyName,
              landing_company_full_name: state.landingCompanyFullName,
              country: "fr",
              email: "fixture-user@example.test",
              fullname: "Fixture User",
            },
            req_id: reqId,
          });
        } else {
          send(socket, { error: { code: "InvalidToken", message: "internal fixture detail never surfaced" }, req_id: reqId });
        }
        return;
      }

      // ── balance ──────────────────────────────────────────────────────────
      if (name === "balance") {
        send(socket, { balance: { balance: state.balance, currency: state.currency, loginid: state.loginid }, req_id: reqId });
        return;
      }

      // ── portfolio ────────────────────────────────────────────────────────
      if (name === "portfolio") {
        if (state.malformedPortfolio) {
          send(socket, { portfolio: { contracts: "not-an-array" }, req_id: reqId });
          return;
        }
        send(socket, { portfolio: { contracts: state.portfolio }, req_id: reqId });
        return;
      }

      // ── profit_table (documented pagination: limit/offset, DESC) ─────────
      if (name === "profit_table") {
        if (state.rateLimitProfitTable) {
          send(socket, { error: { code: "RateLimitExceeded", message: "internal fixture detail never surfaced" }, req_id: reqId });
          return;
        }
        if (state.malformedProfitTable) {
          send(socket, { profit_table: { transactions: 42 }, req_id: reqId });
          return;
        }
        const limit = typeof payload.limit === "number" ? payload.limit : 50;
        const offset = typeof payload.offset === "number" ? payload.offset : 0;
        const sorted = [...state.profitTable].sort(
          (a, b) => Number(b.sell_time) - Number(a.sell_time),
        );
        send(socket, {
          profit_table: { count: sorted.length, transactions: sorted.slice(offset, offset + limit) },
          req_id: reqId,
        });
        return;
      }

      // Everything else: acknowledge benignly (ping/website_status/logout).
      send(socket, { [name]: 1, req_id: reqId });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `ws://127.0.0.1:${port}`,
        port,
        state,
        close: () =>
          new Promise<void>((resolveClose) => {
            wss.close(() => server.close(() => resolveClose()));
          }),
      });
    });
  });
}
