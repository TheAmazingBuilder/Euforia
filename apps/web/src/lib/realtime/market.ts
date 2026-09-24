"use client";

import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Live market prices — client store for the socket.io market service.
 *
 * Transport: the sandbox gateway routes on the `XTransformPort` query param,
 * so the connection URL is RELATIVE ("/?XTransformPort=3003") — never a
 * host:port. If the socket cannot connect (e.g. blocked upgrade), the store
 * degrades gracefully to HTTP snapshot polling on the same service, so the
 * unrealized P&L stays live either way.
 */

export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number;
  ts: number;
}

const MARKET_PORT = 3003;
const WS_URL = `/?XTransformPort=${MARKET_PORT}`;
const SNAPSHOT_URL = `/prices?XTransformPort=${MARKET_PORT}`;
const POLL_MS = 2000;
/** Give the websocket this long before falling back to polling. */
const CONNECT_GRACE_MS = 3500;

type Listener = () => void;

const EMPTY: ReadonlyMap<string, LiveQuote> = new Map();
/** Frozen empty snapshot — stable reference for SSR/hydration. */
const EMPTY_SNAPSHOT: PriceSnapshot = Object.freeze({
  quotes: EMPTY,
  connected: false,
  source: "idle" as const,
});

export interface PriceSnapshot {
  quotes: ReadonlyMap<string, LiveQuote>;
  connected: boolean;
  source: "idle" | "socket" | "polling";
}

let snapshot: PriceSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<Listener>();
let started = false;
let socket: Socket | null = null;
let pollTimer: number | null = null;
let graceTimer: number | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setQuotes(quotes: LiveQuote[], source: PriceSnapshot["source"], connected: boolean): void {
  snapshot = Object.freeze({
    quotes: new Map(quotes.map((quote) => [quote.symbol, quote])),
    connected,
    source,
  });
  emit();
}

async function pollOnce(): Promise<void> {
  try {
    const response = await fetch(SNAPSHOT_URL);
    if (!response.ok) return;
    const body = (await response.json()) as { quotes?: LiveQuote[] };
    if (Array.isArray(body.quotes)) {
      // A successful snapshot IS a live feed — the source just differs.
      setQuotes(body.quotes, socket?.connected ? "socket" : "polling", true);
    }
  } catch {
    // Service unreachable — keep the last snapshot; the UI shows the stale mark.
    snapshot = { ...snapshot, connected: false, source: socket?.connected ? "socket" : "idle" };
    emit();
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
    setQuotes(quotes, "socket", true);
  });

  socket.on("disconnect", () => {
    startPolling();
    snapshot = { ...snapshot, connected: false, source: "polling" };
    emit();
  });
  socket.on("connect_error", () => {
    startPolling();
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
