/**
 * Euforia market-data service: real public market data only.
 *
 * Providers:
 *   - Binance Spot: real crypto prices and exchange OHLCV candles.
 *   - Deriv public feed: real FX, metals and Deriv synthetic-index quotes/candles.
 *
 * No generated quotes, simulated candles, trading operations, account data or
 * private position streams are exposed by this service.
 */
import { createServer } from "node:http";
import { Server } from "socket.io";

import { BinanceProvider } from "./providers/binance";
import { DerivProvider } from "./providers/deriv";
import { isInterval, type MarketDataProvider, type Tick } from "./providers/types";

const PORT = Number(process.env.PORT ?? 3003);
const BROADCAST_MS = 500;
const providers: MarketDataProvider[] = [new BinanceProvider(), new DerivProvider()];
const quotes = new Map<string, Tick>();
const dirty = new Set<string>();
let lastTickAt = 0;

function routeTick(tick: Tick): void {
  if (
    tick.source !== "real" ||
    !Number.isFinite(tick.price) || tick.price <= 0 ||
    !Number.isFinite(tick.ts) || tick.ts <= 0 ||
    (tick.prevClose !== null && (!Number.isFinite(tick.prevClose) || tick.prevClose <= 0))
  ) return;
  const current = quotes.get(tick.symbol);
  if (current && current.ts > tick.ts) return;
  quotes.set(tick.symbol, tick);
  lastTickAt = Math.max(lastTickAt, tick.ts);
  dirty.add(tick.symbol);
}

for (const provider of providers) void provider.start(routeTick);

function sendJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(body));
}

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }
  if (url.pathname === "/prices") {
    const symbol = url.searchParams.get("symbol");
    const list = [...quotes.values()].filter((quote) => !symbol || quote.symbol === symbol);
    sendJson(response, 200, { policy: "REAL_ONLY", quotes: list, ts: Date.now() });
    return;
  }
  if (url.pathname === "/candles") {
    const symbol = url.searchParams.get("symbol");
    const interval = url.searchParams.get("interval") ?? "5m";
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const ranged = fromParam !== null || toParam !== null;
    const limit = Number(url.searchParams.get("limit") ?? 300);
    const from = fromParam !== null ? Number(fromParam) : undefined;
    const to = toParam !== null ? Number(toParam) : undefined;
    if (
      !symbol || !isInterval(interval) ||
      !Number.isInteger(limit) || limit < 1 ||
      (ranged && from !== undefined && !Number.isFinite(from)) ||
      (ranged && to !== undefined && !Number.isFinite(to)) ||
      (from !== undefined && to !== undefined && from > to)
    ) {
      sendJson(response, 400, { error: "invalid_candle_query" });
      return;
    }
    const provider = providers.find((candidate) => candidate.handles(symbol));
    if (!provider) {
      sendJson(response, 404, { error: "real_market_data_not_available_for_symbol", symbol });
      return;
    }
    try {
      const candles = await provider.candles(symbol, interval, limit, from, to);
      sendJson(response, 200, { symbol, interval, source: "real", provider: provider.id, candles });
    } catch (error) {
      console.error("market-service candle request failed:", error instanceof Error ? error.message : "unknown error");
      sendJson(response, 502, { error: "upstream_market_data_unavailable", symbol });
    }
    return;
  }
  if (url.pathname === "/health") {
    const now = Date.now();
    const staleAfterMs = 15_000;
    const freshQuotes = [...quotes.values()].filter((quote) => now - quote.ts <= staleAfterMs && now >= quote.ts - 60_000);
    const staleSymbols = [...quotes.values()]
      .filter((quote) => !freshQuotes.some((fresh) => fresh.symbol === quote.symbol))
      .map((quote) => quote.symbol)
      .sort();
    sendJson(response, 200, {
      ok: true,
      dataPolicy: "REAL_ONLY",
      realFeedReady: freshQuotes.length > 0,
      quoteCount: quotes.size,
      freshQuoteCount: freshQuotes.length,
      staleSymbols,
      symbols: [...quotes.keys()].sort(),
      lastTickAt: lastTickAt || null,
      providers: providers.map((provider) => ({ id: provider.id, source: provider.source, status: provider.status() })),
    });
    return;
  }
  sendJson(response, 404, { error: "not_found" });
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});
io.on("connection", (socket) => socket.emit("prices", [...quotes.values()]));

const broadcastTimer = setInterval(() => {
  if (dirty.size === 0) return;
  dirty.clear();
  io.emit("prices", [...quotes.values()]);
}, BROADCAST_MS);

function shutdown(): void {
  clearInterval(broadcastTimer);
  for (const provider of providers) provider.stop();
  io.close();
  httpServer.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`market-service listening on :${PORT} — REAL_ONLY (Binance Spot + Deriv public)`);
});
