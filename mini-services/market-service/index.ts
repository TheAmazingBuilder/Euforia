/**
 * Cosmoz market service — Market Data Hub for the Session Live (V1).
 *
 * Provider architecture (mission §34): sources implement the single
 * MarketDataProvider contract and stay responsible for their transport.
 *   - BinanceProvider  → REAL crypto prices (Binance public market data)
 *   - SimulatedProvider → labeled SIM walk for forex/synthetic catalog symbols
 *
 * Transport contract (unchanged, sandbox gateway compatible):
 *   - socket.io clients connect with  io("/?XTransformPort=3003")
 *   - REST snapshot:  GET /prices?XTransformPort=3003
 *   - Candle feed:    GET /candles?XTransformPort=3003&symbol=&interval=&limit=
 *   - Health:         GET /health
 *
 * Run: bun run dev  (bun --hot index.ts, port 3003)
 */
import { createServer } from "node:http";
import type { Socket } from "socket.io";
import { Server } from "socket.io";

import { bearerFromHeader, verifyAccessToken } from "./auth";
import { BinanceProvider } from "./providers/binance";
import { SimulatedProvider } from "./providers/simulated";
import { isInterval, type MarketDataProvider, type Tick } from "./providers/types";

const PORT = Number(process.env.PORT ?? 3003);
const BROADCAST_MS = 750;

// ── Providers (order = routing priority) ─────────────────────────────────────
const providers: MarketDataProvider[] = [new BinanceProvider(), new SimulatedProvider()];

interface Quote extends Tick {}
/** Latest quote per internal symbol — the REST/WS snapshot. */
const quotes = new Map<string, Quote>();
/** Symbols whose quote changed since the last broadcast (dirty flush). */
const dirty = new Set<string>();

function routeTick(tick: Tick): void {
  quotes.set(tick.symbol, tick);
  dirty.add(tick.symbol);
}

for (const provider of providers) {
  void provider.start(routeTick);
}

// ── HTTP: REST snapshot + candles + health ──────────────────────────────────
function json(res: import("node:http").ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

/**
 * REST auth guard (mission §61/§63): market reads are authenticated. /health
 * stays public — it is infrastructure telemetry, not trading data.
 */
function restAuth(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): string | null {
  const verdict = verifyAccessToken(bearerFromHeader(req.headers.authorization));
  if (!verdict.ok) {
    json(res, 401, { error: verdict.code });
    return null;
  }
  return verdict.userId;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/prices") {
    if (restAuth(req, res) === null) return;
    const symbol = url.searchParams.get("symbol");
    const list = [...quotes.values()].filter((quote) => !symbol || quote.symbol === symbol);
    json(res, 200, { quotes: list, ts: Date.now() });
    return;
  }

  if (url.pathname === "/candles") {
    if (restAuth(req, res) === null) return;
    const symbol = url.searchParams.get("symbol");
    const interval = url.searchParams.get("interval") ?? "5m";
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const ranged = fromParam !== null || toParam !== null;
    // Ranged requests (session replay) may pull up to 1000 buckets; the
    // plain chart datafeed keeps its 500 ceiling.
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 300) || 300, ranged ? 1000 : 500);
    const from = fromParam !== null ? Number(fromParam) : undefined;
    const to = toParam !== null ? Number(toParam) : undefined;
    if (!symbol || !isInterval(interval) || (ranged && (from === undefined || Number.isNaN(from)) && (to === undefined || Number.isNaN(to)))) {
      json(res, 400, { error: "symbol and interval (1m|5m|15m|30m|1H|4H|1D) are required" });
      return;
    }
    const provider = providers.find((candidate) => candidate.handles(symbol));
    if (!provider) {
      json(res, 404, { error: `no market data provider for ${symbol}` });
      return;
    }
    try {
      const candles = await provider.candles(symbol, interval, limit, from, to);
      json(res, 200, { symbol, interval, source: provider.source, candles });
    } catch (error) {
      // Structured, secret-free error (mission §27) — the client renders
      // "market data unavailable" and retries.
      console.error(`[market-service] candles ${symbol} ${interval} failed:`, error instanceof Error ? error.message : error);
      json(res, 502, { error: "market data provider unavailable" });
    }
    return;
  }

  if (url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      providers: providers.map((provider) => ({ id: provider.id, source: provider.source, status: provider.status() })),
      symbols: [...quotes.keys()],
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ── Socket.io: authenticated "prices" stream (mission §43/§45/§63) ─────────
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

/**
 * Handshake-time authentication. The client presents the Cosmoz access token
 * in `auth.token`; the connection is rejected with a structured auth error
 * otherwise. The verified subject is bound to the socket and joined to its
 * `user:<id>` room — the server-side scoping point for any future PRIVATE
 * stream (positions/orders/events are emitted only into the owner's room,
 * never addressed by client-named channels). Re-verification happens on
 * every explicit `subscribe` so long-lived sockets cannot outlive a
 * revoked/expired token silently.
 */
io.use((socket: Socket, next: (err?: Error) => void) => {
  const verdict = verifyAccessToken(socket.handshake.auth?.token);
  if (!verdict.ok) {
    next(new Error(verdict.code));
    return;
  }
  socket.data.userId = verdict.userId;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  void socket.join(`user:${userId}`);

  // Fresh snapshot on connect; the shared broadcast keeps everyone live.
  // Market prices are shared global data — the per-user room exists for
  // private streams, not to shard the price feed.
  socket.emit("prices", [...quotes.values()]);
  socket.on("subscribe", () => {
    // Re-check the presented token so a long-lived socket cannot outlive an
    // expired/revoked token silently (spec §76 negative tests).
    const verdict = verifyAccessToken(socket.handshake.auth?.token);
    if (!verdict.ok) {
      socket.emit("auth-error", verdict.code);
      socket.disconnect(true);
      return;
    }
    socket.emit("prices", [...quotes.values()]);
  });
});

setInterval(() => {
  if (dirty.size === 0) return;
  dirty.clear();
  io.emit("prices", [...quotes.values()]);
}, BROADCAST_MS);

httpServer.listen(PORT);

console.log(`[market-service] listening on :${PORT} — REST /prices /candles, WS path /socket.io/`);
