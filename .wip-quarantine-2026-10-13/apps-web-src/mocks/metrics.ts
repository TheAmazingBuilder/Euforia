/**
 * API request telemetry — a real ring buffer of the requests that crossed the
 * MSW layer (§9). The lifecycle listeners in mocks/browser.ts feed it; the
 * monitoring handler reads it. No sampling, no fabrication: what was not
 * requested simply does not appear.
 *
 * The buffer is intentionally small (600 entries ≈ a long working session)
 * and path-normalized on write so the endpoint table can never leak record
 * or trade identifiers (§19 — monitoring data must stay secret-free).
 */

export interface ApiRequestSample {
  at: number;
  /** Normalized path pattern, e.g. "/trades/:id/review". */
  pattern: string;
  status: number;
  durationMs: number;
}

const MAX_SAMPLES = 600;
const samples: ApiRequestSample[] = [];
/** requestId → start timestamp (MSW lifecycle correlation). */
const inflight = new Map<string, { at: number; pattern: string }>();

/** Segments that look like identifiers (uuids, long/numeric ids, hashes). */
const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,}|[a-z0-9]{16,})$/i;

/**
 * Collapse dynamic segments to ":id" so the endpoint table groups by shape.
 * Query strings are dropped — they carry filters, never identity.
 */
export function normalizeApiPath(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    const segments = parsed.pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => (ID_LIKE.test(segment) ? ":id" : segment));
    return `/${segments.join("/")}`;
  } catch {
    return "/unparsable";
  }
}

/** MSW lifecycle: request:start — begin timing. */
export function trackRequestStart(requestId: string, url: string): void {
  inflight.set(requestId, { at: Date.now(), pattern: normalizeApiPath(url) });
  // Defensive: if a response event never fires, the map must not leak.
  if (inflight.size > 64) {
    const oldest = inflight.keys().next().value;
    if (oldest !== undefined) inflight.delete(oldest);
  }
}

/** MSW lifecycle: response:mocked / response:bypass — commit the sample. */
export function trackRequestEnd(requestId: string, status: number): void {
  const started = inflight.get(requestId);
  inflight.delete(requestId);
  if (!started) return;
  samples.push({
    at: Date.now(),
    pattern: started.pattern,
    status,
    durationMs: Math.max(0, Date.now() - started.at),
  });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export interface WindowedApiStats {
  windowStart: number;
  windowEnd: number;
  requestCount: number;
  errorCount: number;
  rateLimitedCount: number;
  statusCodes: Record<string, number>;
  endpoints: {
    pattern: string;
    count: number;
    errorCount: number;
    p50Ms: number;
    p95Ms: number;
    lastStatus: number;
  }[];
}

const WINDOW_MS: Record<string, number> = { "5m": 5 * 60_000, "1h": 60 * 60_000, "24h": 24 * 60 * 60_000 };

export function apiWindowMs(window: string): number {
  return WINDOW_MS[window] ?? WINDOW_MS["1h"]!;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** Aggregate the samples inside the window — the only source §9 consumes. */
export function summarizeApiWindow(window: string, now = Date.now()): WindowedApiStats {
  const span = apiWindowMs(window);
  const from = now - span;
  const inWindow = samples.filter((sample) => sample.at >= from);

  const statusCodes: Record<string, number> = {};
  const byPattern = new Map<
    string,
    { count: number; errorCount: number; durations: number[]; lastStatus: number; lastAt: number }
  >();
  let errorCount = 0;
  let rateLimitedCount = 0;

  for (const sample of inWindow) {
    const code = String(sample.status);
    statusCodes[code] = (statusCodes[code] ?? 0) + 1;
    const errored = sample.status >= 400;
    if (errored) errorCount += 1;
    if (sample.status === 429) rateLimitedCount += 1;

    let bucket = byPattern.get(sample.pattern);
    if (!bucket) {
      bucket = { count: 0, errorCount: 0, durations: [], lastStatus: sample.status, lastAt: sample.at };
      byPattern.set(sample.pattern, bucket);
    }
    bucket.count += 1;
    if (errored) bucket.errorCount += 1;
    bucket.durations.push(sample.durationMs);
    if (sample.at >= bucket.lastAt) {
      bucket.lastAt = sample.at;
      bucket.lastStatus = sample.status;
    }
  }

  const endpoints = [...byPattern.entries()]
    .map(([pattern, bucket]) => {
      const sorted = [...bucket.durations].sort((a, b) => a - b);
      return {
        pattern,
        count: bucket.count,
        errorCount: bucket.errorCount,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        lastStatus: bucket.lastStatus,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    windowStart: from,
    windowEnd: now,
    requestCount: inWindow.length,
    errorCount,
    rateLimitedCount,
    statusCodes,
    endpoints,
  };
}

/** How many samples the buffer currently holds (used by the honesty note). */
export function apiSampleCount(): number {
  return samples.length;
}

// ── Failed operations ledger (§10 — honest failure counts) ──────────────────

let failedOperations = 0;

/** Every 4xx/5xx the API layer produces counts as a failed operation. */
export function recordFailedOperation(): void {
  failedOperations += 1;
}

export function failedOperationCount(): number {
  return failedOperations;
}
