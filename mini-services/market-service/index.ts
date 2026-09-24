/**
 * Cosmoz market service — simulated real-time price feed (socket.io).
 *
 * The trading journal needs a live "last price" for open positions
 * (unrealized P&L). No broker feed exists in this environment, so this
 * service random-walks the fixture catalog around the same base prices
 * the mock backend uses, and broadcasts ticks every second.
 *
 * Transport contract (sandbox gateway):
 *   - socket.io clients connect with  io("/?XTransformPort=3003")
 *   - REST snapshot polling fallback: GET /prices?XTransformPort=3003
 *
 * Run: bun run dev  (bun --hot index.ts, port 3003)
 */
import { createServer } from "node:http";
import { Server } from "socket.io";

// ── Instrument catalog (mirrors mocks/fixtures/catalog.ts anchors) ──────────
interface SymbolDef {
  symbol: string;
  basePrice: number;
  digits: number;
  /** Per-tick volatility as a fraction of price (random-walk step). */
  vol: number;
}

const SYMBOLS: SymbolDef[] = [
  { symbol: "EURUSD", basePrice: 1.0865, digits: 5, vol: 0.00025 },
  { symbol: "GBPUSD", basePrice: 1.2705, digits: 5, vol: 0.0003 },
  { symbol: "XAUUSD", basePrice: 2385.0, digits: 2, vol: 0.0008 },
  { symbol: "BTCUSDT", basePrice: 61240.0, digits: 2, vol: 0.0012 },
  { symbol: "BOOM500", basePrice: 9820.0, digits: 2, vol: 0.001 },
  { symbol: "CRASH500", basePrice: 8340.0, digits: 2, vol: 0.001 },
  { symbol: "VOL75(1s)", basePrice: 128400.0, digits: 2, vol: 0.0014 },
];

interface Quote {
  symbol: string;
  price: number;
  /** Price ~24h ago (for change % display). */
  prevClose: number;
  ts: number;
}

/** Start every walk slightly off the anchor so sessions differ. */
const quotes = new Map<string, Quote>(
  SYMBOLS.map((def) => [
    def.symbol,
    {
      symbol: def.symbol,
      price: round(def.basePrice * (1 + (Math.random() - 0.5) * def.vol * 40), def.digits),
      prevClose: def.basePrice,
      ts: Date.now(),
    },
  ]),
);

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tick(): void {
  for (const def of SYMBOLS) {
    const quote = quotes.get(def.symbol)!;
    // Mean-reverting random walk: step + gentle pull back to the anchor.
    const drift = (def.basePrice - quote.price) * 0.002;
    const step = quote.price * def.vol * (Math.random() * 2 - 1) + drift;
    quote.price = round(Math.max(quote.price + step, def.basePrice * 0.5), def.digits);
    quote.ts = Date.now();
  }
}

const TICK_MS = 1000;
const PORT = Number(process.env.PORT ?? 3003);

// ── One node:http server (Bun-compatible) serving REST + socket.io ─────────
const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/prices") {
    const symbol = url.searchParams.get("symbol");
    const list = [...quotes.values()].filter((quote) => !symbol || quote.symbol === symbol);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ quotes: list, ts: Date.now() }));
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  // Fresh snapshot on connect; the shared broadcast keeps everyone live.
  socket.emit("prices", [...quotes.values()]);
  socket.on("subscribe", () => socket.emit("prices", [...quotes.values()]));
});

setInterval(() => {
  tick();
  io.emit("prices", [...quotes.values()]);
}, TICK_MS);

httpServer.listen(PORT);

console.log(`[market-service] listening on :${PORT} — REST /prices, WS path /socket.io/`);
