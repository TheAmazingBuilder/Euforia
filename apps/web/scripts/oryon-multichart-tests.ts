/**
 * Oryon multi-chart synchronization — unit tests (bun).
 *
 * Phase 7 spec §8 (sync engine), §9 (sync group model), §14 (loop safety):
 *   - EchoGuard: programmatic applies are suppressed within the window,
 *     expired guards release the value (user input of the same value
 *     still propagates), range objects compare with the epsilon;
 *   - rangesEqual: same-second epsilon semantics;
 *   - findBarContainingTime: timestamp-based crosshair anchoring — a time
 *     is snapped ONLY onto a bar that actually contains it (session gaps,
 *     out-of-span times and non-finite inputs are honestly rejected);
 *   - OryonSyncCoordinator with FAKE adapters (no chart library, no DOM):
 *       · registration discipline: duplicate id no-op, unregister stops
 *         both directions, dispose tears everything down;
 *       · time-scale sync: user pan broadcasts to every OTHER chart,
 *         the source never receives an apply, disabled feature is inert,
 *         null ranges are ignored, already-aligned targets (epsilon)
 *         are skipped, synchronous library echoes terminate (no loop);
 *       · crosshair sync: hover time propagates timestamp-based (never
 *         pixels), leave (null) clears the others, a target that cannot
 *         represent the timestamp returns false honestly (no fabricated
 *         candle), echo termination;
 *       · feature independence: enabling one flag never moves another
 *         channel; instrument/timeframe flags are inert in the
 *         coordinator (state-level concerns live in the workspace store).
 *
 * Run: bun run scripts/oryon-multichart-tests.ts
 */

import type { Candle, OryonSyncSettings } from "@cosmoz/shared";

import {
  createEchoGuard,
  findBarContainingTime,
  RANGE_EPSILON_SEC,
  rangesEqual,
  type SyncRange,
} from "../src/lib/oryon/sync/alignment";
import {
  OryonSyncCoordinator,
  type SyncEngineAdapter,
} from "../src/lib/oryon/sync/sync-engine";

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

/** Temporarily replaces Date.now (EchoGuard expiry is wall-clock based). */
function withFakeNow<T>(now: () => number, fn: () => T): T {
  const real = Date.now;
  Date.now = now;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

// ── Fake chart adapter (same contract as the real engine surface) ───────────

class FakeChartAdapter implements SyncEngineAdapter {
  range: SyncRange | null;
  crosshairTime: number | null = null;
  appliedRanges: SyncRange[] = [];
  clearCount = 0;
  crosshairAttempts: number[] = [];
  /** Simulates the library firing its listener synchronously inside apply. */
  echoOnApply: boolean;
  /** False = the chart cannot represent the timestamp (gap / out of span). */
  canRepresent: boolean;

  private rangeHandlers: Array<(range: SyncRange | null) => void> = [];
  private crosshairHandlers: Array<(timeSec: number | null) => void> = [];

  constructor(
    options: {
      range?: SyncRange | null;
      echoOnApply?: boolean;
      canRepresent?: boolean;
    } = {},
  ) {
    this.range = options.range ?? { from: 1_700_000_000, to: 1_700_000_600 };
    this.echoOnApply = options.echoOnApply ?? false;
    this.canRepresent = options.canRepresent ?? true;
  }

  getVisibleRange(): SyncRange | null {
    return this.range;
  }

  applyVisibleRange(range: SyncRange): void {
    this.appliedRanges.push({ ...range });
    this.range = { ...range };
    if (this.echoOnApply) {
      for (const handler of [...this.rangeHandlers]) handler(this.range);
    }
  }

  onVisibleRangeChange(handler: (range: SyncRange | null) => void): () => void {
    this.rangeHandlers.push(handler);
    return () => {
      this.rangeHandlers = this.rangeHandlers.filter((h) => h !== handler);
    };
  }

  applyCrosshairAtTime(timeSec: number): boolean {
    this.crosshairAttempts.push(timeSec);
    if (!this.canRepresent) return false;
    this.crosshairTime = timeSec;
    return true;
  }

  clearCrosshair(): void {
    this.crosshairTime = null;
    this.clearCount += 1;
  }

  onCrosshairTime(handler: (timeSec: number | null) => void): () => void {
    this.crosshairHandlers.push(handler);
    return () => {
      this.crosshairHandlers = this.crosshairHandlers.filter((h) => h !== handler);
    };
  }

  /** USER pan (real input, not an apply echo). */
  userPan(from: number, to: number): void {
    this.range = { from, to };
    for (const handler of [...this.rangeHandlers]) handler(this.range);
  }

  /** USER hover (real input). null = crosshair left the chart. */
  userHover(timeSec: number | null): void {
    for (const handler of [...this.crosshairHandlers]) handler(timeSec);
  }

  /** Fires a range event WITHOUT changing state (defensive path test). */
  emitRangeOnly(range: SyncRange | null): void {
    for (const handler of [...this.rangeHandlers]) handler(range);
  }
}

const FEATURES_ALL_OFF = {
  timeScale: false,
  crosshair: false,
  instrument: false,
  timeframe: false,
} as const;

function newCoordinator(features: Partial<OryonSyncSettings> = {}): OryonSyncCoordinator {
  const coordinator = new OryonSyncCoordinator();
  coordinator.setFeatures({ ...FEATURES_ALL_OFF, ...features });
  return coordinator;
}

// ── 1. Gardes d'écho (protection anti-boucle, spec §14) ─────────────────────

console.log("— gardes d'écho");

{
  const guard = createEchoGuard();
  guard.mark({ from: 100, to: 200 });
  ok("garde → la valeur appliquée est reconnue", guard.matches({ from: 100, to: 200 }));
  ok("garde → une autre plage est rejetée", !guard.matches({ from: 300, to: 400 }));
  ok("garde → un scalaire ne matche pas une plage", !guard.matches(123));
  ok("garde vierge → rien ne matche", !createEchoGuard().matches({ from: 100, to: 200 }));
}

{
  const guard = createEchoGuard();
  guard.mark(1_700_000_123);
  ok("garde scalaire → même timestamp reconnu", guard.matches(1_700_000_123));
  ok("garde scalaire → autre timestamp rejeté", !guard.matches(1_700_000_456));
}

{
  const guard = createEchoGuard();
  guard.mark(null);
  ok("garde null → null reconnu (crosshair quitté)", guard.matches(null));
  ok("garde null → un nombre ne matche pas null", !guard.matches(0));
}

{
  const guard = createEchoGuard();
  guard.mark({ from: 100, to: 200 });
  const before = Date.now();
  withFakeNow(() => before + 1, () => {
    ok("garde → dans la fenêtre, reconnue", guard.matches({ from: 100, to: 200 }));
  });
  withFakeNow(() => before + 500, () => {
    ok("garde expirée → la même valeur n'est plus supprimée", !guard.matches({ from: 100, to: 200 }));
  });
}

{
  const guard = createEchoGuard();
  guard.mark({ from: 100, to: 200 });
  // Epsilon semantics: a range within one second is the same applied value.
  ok(
    "garde → plage dans l'epsilon reconnue (même seconde)",
    guard.matches({ from: 100 + RANGE_EPSILON_SEC, to: 200 - RANGE_EPSILON_SEC }),
  );
  ok(
    "garde → hors epsilon rejetée",
    !guard.matches({ from: 100 + RANGE_EPSILON_SEC + 1, to: 200 }),
  );
}

{
  const guard = createEchoGuard();
  const base = Date.now();
  guard.mark(null);
  withFakeNow(() => base + 500, () => {
    ok("garde null expirée → rejetée", !guard.matches(null));
  });
}

// ── 2. Égalité de plages (epsilon) ───────────────────────────────────────────

console.log("— égalité de plages (epsilon)");

eq("rangesEqual → identiques", rangesEqual({ from: 10, to: 20 }, { from: 10, to: 20 }), true);
eq(
  "rangesEqual → dans l'epsilon",
  rangesEqual({ from: 10, to: 20 }, { from: 10 + RANGE_EPSILON_SEC, to: 20 - RANGE_EPSILON_SEC }),
  true,
);
eq(
  "rangesEqual → from hors epsilon",
  rangesEqual({ from: 10, to: 20 }, { from: 10 + RANGE_EPSILON_SEC + 0.5, to: 20 }),
  false,
);
eq(
  "rangesEqual → to hors epsilon",
  rangesEqual({ from: 10, to: 20 }, { from: 10, to: 20 + RANGE_EPSILON_SEC + 0.5 }),
  false,
);

// ── 3. Ancrage temporel (containment honnête) ───────────────────────────────

console.log("— ancre temporelle findBarContainingTime");

const BARS: Candle[] = [
  { t: 1_700_000_000_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
  { t: 1_700_000_060_000, o: 1.5, h: 2.5, l: 1, c: 2, v: 20 },
  { t: 1_700_000_600_000, o: 2, h: 3, l: 1.5, c: 2.5, v: 30 }, // gap: two 1m buckets missing
];
const MIN_MS = 60_000;

eq(
  "temps = ouverture d'une bougie → cette bougie",
  findBarContainingTime(BARS, 1_700_000_060, MIN_MS)?.t,
  1_700_000_060_000,
);
eq(
  "temps DANS le bucket d'une bougie → cette bougie",
  findBarContainingTime(BARS, 1_700_000_089, MIN_MS)?.t,
  1_700_000_060_000,
);
eq(
  "dernier instant du bucket → la bougie",
  findBarContainingTime(BARS, 1_700_000_119, MIN_MS)?.t,
  1_700_000_060_000,
);
ok("temps avant la première bougie → null", findBarContainingTime(BARS, 1_699_999_999, MIN_MS) === null);
ok(
  "temps dans un GAP de session → null (jamais rattaché à une bougie sans lien)",
  findBarContainingTime(BARS, 1_700_000_300, MIN_MS) === null,
);
ok(
  "temps après le bucket de la dernière bougie → null",
  findBarContainingTime(BARS, 1_700_000_661, MIN_MS) === null,
);
ok("candles vides → null", findBarContainingTime([], 1_700_000_000, MIN_MS) === null);
ok("interval <= 0 → null (garde d'invariant)", findBarContainingTime(BARS, 1_700_000_000, 0) === null);
ok("temps NaN → null", findBarContainingTime(BARS, Number.NaN, MIN_MS) === null);
ok("temps Infinity → null", findBarContainingTime(BARS, Number.POSITIVE_INFINITY, MIN_MS) === null);

// ── 4. Coordinateur — discipline d'inscription ──────────────────────────────

console.log("— coordinateur : inscriptions et teardown");

{
  const coordinator = newCoordinator();
  const a = new FakeChartAdapter();
  coordinator.register("a", a);
  eq("register → taille 1", coordinator.size, 1);
  coordinator.register("a", new FakeChartAdapter()); // React strict-mode double effect
  eq("register du même id → no-op (pas d'écrasement)", coordinator.size, 1);
  coordinator.unregister("a");
  eq("unregister → taille 0", coordinator.size, 0);
  coordinator.unregister("a"); // idempotent
  eq("unregister d'un id absent → no-op", coordinator.size, 0);
}

{
  const coordinator = newCoordinator({ timeScale: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  coordinator.unregister("b");

  a.userPan(1_700_001_000, 1_700_001_600);
  eq(
    "unregister → le panneau retiré ne reçoit plus les broadcasts",
    b.appliedRanges.length,
    0,
  );
  b.userPan(1_700_002_000, 1_700_002_600);
  eq(
    "unregister → les événements du panneau retiré ne sont plus diffusés",
    a.appliedRanges.length,
    0,
  );
  coordinator.dispose();
}

{
  const coordinator = newCoordinator({ timeScale: true, crosshair: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  coordinator.dispose();
  eq("dispose → taille 0", coordinator.size, 0);

  a.userPan(1_700_003_000, 1_700_003_600);
  a.userHover(1_700_003_300);
  eq("dispose → plus aucune propagation de range", b.appliedRanges.length, 0);
  eq("dispose → plus aucune propagation de crosshair", b.crosshairAttempts.length, 0);

  coordinator.register("c", new FakeChartAdapter());
  eq("register après dispose → refusé", coordinator.size, 0);
}

// ── 5. Synchronisation time-scale ────────────────────────────────────────────

console.log("— sync time-scale");

{
  // Feature OFF: nothing propagates.
  const coordinator = newCoordinator(); // timeScale false
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.userPan(1_700_010_000, 1_700_010_600);
  eq("timeScale désactivé → aucun apply sur les autres", b.appliedRanges.length, 0);
  eq("timeScale désactivé → l'état de la source reste local", a.appliedRanges.length, 0);
  coordinator.dispose();
}

{
  const coordinator = newCoordinator({ timeScale: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  const c = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  coordinator.register("c", c);

  a.userPan(1_700_020_000, 1_700_020_600);
  eq(
    "pan utilisateur sur A → B reçoit la plage",
    b.appliedRanges.length,
    1,
  );
  eq(
    "pan utilisateur sur A → la plage propagée est exacte",
    b.appliedRanges[0],
    { from: 1_700_020_000, to: 1_700_020_600 },
  );
  eq(
    "pan utilisateur sur A → C reçoit aussi la plage",
    c.appliedRanges.length,
    1,
  );
  eq(
    "la SOURCE ne reçoit jamais son propre apply",
    a.appliedRanges.length,
    0,
  );

  // B echoes the applied value synchronously (library behavior) — the
  // coordinator must NOT rebroadcast it (A gets nothing new, C does not
  // receive a SECOND apply from B's echo).
  b.appliedRanges.length = 0;
  c.appliedRanges.length = 0;
  a.userPan(1_700_021_000, 1_700_021_600);
  eq(
    "écho synchrone de B → pas de re-broadcast (A inchangé)",
    a.appliedRanges.length,
    0,
  );
  eq(
    "écho synchrone de B → C reçoit SEULEMENT la propagation légitime (1, pas 2)",
    c.appliedRanges.length,
    1,
  );
  eq("boucle terminée → B reçoit exactement 1 apply", b.appliedRanges.length, 1);
  coordinator.dispose();
}

{
  // Epsilon skip: an already-aligned target is not re-applied.
  const coordinator = newCoordinator({ timeScale: true });
  const a = new FakeChartAdapter({ range: { from: 1_700_030_000, to: 1_700_030_600 } });
  const b = new FakeChartAdapter({ range: { from: 1_700_030_000 + 1, to: 1_700_030_600 - 1 } });
  coordinator.register("a", a);
  coordinator.register("b", b);

  a.userPan(1_700_030_000, 1_700_030_600);
  eq(
    "cible déjà alignée dans l'epsilon → apply évité (pas de no-op dans le pipeline)",
    b.appliedRanges.length,
    0,
  );

  a.userPan(1_700_031_000, 1_700_031_600);
  eq(
    "cible réellement désalignée → apply effectué",
    b.appliedRanges.length,
    1,
  );
  coordinator.dispose();
}

{
  // Null range events (chart without data) are ignored, never broadcast.
  const coordinator = newCoordinator({ timeScale: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.emitRangeOnly(null);
  eq("range null sur la source → rien n'est diffusé", b.appliedRanges.length, 0);
  coordinator.dispose();
}

// ── 6. Synchronisation crosshair (timestamp-based) ──────────────────────────

console.log("— sync crosshair");

{
  const coordinator = newCoordinator(); // crosshair false
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.userHover(1_700_040_000);
  a.userHover(null);
  eq("crosshair désactivé → aucun mouvement chez les autres", b.crosshairAttempts.length, 0);
  eq("crosshair désactivé → aucun clear chez les autres", b.clearCount, 0);
  coordinator.dispose();
}

{
  const coordinator = newCoordinator({ crosshair: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  const c = new FakeChartAdapter({ canRepresent: false }); // gap / out of span
  coordinator.register("a", a);
  coordinator.register("b", b);
  coordinator.register("c", c);

  a.userHover(1_700_040_123);
  eq(
    "hover utilisateur sur A → B reçoit le MÊME timestamp (jamais des pixels)",
    b.crosshairAttempts[0],
    1_700_040_123,
  );
  eq(
    "cible représentable → crosshair appliqué",
    b.crosshairTime,
    1_700_040_123,
  );
  eq(
    "cible non représentable (gap/hors span) → apply tenté honnêtement",
    c.crosshairAttempts.length,
    1,
  );
  ok(
    "cible non représentable → false (aucune bougie fabriquée), sans crash",
    c.crosshairTime === null,
  );

  a.userHover(null);
  eq("crosshair quitté → clear sur B", b.clearCount, 1);
  eq(
    "crosshair quitté → clear sur C (le clear de l'échec d'apply compte aussi)",
    c.clearCount,
    2,
  );
  eq("crosshair quitté → B n'a plus de crosshair", b.crosshairTime, null);

  // Echo termination: B's synchronous echo of its own crosshair apply is
  // dropped, not rebroadcast to A.
  a.crosshairAttempts.length = 0;
  a.userHover(1_700_040_500);
  eq("écho crosshair de B → pas de rebroadcast vers A", a.crosshairAttempts.length, 0);
  coordinator.dispose();
}

// ── 7. Indépendance des fonctionnalités ─────────────────────────────────────

console.log("— indépendance des canaux de synchronisation");

{
  const coordinator = newCoordinator({ timeScale: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.userHover(1_700_050_000);
  a.userHover(null);
  eq("timeScale seul → le crosshair reste inerte", b.crosshairAttempts.length, 0);
  eq("timeScale seul → pas de clear parasite", b.clearCount, 0);
  coordinator.dispose();
}

{
  const coordinator = newCoordinator({ crosshair: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.userPan(1_700_051_000, 1_700_051_600);
  eq("crosshair seul → le time-scale reste inerte", b.appliedRanges.length, 0);
  coordinator.dispose();
}

{
  const coordinator = newCoordinator({ instrument: true, timeframe: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  a.userPan(1_700_052_000, 1_700_052_600);
  a.userHover(1_700_052_300);
  eq(
    "instrument/timeframe = préoccupations d'ÉTAT → inertes dans le coordinateur (range)",
    b.appliedRanges.length,
    0,
  );
  eq(
    "instrument/timeframe = préoccupations d'ÉTAT → inertes dans le coordinateur (crosshair)",
    b.crosshairAttempts.length,
    0,
  );
  coordinator.dispose();
}

{
  const coordinator = newCoordinator();
  const external = { timeScale: true, crosshair: true, instrument: false, timeframe: false };
  coordinator.setFeatures(external);
  external.timeScale = false; // mutating the caller's object must not leak in
  eq(
    "setFeatures → copie défensive (mutation externe sans effet)",
    coordinator.getFeatures().timeScale,
    true,
  );
  eq("getFeatures → copie défensive", coordinator.getFeatures() === coordinator.getFeatures(), false);
  coordinator.dispose();
}

// ── 8. Désinscription des handlers par l'adapter (retours d'abonnement) ─────

console.log("— retours d'abonnement utilisables");

{
  const coordinator = newCoordinator({ timeScale: true, crosshair: true });
  const a = new FakeChartAdapter();
  const b = new FakeChartAdapter();
  coordinator.register("a", a);
  coordinator.register("b", b);
  coordinator.unregister("b");
  coordinator.register("b", b); // panel remount — fresh subscriptions
  a.userPan(1_700_060_000, 1_700_060_600);
  eq(
    "remount → l'adapter réinscrit reçoit à nouveau les broadcasts",
    b.appliedRanges.length,
    1,
  );
  coordinator.dispose();
}

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
