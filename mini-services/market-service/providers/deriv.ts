/**
 * Deriv public market-data provider.
 *
 * This uses the documented unauthenticated, read-only public WebSocket.
 * Instruments are subscribed only when Deriv currently advertises them as
 * active. Missing ticks/references are not approximated or generated.
 */
import type { Candle, Interval, MarketDataProvider, Tick } from "./types";
import {
  availableDerivMarkets,
  candlesFromDerivHistory,
  DERIV_MARKETS,
  normalizeDerivTick,
  referencePriceFromHistory,
  type DerivMarket,
} from "./deriv.logic";

const DEFAULT_WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
const MAX_REFERENCE_DISTANCE_SECONDS = 180;
const REQUEST_TIMEOUT_MS = 12_000;
const GRANULARITY_SECONDS: Record<Interval, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1_800, "1H": 3_600, "4H": 14_400, "1D": 86_400,
};

interface PendingRequest {
  resolve: (message: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export class DerivProvider implements MarketDataProvider {
  readonly id = "deriv" as const;
  readonly source = "real" as const;
  private readonly wsUrl = process.env.DERIV_PUBLIC_WS_URL?.trim() || DEFAULT_WS_URL;
  private emit: ((tick: Tick) => void) | null = null;
  private ws: WebSocket | null = null;
  private started = false;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1_000;
  private requestId = 1;
  private reconnectAttempts = 0;
  private ticksReceived = 0;
  private lastTickAt = 0;
  private lastError: string | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly subscriptionRequests = new Map<number, string>();
  private markets = new Map<string, DerivMarket>();
  private marketsByRemote = new Map<string, DerivMarket>();
  private readonly prevClose = new Map<string, number | null>();
  private readonly latest = new Map<string, Tick>();

  handles(symbol: string): boolean {
    return this.markets.has(symbol);
  }

  start(emit: (tick: Tick) => void): void {
    if (this.started) return;
    this.started = true;
    this.emit = emit;
    this.openSocket();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
    this.rejectPending(new Error("Deriv provider stopped"));
    this.subscriptionRequests.clear();
    this.markets.clear();
    this.marketsByRemote.clear();
    this.latest.clear();
    this.prevClose.clear();
    this.emit = null;
  }

  status(): Record<string, unknown> {
    return {
      transport: this.connected ? "websocket" : "down",
      endpoint: this.wsUrl,
      configuredSymbols: DERIV_MARKETS.map((market) => market.symbol),
      availableSymbols: [...this.markets.keys()],
      subscribedSymbols: [...this.latest.keys()],
      reconnectAttempts: this.reconnectAttempts,
      ticksReceived: this.ticksReceived,
      lastTickAt: this.lastTickAt || null,
      lastError: this.lastError,
    };
  }

  private openSocket(): void {
    if (!this.started || typeof WebSocket === "undefined") return;
    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.backoffMs = 1_000;
        this.lastError = null;
        void this.loadActiveSymbols(ws);
      };
      ws.onmessage = (event: MessageEvent) => this.handleMessage(ws, String(event.data));
      ws.onerror = () => {
        this.lastError = "Deriv public WebSocket connection error";
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.connected = false;
        this.rejectPending(new Error("Deriv public WebSocket disconnected"));
        this.scheduleReconnect();
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Could not open Deriv public WebSocket";
      this.scheduleReconnect();
    }
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.onopen = null;
    try { ws.close(); } catch { /* Already closed. */ }
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== null) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    }, this.backoffMs);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private send(ws: WebSocket, message: Record<string, unknown>): number | null {
    if (ws !== this.ws || ws.readyState !== WebSocket.OPEN) return null;
    const reqId = this.requestId++;
    ws.send(JSON.stringify({ ...message, req_id: reqId }));
    return reqId;
  }

  private request(ws: WebSocket, message: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const reqId = this.send(ws, message);
      if (reqId === null) {
        reject(new Error("Deriv WebSocket is not connected"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`Deriv request timed out (req_id ${reqId})`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, reject, timer });
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    if (ws !== this.ws) return;
    let message: Record<string, unknown>;
    try {
      const parsed = recordOf(JSON.parse(raw));
      if (!parsed) return;
      message = parsed;
    } catch {
      this.lastError = "Deriv sent a malformed WebSocket message";
      return;
    }

    const reqId = Number(message.req_id);
    if (Number.isInteger(reqId)) {
      const pending = this.pending.get(reqId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(reqId);
        const error = recordOf(message.error);
        if (error) {
          pending.reject(new Error(typeof error.message === "string" ? error.message : "Deriv request failed"));
        } else {
          pending.resolve(message);
        }
      }
      const subscriptionSymbol = this.subscriptionRequests.get(reqId);
      if (subscriptionSymbol && recordOf(message.error)) {
        const error = recordOf(message.error);
        this.lastError = typeof error?.message === "string" ? error.message : `Deriv rejected ${subscriptionSymbol}`;
        this.subscriptionRequests.delete(reqId);
      }
    }
    if (message.msg_type === "tick") this.handleTick(message);
  }

  private async loadActiveSymbols(ws: WebSocket): Promise<void> {
    try {
      const response = await this.request(ws, { active_symbols: "brief" });
      if (ws !== this.ws) return;
      const markets = availableDerivMarkets(response);
      this.markets = new Map(markets.map((market) => [market.symbol, market]));
      this.marketsByRemote = new Map(markets.map((market) => [market.remoteSymbol, market]));
      for (const market of markets) {
        const reqId = this.send(ws, { ticks: market.remoteSymbol, subscribe: 1 });
        if (reqId !== null) this.subscriptionRequests.set(reqId, market.symbol);
        void this.loadReference(ws, market);
      }
      if (markets.length === 0) this.lastError = "Deriv did not advertise any configured symbols as active";
    } catch (error) {
      if (ws !== this.ws) return;
      this.lastError = error instanceof Error ? error.message : "Could not load Deriv active symbols";
      try { ws.close(); } catch { /* Reconnect is driven by close. */ }
    }
  }

  private async loadReference(ws: WebSocket, market: DerivMarket): Promise<void> {
    const target = Math.floor(Date.now() / 1_000) - 86_400;
    try {
      const response = await this.request(ws, {
        ticks_history: market.remoteSymbol,
        start: target - 90,
        end: target + 90,
        count: 1_000,
        style: "ticks",
      });
      if (ws !== this.ws) return;
      const reference = referencePriceFromHistory(response, target, MAX_REFERENCE_DISTANCE_SECONDS);
      this.prevClose.set(market.symbol, reference);
      const latest = this.latest.get(market.symbol);
      if (latest) this.publish({ ...latest, prevClose: reference });
    } catch {
      this.prevClose.set(market.symbol, null);
    }
  }

  private handleTick(message: Record<string, unknown>): void {
    const tick = recordOf(message.tick);
    if (!tick) return;
    const remote = tick.symbol ?? tick.underlying_symbol;
    if (typeof remote !== "string") return;
    const market = this.marketsByRemote.get(remote);
    if (!market) return;
    const normalized = normalizeDerivTick(message, market, this.prevClose.get(market.symbol) ?? null);
    if (normalized) this.publish(normalized);
  }

  private publish(tick: Tick): void {
    if (!this.emit || tick.source !== "real") return;
    this.latest.set(tick.symbol, tick);
    this.ticksReceived += 1;
    this.lastTickAt = tick.ts;
    this.lastError = null;
    this.emit(tick);
  }

  async candles(symbol: string, interval: Interval, limit: number, from?: number, to?: number): Promise<Candle[]> {
    const market = this.markets.get(symbol);
    const ws = this.ws;
    if (!market || !ws || ws.readyState !== WebSocket.OPEN) return [];
    const granularity = GRANULARITY_SECONDS[interval];
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const start = from !== undefined
      ? Math.max(0, Math.floor(from / 1_000))
      : Math.max(0, Math.floor(Date.now() / 1_000) - granularity * boundedLimit);
    const end: number | string = to !== undefined ? Math.max(0, Math.floor(to / 1_000)) : "latest";
    const response = await this.request(ws, {
      ticks_history: market.remoteSymbol,
      start,
      end,
      count: boundedLimit,
      style: "candles",
      granularity,
    });
    if (ws !== this.ws) return [];
    return candlesFromDerivHistory(response);
  }
}
