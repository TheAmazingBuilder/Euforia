"use client";

import { useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";

import type { CandlesResponse, MarketInterval, QuoteSource } from "@cosmoz/shared";

import { subscribeAuthEvents } from "@/lib/auth/auth-events";
import { refreshAccessToken } from "@/lib/auth/refresh";
import { getAccessToken, hasTokenRecord } from "@/lib/auth/token-store";

/**
 * Live market prices — client store for the authenticated socket.io market
 * service.
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
 *
 * Authentication (mission §45/§62/§63 — "reuse the existing auth
 * infrastructure, do not create a second token manager"): the socket
 * handshake presents the SAME access token the API client uses
 * (lib/auth/token-store) via socket.io's `auth` payload; REST reads send it
 * as Bearer. Lifecycle is driven by the shared auth event bus:
 *   TOKEN_REFRESHED  → re-handshake so the server always sees a fresh
 *                      credential (Reconnect → Authenticate, §45)
 *   SESSION_EXPIRED / LOGGED_OUT → full teardown — the feed must NOT keep
 *                      streaming after the session ends (§76 negative test)
 *   AUTHENTICATED    → (re)start with the current token
 * Handshake auth failures trigger ONE bounded single-flight refresh → retry;
 * the server — not this client — is the security boundary.
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
  /** Last structured auth rejection from the service (null otherwise). */
  authError: "AUTH_REQUIRED" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | null;
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
  authError: null,
});

let snapshot: PriceSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<Listener>();
let started = false;
let gotData = false;
let socket: Socket | null = null;
let pollTimer: number | null = null;
let graceTimer: number | null = null;

/** Structured auth errors the market service answers handshakes with. */
const AUTH_ERRORS = new Set(["AUTH_REQUIRED", "TOKEN_INVALID", "TOKEN_EXPIRED"]);
/** Bounded re-auth: at most 3 refresh-driven handshakes per 30s window. */
const AUTH_RETRY_LIMIT = 3;
const AUTH_RETRY_WINDOW_MS = 30_000;
let authRetryWindowStart = 0;
let authRetries = 0;

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
    authError: null,
  });
  emit();
}

async function pollOnce(): Promise<void> {
  const pollStartedAt = Date.now();
  try {
    const response = await marketFetch(SNAPSHOT_URL);
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

/**
 * Authenticated fetch for the market service surface (polling snapshot +
 * candles). Mirrors the API client's contract — Bearer injection, then on
 * 401 ONE single-flight refresh and ONE retry — without routing through
 * MSW (these paths bypass the mock worker on purpose).
 */
async function marketFetch(url: string, allowRetry = true): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (response.status === 401 && allowRetry && hasTokenRecord()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return marketFetch(url, false);
  }
  return response;
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

function startSocket(token: string): void {
  if (typeof window === "undefined") return;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = io(WS_URL, {
    // Long-polling first (works through every proxy), websocket upgrade when
    // the transport allows it — the classic resilient socket.io handshake.
    transports: ["polling", "websocket"],
    reconnectionDelay: 2000,
    timeout: 5000,
    // Same credential the API client injects — one token manager, one
    // identity (mission §6.1: no second auth store / token manager).
    auth: { token },
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
  socket.on("connect_error", (error: Error) => {
    telemetry.reconnectAttempts += 1;
    if (AUTH_ERRORS.has(error.message)) {
      // Server rejected the credential. Reconnect → Authenticate (§45):
      // one bounded single-flight refresh, then re-handshake. The server
      // stays the security boundary — the client never self-authorizes.
      const now = Date.now();
      if (now - authRetryWindowStart > AUTH_RETRY_WINDOW_MS) {
        authRetryWindowStart = now;
        authRetries = 0;
      }
      if (authRetries >= AUTH_RETRY_LIMIT || !hasTokenRecord()) {
        stopPolling();
        patch({
          phase: "offline",
          connected: false,
          transport: "none",
          source: "idle",
          authError: error.message as PriceSnapshot["authError"],
        });
        return;
      }
      authRetries += 1;
      stopPolling();
      void refreshAccessToken().then((refreshed) => {
        if (refreshed && socket !== null) {
          socket.auth = { token: getAccessToken() };
          socket.connect();
        } else if (!refreshed) {
          patch({
            phase: "offline",
            connected: false,
            transport: "none",
            source: "idle",
            authError: error.message as PriceSnapshot["authError"],
          });
        }
      });
      return;
    }
    startPolling();
  });
  socket.io.on("reconnect_attempt", () => {
    telemetry.reconnectAttempts += 1;
  });

  // Grace period: if the socket never connects, degrade to polling quietly.
  if (graceTimer !== null) window.clearTimeout(graceTimer);
  graceTimer = window.setTimeout(() => {
    if (!socket?.connected) startPolling();
  }, CONNECT_GRACE_MS);
}

/** Server-authoritative session end — the feed must stop streaming (§76). */
function teardownFeed(): void {
  stopPolling();
  if (graceTimer !== null) {
    window.clearTimeout(graceTimer);
    graceTimer = null;
  }
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  gotData = false;
  snapshot = Object.freeze({
    quotes: EMPTY,
    connected: false,
    source: "idle" as const,
    phase: "offline" as const,
    transport: "none" as const,
    lastTickAt: 0,
    authError: null,
  });
  emit();
}

/** Re-handshake with the freshest credential (Reconnect → Authenticate, §45). */
function rehandshake(): void {
  const token = getAccessToken();
  if (socket === null) {
    if (token !== null) startSocket(token);
    return;
  }
  socket.auth = { token };
  if (socket.connected) socket.disconnect();
  socket.connect();
}

function bindAuthLifecycle(): void {
  // One subscription for the module lifetime — the feed is app-wide.
  subscribeAuthEvents((event) => {
    if (event.type === "TOKEN_REFRESHED") {
      rehandshake();
      return;
    }
    if (event.type === "SESSION_EXPIRED" || event.type === "LOGGED_OUT") {
      teardownFeed();
      return;
    }
    if (event.type === "AUTHENTICATED") {
      rehandshake();
    }
  });
}

function start(): void {
  if (typeof window === "undefined") return;
  if (!started) {
    started = true;
    bindAuthLifecycle();
  }
  const token = getAccessToken();
  if (token !== null) {
    startSocket(token);
  }
  // No token yet (boot race): the AUTHENTICATED / TOKEN_REFRESHED event
  // starts the socket — the feed never presents an empty credential.
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
export function useFeedStatus(): {
  phase: FeedPhase;
  transport: FeedTransport;
  lastTickAt: number;
  authError: PriceSnapshot["authError"];
} {
  const { phase, transport, lastTickAt, authError } = useLiveQuotes();
  return { phase, transport, lastTickAt, authError };
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
      const response = await marketFetch(url);
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
      const response = await marketFetch(url);
      if (!response.ok) throw new Error(`candles-range ${response.status}`);
      return (await response.json()) as CandlesResponse;
    },
    staleTime: 5 * 60_000,
    retry: 2,
  });
}
