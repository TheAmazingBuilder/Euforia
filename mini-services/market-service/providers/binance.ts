/**
 * BinanceProvider - REAL market data (mission §33/§34).
 *
 * Source: Binance public market-data endpoints (no API key, read-only):
 *   - REST  https://data-api.binance.vision/api/v3  (klines, 24h ticker)
 *   - WS    wss://data-stream.binance.vision/stream (miniTicker stream)
 *
 * Reliability ladder: WS ticks → when the socket is down, REST polling
 * (still real) → when both fail, stop emitting so clients go STALE instead
 * of showing frozen prices as if they were live.
 *
 * The provider maps INTERNAL symbols → Binance symbols (mission §14: never
 * assume the same ticker everywhere). Only catalog CRYPTO symbols are
 * handled today; forex/synthetics stay on the labeled simulated provider.
 */
import type { Candle, Interval, MarketDataProvider, Tick } from "./types";
import { INTERVAL_MS } from "./types";

const REST_BASE = "https://data-api.binance.vision/api/v3";
const WS_BASE = "wss://data-stream.binance.vision/stream?streams=";

/** Internal symbol → Binance symbol. Extend deliberately (per listing). */
const SYMBOL_MAP = new Map<string, string>([
  ["BTCUSDT", "BTCUSDT"],
]);

/** Internal interval → Binance kline interval. */
const INTERVAL_MAP: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

interface MiniTickerPayload {
  stream: string;
  data: { s: string; c: string; o: string };
}

export class BinanceProvider implements MarketDataProvider {
  readonly id = "binance";
  readonly source = "real" as const;

  private emit: ((tick: Tick) => void) | null = null;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private wsUp = false;
  private restFailures = 0;
  private started = false;

  /** Kline cache - one upstream call per (symbol, interval) per 15s max. */
  private klineCache = new Map<string, { at: number; candles: Candle[] }>();
  private readonly KLINE_TTL_MS = 15_000;

  handles(symbol: string): boolean {
    return SYMBOL_MAP.has(symbol);
  }

  start(emit: (tick: Tick) => void): void {
    if (this.started) return;
    this.started = true;
    this.emit = emit;
    this.openSocket();
    // REST fallback runs only while the socket is down (see openSocket/closeSocket).
    this.pollTimer = setInterval(() => void this.pollOnce(), 5_000);
  }

  stop(): void {
    this.started = false;
    this.closeSocket();
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.klineCache.clear();
  }

  status(): Record<string, unknown> {
    return {
      transport: this.wsUp ? "websocket" : this.pollTimer !== null ? "rest-polling" : "down",
      symbols: [...SYMBOL_MAP.keys()],
      restFailures: this.restFailures,
    };
  }

  // ── WebSocket stream ─────────────────────────────────────────────────────

  private openSocket(): void {
    if (typeof WebSocket === "undefined") return; // REST polling covers it
    const streams = [...SYMBOL_MAP.values()]
      .map((s) => `${s.toLowerCase()}@miniTicker`)
      .join("/");
    try {
      const ws = new WebSocket(`${WS_BASE}${streams}`);
      this.ws = ws;
      ws.onopen = () => {
        this.wsUp = true;
        this.backoffMs = 1000; // healthy again
      };
      ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(String(event.data)) as MiniTickerPayload;
          const internal = this.internalOf(payload.data.s);
          if (!internal || !this.emit) return;
          this.emit({
            symbol: internal,
            price: Number(payload.data.c),
            prevClose: Number(payload.data.o), // 24h open - honest change % base
            ts: Date.now(),
            source: "real",
          });
        } catch {
          // Malformed frame - ignore, the next tick repairs the state.
        }
      };
      ws.onclose = () => {
        this.wsUp = false;
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        this.wsUp = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private closeSocket(): void {
    if (this.ws !== null) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      try {
        this.ws.close();
      } catch {
        // Already closed.
      }
    }
    this.ws = null;
    this.wsUp = false;
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.started) this.openSocket();
      this.backoffMs = Math.min(this.backoffMs * 2, 15_000);
    }, this.backoffMs);
  }

  private internalOf(binanceSymbol: string): string | null {
    for (const [internal, remote] of SYMBOL_MAP) {
      if (remote === binanceSymbol) return internal;
    }
    return null;
  }

  // ── REST fallback (still REAL data while the socket is down) ────────────

  private async pollOnce(): Promise<void> {
    if (this.wsUp || !this.emit) return;
    for (const [internal, remote] of SYMBOL_MAP) {
      try {
        const response = await fetch(`${REST_BASE}/ticker/24hr?symbol=${remote}`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { lastPrice: string; openPrice: string };
        this.restFailures = 0;
        this.emit({
          symbol: internal,
          price: Number(body.lastPrice),
          prevClose: Number(body.openPrice),
          ts: Date.now(),
          source: "real",
        });
      } catch {
        this.restFailures += 1;
        // Silence on purpose: no tick → clients show STALE (never fake liveness).
      }
    }
  }

  // ── Candles ──────────────────────────────────────────────────────────────

  async candles(symbol: string, interval: Interval, limit: number, from?: number, to?: number): Promise<Candle[]> {
    const remote = SYMBOL_MAP.get(symbol);
    if (!remote) return [];
    const ranged = from !== undefined || to !== undefined;
    const cacheKey = `${symbol}|${interval}|${limit}|${from ?? ""}|${to ?? ""}`;
    const hit = this.klineCache.get(cacheKey);
    if (hit !== undefined && Date.now() - hit.at < this.KLINE_TTL_MS) return hit.candles;

    // Ranged klines (session replay): Binance serves historical windows
    // natively - startTime/endTime with the standard 1000-row ceiling.
    const params = new URLSearchParams({
      symbol: remote,
      interval: INTERVAL_MAP[interval],
      limit: String(Math.min(limit, ranged ? 1000 : 500)),
    });
    if (from !== undefined) params.set("startTime", String(Math.max(from, 0)));
    if (to !== undefined) params.set("endTime", String(Math.max(to, 0)));
    const response = await fetch(`${REST_BASE}/klines?${params.toString()}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`binance klines ${response.status}`);
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) throw new Error("binance klines: unexpected payload");
    const candles: Candle[] = rows.map((row) => {
      // [openTime, open, high, low, close, volume, …]
      const cells = row as [number, string, string, string, string, string];
      return {
        t: cells[0],
        o: Number(cells[1]),
        h: Number(cells[2]),
        l: Number(cells[3]),
        c: Number(cells[4]),
        v: Number(cells[5]),
      };
    });
    this.klineCache.set(cacheKey, { at: Date.now(), candles });
    if (this.klineCache.size > 64) {
      // Keep the cache bounded - drop the oldest entry.
      const oldest = this.klineCache.keys().next().value;
      if (oldest !== undefined) this.klineCache.delete(oldest);
    }
    return candles;
  }
}
