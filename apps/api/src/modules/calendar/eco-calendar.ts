/**
 * Deterministic eco-calendar source (B7). Euforia has NO live macro-data
 * provider (§68 honesty contract), so the calendar runs on the SAME
 * solution as the mock engine's "macro-sample" provider: a DETERMINISTIC
 * SYNTHETIC schedule generated relative to today — seeded per date key
 * (mulberry32), so every consumer sees the same releases for a given day
 * and the import-eco → blockers flow is reproducible. Past releases carry
 * an `actual`; future ones stay honest nulls.
 *
 * Replacing this with a real provider is a matter of swapping this module's
 * source — the wire contract (ecoEventSchema) stays identical.
 */
import type { EcoEvent } from "../../shared/contracts";

/** mulberry32 — the same deterministic PRNG the session series uses. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ReleaseDef {
  title: string;
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  hourUtc: number;
  unit: string;
  base: number;
}

const RELEASES: readonly ReleaseDef[] = [
  { title: "Nonfarm Payrolls", currency: "USD", impact: "HIGH", hourUtc: 13, unit: "K", base: 210 },
  { title: "CPI y/y", currency: "USD", impact: "HIGH", hourUtc: 13, unit: "%", base: 3.1 },
  { title: "FOMC Rate Decision", currency: "USD", impact: "HIGH", hourUtc: 19, unit: "%", base: 4.5 },
  { title: "GDP q/q", currency: "EUR", impact: "MEDIUM", hourUtc: 10, unit: "%", base: 0.2 },
  { title: "ECB Rate Decision", currency: "EUR", impact: "HIGH", hourUtc: 13, unit: "%", base: 3.5 },
  { title: "Retail Sales m/m", currency: "GBP", impact: "MEDIUM", hourUtc: 7, unit: "%", base: 0.3 },
  { title: "BoE Rate Decision", currency: "GBP", impact: "HIGH", hourUtc: 12, unit: "%", base: 4.75 },
  { title: "CPI m/m", currency: "CAD", impact: "MEDIUM", hourUtc: 13, unit: "%", base: 0.2 },
  { title: "Employment Change", currency: "AUD", impact: "MEDIUM", hourUtc: 1, unit: "K", base: 25 },
  { title: "Trade Balance", currency: "JPY", impact: "LOW", hourUtc: 1, unit: "¥B", base: 350 },
] as const;

const DAY_MS = 24 * 60 * 60_000;

/** Deterministic UUID variant of a string seed (contract: uuidSchema). */
function uuidFrom(seed: string): string {
  let hash = 7;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  let hex = "";
  let state = hash;
  while (hex.length < 32) {
    state = (state * 1664525 + 1013904223) >>> 0;
    hex += state.toString(16).padStart(8, "0");
  }
  hex = hex.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function generateEcoEvents(todayUtc: Date): EcoEvent[] {
  const events: EcoEvent[] = [];
  for (let offset = -3; offset <= 14; offset += 1) {
    const day = new Date(todayUtc.getTime() + offset * DAY_MS);
    const dateKey = day.toISOString().slice(0, 10);
    const rand = mulberry32(
      [...dateKey].reduce((acc, character) => (acc * 31 + character.charCodeAt(0)) >>> 0, 7),
    );
    // 0–2 releases per day (weekends lighter — deterministically).
    const weekday = day.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const count = weekend ? Math.floor(rand() * 2) : Math.floor(rand() * 3);
    const usedHours = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const def = RELEASES[Math.floor(rand() * RELEASES.length)]!;
      let hour = def.hourUtc + Math.floor(rand() * 2);
      while (usedHours.has(hour)) hour += 1;
      usedHours.add(hour);
      const minute = rand() < 0.5 ? "00" : "30";
      const scheduledAt = new Date(
        `${dateKey}T${String(hour).padStart(2, "0")}:${minute}:00.000Z`,
      );
      const drift = (rand() - 0.5) * def.base * 0.2;
      const forecast = Number((def.base + drift).toFixed(1));
      const previous = Number((def.base - drift).toFixed(1));
      const released = scheduledAt.getTime() <= todayUtc.getTime();
      events.push({
        id: uuidFrom(`${dateKey}-${def.title}-${hour}`),
        title: def.title,
        currency: def.currency,
        impact: def.impact,
        scheduledAt: scheduledAt.toISOString(),
        actual: released
          ? Number((forecast + (rand() - 0.5) * 0.1 * def.base).toFixed(1)).toString()
          : null,
        forecast: forecast.toString(),
        previous: previous.toString(),
      });
    }
  }
  return events.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
