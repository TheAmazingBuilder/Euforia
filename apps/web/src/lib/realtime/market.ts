"use client";

import { useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";

import type { CandlesResponse, MarketInterval, QuoteSource } from "@cosmoz/shared";

/**
 * Live market prices — client store for the socket.io market service.
 *
 * Transport: the sandbox gateway routes on the `XTransformPort` query param,
 * so the connection URL is RELATIVE ("/?XTransformPort=3003") — never a
 * host:port. If the socket cannot connect (e.g. blocked upgrade), the store
 * degrades gracefully to HTTP snapshot polling on the same service, so the
 * unrealized P&L stays live either way. Locally (no gateway) the Next.js
 * rewrites proxy the same paths to the market service.
 *
 * Feed state machine (mission §16/§17): `phase` reflects the DATA path —
 * live (a transport delivers), reconnecting (retrying after a loss),
 * offline (nothing works), connecting (initial). Staleness is computed by
 * consumers from `lastTickAt` — a frozen feed must read STALE, never live.
 */

export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number;
  ts: number;
  /** Feed origin — the UI labels simulated data honestly ("SIM" badge). */
  source: QuoteSource;
}

export type FeedPhase = "connecting" | "live" | "reconnecting" | "offline";
export type FeedTransport = "socket" | "polling" | "none";

export interface PriceSnapshot {
  quotes: ReadonlyMap<string, LiveQuote>;
  connected: boolean;
  source: "idle" | "socket" | "polling";
  phase: FeedPhase;
  transport: FeedTransport;
  /** Server ts of the newest quote seen (epoch ms) — staleness input. */
  lastTickAt: number;
}

const MARKET_PORT = 3003;
const WS_URL = `/?XTransformPort=${MARKET_PORT}`;
const SNAPSHOT_URL = `/prices?XTransformPort=${MARKET_PORT}`;
const CANDLES_URL = `/candles?XTransformPort=${MARKET_PORT}`;
const POLL_MS = 2000;
/** Give the websocket this long before falling back to polling. */
const CONNECT_GRACE_MS = 3500;
/** A feed older than this renders STALE even when a transport is up. */
export const STALE_MS = 8_000;

type Listener = () => void;

const EMPTY: ReadonlyMap<string, LiveQuote> = new Map();
/** Frozen empty snapshot — stable reference for SSR/hydration. */
const EMPTY_SNAPSHOT: PriceSnapshot = Object.freeze({
  quotes: EMPTY,
  connected: false,
  source: "idle" as const,
  phase: "connecting" as const,
  transport: "none" as const,
  lastTickAt: 0,
});

let snapshot: PriceSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<Listener>();
let started = false;
let gotData = false;
let socket: Socket | null = null;
let pollTimer: number | null = null;
let graceTimer: number | null = null;

/**
 * Connection telemetry observed by this client (Monitoring MASTER PROMPT §8).
 * Real counters from the running feed — reconnects, drops, last message,
 * polling RTT — read by the Monitoring view; never synthesized.
 */
export interface MarketTelemetry {
  reconnectAttempts: number;
  droppedConnections: number;
  messagesReceived: number;
  lastMessageAt: number | null;
  lastPollRttMs: number | null;
}

const telemetry: MarketTelemetry = {
  reconnectAttempts: 0,
  droppedConnections: 0,
  messagesReceived: 0,
  lastMessageAt: null,
  lastPollRttMs: null,
};

/** Read-side copy of the client-observed connection telemetry. */
export function getMarketTelemetry(): MarketTelemetry {
  return { ...telemetry };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(next: Partial<PriceSnapshot>): void {
  snapshot = Object.freeze({ ...snapshot, ...next });
  emit();
}

function setQuotes(
  quotes: LiveQuote[],
  source: PriceSnapshot["source"],
  transport: FeedTransport,
): void {
  gotData = true;
  telemetry.messagesReceived += 1;
  telemetry.lastMessageAt = Date.now();
  snapshot = Object.freeze({
    quotes: new Map(quotes.map((quote) => [quote.symbol, quote])),
    connected: true,
    source,
    phase: "live",
    transport,
    lastTickAt: Date.now(),
  });
  emit();
}

async function pollOnce(): Promise<void> {
  const pollStartedAt = Date.now();
  try {
    const response = await fetch(SNAPSHOT_URL);
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { quotes?: LiveQuote[] };
    if (!Array.isArray(body.quotes)) throw new Error("malformed snapshot");
    telemetry.lastPollRttMs = Date.now() - pollStartedAt;
    // A successful snapshot IS a live feed — the transport just differs.
    setQuotes(body.quotes, socket?.connected ? "socket" : "polling", socket?.connected ? "socket" : "polling");
  } catch {
    // Service unreachable — keep the last snapshot; the UI shows the stale mark.
    patch({
      connected: false,
      source: socket?.connected ? "socket" : "idle",
      phase: gotData ? "reconnecting" : "offline",
      transport: socket?.connected ? "socket" : "none",
    });
  }
}

function startPolling(): void {
  if (pollTimer !== null) return;
  void pollOnce();
  pollTimer = window.setInterval(() => void pollOnce(), POLL_MS);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  socket = io(WS_URL, {
    // Long-polling first (works through every proxy), websocket upgrade when
    // the transport allows it — the classic resilient socket.io handshake.
    transports: ["polling", "websocket"],
    reconnectionDelay: 2000,
    timeout: 5000,
  });

  socket.on("prices", (quotes: LiveQuote[]) => {
    stopPolling();
    if (graceTimer !== null) {
      window.clearTimeout(graceTimer);
      graceTimer = null;
    }
    setQuotes(quotes, "socket", "socket");
  });

  socket.on("disconnect", () => {
    // Socket lost — polling carries the data while socket.io retries.
    telemetry.droppedConnections += 1;
    startPolling();
    patch({ phase: "reconnecting", connected: false, transport: "polling", source: "polling" });
  });
  socket.on("connect_error", () => {
    telemetry.reconnectAttempts += 1;
    startPolling();
  });
  socket.io.on("reconnect_attempt", () => {
    telemetry.reconnectAttempts += 1;
  });

  // Grace period: if the socket never connects, degrade to polling quietly.
  graceTimer = window.setTimeout(() => {
    if (!socket?.connected) startPolling();
  }, CONNECT_GRACE_MS);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    // Keep the socket alive across subscribers (single app-wide feed).
  };
}

/** Reactive snapshot of every live quote + connection state. */
export function useLiveQuotes(): PriceSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY_SNAPSHOT);
}

/** Live quote for one symbol (null until the first tick arrives). */
export function useLiveQuote(symbol: string | null | undefined): LiveQuote | null {
  const { quotes } = useLiveQuotes();
  return symbol ? quotes.get(symbol) ?? null : null;
}

/**
 * Feed connection state (§16) + the raw inputs (§17) consumers need to
 * render STALE honestly: `ageMs` recomputes on each store emission, and the
 * caller can add a 1s local ticker for "N seconds ago" copy.
 */
export function useFeedStatus(): { phase: FeedPhase; transport: FeedTransport; lastTickAt: number } {
  const { phase, transport, lastTickAt } = useLiveQuotes();
  return { phase, transport, lastTickAt };
}

/** Unrealized P&L in account currency for an open position. */
export function unrealizedPnl(params: {
  entryPrice: string;
  quantity: string;
  contractSize: string;
  direction: "BUY" | "SELL";
  lastPrice: number | null;
}): number | null {
  const { entryPrice, quantity, contractSize, direction, lastPrice } = params;
  if (lastPrice === null) return null;
  const entry = Number(entryPrice);
  const qty = Number(quantity);
  const size = Number(contractSize);
  if (!Number.isFinite(entry) || !Number.isFinite(qty) || !Number.isFinite(size)) return null;
  const sign = direction === "BUY" ? 1 : -1;
  return (lastPrice - entry) * qty * size * sign;
}

// ── Candle datafeed (chart history; ticks merge client-side) ────────────────

const CANDLE_LIMIT = 300;

/**
 * Chart history for one symbol + timeframe. Served by the market service
 * (gateway/rewrite proxy — NOT the /api MSW surface). Refetches quietly so
 * the window follows "now"; between refetches the live tick stream merges
 * into the last bucket (see PriceChart).
 */
export function useCandles(symbol: string, interval: MarketInterval) {
  return useQuery({
    queryKey: ["candles", symbol, interval],
    // The station boots before instruments resolve — an empty symbol would
    // be a guaranteed 400 from the market service, so the query waits.
    enabled: symbol.length > 0,
    queryFn: async (): Promise<CandlesResponse> => {
      const url = `${CANDLES_URL}&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${CANDLE_LIMIT}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`candles ${response.status}`);
      return (await response.json()) as CandlesResponse;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });
}

/**
 * Candle history for a FIXED past window (epoch ms bounds) — session replay.
 * Static history: no refetchInterval, generous staleTime. The market service
 * forwards from/to to the provider (Binance native windows; SIM materializes
 * its labeled walk).
 */
export function useCandlesRange(symbol: string, interval: MarketInterval, from: number, to: number, enabled: boolean) {
  return useQuery({
    queryKey: ["candles-range", symbol, interval, from, to],
    enabled: enabled && symbol.length > 0 && to > from,
    queryFn: async (): Promise<CandlesResponse> => {
      const url = `${CANDLES_URL}&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=1000&from=${Math.floor(from)}&to=${Math.ceil(to)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`candles-range ${response.status}`);
      return (await response.json()) as CandlesResponse;
    },
    staleTime: 5 * 60_000,
    retry: 2,
  });
}
