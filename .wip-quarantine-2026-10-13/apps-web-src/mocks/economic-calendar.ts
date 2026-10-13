import { toTradingDateKey, type EconomicEvent, type EventImpact } from "@cosmoz/shared";

import { mulberry32, type Rng } from "./fixtures/random";

/**
 * Economic calendar fixture engine (feature proposal #10).
 *
 * Deterministic per trading week: the same week key always regenerates the
 * exact same event list (mulberry32 seeded by the week key hash), so week
 * navigation is stable across refetches and reloads. Recurring templates
 * (jobless claims, EIA inventories, PMIs…) plus 1–2 weekly "anchor" events
 * (FOMC, CPI, NFP…) drawn from a pool. Released events (in the past) get
 * an actual value with a plausible surprise; upcoming ones stay null.
 *
 * All times are composed in the user's timezone (America/Toronto) and
 * stored as UTC ISO — DST-safe via a wall-time round-trip.
 */

/** Calendar-day key helpers anchored at UTC noon (no DST drift). */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `now`, rendered in the user timezone. */
export function currentWeekStart(nowIso: string, tz: string): string {
  const key = toTradingDateKey(nowIso, tz);
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysKey(key, -(dow + 6) % 7);
}

/** Toronto wall-clock rendering of an instant → "YYYY-MM-DD HH:mm". */
function torontoWall(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

/** UTC instant whose Toronto wall time equals `dateKey Ttime` (DST-safe). */
function etToUtcIso(dateKey: string, time: string): string {
  for (const offset of ["-04:00", "-05:00"]) {
    const guess = new Date(`${dateKey}T${time}:00${offset}`);
    if (torontoWall(guess) === `${dateKey} ${time}`) return guess.toISOString();
  }
  return new Date(`${dateKey}T${time}:00-04:00`).toISOString();
}

interface EventTemplate {
  /** ISO weekday (1 = Monday … 5 = Friday). */
  dow: number;
  /** "HH:mm" in the user timezone (America/Toronto). */
  time: string;
  currency: string;
  title: string;
  impact: EventImpact;
  /** Value family → realistic magnitudes and formatting. */
  value: ValueSpec;
}

type ValueKind = "pct1" | "pct0" | "k" | "idx" | "rate";

interface ValueSpec {
  kind: ValueKind;
  typical: number;
  /** Relative jitter applied to forecast/previous around typical. */
  jitter: number;
}

const TEMPLATES: readonly EventTemplate[] = [
  { dow: 1, time: "09:45", currency: "USD", title: "S&P Global US Manufacturing PMI (flash)", impact: "MEDIUM", value: { kind: "idx", typical: 51.8, jitter: 0.04 } },
  { dow: 1, time: "10:00", currency: "USD", title: "NAHB Housing Market Index", impact: "LOW", value: { kind: "idx", typical: 42, jitter: 0.05 } },
  { dow: 1, time: "04:30", currency: "GBP", title: "S&P Global UK Manufacturing PMI (flash)", impact: "LOW", value: { kind: "idx", typical: 51.2, jitter: 0.03 } },
  { dow: 1, time: "00:30", currency: "AUD", title: "RBA Meeting Minutes", impact: "MEDIUM", value: { kind: "idx", typical: 0, jitter: 0 } },
  { dow: 2, time: "09:00", currency: "EUR", title: "German ifo Business Climate", impact: "MEDIUM", value: { kind: "idx", typical: 88.5, jitter: 0.02 } },
  { dow: 2, time: "08:30", currency: "CAD", title: "CPI m/m", impact: "HIGH", value: { kind: "pct1", typical: 0.2, jitter: 0.5 } },
  { dow: 2, time: "10:00", currency: "USD", title: "New Home Sales", impact: "MEDIUM", value: { kind: "k", typical: 702, jitter: 0.03 } },
  { dow: 3, time: "10:30", currency: "USD", title: "EIA Crude Oil Inventories", impact: "MEDIUM", value: { kind: "k", typical: -1.4, jitter: 6 } },
  { dow: 3, time: "04:00", currency: "EUR", title: "HCOB Eurozone Composite PMI (flash)", impact: "MEDIUM", value: { kind: "idx", typical: 50.4, jitter: 0.02 } },
  { dow: 4, time: "08:30", currency: "USD", title: "Initial Jobless Claims", impact: "MEDIUM", value: { kind: "k", typical: 221, jitter: 0.05 } },
  { dow: 4, time: "08:30", currency: "USD", title: "Core PPI m/m", impact: "MEDIUM", value: { kind: "pct1", typical: 0.2, jitter: 0.5 } },
  { dow: 4, time: "08:30", currency: "USD", title: "GDP q/q (final)", impact: "MEDIUM", value: { kind: "pct1", typical: 2.8, jitter: 0.03 } },
  { dow: 4, time: "09:45", currency: "USD", title: "S&P Global US Services PMI (flash)", impact: "MEDIUM", value: { kind: "idx", typical: 52.1, jitter: 0.02 } },
  { dow: 5, time: "08:30", currency: "USD", title: "Average Hourly Earnings m/m", impact: "MEDIUM", value: { kind: "pct1", typical: 0.3, jitter: 0.4 } },
  { dow: 5, time: "02:00", currency: "GBP", title: "Retail Sales m/m", impact: "MEDIUM", value: { kind: "pct1", typical: 0.1, jitter: 2 } },
];

/** Weekly anchors — the releases that actually shape the trading week. */
const ANCHORS: readonly EventTemplate[] = [
  { dow: 3, time: "14:00", currency: "USD", title: "FOMC Statement & Rate Decision", impact: "HIGH", value: { kind: "rate", typical: 4.25, jitter: 0.001 } },
  { dow: 2, time: "08:30", currency: "USD", title: "CPI m/m", impact: "HIGH", value: { kind: "pct1", typical: 0.2, jitter: 0.5 } },
  { dow: 4, time: "08:30", currency: "USD", title: "Core CPI m/m", impact: "HIGH", value: { kind: "pct1", typical: 0.3, jitter: 0.4 } },
  { dow: 5, time: "08:30", currency: "USD", title: "Non-Farm Payrolls", impact: "HIGH", value: { kind: "k", typical: 168, jitter: 0.25 } },
  { dow: 3, time: "10:00", currency: "USD", title: "Retail Sales m/m", impact: "HIGH", value: { kind: "pct1", typical: 0.4, jitter: 0.8 } },
  { dow: 4, time: "02:00", currency: "JPY", title: "BoJ Policy Rate", impact: "HIGH", value: { kind: "rate", typical: 0.5, jitter: 0.001 } },
];

/** Exactly two anchors per week (drawn without replacement). */
const ANCHORS_PER_WEEK = 2;

function formatValue(spec: ValueSpec, value: number): string {
  switch (spec.kind) {
    case "pct1":
      return `${value.toFixed(1)}%`;
    case "pct0":
      return `${Math.round(value)}%`;
    case "k":
      return `${Math.round(value)}k`;
    case "idx":
      return spec.typical >= 100 ? value.toFixed(1) : value.toFixed(spec.typical % 1 === 0 ? 0 : 1);
    case "rate":
      return `${value.toFixed(2)}%`;
  }
}

function sampleValue(rng: Rng, spec: ValueSpec): number {
  if (spec.kind === "rate") return spec.typical; // rates only move on decision weeks
  const spread = Math.abs(spec.typical) * spec.jitter + 1e-9;
  return spec.typical + (rng() * 2 - 1) * spread;
}

function hashWeekKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Build one deterministic week of events (Monday key → 15–18 events). */
export function buildEconomicWeek(weekStart: string, nowIso: string, _tz: string): EconomicEvent[] {
  void _tz;
  const rng = mulberry32(hashWeekKey(weekStart));
  const now = new Date(nowIso).getTime();

  // Two distinct weekly anchors (FOMC/CPI/NFP/…), rest are recurring templates.
  const anchorPool = [...ANCHORS];
  const anchors: EventTemplate[] = [];
  for (let i = 0; i < ANCHORS_PER_WEEK; i += 1) {
    const index = Math.floor(rng() * anchorPool.length);
    anchors.push(anchorPool.splice(index, 1)[0]!);
  }
  const templates = [...anchors, ...TEMPLATES];

  const events: EconomicEvent[] = [];
  for (const template of templates) {
    const dateKey = addDaysKey(weekStart, template.dow - 1);
    const dateTime = etToUtcIso(dateKey, template.time);
    const released = new Date(dateTime).getTime() <= now;

    const previous = sampleValue(rng, template.value);
    const forecast = sampleValue(rng, template.value);
    // Released: surprise lands in [−35%…+35%] of |forecast|, biased to small.
    const surprise = forecast * (rng() * 0.7 - 0.32);
    const actual = released ? sampleValue(rng, template.value) + surprise : null;

    events.push({
      id: `${weekStart}-${template.currency.toLowerCase()}-${template.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      dateTime,
      currency: template.currency,
      title: template.title,
      impact: template.impact,
      actual: actual === null ? null : formatValue(template.value, actual),
      forecast: template.value.kind === "idx" && template.value.typical === 0 ? null : formatValue(template.value, forecast),
      previous: template.value.kind === "idx" && template.value.typical === 0 ? null : formatValue(template.value, previous),
    });
  }

  // Chronological within the week.
  return events.sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}
