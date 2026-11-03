/**
 * Binance Spot provider - real public exchange market data.
 *
 * WebSocket: combined individual mini-ticker streams on data-stream.binance.vision.
 * REST fallback: public 24-hour ticker endpoint on data-api.binance.vision.
 * Both are public market-data endpoints and require no exchange credentials.
 * When both transports fail, no replacement price is emitted.
 */
import type { Candle, Interval, MarketDataProvider, Tick } from "./types";

const REST_BASE = "https://data-api.binance.vision/api/v3";
const WS_BASE = "wss://data-stream.binance.vision/stream?streams=";
const MAX_FRESH_MS = 8_000;

const SYMBOL_MAP = new Map<string, string>([
  ["BTCUSDT", "BTCUSDT"],
  ["ETHUSDT", "ETHUSDT"],
  ["BNBUSDT", "BNBUSDT"],
  ["SOLUSDT", "SOLUSDT"],
  ["XRPUSDT", "XRPUSDT"],
  ["DOGEUSDT", "DOGEUSDT"],
  ["ADAUSDT", "ADAUSDT"],
]);

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
  data?: { s?: string; c?: string; o?: string; E?: number };
}
interface RestTickerPayload {
  lastPrice?: string;
  openPrice?: string;
  closeTime?: number;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class BinanceProvider implements MarketDataProvider {
  readonly id = "binance" as const;
  readonly source = "real" as const;
  private emit: ((tick: Tick) => void) | null = null;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1_000;
  private wsUp = false;
  private restFailures = 0;
  private ticksReceived = 0;
  private lastTickAt = 0;
  private lastError: string | null = null;
  private started = false;
  private readonly klineCache = new Map<string, { at: number; candles: Candle[] }>();
  private readonly KLINE_TTL_MS = 15_000;

  handles(symbol: string): boolean {
    return SYMBOL_MAP.has(symbol);
  }

  start(emit: (tick: Tick) => void): void {
    if (this.started) return;
    this.started = true;
    this.emit = emit;
    this.openSocket();
    void this.pollOnce();
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
    this.emit = null;
  }

  status(): Record<string, unknown> {
    return {
      transport: this.wsUp ? "websocket" : this.pollTimer !== null ? "rest-polling" : "down",
      symbols: [...SYMBOL_MAP.keys()],
      restFailures: this.restFailures,
      ticksReceived: this.ticksReceived,
      lastTickAt: this.lastTickAt || null,
      lastError: this.lastError,
    };
  }

  private publish(internal: string, price: number, prevClose: number | null, ts: number): void {
    if (!this.emit || !Number.isFinite(price) || price <= 0 || !Number.isFinite(ts) || ts <= 0) return;
    const tick: Tick = {
      symbol: internal, price, prevClose, ts,
      source: "real", provider: "binance", marketType: "CRYPTO_SPOT", quoteCurrency: "USDT",
    };
    this.ticksReceived += 1;
    this.lastTickAt = ts;
    this.lastError = null;
    this.emit(tick);
  }

  private openSocket(): void {
    if (!this.started || typeof WebSocket === "undefined") return;
    const streams = [...SYMBOL_MAP.values()].map((symbol) => `${symbol.toLowerCase()}@miniTicker`).join("/");
    try {
      const ws = new WebSocket(`${WS_BASE}${streams}`);
      this.ws = ws;
      ws.onopen = () => {
        this.wsUp = true;
        this.backoffMs = 1_000;
        this.lastError = null;
      };
      ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(String(event.data)) as MiniTickerPayload;
          const data = payload.data;
          if (!data?.s) return;
          const internal = this.internalOf(data.s);
          if (!internal) return;
          const price = positiveNumber(data.c);
          const reference = positiveNumber(data.o);
          if (price === null) return;
          const eventTime = Number(data.E);
          const observedAt = Number.isFinite(eventTime) && eventTime > 0 ? eventTime : Date.now();
          this.publish(internal, price, reference, observedAt);
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : "Invalid Binance WebSocket frame";
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.wsUp = false;
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        this.wsUp = false;
        this.lastError = "Binance WebSocket connection error";
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Could not open Binance WebSocket";
      this.scheduleReconnect();
    }
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    this.wsUp = false;
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.onopen = null;
    try { ws.close(); } catch { /* Already closed. */ }
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    }, this.backoffMs);
  }

  private internalOf(remoteSymbol: string): string | null {
    for (const [internal, remote] of SYMBOL_MAP) if (remote === remoteSymbol) return internal;
    return null;
  }

  private async pollOnce(): Promise<void> {
    if (!this.emit) return;
    if (this.wsUp && this.lastTickAt > 0 && Date.now() - this.lastTickAt <= MAX_FRESH_MS) return;

    await Promise.all([...SYMBOL_MAP].map(async ([internal, remote]) => {
      try {
        const response = await fetch(`${REST_BASE}/ticker/24hr?symbol=${remote}`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) throw new Error(`Binance REST ${response.status}`);
        const body = await response.json() as RestTickerPayload;
        const price = positiveNumber(body.lastPrice);
        const reference = positiveNumber(body.openPrice);
        if (price === null) throw new Error("Binance returned an invalid last price");
        const closeTime = Number(body.closeTime);
        const observedAt = Number.isFinite(closeTime) && closeTime > 0 ? closeTime : Date.now();
        this.restFailures = 0;
        this.publish(internal, price, reference, observedAt);
      } catch (error) {
        this.restFailures += 1;
        this.lastError = error instanceof Error ? error.message : "Binance REST request failed";
      }
    }));
  }

  async candles(symbol: string, interval: Interval, limit: number, from?: number, to?: number): Promise<Candle[]> {
    const remote = SYMBOL_MAP.get(symbol);
    if (!remote) return [];
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), from !== undefined || to !== undefined ? 1_000 : 500));
    const cacheKey = `${symbol}|${interval}|${boundedLimit}|${from ?? ""}|${to ?? ""}`;
    const cached = this.klineCache.get(cacheKey);
    if (cached && Date.now() - cached.at < this.KLINE_TTL_MS) return cached.candles;

    const params = new URLSearchParams({ symbol: remote, interval: INTERVAL_MAP[interval], limit: String(boundedLimit) });
    if (from !== undefined) params.set("startTime", String(Math.max(0, Math.trunc(from))));
    if (to !== undefined) params.set("endTime", String(Math.max(0, Math.trunc(to))));
    const response = await fetch(`${REST_BASE}/klines?${params.toString()}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Binance klines ${response.status}`);
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) throw new Error("Binance returned an invalid kline payload");

    const candles: Candle[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [time, open, high, low, close, volume] = row as [unknown, unknown, unknown, unknown, unknown, unknown];
      const candle = { t: Number(time), o: Number(open), h: Number(high), l: Number(low), c: Number(close), v: Number(volume) };
      if (
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) && candle.o > 0 &&
        Number.isFinite(candle.h) && candle.h > 0 &&
        Number.isFinite(candle.l) && candle.l > 0 &&
        Number.isFinite(candle.c) && candle.c > 0 &&
        Number.isFinite(candle.v) && candle.v >= 0
      ) candles.push(candle);
    }
    this.klineCache.set(cacheKey, { at: Date.now(), candles });
    if (this.klineCache.size > 64) {
      const oldest = this.klineCache.keys().next().value;
      if (oldest !== undefined) this.klineCache.delete(oldest);
    }
    return candles;
  }
}
