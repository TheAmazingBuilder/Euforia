import { STALE_MS } from "@/lib/realtime/market";

/**
 * Positions-stream freshness machine (Phase 4 spec §9–§10 — "do not display
 * a permanently green Live status simply because the UI is open").
 *
 * Same honesty contract as the price feed (OryonFeedStatus): a transport
 * that stopped delivering renders STALE, a lost transport renders
 * DISCONNECTED, and "no snapshot yet" renders CONNECTING — never LIVE by
 * default. Pure function of (connected, lastEventAt, now).
 */

export type PositionsStreamStatus =
  | "connecting"
  | "live"
  | "stale"
  | "disconnected";

export function classifyPositionsStatus(params: {
  connected: boolean;
  lastEventAt: number;
  now: number;
  /** Defaults to the market layer's STALE_MS convention (8 s). */
  staleMs?: number;
}): PositionsStreamStatus {
  const { connected, lastEventAt, now } = params;
  const staleMs = params.staleMs ?? STALE_MS;

  if (lastEventAt === 0) {
    // Nothing has ever arrived: the stream is starting (or retrying) —
    // "disconnected" would claim we LOST a feed we never had.
    return "connecting";
  }
  if (!connected) return "disconnected";
  if (now - lastEventAt > staleMs) return "stale";
  return "live";
}

/** Age of the last snapshot in whole seconds (0 when unknown). */
export function snapshotAgeSeconds(lastEventAt: number, now: number): number | null {
  if (lastEventAt === 0) return null;
  return Math.max(0, Math.floor((now - lastEventAt) / 1000));
}
