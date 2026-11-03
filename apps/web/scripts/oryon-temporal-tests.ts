/**
 * Oryon Phase 8 temporal tests - session engine, event domain, temporal
 * display and the per-panel context store mutations.
 *
 * Run: bun run scripts/oryon-temporal-tests.ts
 *
 * Session math is verified against KNOWN 2026 DST dates (audit-checked):
 *   - US DST: Mar 8 2026 → Nov 1 2026 (second Sunday March / first November)
 *   - EU/BST: Mar 29 2026 → Oct 25 2026 (last Sunday March / October)
 *   - NSW (Sydney): Oct 4 2026 → Apr 5 2026 (first Sunday October / April)
 * Intervals are HALF-OPEN [start, end): start included, end excluded.
 */

import type { EcoEvent, OryonPanelContext } from "@cosmoz/shared";
import { ecoEventSchema, ORYON_DEFAULT_PANEL_CONTEXT } from "@cosmoz/shared";

import {
  dedupeEventsById,
  eventMeetsImportance,
  eventMatchesCurrency,
  eventStatus,
  eventsForChartSpan,
  eventsInUtcSpan,
} from "../src/lib/oryon/events/domain";
import {
  computeSessionBands,
  sessionIntervalsForUtcRange,
  sessionStatusAt,
  zoneOffsetMs,
  zonedWallTimeToUtcMs,
  localDateKeyInZone,
  weekdayOfDateKey,
} from "../src/lib/oryon/sessions/engine";
import {
  ORYON_SESSION_DEFINITIONS,
  sessionDefinitionById,
  sessionsForAssetClass,
} from "../src/lib/oryon/sessions/definitions";
import {
  dateKeyInZone,
  formatInstantInZone,
  isValidIanaZone,
} from "../src/lib/oryon/temporal/display";
import type { OryonSessionDefinition } from "../src/lib/oryon/sessions/definitions";
import { OryonWorkspaceConfigStore } from "../src/lib/oryon/workspace/store";

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

/** Fake localStorage - the store's persistence adapters need the DOM API. */
function installStorage(): Map<string, string> {
  const memory = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  };
  return memory;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** UTC midnight of a UTC calendar date (test-local helper). */
function utcMs(y: number, m: number, d: number, hh = 0, mm = 0): number {
  return Date.UTC(y, m - 1, d, hh, mm);
}

// ── 1. Zone offsets (Intl - DST-aware, no fixed offsets) ─────────────────────

console.log("- offsets de zone (Intl, DST)");

eq("New York hiver → UTC-5", zoneOffsetMs(utcMs(2026, 1, 15), "America/New_York"), -5 * HOUR);
eq("New York été → UTC-4", zoneOffsetMs(utcMs(2026, 7, 15), "America/New_York"), -4 * HOUR);
eq("Tokyo → UTC+9 (pas de DST)", zoneOffsetMs(utcMs(2026, 1, 15), "Asia/Tokyo"), 9 * HOUR);
eq("Londres hiver → UTC+0", zoneOffsetMs(utcMs(2026, 1, 15), "Europe/London"), 0);
eq("Londres été → UTC+1", zoneOffsetMs(utcMs(2026, 7, 15), "Europe/London"), 1 * HOUR);
eq("Sydney hiver austral → UTC+10", zoneOffsetMs(utcMs(2026, 7, 15), "Australia/Sydney"), 10 * HOUR);
eq("Sydney été austral → UTC+11", zoneOffsetMs(utcMs(2026, 12, 15), "Australia/Sydney"), 11 * HOUR);
eq("zone inconnue → NaN (indisponible, jamais deviné)", zoneOffsetMs(utcMs(2026, 1, 15), "Not/AZone"), null);
eq("transition US printemps (8 mars 2026)", zoneOffsetMs(utcMs(2026, 3, 9), "America/New_York"), -4 * HOUR);
eq("transition EU automne (25 oct 2026)", zoneOffsetMs(utcMs(2026, 10, 26), "Europe/London"), 0);

// Wall-time conversion (offset twicing).
eq(
  "wall 08:00 NY janvier → 13:00 UTC",
  zonedWallTimeToUtcMs("2026-01-05", 8, 0, "America/New_York"),
  utcMs(2026, 1, 5, 13),
);
eq(
  "wall 08:00 NY juin → 12:00 UTC (DST)",
  zonedWallTimeToUtcMs("2026-06-01", 8, 0, "America/New_York"),
  utcMs(2026, 6, 1, 12),
);
eq(
  "wall 08:00 Londres juin → 07:00 UTC (BST)",
  zonedWallTimeToUtcMs("2026-06-01", 8, 0, "Europe/London"),
  utcMs(2026, 6, 1, 7),
);
eq(
  "date locale en zone (00:30 UTC → 31 mai à New York)",
  localDateKeyInZone(utcMs(2026, 6, 1, 0, 30), "America/New_York"),
  "2026-05-31",
);
eq("weekday de la clé (lundi 1 juin 2026)", weekdayOfDateKey("2026-06-01"), 1);

// ── 2. Intervalles de session - définitions réelles ──────────────────────────

console.log("- intervalles de session");

const london = sessionDefinitionById("london")!;
const ny = sessionDefinitionById("newyork")!;
const tokyo = sessionDefinitionById("tokyo")!;
const sydney = sessionDefinitionById("sydney")!;

{
  // London, Monday 2026-01-05 (GMT): 08:00–17:00 local = 08:00–17:00 UTC.
  const intervals = sessionIntervalsForUtcRange(london, utcMs(2026, 1, 5), utcMs(2026, 1, 6));
  eq(
    "Londres hiver : 08:00–17:00 UTC",
    intervals.map((i) => [i.startMs, i.endMs]),
    [[utcMs(2026, 1, 5, 8), utcMs(2026, 1, 5, 17)]],
  );

  // London, Monday 2026-06-01 (BST): 08:00–17:00 local = 07:00–16:00 UTC.
  const summer = sessionIntervalsForUtcRange(london, utcMs(2026, 6, 1), utcMs(2026, 6, 2));
  eq(
    "Londres été (BST) : 07:00–16:00 UTC",
    summer.map((i) => [i.startMs, i.endMs]),
    [[utcMs(2026, 6, 1, 7), utcMs(2026, 6, 1, 16)]],
  );

  // New York, Monday 2026-01-05 (EST): 08:00–17:00 local = 13:00–22:00 UTC.
  const nyWinter = sessionIntervalsForUtcRange(ny, utcMs(2026, 1, 5), utcMs(2026, 1, 6));
  eq(
    "New York hiver (EST) : 13:00–22:00 UTC",
    nyWinter.map((i) => [i.startMs, i.endMs]),
    [[utcMs(2026, 1, 5, 13), utcMs(2026, 1, 5, 22)]],
  );

  // New York, Monday 2026-06-01 (EDT): 12:00–21:00 UTC.
  const nySummer = sessionIntervalsForUtcRange(ny, utcMs(2026, 6, 1), utcMs(2026, 6, 2));
  eq(
    "New York été (EDT) : 12:00–21:00 UTC",
    nySummer.map((i) => [i.startMs, i.endMs]),
    [[utcMs(2026, 6, 1, 12), utcMs(2026, 6, 1, 21)]],
  );

  // Tokyo, Monday 2026-06-01 (JST, no DST): 09:00–18:00 local = 00:00–09:00 UTC.
  const tokyoInterval = sessionIntervalsForUtcRange(tokyo, utcMs(2026, 6, 1), utcMs(2026, 6, 2));
  eq(
    "Tokyo : 00:00–09:00 UTC",
    tokyoInterval.map((i) => [i.startMs, i.endMs]),
    [[utcMs(2026, 6, 1), utcMs(2026, 6, 1, 9)]],
  );

  // Sydney, local Monday 2026-06-01 (AEST): 07:00–16:00 local spans UTC
  // May 31 21:00 → Jun 1 06:00 - TWO clipped bands inside the UTC day
  // (the tail of Monday + the head of Tuesday's session). Documented
  // behavior of zone-honest computation on a UTC-bounded window.
  const sydneyDay = sessionIntervalsForUtcRange(sydney, utcMs(2026, 6, 1), utcMs(2026, 6, 2));
  eq(
    "Sydney (AEST) : deux tronçons dans la journée UTC",
    sydneyDay.map((i) => [i.startMs, i.endMs]),
    [
      [utcMs(2026, 6, 1), utcMs(2026, 6, 1, 6)],
      [utcMs(2026, 6, 1, 21), utcMs(2026, 6, 2)],
    ],
  );

  // Sydney southern-DST: local Monday 2026-10-05 (AEDT) = 07:00+11 →
  // Oct 4 20:00 UTC start (one hour EARLIER in UTC than AEST).
  const sydneyDst = sessionIntervalsForUtcRange(
    sydney,
    utcMs(2026, 10, 4, 18),
    utcMs(2026, 10, 5, 12),
  );
  eq(
    "Sydney été austral (AEDT) : début 20:00 UTC la veille",
    sydneyDst.some((i) => i.startMs === utcMs(2026, 10, 4, 20) && i.endMs === utcMs(2026, 10, 5, 5)),
    true,
  );

  // Weekends: Saturday 2026-06-06 → no intervals for ANY definition.
  for (const def of ORYON_SESSION_DEFINITIONS) {
    const weekend = sessionIntervalsForUtcRange(def, utcMs(2026, 6, 6), utcMs(2026, 6, 7));
    eq(`week-end sans session (${def.id})`, weekend, []);
  }

  // Indicative honesty: a public holiday (Christmas, Friday 2026-12-25)
  // still resolves a session - NO holiday calendar is claimed (§4.2), the
  // UI states "indicative". The engine must not silently fake a closure.
  const christmas = sessionIntervalsForUtcRange(ny, utcMs(2026, 12, 25), utcMs(2026, 12, 26));
  eq(
    "jour férié sans calendrier → session indicative maintenue",
    christmas.length,
    1,
  );
}

// ── 3. Cross-midnight + bornes + métadonnées manquantes ─────────────────────

console.log("- cross-midnight, bornes, indisponibilités");

{
  // Synthetic cross-midnight definition (§4.2 capability test): 22:00–06:00
  // in UTC, weekdays only. Monday 2026-05-04 rolls its end to Tuesday.
  const overnight = {
    ...london,
    id: "overnight",
    name: "Overnight",
    ianaZone: "UTC",
    startHHmm: "22:00",
    endHHmm: "06:00",
  } as unknown as OryonSessionDefinition;
  const interval = sessionIntervalsForUtcRange(overnight, utcMs(2026, 5, 4), utcMs(2026, 5, 7));
  eq(
    "cross-midnight : fin reportée au lendemain local (dernier tronçon clippé)",
    interval.map((i) => [i.startMs, i.endMs]),
    [
      [utcMs(2026, 5, 4, 22), utcMs(2026, 5, 5, 6)],
      [utcMs(2026, 5, 5, 22), utcMs(2026, 5, 6, 6)],
      [utcMs(2026, 5, 6, 22), utcMs(2026, 5, 7)],
    ],
  );

  // Half-open boundaries: status AT the start instant is open; AT the end
  // instant is closed (with the next opening in the lookahead).
  const mondayStart = utcMs(2026, 6, 1, 12); // NY summer session start
  const mondayEnd = utcMs(2026, 6, 1, 21);
  eq("borne : à l'ouverture → ouvert", sessionStatusAt(ny, mondayStart)?.open, true);
  eq("borne : à la clôture → fermé", sessionStatusAt(ny, mondayEnd)?.open, false);
  eq(
    "borne : clôture = prochaine transition d'ouverture",
    sessionStatusAt(ny, mondayEnd)?.transitionMs,
    utcMs(2026, 6, 2, 12),
  );
  eq(
    "ouvert : transition = la clôture du jour",
    sessionStatusAt(ny, utcMs(2026, 6, 1, 15))?.transitionMs,
    mondayEnd,
  );

  // Missing metadata: malformed times → no intervals, no crash.
  const broken = { ...london, startHHmm: "25:00" };
  eq("heure de départ invalide → aucun intervalle", sessionIntervalsForUtcRange(broken, utcMs(2026, 6, 1), utcMs(2026, 6, 2)), []);
  const brokenZone = { ...london, ianaZone: "Not/AZone" };
  eq("zone inconnue → aucun intervalle (honnête)", sessionIntervalsForUtcRange(brokenZone, utcMs(2026, 6, 1), utcMs(2026, 6, 2)), []);
  eq("zone inconnue → statut null", sessionStatusAt(brokenZone, utcMs(2026, 6, 1, 9)), null);

  // Out-of-order / degenerate ranges → empty, never a throw.
  eq("plage inversée → vide", sessionIntervalsForUtcRange(london, utcMs(2026, 6, 2), utcMs(2026, 6, 1)), []);
}

// ── 4. Bandes multi-sessions + périmètre par classe d'actif ────────────────

console.log("- bandes et périmètre");

{
  // FOREX gets all four definitions, ordered Sydney→NY by display order.
  eq("FOREX → 4 sessions", sessionsForAssetClass("FOREX").map((d) => d.id), ["sydney", "tokyo", "london", "newyork"]);
  eq("METAL → London + NY uniquement", sessionsForAssetClass("METAL").map((d) => d.id), ["london", "newyork"]);
  eq("CRYPTO → aucune (24/7, honnête)", sessionsForAssetClass("CRYPTO"), []);
  eq("SYNTHETIC → aucune (24/7, honnête)", sessionsForAssetClass("SYNTHETIC"), []);

  // Bands over a London+NY overlap window (10:00–14:00 UTC winter Monday):
  // London [08:00–17:00) and NY [13:00–22:00) both cover 13:00–14:00 -
  // two overlapping bands, alpha-composited by the renderer (§5).
  const bands = computeSessionBands([london, ny], utcMs(2026, 1, 5, 10), utcMs(2026, 1, 5, 14));
  eq(
    "chevauchement Londres/NY → deux bandes triées",
    bands.map((b) => [b.sessionId, b.startSec, b.endSec]),
    [
      ["london", utcMs(2026, 1, 5, 10) / 1000, utcMs(2026, 1, 5, 14) / 1000],
      ["newyork", utcMs(2026, 1, 5, 13) / 1000, utcMs(2026, 1, 5, 14) / 1000],
    ],
  );
  ok("bandes : tokens de thème (jamais de hex)", bands.every((b) => !b.colorToken.startsWith("#")));
}

// ── 5. Événements économiques - validation et filtres (§6, §10) ──────────────

console.log("- domaine des événements");

const validEvent: EcoEvent = {
  id: "9b2f6a1e-3c4d-4e5f-8a9b-1c2d3e4f5a6b",
  title: "US CPI y/y",
  currency: "USD",
  impact: "HIGH",
  scheduledAt: "2026-06-02T12:30:00.000Z",
  actual: null,
  forecast: "2.9",
  previous: "2.7",
};

eq("schéma : événement valide accepté", ecoEventSchema.safeParse(validEvent).success, true);
eq(
  "schéma : valeurs manquantes (null) acceptées",
  ecoEventSchema.safeParse({ ...validEvent, forecast: null, previous: null }).success,
  true,
);
eq(
  "schéma : timestamp invalide rejeté",
  ecoEventSchema.safeParse({ ...validEvent, scheduledAt: "not-a-date" }).success,
  false,
);
eq(
  "schéma : devise non ISO rejetée",
  ecoEventSchema.safeParse({ ...validEvent, currency: "US" }).success,
  false,
);
eq(
  "schéma : impact hors vocabulaire rejeté",
  ecoEventSchema.safeParse({ ...validEvent, impact: "EXTREME" }).success,
  false,
);

const nowMs = utcMs(2026, 6, 3);
eq("statut : à venir → SCHEDULED", eventStatus(validEvent, nowMs), "SCHEDULED");
eq(
  "statut : actual publié + passé → RELEASED",
  eventStatus({ ...validEvent, actual: "3.0" }, nowMs),
  "RELEASED",
);
eq(
  "statut : actual null → jamais RELEASED",
  eventStatus({ ...validEvent, scheduledAt: "2026-01-01T00:00:00.000Z" }, nowMs),
  "SCHEDULED",
);

eq("importance : HIGH >= MEDIUM", eventMeetsImportance(validEvent, "MEDIUM"), true);
eq("importance : LOW < MEDIUM", eventMeetsImportance({ ...validEvent, impact: "LOW" }, "MEDIUM"), false);
eq("importance : LOW >= LOW", eventMeetsImportance({ ...validEvent, impact: "LOW" }, "LOW"), true);

eq("devise : correspondance exacte", eventMatchesCurrency(validEvent, "usd"), true);
eq("devise : pas de match par sous-chaîne", eventMatchesCurrency(validEvent, "USDX"), false);
eq("devise : null = toutes", eventMatchesCurrency(validEvent, null), true);

{
  // Half-open span: [from, to) - the event AT from is IN, the one AT to is OUT.
  const from = utcMs(2026, 6, 2);
  const to = utcMs(2026, 6, 3);
  const inRange = [
    validEvent,
    { ...validEvent, id: "evt-2", scheduledAt: "2026-06-02T00:00:00.000Z" },
    { ...validEvent, id: "evt-3", scheduledAt: "2026-06-03T00:00:00.000Z" },
  ];
  eq(
    "borne : [from, to) - from inclus, to exclu",
    eventsInUtcSpan(inRange, from, to).map((e) => e.id),
    [validEvent.id, "evt-2"],
  );
  eq("plage inversée → vide", eventsInUtcSpan(inRange, to, from), []);
  eq(
    "timestamp non parsable → exclu, jamais rendu",
    eventsInUtcSpan([{ ...validEvent, id: "evt-4", scheduledAt: "garbage" } as unknown as EcoEvent], from, to),
    [],
  );

  // Chart span: candle domain padded by one bucket on each side.
  const firstCandle = utcMs(2026, 6, 2, 12);
  const lastCandle = utcMs(2026, 6, 2, 17);
  const fiveMin = 5 * MIN;
  eq(
    "span graphique : un bucket de marge de chaque côté",
    eventsForChartSpan(
      [
        { ...validEvent, id: "a", scheduledAt: new Date(firstCandle - fiveMin).toISOString() },
        { ...validEvent, id: "b", scheduledAt: new Date(firstCandle - fiveMin - 1).toISOString() },
        { ...validEvent, id: "c", scheduledAt: new Date(lastCandle + fiveMin - 1).toISOString() },
        { ...validEvent, id: "d", scheduledAt: new Date(lastCandle + fiveMin + 1).toISOString() },
      ],
      firstCandle,
      lastCandle,
      fiveMin,
    ).map((e) => e.id),
    ["a", "c"],
  );
  eq(
    "span graphique : bornes non finies → vide",
    eventsForChartSpan([validEvent], Number.NaN, lastCandle, fiveMin),
    [],
  );

  // Duplicate ids: first occurrence wins (defensive, §8).
  eq(
    "doublons d'identifiants → première occurrence",
    dedupeEventsById([validEvent, { ...validEvent, forecast: "CHANGED" }]).map((e) => e.forecast),
    ["2.9"],
  );
  eq("sans doublons → ordre stable", dedupeEventsById([validEvent]).length, 1);
}

// ── 6. Affichage temporel - fuseau utilisateur (§9.1) ────────────────────────

console.log("- affichage et fuseaux");

ok("zone valide reconnue", isValidIanaZone("America/Toronto"));
ok("zone inconnue rejetée", !isValidIanaZone("Mars/Olympus"));
ok("format instant non vide", formatInstantInZone(utcMs(2026, 6, 1, 12), "UTC") !== "");
ok(
  "même instant, zones différentes → libellés différents (l'affichage ne déplace pas l'instant)",
  formatInstantInZone(utcMs(2026, 6, 1, 12), "UTC") !== formatInstantInZone(utcMs(2026, 6, 1, 12), "Asia/Tokyo"),
);
eq(
  "clé de date locale : 00:30 UTC → 31 mai à New York",
  dateKeyInZone(utcMs(2026, 6, 1, 0, 30), "America/New_York"),
  "2026-05-31",
);
eq(
  "clé de date locale : 00:30 UTC → 1er juin à Tokyo",
  dateKeyInZone(utcMs(2026, 6, 1, 0, 30), "Asia/Tokyo"),
  "2026-06-01",
);
eq("instant invalide → chaîne vide", formatInstantInZone(Number.NaN, "UTC"), "");
eq("zone invalide → chaîne vide", formatInstantInZone(utcMs(2026, 6, 1), "Nope/Nope"), "");

// ── 7. Store : mutations de contexte par panneau (Phase 8 §12) ───────────────

console.log("- store : contexte de panneau");

{
  const memory = installStorage();
  void memory;
  const store = new OryonWorkspaceConfigStore();
  const context: OryonPanelContext = {
    sessionShading: false,
    eventMarkers: false,
    eventMinImportance: "HIGH",
  };

  // Dirty tracking is measured against the ACTIVE SAVED layout - the
  // default layout is immutable by design (Phase 6), so a saved layout
  // must be active first for the dirty flag to move at all.
  // saveAsNewLayout saves the CURRENT session and activates the record
  // (commitLayouts(…, layout.id)), so the next context mutation is a real
  // unsaved change.
  const created = store.saveAsNewLayout("Context desk");
  eq("layout de test créé", created.ok, true);

  const baseline = store.getSnapshot().session;
  store.setPanelContext("panel-main", context);
  const after = store.getSnapshot().session;
  eq(
    "mutation de contexte appliquée au panneau ciblé",
    after.panels.find((p) => p.id === "panel-main")!.context,
    context,
  );
  ok("mutation de contexte → dirty (préférence persistée)", store.getSnapshot().dirty);
  ok(
    "les autres panneaux gardent leur contexte",
    after.panels.filter((p) => p.id !== "panel-main").every((p) => p.context.sessionShading === ORYON_DEFAULT_PANEL_CONTEXT.sessionShading),
  );
  ok(
    "égalité de session : contexte différent → inégal",
    !sessionStateEqualShim(baseline, after),
  );

  // Unknown panel id: a stale menu must not corrupt the session.
  store.setPanelContext("panel-ghost", context);
  eq("panneau inconnu → session inchangée", store.getSnapshot().session, after);

  // Duplicate copies the source panel's context (independent id).
  const dup = store.duplicatePanel("panel-main");
  eq("duplication → ok", dup.ok, true);
  const dupPanel = store.getSnapshot().session.panels.at(-1)!;
  eq("duplication : contexte copié", dupPanel.context, context);
  ok("duplication : id différent", dupPanel.id !== "panel-main");

  // Grid switches preserve panel context (identity reuse, §7 Phase 7).
  store.setGrid("single");
  eq(
    "repli single : le contexte du panneau actif survit",
    store.getSnapshot().session.panels[0]!.context,
    context,
  );
}

/** Local equality shim (avoids importing the whole layouts module twice). */
function sessionStateEqualShim(
  a: { panels: readonly { id: string; context: OryonPanelContext }[] },
  b: { panels: readonly { id: string; context: OryonPanelContext }[] },
): boolean {
  return JSON.stringify(a.panels) === JSON.stringify(b.panels);
}

// ── Rapport ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failures.length > 0) {
  console.error("Échecs:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
