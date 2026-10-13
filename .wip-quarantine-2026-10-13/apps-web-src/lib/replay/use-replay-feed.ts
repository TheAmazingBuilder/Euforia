"use client";

import * as React from "react";

import type { Candle, CandlesResponse, MarketInterval, QuoteSource } from "@cosmoz/shared";

import { marketFetch, STALE_MS } from "@/lib/realtime/market";

/**
 * Replay candle feed — the look-ahead-protected data boundary
 * (REPLAY MASTER PROMPT §18, §50).
 *
 * The browser NEVER receives the whole historical window up front. Slices
 * are fetched in bounded chunks that trail the playhead: the feed may hold
 * at most CHUNK_CANDLES of unrevealed future beyond `revealToMs` (playback
 * prefetch buffer). Everything that reaches the chart still passes through
 * the engine's `visibleCandles` filter — two independent layers, so future
 * market data cannot leak even if a chunk arrives early.
 *
 * Transport: the SAME authenticated market-service path as Session Live
 * (lib/realtime/market) — one token manager, one refresh policy.
 *
 * Honest empty/error states (§53/§16): a provider outage surfaces as
 * `status: "error"`; a window the provider cannot serve is `"empty"`. No
 * client-side fabrication, ever.
 */

const CANDLES_URL = `/candles?XTransformPort=3003`;
/** Candles per chunk — bounded window per request (§50: no warehouse reads). */
const CHUNK_CANDLES = 240;
/** How far beyond the playhead prefetching may reach, in candles. */
const PREFETCH_AHEAD_CANDLES = 12;
const CANDLES_LIMIT = 1000;

export type ReplayFeedStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface ReplayFeedSnapshot {
  /** Fetched slices — bounded by the chunk policy, ascending by open time. */
  candles: Candle[];
  source: QuoteSource | null;
  status: ReplayFeedStatus;
  /** Exclusive open-time bound (ms) the feed has actually received. */
  fetchedToMs: number;
}

interface FeedState extends ReplayFeedSnapshot {
  /** Dataset identity the stored state belongs to (guards stale datasets). */
  key: string;
}

const INITIAL_STATE: FeedState = {
  key: "",
  candles: [],
  source: null,
  status: "idle",
  fetchedToMs: 0,
};

export interface ReplayFeedSnapshotPublic extends ReplayFeedSnapshot {
  attempt: number;
  retry: () => void;
}

interface ReplayFeedArgs {
  symbol: string;
  interval: MarketInterval;
  /** Historical window bounds (ms epoch) — the session's dataset. */
  fromMs: number;
  toMs: number;
  /** Bucket width (interval ms). */
  bucketMs: number;
  /**
   * The replay boundary the feed may fetch up to: engine current time plus
   * the forming bucket. The feed keeps at most PREFETCH_AHEAD_CANDLES of
   * headroom beyond this point — never the whole dataset (§18).
   */
  revealToMs: number;
  enabled: boolean;
}

export function useReplayFeed({
  symbol,
  interval,
  fromMs,
  toMs,
  bucketMs,
  revealToMs,
  enabled,
}: ReplayFeedArgs): ReplayFeedSnapshotPublic {
  const [state, setState] = React.useState<FeedState>(INITIAL_STATE);
  const [attempt, setAttempt] = React.useState(0);
  const inFlight = React.useRef(false);

  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);

  const datasetKey = `${symbol}|${interval}|${fromMs}|${toMs}`;
  // Stale datasets (symbol/window switch) never surface — render sees the
  // frozen initial state until the first chunk of THIS dataset lands.
  const active: FeedState = state.key === datasetKey ? state : INITIAL_STATE;

  React.useEffect(() => {
    if (!enabled || symbol.length === 0 || bucketMs <= 0 || fromMs >= toMs) return;
    if (active.status === "error" || active.status === "empty") return; // terminal until retry

    const prefetchLimit = Math.min(revealToMs + PREFETCH_AHEAD_CANDLES * bucketMs, toMs);
    if (active.fetchedToMs >= prefetchLimit && active.status !== "loading" && active.status !== "idle") return;
    if (active.status === "loading" && active.fetchedToMs >= prefetchLimit) return;
    if (inFlight.current) return;

    const fresh = state.key !== datasetKey;
    const resumed = !fresh && active.fetchedToMs > fromMs;
    const chunkFrom = resumed ? active.fetchedToMs + bucketMs : fromMs;
    if (chunkFrom > toMs) return;
    const chunkTo = Math.min(chunkFrom + CHUNK_CANDLES * bucketMs - 1, prefetchLimit);

    inFlight.current = true;
    void (async () => {
      setState((previous) => ({
        key: datasetKey,
        candles: previous.key === datasetKey ? previous.candles : [],
        source: previous.key === datasetKey ? previous.source : null,
        status: "loading",
        fetchedToMs: previous.key === datasetKey ? previous.fetchedToMs : 0,
      }));
      try {
        const url = `${CANDLES_URL}&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${CANDLES_LIMIT}&from=${Math.floor(chunkFrom)}&to=${Math.ceil(chunkTo)}`;
        const response = await marketFetch(url);
        if (!response.ok) throw new Error(`replay candles ${response.status}`);
        const body = (await response.json()) as CandlesResponse;
        const incoming = body.candles ?? [];
        setState((previous) => {
          const base = previous.key === datasetKey ? previous : INITIAL_STATE;
          const merged = [...base.candles];
          let lastT = merged.length > 0 ? merged[merged.length - 1]!.t : Number.NEGATIVE_INFINITY;
          for (const candle of incoming) {
            if (candle.t > lastT) {
              merged.push(candle);
              lastT = candle.t;
            }
          }
          const fetchedTo = Math.max(base.fetchedToMs, (incoming.length > 0 ? lastT : chunkTo) + bucketMs - 1);
          return {
            key: datasetKey,
            candles: merged,
            source: body.source ?? base.source,
            fetchedToMs: fetchedTo,
            status: merged.length === 0 && fetchedTo >= toMs - bucketMs ? "empty" : "ready",
          };
        });
      } catch {
        setState((previous) => ({
          key: datasetKey,
          candles: previous.key === datasetKey ? previous.candles : [],
          source: previous.key === datasetKey ? previous.source : null,
          status: "error",
          fetchedToMs: previous.key === datasetKey ? previous.fetchedToMs : 0,
        }));
      } finally {
        inFlight.current = false;
      }
    })();
    // The loader follows the playhead — revealToMs is a deliberate driver.
  }, [
    enabled,
    symbol,
    interval,
    bucketMs,
    fromMs,
    toMs,
    revealToMs,
    attempt,
    datasetKey,
    active.status,
    active.fetchedToMs,
    active.key,
    state.key,
  ]);

  return { candles: active.candles, source: active.source, status: active.status, fetchedToMs: active.fetchedToMs, attempt, retry };
}

/**
 * True while the replay should keep its transport running but the feed is
 * still catching up with the prefetch window (a quiet spinner on the
 * transport — never a blocker, the playhead simply waits for data).
 */
export function feedLagging(snapshot: ReplayFeedSnapshotPublic, revealToMs: number, bucketMs: number): boolean {
  return snapshot.status === "loading" && snapshot.fetchedToMs < revealToMs + bucketMs;
}

/** Re-export so callers can mark a stale loaded window honestly. */
export { STALE_MS as REPLAY_STALE_MS };
