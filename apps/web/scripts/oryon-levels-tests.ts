/**
 * Oryon Phase 9 key-level tests - previous-day / previous-week reference
 * levels and the session opening range.
 *
 * Run: bun run scripts/oryon-levels-tests.ts
 *
 * Conventions under test (spec §5.4):
 *   - day boundaries are the datafeed's UTC-midnight buckets (the browser
 *     timezone is never consulted; the current partial day is excluded);
 *   - weeks are ISO weeks (Monday 00:00 UTC), current week excluded;
 *   - a missing period is skipped - never zero-filled;
 *   - duplicate timestamps: first wins; invalid candles are dropped;
 *   - the opening range REUSES the Phase 8 session engine (IANA/DST), stays
 *     inside its window, and distinguishes complete vs developing honestly.
 */

import type { Candle } from "@cosmoz/shared";

import { computePreviousDayLevels, computePreviousWeekLevels } from "../src/lib/oryon/levels/levels";
import { computeOpeningRange } from "../src/lib/oryon/levels/opening-range";
import { sessionDefinitionById } from "../src/lib/oryon/sessions/definitions";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  FAIL ${name}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(`${name} (${a === b ? "ok" : `${a} !== ${b}`})`, a === b);
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

function dayCandle(day: number, o: number, h: number, l: number, c: number): Candle {
  const t = Date.UTC(2026, 8, 1, 0, 0) + day * DAY; // 2026-09-01 = Tuesday
  return { t, o, h, l, c, v: 1 };
}

/** Daily candles for N consecutive UTC days (2026-09-01 Tuesday onward). */
function dailySeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => dayCandle(i, 100 + i, 110 + i, 90 + i, 105 + i));
}

// ── 1. Previous-day levels ───────────────────────────────────────────────────

console.log("- previous day (bornes UTC)");

// Series ends 2026-09-03 → previous day = 2026-09-02 (h 111, l 91).
const pd = computePreviousDayLevels(dailySeries(3));
eq("PDH = plus haut du jour précédent", pd?.high, 111);
eq("PDL = plus bas du jour précédent", pd?.low, 91);
eq("PDO = open du jour précédent", pd?.open, 101);
eq("PDC = close du jour précédent", pd?.close, 106);
eq("clé de période = date UTC", pd?.periodKey, "2026-09-02");
eq("une seule bougie agrégée (série 1D)", pd?.candleCount, 1);

// Weekend gap (crypto-style continuous series is NOT required): skip a day.
const gapSeries = [dayCandle(0, 100, 110, 90, 105), dayCandle(3, 103, 113, 93, 108)];
const gapPd = computePreviousDayLevels(gapSeries);
eq("jour manquant → sauté (jamais zéro)", gapPd?.periodKey, "2026-09-01");
eq("jour manquant → niveaux du dernier jour EXISTANT", { h: gapPd?.high, l: gapPd?.low }, { h: 110, l: 90 });

// Intraday series: the CURRENT partial day is excluded, the previous full
// day's aggregate spans all its candles (engine works on any granularity).
const intraday: Candle[] = [
  { t: Date.UTC(2026, 8, 1, 10, 0), o: 100, h: 108, l: 95, c: 102, v: 1 },
  { t: Date.UTC(2026, 8, 1, 14, 0), o: 102, h: 112, l: 99, c: 107, v: 1 },
  { t: Date.UTC(2026, 8, 2, 9, 0), o: 107, h: 109, l: 101, c: 104, v: 1 }, // today 09:00
];
const intradayPd = computePreviousDayLevels(intraday);
eq("intraday : le jour partiel courant est exclu", intradayPd?.periodKey, "2026-09-01");
eq("intraday : agrégat complet du jour précédent", { h: intradayPd?.high, l: intradayPd?.low, o: intradayPd?.open, c: intradayPd?.close }, { h: 112, l: 95, o: 100, c: 107 });

// Insufficient coverage.
eq("un seul jour → previous day indisponible", computePreviousDayLevels(dailySeries(1)), null);
eq("aucune bougie → null", computePreviousDayLevels([]), null);

// Invalid candles dropped; zero prices stay VALID (domain-permitted).
const withInvalid: Candle[] = [
  dayCandle(0, 100, 90, 110, 105), // h < l → invalid, dropped
  dayCandle(1, 100, 110, 90, 105),
  dayCandle(2, 100, 111, 91, 106),
];
const invalidPd = computePreviousDayLevels(withInvalid);
eq("bougie invalide écartée (jour 0), previous = dernier jour existant", invalidPd?.periodKey, "2026-09-02");
eq("prix zéro légitime ≠ valeur manquante", computePreviousDayLevels([dayCandle(0, 0, 2, 0, 1), dayCandle(1, 1, 3, 0, 2)])?.low, 0);

// Duplicate timestamps: first wins.
const dupSeries: Candle[] = [
  dayCandle(0, 100, 110, 90, 105),
  { ...dayCandle(0, 999, 999, 0, 999) }, // duplicate t - dropped
  dayCandle(1, 100, 111, 91, 106),
];
eq("doublon : la première bougie gagne", computePreviousDayLevels(dupSeries)?.high, 110);

// ── 2. Previous-week levels ──────────────────────────────────────────────────

console.log("- previous week (semaines ISO lundi UTC)");

// 2026-09-01 is a Tuesday. Week of Aug 31 (Mon) → Sep 6 (Sun).
// Series: Tue Sep 1, Wed Sep 2, ... Tue Sep 8 (next week) → previous week = Sep 1..6.
const weekSeries = dailySeries(8); // Sep 1..8
const pw = computePreviousWeekLevels(weekSeries);
eq("PWH = plus haut de la semaine précédente", pw?.high, 115); // days 0..5 (Sep 1-6): h max 115
eq("PWL = plus bas de la semaine précédente", pw?.low, 90);
eq("PWO = open de la première bougie de semaine", pw?.open, 100);
eq("PWC = close de la dernière bougie de semaine", pw?.close, 110);
eq("clé de période = lundi UTC", pw?.periodKey, "2026-08-31");

// The current (partial) week never produces levels even mid-week.
const midWeek = dailySeries(4); // Sep 1..4, still in the Sep 1 week
const midWeekPw = computePreviousWeekLevels(midWeek);
eq("semaine courante partielle → aucune semaine précédente dispo", midWeekPw, null);

// Aggregation across MULTIPLE candles per week (intraday granularity).
// Aug 26/27 belong to the Aug 24 ISO week; the Sep 1 candle opens the
// CURRENT week - previous week = Aug 24..30.
const weekIntraday: Candle[] = [
  { t: Date.UTC(2026, 7, 26, 10, 0), o: 100, h: 115, l: 98, c: 110, v: 1 }, // Wed Aug 26
  { t: Date.UTC(2026, 7, 26, 14, 0), o: 110, h: 112, l: 88, c: 105, v: 1 },
  { t: Date.UTC(2026, 8, 1, 10, 0), o: 105, h: 108, l: 100, c: 103, v: 1 }, // Tue Sep 1 (current week)
];
const weekIntradayPw = computePreviousWeekLevels(weekIntraday);
eq("semaine précédente multi-bougies agrégée", { h: weekIntradayPw?.high, l: weekIntradayPw?.low, o: weekIntradayPw?.open, c: weekIntradayPw?.close }, { h: 115, l: 88, o: 100, c: 105 });
eq("bornes hebdo : lundi 00:00 UTC", weekIntradayPw?.periodStartMs, Date.UTC(2026, 7, 24));

// ── 3. Opening range (sessions Phase 8 réutilisées) ──────────────────────────

console.log("- opening range (session NY, durée 60)");

const ny = sessionDefinitionById("newyork")!;
ok("définition NY disponible (moteur sessions Phase 8)", ny !== null);

/** 15-minute candles from a UTC hour offset over a base day. */
function intraday15(baseDayUtc: number, fromHourUtc: number, toHourUtc: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  for (let hour = fromHourUtc; hour < toHourUtc; hour += 0.25) {
    const t = baseDayUtc + hour * HOUR;
    const price = basePrice + (hour - fromHourUtc);
    candles.push({ t, o: price, h: price + 0.5, l: price - 0.5, c: price + 0.2, v: 1 });
  }
  return candles;
}

// 2026-07-15 is EDT: NY 08:00 local = 12:00 UTC. Window [12:00, 13:00) UTC.
const julyDay = Date.UTC(2026, 6, 15);
const summerCandles = intraday15(julyDay, 10, 15);
const summerOr = computeOpeningRange({ candles: summerCandles, intervalMs: 900_000, session: ny, durationMinutes: 60 });
eq("OR été : fenêtre [12:00, 13:00) UTC (EDT)", { s: summerOr?.startMs, e: summerOr?.endMs }, { s: julyDay + 12 * HOUR, e: julyDay + 13 * HOUR });
eq("OR été : statut complete", summerOr?.status, "complete");
eq("OR été : high = max des 4 bougies de la fenêtre", summerOr?.high, 100 + 2.75 + 0.5);
eq("OR été : low = min des 4 bougies de la fenêtre", summerOr?.low, 100 + 2 - 0.5);
eq("OR été : 4 bougies dans la fenêtre", summerOr?.candleCount, 4);

// 2026-12-15 is EST: NY 08:00 local = 13:00 UTC - the window SHIFTS (DST).
const decDay = Date.UTC(2026, 11, 15);
const winterCandles = intraday15(decDay, 11, 16);
const winterOr = computeOpeningRange({ candles: winterCandles, intervalMs: 900_000, session: ny, durationMinutes: 60 });
eq("OR hiver : fenêtre décalée [13:00, 14:00) UTC (EST)", { s: winterOr?.startMs, e: winterOr?.endMs }, { s: decDay + 13 * HOUR, e: decDay + 14 * HOUR });

// Developing: the window has not fully passed relative to the last candle.
const formingCandles = intraday15(julyDay, 10, 12.75); // last bar 12:30, closes 12:45 < 13:00
const formingOr = computeOpeningRange({ candles: formingCandles, intervalMs: 900_000, session: ny, durationMinutes: 60 });
eq("fenêtre en cours → developing", formingOr?.status, "developing");
eq("developing : 3 bougies seulement", formingOr?.candleCount, 3);

// Missing candles are never zero-filled: a hole inside a PASSED window
// aggregates only what exists (complete, honest count).
const holeCandles = intraday15(julyDay, 10, 15).filter((_, i) => i !== 8 && i !== 9); // 12:00 & 12:15 missing
const holeOr = computeOpeningRange({ candles: holeCandles, intervalMs: 900_000, session: ny, durationMinutes: 60 });
eq("trou dans la fenêtre : statut complete (fenêtre passée)", holeOr?.status, "complete");
eq("trou dans la fenêtre : seules les bougies réelles comptent", holeOr?.candleCount, 2);
ok("trou : aucune valeur zéro inventée", (holeOr?.high ?? 0) > 0 && (holeOr?.low ?? 0) > 0);

// No candles inside the window → unavailable (null), never a fake range.
const noWindowCandles = intraday15(julyDay, 10, 11.9); // ends 11:45, NY opens 12:00
eq("aucune bougie dans la fenêtre → null", computeOpeningRange({ candles: noWindowCandles, intervalMs: 900_000, session: ny, durationMinutes: 60 }), null);

// The range never extends beyond its window: an interval END bound (17:00)
// shorter than the duration clips the range to the session end.
const shortSession = sessionDefinitionById("tokyo")!; // 09:00-18:00 Asia/Tokyo - 9h > any duration here
const tokyoDay = Date.UTC(2026, 6, 15);
const tokyoCandles = intraday15(tokyoDay, 0, 6);
const tokyoOr = computeOpeningRange({ candles: tokyoCandles, intervalMs: 900_000, session: shortSession, durationMinutes: 120 });
eq("session Tokyo : open 00:00 UTC (été)", tokyoOr?.startMs, tokyoDay + 0 * HOUR);
eq("durée 120 respectée", { e: tokyoOr?.endMs }, { e: tokyoDay + 2 * HOUR });

// Duration 15 → different window from the same data.
const quarterOr = computeOpeningRange({ candles: summerCandles, intervalMs: 900_000, session: ny, durationMinutes: 15 });
eq("durée 15 : fenêtre [12:00, 12:15)", { s: quarterOr?.startMs, e: quarterOr?.endMs }, { s: julyDay + 12 * HOUR, e: julyDay + 12.25 * HOUR });
eq("durée 15 : 1 bougie", quarterOr?.candleCount, 1);

// Weekend (no session interval in span) → null.
const saturday = Date.UTC(2026, 6, 18); // Saturday
eq("week-end → aucune session → null", computeOpeningRange({ candles: intraday15(saturday, 10, 15), intervalMs: 900_000, session: ny, durationMinutes: 60 }), null);

// Insufficient/invalid inputs.
eq("aucune bougie → null", computeOpeningRange({ candles: [], intervalMs: 900_000, session: ny, durationMinutes: 60 }), null);
eq("intervalMs invalide → null", computeOpeningRange({ candles: summerCandles, intervalMs: 0, session: ny, durationMinutes: 60 }), null);
eq("durée invalide → null", computeOpeningRange({ candles: summerCandles, intervalMs: 900_000, session: ny, durationMinutes: -5 }), null);

// Symbol isolation is structural: the engine sees ONE candle array - the
// caller's query key guarantees per-symbol data (§9.3). Verified here by
// computing two different series and asserting no cross-contamination.
const otherSymbolOr = computeOpeningRange({
  candles: intraday15(julyDay, 10, 15, 200),
  intervalMs: 900_000,
  session: ny,
  durationMinutes: 60,
});
ok("isolation par série (prix différents, même fenêtre)", otherSymbolOr?.high !== summerOr?.high && otherSymbolOr?.startMs === summerOr?.startMs);

// ── Rapport ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failures.length > 0) {
  console.error("Échecs:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
