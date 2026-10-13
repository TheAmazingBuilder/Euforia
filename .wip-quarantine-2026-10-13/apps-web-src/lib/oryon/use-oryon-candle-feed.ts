"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";

import type { Candle, CandlesResponse, QuoteSource } from "@cosmoz/shared";

import { useCandles, fetchCandlesRange } from "@/lib/realtime/market";
import {
  mergeCandleWindows,
  normalizeCandlesResponse,
  oldestTime,
  previousWindow,
} from "@/lib/oryon/candles";

/**
 * Oryon candle feed — ONE hook owning the full Phase-1 history pipeline
 * (docs/specs/oryon-prd.md §10.1):
 *
 *   initial window  — the existing `useCandles` (market-service via the
 *                     Next rewrite, NOT the MSW surface), refetched quietly
 *   backfill        — history windows fetched ONE page at a time through
 *                     `useQueries` as the chart's left edge is reached
 *                     (`requestOlder`), then deduplicated and merged
 *   validation      — every payload passes `candlesResponseSchema` and row
 *                     sanitization before reaching the chart engine
 *
 * Honesty rules: an empty (or failed) backfill window marks the history
 * EXHAUSTED — the pagination stops instead of hammering the provider past
 * its genesis; a payload whose symbol/interval does not match the current
 * selection is ignored (keepPreviousData can surface the previous query's
 * data briefly); the number of windows is capped to bound memory.
 *
 * React-discipline: backfill state is DERIVED from the query states every
 * render — no setState inside effects (react-hooks/set-state-in-effect).
 */

export interface OryonCandleFeed {
  /** Merged, validated, ascending series (empty while loading/failed). */
  candles: Candle[];
  /** Quote-source label from the current feed (real|sim) — null until known. */
  source: QuoteSource | null;
  /** True until the FIRST successful/failed answer for this instrument. */
  initialLoading: boolean;
  /** First-load failure — renders the inline error banner + retry. */
  initialError: boolean;
  /** A backfill window is in flight (subtle chip, not a blocker). */
  backfilling: boolean;
  /** Nothing older is available (or pagination hit its cap) — stop asking. */
  historyExhausted: boolean;
  /** Re-fetch the initial window (error banner retry). */
  refetch: () => void;
  /** Ask for the next older window (no-op while one is already pending). */
  requestOlder: () => void;
}

const BACKFILL_SIZE = 300;
/** 16 × 300 = 4 800 buckets maximum loaded per instrument/timeframe. */
const MAX_WINDOWS = 16;

interface RangeRequest {
  from: number;
  to: number;
}

export function useOryonCandleFeed(
  symbol: string,
  interval: Parameters<typeof useCandles>[1],
): OryonCandleFeed {
  const initial = useCandles(symbol, interval);

  // Requested backfill windows, oldest fetch appended last (event-driven
  // only: `requestOlder` from the chart's left-edge callback).
  const [windows, setWindows] = React.useState<RangeRequest[]>([]);

  // Selection change → the window list is meaningless — reset DURING RENDER
  // (React's documented "adjust state when a prop changes" pattern; never in
  // an effect, which would cascade).
  const selectionKey = `${symbol}|${interval}`;
  const [prevKey, setPrevKey] = React.useState(selectionKey);
  if (prevKey !== selectionKey) {
    setPrevKey(selectionKey);
    setWindows([]);
  }

  const queries = useQueries({
    queries: windows.map((range) => ({
      queryKey: ["candles-range", symbol, interval, range.from, range.to] as const,
      queryFn: (): Promise<CandlesResponse> =>
        fetchCandlesRange(symbol, interval, range.from, range.to),
      enabled: symbol.length > 0,
      staleTime: 5 * 60_000,
      retry: 2,
    })),
  });

  // Derive the backfill result from the window queries — every render.
  const backfill = React.useMemo(() => {
    const collected: Candle[] = [];
    let loading = false;
    let exhausted = false;
    for (const query of queries) {
      if (query.isLoading) {
        loading = true;
        continue;
      }
      if (query.isError) {
        // A window that exhausted its retries stops pagination honestly.
        exhausted = true;
        continue;
      }
      if (query.data !== undefined) {
        const normalized = normalizeCandlesResponse(query.data);
        if (normalized.candles.length === 0) exhausted = true;
        else collected.push(...normalized.candles);
      }
    }
    return { candles: collected, loading, exhausted };
  }, [queries]);

  // ── Match-guard: with keepPreviousData, `initial.data` may briefly be the
  // PREVIOUS instrument/interval payload — never feed it to the chart.
  const initialMatched =
    initial.data !== undefined &&
    initial.data.symbol === symbol &&
    initial.data.interval === interval;

  const initialNormalized = React.useMemo(
    () => (initialMatched ? normalizeCandlesResponse(initial.data) : null),
    [initialMatched, initial.data],
  );

  const merged = React.useMemo(
    () => mergeCandleWindows(initialNormalized?.candles ?? [], backfill.candles),
    [initialNormalized, backfill.candles],
  );

  const historyExhausted =
    backfill.exhausted || windows.length >= MAX_WINDOWS;

  const requestOlder = () => {
    if (backfill.loading || historyExhausted) return;
    const oldest = oldestTime(merged);
    if (oldest === null) return;
    setWindows((previous) => [...previous, previousWindow(oldest, interval, BACKFILL_SIZE)]);
  };

  return {
    candles: merged,
    source: initialNormalized?.source ?? null,
    initialLoading: initial.isPending,
    initialError: initial.isError,
    backfilling: backfill.loading,
    historyExhausted,
    refetch: initial.refetch,
    requestOlder,
  };
}
