import type { OryonSessionDefinition } from "./definitions";

/**
 * Oryon session-interval engine (Phase 8 spec §4.2) — PURE, framework-free.
 *
 * Every interval is computed by interpreting the session's LOCAL wall time
 * in the session's own IANA timezone, then converting to the chart's UTC
 * time basis (epoch ms — the repo's canonical candle domain). DST is
 * handled by construction: the zone offset is resolved AT the instant
 * being converted (Intl-based, no fixed offsets, no timezone library —
 * spec §9 mandates reusing platform Intl like the rest of the repo).
 *
 * Honesty (spec §4.2): no holiday calendar exists in this repo, so
 * weekends are excluded via the definition's local days and NOTHING ELSE
 * is claimed — a public holiday renders as a regular session day and the
 * UI labels every session "indicative" (§4.2 "communicate that the session
 * is an indicative reference").
 *
 * Interval semantics: [startMs, endMs) — start inclusive, end exclusive.
 * A definition whose end ≤ start (cross-midnight, spec §4.2) rolls its end
 * to the NEXT local day. Results are clipped to the requested UTC window.
 */

/** One resolved session interval on the UTC time basis (epoch ms). */
export interface OryonSessionInterval {
  readonly sessionId: OryonSessionDefinition["id"];
  /** Interval start (epoch ms, inclusive). */
  readonly startMs: number;
  /** Interval end (epoch ms, exclusive). */
  readonly endMs: number;
}

/** Session lifecycle status at an instant (spec §4.3) — INDICATIVE only. */
export interface OryonSessionStatus {
  readonly sessionId: OryonSessionDefinition["id"];
  /** True while now ∈ [start, end) of a resolved interval. */
  readonly open: boolean;
  /** Next expected transition (epoch ms): close when open, open when closed. */
  readonly transitionMs: number | null;
}

const DAY_MS = 86_400_000;
/** Guard for the next-transition lookahead (10 days spans every weekend). */
const LOOKAHEAD_DAYS = 10;

// ── Intl plumbing (formatters cached per zone — creation is expensive) ──────

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  zone: string,
  build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  let fmt = cache.get(zone);
  if (fmt === undefined) {
    fmt = build();
    cache.set(zone, fmt);
  }
  return fmt;
}

/**
 * Zone offset (ms EAST of UTC) in effect at `instantMs` — resolved by Intl
 * ("longOffset" → "GMT-04:00"). Accepts legacy "±HHMM" spellings too.
 * Returns NaN for an unknown zone (callers treat that as "unavailable").
 */
export function zoneOffsetMs(instantMs: number, ianaZone: string): number {
  try {
    const fmt = cachedFormatter(offsetFormatters, ianaZone, () => {
      try {
        return new Intl.DateTimeFormat("en-US", {
          timeZone: ianaZone,
          timeZoneName: "longOffset",
        });
      } catch {
        // Ancient engines without longOffset — shortOffset is the fallback
        // vocabulary ("GMT-4"), still an offset, still zone-derived.
        return new Intl.DateTimeFormat("en-US", {
          timeZone: ianaZone,
          timeZoneName: "shortOffset",
        });
      }
    });
    const part = fmt
      .formatToParts(new Date(instantMs))
      .find((p) => p.type === "timeZoneName");
    const raw = part?.value ?? "GMT";
    if (raw === "GMT" || raw === "UTC") return 0;
    const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?$/.exec(raw);
    if (m === null) return NaN;
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2] ?? 0);
    const mm = Number(m[3] ?? 0);
    const ss = Number(m[4] ?? 0);
    return sign * (hh * 3_600_000 + mm * 60_000 + ss * 1_000);
  } catch {
    return NaN;
  }
}

/** Local Y/M/D parts of an instant in a zone (en-CA → YYYY-MM-DD). */
export function localDateKeyInZone(instantMs: number, ianaZone: string): string | null {
  try {
    const fmt = cachedFormatter(dayFormatters, ianaZone, () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ianaZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
    // en-CA formats as "YYYY-MM-DD" — the repo's date-key convention.
    return fmt.format(new Date(instantMs));
  } catch {
    return null;
  }
}

/** Weekday (0=Sun..6=Sat) of a local date key — anchored at noon UTC so
 *  no offset can shift the key to another day (repo convention). */
export function weekdayOfDateKey(key: string): number {
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? NaN : date.getUTCDay();
}

/** Shift a local date key by whole days (UTC arithmetic on the noon anchor). */
function shiftDateKey(key: string, days: number): string {
  const anchor = new Date(`${key}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Parse "HH:mm" → {hh, mm} — null when malformed (missing metadata §4.2). */
function parseHHmm(value: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (m === null) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

/**
 * Local wall time in a zone → UTC instant (epoch ms). The standard
 * "offset twicing" algorithm: guess with the offset at the naive instant,
 * then re-guess with the offset at the result. Wall times inside a
 * spring-forward gap resolve to the instant after the gap (platform
 * convention); session windows (07:00-18:00 local) never enter it.
 */
export function zonedWallTimeToUtcMs(
  dateKey: string,
  hh: number,
  mm: number,
  ianaZone: string,
): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const naive = Date.UTC(y, (mo ?? 1) - 1, d ?? 1, hh, mm);
  const off1 = zoneOffsetMs(naive, ianaZone);
  let t = naive - off1;
  const off2 = zoneOffsetMs(t, ianaZone);
  if (off2 !== off1) t = naive - off2;
  return t;
}

/**
 * All resolved intervals of ONE definition overlapping [fromMs, toMs).
 * Candidate local days are enumerated as UTC days padded by one day on
 * each side (zone offsets stay within ±1 day of UTC for every IANA zone).
 * Per-day results are cached — repeated visible-range updates and the
 * 1 Hz status read share one computation per session-day.
 */
const dayIntervalCache = new Map<string, OryonSessionInterval | null>();
const DAY_CACHE_MAX = 512;

function intervalForLocalDay(
  def: OryonSessionDefinition,
  dateKey: string,
): OryonSessionInterval | null {
  // The cache key carries the FULL effective definition (id + zone + times
  // + days): a definition is a code constant whose identity is its id, but
  // keying on the id ALONE would let a changed schedule read a stale
  // interval — cheap insurance, no correctness assumptions.
  const cacheKey = `${def.id}|${def.ianaZone}|${def.startHHmm}|${def.endHHmm}|${def.daysLocal.join(",")}|${dateKey}`;
  if (dayIntervalCache.has(cacheKey)) return dayIntervalCache.get(cacheKey) ?? null;

  let result: OryonSessionInterval | null = null;
  const start = parseHHmm(def.startHHmm);
  const end = parseHHmm(def.endHHmm);
  const weekday = weekdayOfDateKey(dateKey);
  if (start !== null && end !== null && !Number.isNaN(weekday)) {
    if (def.daysLocal.includes(weekday)) {
      const startMs = zonedWallTimeToUtcMs(dateKey, start.hh, start.mm, def.ianaZone);
      // Cross-midnight (§4.2): end ≤ start rolls to the NEXT local day.
      const endKey = end.hh * 60 + end.mm <= start.hh * 60 + start.mm
        ? shiftDateKey(dateKey, 1)
        : dateKey;
      const endMs = zonedWallTimeToUtcMs(endKey, end.hh, end.mm, def.ianaZone);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        result = { sessionId: def.id, startMs, endMs };
      }
    }
  }

  if (dayIntervalCache.size >= DAY_CACHE_MAX) dayIntervalCache.clear();
  dayIntervalCache.set(cacheKey, result);
  return result;
}

export function sessionIntervalsForUtcRange(
  def: OryonSessionDefinition,
  fromMs: number,
  toMs: number,
): OryonSessionInterval[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return [];
  const intervals: OryonSessionInterval[] = [];
  // UTC-day floor, padded by one day on each side (max |offset| is < 24h).
  const firstDay = Math.floor(fromMs / DAY_MS) - 1;
  const lastDay = Math.floor(toMs / DAY_MS) + 1;
  for (let day = firstDay; day <= lastDay; day += 1) {
    const probeMs = day * DAY_MS + 12 * 3_600_000; // noon UTC — safe probe
    const dateKey = localDateKeyInZone(probeMs, def.ianaZone);
    if (dateKey === null) return []; // unknown zone → honest unavailable
    const interval = intervalForLocalDay(def, dateKey);
    if (interval === null) continue;
    // Clip to the requested window (half-open).
    const start = Math.max(interval.startMs, fromMs);
    const end = Math.min(interval.endMs, toMs);
    if (end > start) intervals.push({ sessionId: def.id, startMs: start, endMs: end });
  }
  return intervals;
}

/**
 * INDICATIVE lifecycle status at `nowMs` (spec §4.3): open when an
 * interval contains the instant; otherwise closed, with the next expected
 * opening within the lookahead. Null when the definition/zone is unusable
 * — callers show an "unavailable" state, never a guessed status.
 */
export function sessionStatusAt(
  def: OryonSessionDefinition,
  nowMs: number,
): OryonSessionStatus | null {
  if (!Number.isFinite(nowMs)) return null;
  const intervals = sessionIntervalsForUtcRange(
    def,
    nowMs - DAY_MS,
    nowMs + LOOKAHEAD_DAYS * DAY_MS,
  );
  const current = intervals.find((i) => i.startMs <= nowMs && nowMs < i.endMs);
  if (current !== undefined) {
    return { sessionId: def.id, open: true, transitionMs: current.endMs };
  }
  const next = intervals.find((i) => i.startMs > nowMs);
  if (next === undefined) return null;
  return { sessionId: def.id, open: false, transitionMs: next.startMs };
}

/** Importance-free band shape the chart primitive consumes (UTC seconds). */
export interface OryonSessionBand {
  readonly sessionId: string;
  readonly startSec: number;
  readonly endSec: number;
  /** Theme token KEY — resolved to a color at render time. */
  readonly colorToken: string;
  readonly label: string;
}

/**
 * Bands for a SET of definitions over the chart's UTC window (spec §5) —
 * the chart overlay input. Intervals stay per-session (overlapping
 * sessions compose visually through alpha compositing, the restrained
 * style §5 requires); sorted by start for a stable draw order.
 */
export function computeSessionBands(
  defs: readonly OryonSessionDefinition[],
  fromMs: number,
  toMs: number,
): OryonSessionBand[] {
  const bands: OryonSessionBand[] = [];
  for (const def of defs) {
    for (const interval of sessionIntervalsForUtcRange(def, fromMs, toMs)) {
      bands.push({
        sessionId: def.id,
        startSec: interval.startMs / 1000,
        endSec: interval.endMs / 1000,
        colorToken: def.colorToken,
        label: def.name,
      });
    }
  }
  return bands.sort((a, b) => a.startSec - b.startSec || a.sessionId.localeCompare(b.sessionId));
}
