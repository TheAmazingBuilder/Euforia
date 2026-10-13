"use client";

import * as React from "react";

/**
 * Mount-stable, slowly-refreshing "now" for relative-time labels
 * (react-hooks/purity: Date.now() never runs inside a component body).
 *
 * Implemented as an external store via useSyncExternalStore — the same
 * sanctioned seam the app shell uses for the sidebar collapse state. The
 * snapshot is bucketed so it stays referentially stable within the window;
 * a slow interval nudges subscribers so "2 min ago" ages honestly.
 */

const NOW_BUCKET_MS = 15_000;

function subscribeToNow(onStoreChange: () => void): () => void {
  const interval = setInterval(onStoreChange, NOW_BUCKET_MS);
  return () => clearInterval(interval);
}

function getNowSnapshot(): number {
  return Math.floor(Date.now() / NOW_BUCKET_MS);
}

function getServerNowSnapshot(): number {
  return 0;
}

export function useNow(): number {
  return React.useSyncExternalStore(
    subscribeToNow,
    getNowSnapshot,
    getServerNowSnapshot,
  );
}

/**
 * Bucket value → epoch ms (the bucket's start). Kept next to the hook so
 * callers never touch Date.now() themselves.
 */
export function nowMs(bucket: number): number {
  return bucket * NOW_BUCKET_MS;
}
