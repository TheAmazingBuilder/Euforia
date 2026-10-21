import { ecoEventSchema, type EcoEvent } from "@cosmoz/shared";

import { mulberry32, uuid, type Rng } from "./random";

/**
 * Economic-calendar fixtures — deterministic per UTC day (same seed rule as
 * buildFixtureData), anchored to the current day: a rolling window of
 * [-92 .. +13] days: the released-history span now covers the full 90-day
 * trade fixture window so the Analytics economic-event context can classify
 * the whole journal (the calendar itself filters client-side per day). Realistic macro releases on their usual Toronto-time
 * slots: US data 8:30/10:00 ET, FOMC 14:00 ET, ECB 8:15 CET.
 */

/** Event template — times are the usual Toronto-time slot (24h). */
interface EcoTemplate {
  title: string;
  currency: "USD" | "EUR" | "GBP" | "CAD";
  impact: EcoEvent["impact"];
  /** Toronto-time hour:minute of the usual slot. */
  hhmm: string;
  base: { forecast: number; previous: number };
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

/** Deterministic value noise: ±10% around the base, 1 decimal. */
function seededValue(rng: Rng, base: number): string {
  const drift = base === 0 ? 0 : base * (rng() * 0.2 - 0.1);
  const value = base + drift;
  return Math.abs(value) >= 100
    ? Math.round(value).toString()
    : value.toFixed(1);
}

/** Build the rolling eco-events window. Deterministic per UTC day. */
export function buildEcoEvents(nowMs: number): EcoEvent[] {
  const rng = mulberry32(
    // Day-stable seed: rolls at UTC midnight like the trade fixtures.
    Math.floor(nowMs / 86_400_000) ^ 0xe0,
  );

  const events: EcoEvent[] = [];

  for (let dayOffset = -92; dayOffset <= 13; dayOffset += 1) {
    const day = new Date(nowMs + dayOffset * 86_400_000);
    const pool = POOLS[day.getUTCDay()];
    if (pool === undefined) continue; // weekends: no scheduled macro data

    for (const template of pool) {
      const [hh, mm] = template.hhmm.split(":").map(Number);
      // Toronto slot (EDT, UTC-4) → UTC instant. Fixture precision is fine.
      const scheduledMs = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hh + 4,
        mm,
      );
      const released = scheduledMs <= nowMs;
      const forecast = seededValue(rng, template.base.forecast);
      const previous = seededValue(rng, template.base.previous);
      const actual = released
        ? seededValue(rng, template.base.forecast * 1.04)
        : null;

      events.push(
        ecoEventSchema.parse({
          id: uuid(rng),
          title: template.title,
          currency: template.currency,
          impact: template.impact,
          scheduledAt: new Date(scheduledMs).toISOString(),
          actual,
          forecast,
          previous,
        }),
      );
    }
  }

  return events.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
