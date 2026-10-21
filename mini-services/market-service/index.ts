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

import { bearerFromHeader, verifyAccessToken, MOCK_ACCESS_SECRET } from "./auth";
import { BinanceProvider } from "./providers/binance";
import { SimulatedProvider } from "./providers/simulated";
import { isInterval, type MarketDataProvider, type Tick } from "./providers/types";

const PORT = Number(process.env.PORT ?? 3003);
const BROADCAST_MS = 750;

// ── Production guard (finalization §113) ─────────────────────────────────────
// The token verification seam below is a MOCK (shared sandbox secret). It must
// never silently serve production traffic: fail the boot instead of inheriting
// development-only behavior. A real deployment plugs the JWT/JWKS verifier
// into auth.ts (structure, error codes and call sites stay put).
if (process.env.NODE_ENV === "production" && MOCK_ACCESS_SECRET === "cosmoz-mock-access-secret-v1") {
  console.error(
    "market-service: refusing to start — NODE_ENV=production with the mock access secret. " +
      "Replace the mock token verifier in auth.ts (JWT/JWKS) before serving production traffic.",
  );
  process.exit(1);
}

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
      console.error("market-service: candles fetch failed:", error instanceof Error ? error.message : error);
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
  connectedUsers.set(userId, (connectedUsers.get(userId) ?? 0) + 1);

  // Fresh snapshot on connect; the shared broadcast keeps everyone live.
  // Market prices are shared global data — the per-user room exists for
  // private streams, not to shard the price feed.
  socket.emit("prices", [...quotes.values()]);
  // Private snapshot immediately (and on every reconnect — the socket.io
  // connect event IS the resync: Reconnect → Authenticate → snapshot).
  const book = ensureUserPositions(userId);
  if (book) {
    socket.emit("positions", { source: "sim", positions: markToMarket(book), ts: Date.now() });
  }
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
  socket.on("disconnect", () => {
    const remaining = (connectedUsers.get(userId) ?? 1) - 1;
    if (remaining <= 0) connectedUsers.delete(userId);
    else connectedUsers.set(userId, remaining);
  });
});

// ── Private positions stream (user:<id> room, honest SIM source) ────────────
//
// The `user:<id>` room bound at handshake is the scoping point for PRIVATE
// streams. This service has no real broker bridge yet: the book is a
// SIMULATED, per-user, deterministic broker book (labeled source: "sim" on
// the wire — the UI repeats the label), marked-to-market against the live
// quotes. Snapshot semantics: the FULL positions array every emit, so a
// reconnect/replay can never duplicate a position. Authorization is purely
// server-side: io.to(`user:${id}`) — user A structurally never receives
// user B's events, and nothing here accepts execution input (read-only).

/** Refcount of live sockets per verified user (multi-tab safe). */
const connectedUsers = new Map<string, number>();

interface PrivatePosition {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  volume: string;
  entryPrice: string;
  currentPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  unrealizedPnl: string | null;
  openedAt: string;
}

/** FNV-1a 32-bit — deterministic per-user seed. */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Preferred stream symbols (first available win), with contract sizes. */
const STREAM_INSTRUMENTS = [
  { symbol: "BTCUSD", contractSize: 1 },
  { symbol: "ETHUSD", contractSize: 1 },
  { symbol: "EURUSD", contractSize: 100_000 },
  { symbol: "XAUUSD", contractSize: 100 },
] as const;

const userPositions = new Map<string, PrivatePosition[]>();

function ensureUserPositions(userId: string): PrivatePosition[] | null {
  const existing = userPositions.get(userId);
  if (existing) return existing;
  // Seeding needs live quotes to anchor entries — wait for the first ticks.
  const available = STREAM_INSTRUMENTS.filter((instrument) => quotes.has(instrument.symbol));
  if (available.length === 0) return null;

  const rnd = mulberry32(hashSeed(`cosmoz.positions:${userId}`));
  const count = 2 + Math.floor(rnd() * 2); // 2–3 positions, per-user shape
  const positions: PrivatePosition[] = [];
  for (let i = 0; i < count; i += 1) {
    const instrument = available[i % available.length];
    const quote = quotes.get(instrument.symbol);
    if (!quote) continue;
    const direction: "BUY" | "SELL" = rnd() >= 0.5 ? "BUY" : "SELL";
    const sign = direction === "BUY" ? 1 : -1;
    const drift = (0.001 + rnd() * 0.004) * sign; // entry sits off the mark
    const entry = quote.price * (1 - drift);
    const digits = quote.price >= 100 ? 2 : 5;
    const round = (value: number): string => String(Number(value.toFixed(digits)));
    const volume = (0.1 + Math.floor(rnd() * 19) / 10).toFixed(2); // 0.10–1.90
    positions.push({
      id: `sim-${userId.slice(0, 8)}-${instrument.symbol.toLowerCase()}-${i + 1}`,
      symbol: instrument.symbol,
      direction,
      volume,
      entryPrice: round(entry),
      currentPrice: round(quote.price),
      stopLoss: round(entry * (1 - sign * (0.004 + rnd() * 0.008))),
      takeProfit: round(entry * (1 + sign * (0.008 + rnd() * 0.016))),
      unrealizedPnl: null,
      openedAt: new Date(Date.now() - Math.floor(rnd() * 4 * 3600_000)).toISOString(),
    });
  }
  userPositions.set(userId, positions);
  return positions;
}

/** Internal contract size per seeded symbol (P&L engine input). */
const contractSizes = new Map(STREAM_INSTRUMENTS.map((instrument) => [instrument.symbol, instrument.contractSize]));

function markToMarket(positions: PrivatePosition[]): PrivatePosition[] {
  return positions.map((position) => {
    const quote = quotes.get(position.symbol);
    if (!quote) {
      return { ...position, currentPrice: null, unrealizedPnl: null };
    }
    const entry = Number(position.entryPrice);
    const volume = Number(position.volume);
    const size = contractSizes.get(position.symbol) ?? 1;
    const sign = position.direction === "BUY" ? 1 : -1;
    const pnl = (quote.price - entry) * volume * size * sign;
    return {
      ...position,
      currentPrice: String(Number(quote.price.toFixed(quote.price >= 100 ? 2 : 5))),
      unrealizedPnl: String(Number(pnl.toFixed(2))),
    };
  });
}

setInterval(() => {
  for (const userId of connectedUsers.keys()) {
    const book = ensureUserPositions(userId);
    if (!book) continue;
    io.to(`user:${userId}`).emit("positions", {
      source: "sim",
      positions: markToMarket(book),
      ts: Date.now(),
    });
  }
}, BROADCAST_MS);

setInterval(() => {
  if (dirty.size === 0) return;
  dirty.clear();
  io.emit("prices", [...quotes.values()]);
}, BROADCAST_MS);

httpServer.listen(PORT);

console.log("market-service listening on :" + PORT + " — REST /prices /candles, WS path /socket.io/");
