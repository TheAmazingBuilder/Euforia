/**
 * Client-observed API telemetry (Monitoring MASTER PROMPT §9, §21).
 *
 * The typed fetch wrapper records every real request it makes — method,
 * path, status and duration as the BROWSER observed it — into bounded rings.
 * The monitoring engine (mocks side) aggregates these observations at read
 * time, so the API tab shows real traffic from the running session instead
 * of hardcoded status values. Direction of dependency: mocks → lib (the app
 * code never imports from mocks).
 *
 * Bounded memory (§18): 500 most recent calls + 90 one-minute buckets.
 */

export interface ApiCallObservation {
  method: string;
  path: string;
  /** HTTP status, or 0 for transport failures (network error / abort). */
  status: number;
  durationMs: number;
  at: number;
}

export interface ApiTelemetrySnapshot {
  windowStartedAt: number;
  calls: readonly ApiCallObservation[];
  /** One bucket per minute: { count, errorCount } keyed by minute start. */
  buckets: readonly { at: number; count: number; errorCount: number }[];
}

const MAX_CALLS = 500;
const MAX_BUCKETS = 90;

const startedAt = Date.now();
const calls: ApiCallObservation[] = [];
const buckets = new Map<number, { count: number; errorCount: number }>();

function bucketStart(at: number): number {
  return Math.floor(at / 60_000) * 60_000;
}

/** Record one real request observation. Never throws; bounded memory. */
export function recordApiTelemetry(observation: ApiCallObservation): void {
  calls.push(observation);
  if (calls.length > MAX_CALLS) calls.splice(0, calls.length - MAX_CALLS);

  const key = bucketStart(observation.at);
  const bucket = buckets.get(key) ?? { count: 0, errorCount: 0 };
  bucket.count += 1;
  if (observation.status === 0 || observation.status >= 400) bucket.errorCount += 1;
  buckets.set(key, bucket);
  if (buckets.size > MAX_BUCKETS) {
    const oldest = Math.min(...buckets.keys());
    buckets.delete(oldest);
  }
}

/** Read-side snapshot for the monitoring engine (copies, caller-safe). */
export function getApiTelemetry(): ApiTelemetrySnapshot {
  return {
    windowStartedAt: startedAt,
    calls: [...calls],
    buckets: [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([at, b]) => ({ at, count: b.count, errorCount: b.errorCount })),
  };
}
