import type { EcoEvent } from "@cosmoz/shared";

/**
 * REAL economic provider bridge — ForexFactory weekly calendar (server-side
 * ONLY: the public JSON has no CORS headers, so this fetch never runs in
 * the browser; it lives behind the /api/eco-events route handler).
 *
 * "Behind the existing port" (the user's contract): the bridge answers the
 * SAME route with the SAME canonical EcoEvent shape — the workspace, the
 * calendar pages and every consumer keep their exact queries; only the
 * provenance changes (and is HONESTLY labeled by `source`).
 *
 * Robustness contract (the provider is external and unauthenticated):
 *   - hard 6 s timeout, single-flight fetch, 30 min TTL cache;
 *   - every row is re-validated against the canonical shape — invalid rows
 *     are skipped, never forced;
 *   - ANY failure (network, shape, parse) returns null and the route falls
 *     back to the deterministic sample fixtures — the surface never breaks
 *     because the provider is down.
 *
 * Identity: `ff-` ref folded into UUID hex from sha256(title|instant) —
 * stable across polls (the same release keeps its id), never a raw
 * provider id.
 */
import { createHash } from "node:crypto";

const FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 30 * 60_000;

/** FF impact vocabulary → the canonical tiers (Holiday keeps its title). */
function mapImpact(impact: string): EcoEvent["impact"] | null {
  const normalized = impact.trim().toLowerCase();
  if (normalized === "high") return "HIGH";
  if (normalized === "medium") return "MEDIUM";
  if (normalized === "low") return "LOW";
  if (normalized === "holiday") return "LOW";
  return null; // Unknown tier — the row is skipped, never force-mapped.
}

/** sha256 hex → canonical UUID layout (deterministic, collision-safe). */
function stableUuid(ref: string): string {
  const hex = createHash("sha256").update(ref).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Raw FF wire row — only the fields this bridge consumes. */
interface FfRow {
  title?: unknown;
  country?: unknown;
  date?: unknown;
  impact?: unknown;
  forecast?: unknown;
  previous?: unknown;
}

function normalizeRow(row: FfRow): EcoEvent | null {
  if (typeof row.title !== "string" || typeof row.country !== "string" || typeof row.date !== "string") {
    return null;
  }
  const title = row.title.trim();
  const currency = row.country.trim().toUpperCase();
  const scheduled = new Date(row.date);
  if (title === "" || currency.length !== 3 || Number.isNaN(scheduled.getTime())) {
    return null;
  }
  const impact = mapImpact(typeof row.impact === "string" ? row.impact : "");
  if (impact === null) return null;

  const text = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };

  return {
    id: stableUuid(`ff|${title}|${scheduled.toISOString()}`),
    title,
    currency,
    impact,
    scheduledAt: scheduled.toISOString(),
    actual: null, // The weekly feed carries no released actuals - honest null.
    forecast: text(row.forecast),
    previous: text(row.previous),
  };
}

export interface RealEcoWindow {
  events: EcoEvent[];
  /** [min, max] scheduled times of the REAL rows (epoch ms). */
  windowStartMs: number;
  windowEndMs: number;
}

let cache: { at: number; data: RealEcoWindow } | null = null;
let inFlight: Promise<RealEcoWindow | null> | null = null;

async function fetchOnce(): Promise<RealEcoWindow | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(FF_CALENDAR_URL, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "cosmoz-eco-bridge/1.0", Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    if (!Array.isArray(payload)) return null;

    const events: EcoEvent[] = [];
    let windowStartMs = Number.POSITIVE_INFINITY;
    let windowEndMs = Number.NEGATIVE_INFINITY;
    for (const row of payload as FfRow[]) {
      const event = normalizeRow(row);
      if (event === null) continue;
      const at = new Date(event.scheduledAt).getTime();
      if (at < windowStartMs) windowStartMs = at;
      if (at > windowEndMs) windowEndMs = at;
      events.push(event);
    }
    if (events.length === 0) return null;
    return { events, windowStartMs, windowEndMs };
  } catch {
    return null; // Timeout / network / parse — the caller falls back.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The real week (or null when the provider is unreachable). Cached 30 min;
 * concurrent callers share one fetch (single-flight).
 */
export function fetchRealEcoWeek(): Promise<RealEcoWindow | null> {
  if (cache !== null && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.data);
  }
  if (inFlight !== null) return inFlight;
  inFlight = fetchOnce()
    .then((data) => {
      if (data !== null) cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
