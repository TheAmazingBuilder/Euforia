/**
 * Built-in deterministic economic provider (Phase 13 §4/§5) - the default
 * adapter behind the provider port.
 *
 * WHY BUILT-IN SAMPLE DATA (§4 - "Do not assume any provider is available"):
 * the audited repository has NO external economic-data integration, no
 * provider credentials and no vendor contract. The product reference
 * (frontend mock engine) ships a deterministic "macro-sample" provider:
 * realistic macro releases on their usual Toronto-time slots, a rolling
 * window of [-92 .. +13] days whose released history spans the full
 * 90-day trade fixture window so Analytics can classify the whole
 * journal. This adapter reproduces that behavior server-side - no
 * credentials, no network, always available - while the port keeps real
 * providers one adapter away (no lock-in, §5/§62 Step 3).
 *
 * Deterministic per UTC day: the seed rolls at UTC midnight like the
 * trade fixtures; values drift ±10% around template bases. Stability of
 * IDENTITY is the adapter's responsibility (§24): `MACRO-<YYYYMMDD>-<i>`
 * is stable across days so synchronization upserts instead of
 * duplicating - the mock's per-day uuid seed is consumed ONLY to
 * preserve the exact value-draw order of the reference engine.
 */
import type { EconomicCalendarProvider } from "../domain/provider.port";
import type { ProviderEconomicEventPayload } from "../domain/economic-event";

/** Deterministic PRNG - verbatim from the product reference engine. */
type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(rng: Rng): string {
  const hex = (count: number): string => {
    let out = "";
    for (let i = 0; i < count; i += 1) out += Math.floor(rng() * 16).toString(16);
    return out;
  };
  const variant = "89ab"[Math.floor(rng() * 4)] ?? "a";
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

interface EcoTemplate {
  readonly title: string;
  readonly currency: "USD" | "EUR" | "GBP" | "CAD";
  readonly impact: "HIGH" | "MEDIUM" | "LOW";
  /** Toronto-time hour:minute of the usual slot. */
  readonly hhmm: string;
  readonly base: { readonly forecast: number; readonly previous: number };
}

/** Day-of-week pools: recurring releases. 0=Sun..5=Fri (no weekend data). */
const MON_POOL: EcoTemplate[] = [
  { title: "US Retail Sales Control Group", currency: "USD", impact: "MEDIUM", hhmm: "08:30", base: { forecast: 0.3, previous: 0.1 } },
  { title: "Empire State Manufacturing Index", currency: "USD", impact: "LOW", hhmm: "08:30", base: { forecast: -4.5, previous: 1.1 } },
  { title: "German Factory Orders", currency: "EUR", impact: "LOW", hhmm: "07:00", base: { forecast: 0.5, previous: -0.2 } },
];

const TUE_POOL: EcoTemplate[] = [
  { title: "US CPI y/y", currency: "USD", impact: "HIGH", hhmm: "08:30", base: { forecast: 2.9, previous: 2.7 } },
  { title: "US Core CPI m/m", currency: "USD", impact: "HIGH", hhmm: "08:30", base: { forecast: 0.3, previous: 0.2 } },
  { title: "ZEW Economic Sentiment", currency: "EUR", impact: "MEDIUM", hhmm: "05:00", base: { forecast: 19.2, previous: 17.4 } },
  { title: "US Retail Inventories", currency: "USD", impact: "LOW", hhmm: "10:00", base: { forecast: 0.2, previous: -0.1 } },
];

const WED_POOL: EcoTemplate[] = [
  { title: "US PPI Final Demand m/m", currency: "USD", impact: "MEDIUM", hhmm: "08:30", base: { forecast: 0.2, previous: 0.3 } },
  { title: "EIA Crude Oil Inventories", currency: "USD", impact: "MEDIUM", hhmm: "10:30", base: { forecast: -1.6, previous: 2.1 } },
  { title: "FOMC Statement & Fed Funds Rate", currency: "USD", impact: "HIGH", hhmm: "14:00", base: { forecast: 4.25, previous: 4.25 } },
  { title: "FOMC Press Conference", currency: "USD", impact: "HIGH", hhmm: "14:30", base: { forecast: 0, previous: 0 } },
];

const THU_POOL: EcoTemplate[] = [
  { title: "US Initial Jobless Claims", currency: "USD", impact: "MEDIUM", hhmm: "08:30", base: { forecast: 218, previous: 221 } },
  { title: "US Philadelphia Fed Index", currency: "USD", impact: "MEDIUM", hhmm: "08:30", base: { forecast: 6.1, previous: 4.5 } },
  { title: "ECB Monetary Policy Statement", currency: "EUR", impact: "HIGH", hhmm: "08:15", base: { forecast: 2.15, previous: 2.15 } },
  { title: "ECB Press Conference", currency: "EUR", impact: "HIGH", hhmm: "08:45", base: { forecast: 0, previous: 0 } },
];

const FRI_POOL: EcoTemplate[] = [
  { title: "Non-Farm Payrolls", currency: "USD", impact: "HIGH", hhmm: "08:30", base: { forecast: 168, previous: 142 } },
  { title: "Unemployment Rate", currency: "USD", impact: "HIGH", hhmm: "08:30", base: { forecast: 4.3, previous: 4.3 } },
  { title: "Canada Labour Force Survey", currency: "CAD", impact: "HIGH", hhmm: "08:30", base: { forecast: 21.5, previous: -6.2 } },
  { title: "ISM Manufacturing PMI", currency: "USD", impact: "MEDIUM", hhmm: "10:00", base: { forecast: 48.9, previous: 47.2 } },
];

const POOLS: Record<number, EcoTemplate[]> = {
  1: MON_POOL,
  2: TUE_POOL,
  3: WED_POOL,
  4: THU_POOL,
  5: FRI_POOL,
};

/** Deterministic value noise: ±10% around the base, 1 decimal (or integer
 * once |value| ≥ 100) - verbatim reference-engine rule. */
function seededValue(rng: Rng, base: number): string {
  const drift = base === 0 ? 0 : base * (rng() * 0.2 - 0.1);
  const value = base + drift;
  return Math.abs(value) >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

const DAY_MS = 86_400_000;

/** The provider's fixed sample seed offset (reference-engine constant). */
const SAMPLE_SEED = 0xe0;

export class BuiltinEconomicProvider implements EconomicCalendarProvider {
  readonly key = "builtin-sample";

  /** Injected for deterministic unit tests; defaults to real time. */
  constructor(private readonly nowMs: number = Date.now()) {}

  async fetchWindow(from: Date, to: Date): Promise<ProviderEconomicEventPayload[]> {
    const rng = mulberry32(Math.floor(this.nowMs / DAY_MS) ^ SAMPLE_SEED);
    const payloads: ProviderEconomicEventPayload[] = [];

    // Iterate UTC days between the requested bounds - same day set as the
    // reference engine's [-92 .. +13] offset walk when called with the
    // canonical sync window (UTC has no DST, offsets compose exactly).
    const startDay = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    const endDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

    for (let dayMs = startDay; dayMs <= endDay; dayMs += DAY_MS) {
      const day = new Date(dayMs);
      const pool = POOLS[day.getUTCDay()];
      if (pool === undefined) continue; // weekends: no scheduled macro data

      const dayKey = day.toISOString().slice(0, 10).replace(/-/g, "");
      for (const [index, template] of pool.entries()) {
        const slot = template.hhmm.split(":");
        const hh = Number(slot[0] ?? 0);
        const mm = Number(slot[1] ?? 0);
        // Toronto slot (EDT, UTC-4) → UTC instant. Fixture precision is
        // fine - a documented, fixed-offset compromise (mock parity §13).
        const scheduledMs = Date.UTC(
          day.getUTCFullYear(),
          day.getUTCMonth(),
          day.getUTCDate(),
          hh + 4,
          mm,
        );
        const released = scheduledMs <= this.nowMs;
        // The reference engine draws a uuid per event BEFORE the values -
        // consumed here only to preserve the exact draw order (parity),
        // never as identity (identity is the stable day+index ref below).
        void uuid(rng);
        const forecast = seededValue(rng, template.base.forecast);
        const previous = seededValue(rng, template.base.previous);
        const actual = released ? seededValue(rng, template.base.forecast * 1.04) : null;

        payloads.push({
          ref: `MACRO-${dayKey}-${index}`,
          title: template.title,
          currency: template.currency,
          tone: template.impact.toLowerCase(),
          scheduledAtIso: new Date(scheduledMs).toISOString(),
          previous,
          forecast,
          actual,
        });
      }
    }

    return payloads.sort((a, b) => a.scheduledAtIso.localeCompare(b.scheduledAtIso));
  }
}
