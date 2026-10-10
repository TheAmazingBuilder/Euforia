/**
 * Oryon drawing engine — unit tests (bun).
 *
 * The repository has NO JS unit-test runner (Phase 1 audit): the honest
 * convention is bun-run TypeScript with plain assertions. These tests cover
 * the Phase 2 spec §15 domains that need NO browser:
 *   - domain model: creation, serialization round-trip, corrupt records
 *   - geometry: segment/ray/rect/fib math, handle hits, edge cases
 *   - history: ≥50 levels, undo/redo, batch = ONE entry, redo branch clear
 *   - store: invariants (hidden not selectable, locked not editable)
 *   - persistence: localStorage round-trip + corruption recovery (mocked)
 *
 * Run: bun run scripts/oryon-drawing-tests.ts
 */

import {
  ORYON_FIB_LEVELS,
  oryonDrawingsFileSchema,
  type OryonDrawing,
} from "@cosmoz/shared";

import {
  distanceToRay,
  distanceToSegment,
  fibLevelPrice,
  hitHandle,
  hitRect,
  normalizeRect,
  rayExitParameter,
} from "../src/lib/oryon/drawings/geometry";
import { DrawingHistory } from "../src/lib/oryon/drawings/history";
import {
  OryonDrawingStore,
  newDrawingId,
} from "../src/lib/oryon/drawings/store";
import {
  flushDrawingsForSymbol,
  loadDrawingsForSymbol,
} from "../src/lib/oryon/drawings/persistence";

let passed = 0;
let failed = 0;
function ok(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown, eps = 1e-9): void {
  const close =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) <= eps
      : actual === expected;
  ok(`${label} (got ${String(actual)})`, close);
}

// ── fixture factory ──────────────────────────────────────────────────────────

function makeTrend(overrides: Partial<Extract<OryonDrawing, { type: "trend" }>> = {}): Extract<OryonDrawing, { type: "trend" }> {
  const now = Date.now();
  return {
    id: newDrawingId(),
    type: "trend",
    visible: true,
    locked: false,
    label: null,
    createdAt: now,
    updatedAt: now,
    style: { color: "accent", width: 2, dash: "solid", fill: null, fillOpacity: 0, fontSize: 13 },
    a: { t: 1_700_000_000, p: 100 },
    b: { t: 1_700_000_600, p: 110 },
    ...overrides,
  };
}

// ── 1. geometry ──────────────────────────────────────────────────────────────

console.log("\n[geometry]");
eq("segment distance — on the line", distanceToSegment(5, 5, 0, 0, 10, 10), 0);
eq("segment distance — perpendicular", distanceToSegment(5, 5, 0, 0, 0, 10), 5);
eq("segment distance — clamped beyond B", distanceToSegment(15, 0, 0, 0, 10, 0), 5);
eq("segment distance — degenerate (point)", distanceToSegment(3, 4, 0, 0, 0, 0), 5);

const PLOT = { left: 0, top: 0, right: 1000, bottom: 500 };
eq("ray exit — rightward", rayExitParameter(10, 0, 0, 250, PLOT), 100);
eq("ray exit — leftward (opposite direction)", rayExitParameter(-10, 0, 500, 250, PLOT), 50);
eq("ray distance — on the ray beyond B", distanceToRay(800, 250, 0, 250, 400, 250, PLOT), 0);
eq("ray distance — behind A is NOT a hit", distanceToRay(50, 250, 300, 250, 400, 250, PLOT) > 100, true);
eq("ray distance — off the line", distanceToRay(500, 300, 0, 250, 1000, 250, PLOT), 50);

const rectA = { x: 100, y: 100 };
const rectB = { x: 300, y: 200 };
ok("rect hit — inside body", hitRect(200, 150, rectA, rectB));
ok("rect hit — within tolerance of edge", hitRect(94, 150, rectA, rectB));
ok("rect miss — outside", !hitRect(400, 300, rectA, rectB));
const norm = normalizeRect(rectB, rectA);
ok("normalizeRect swaps corners", norm.left === 100 && norm.top === 100 && norm.right === 300 && norm.bottom === 200);

ok("handle hit — center", hitHandle(10, 10, { x: 10, y: 10 }));
ok("handle hit — within radius", hitHandle(16, 10, { x: 10, y: 10 }));
ok("handle miss — beyond radius", !hitHandle(30, 10, { x: 10, y: 10 }));

eq("fib level 0 sits at priceB", fibLevelPrice(110, 100, 0), 100);
eq("fib level 1 sits at priceA", fibLevelPrice(110, 100, 1), 110);
eq("fib level 0.5 midpoint", fibLevelPrice(110, 100, 0.5), 105);
eq("fib levels set matches PRD", ORYON_FIB_LEVELS.join(","), "0,0.236,0.382,0.5,0.618,0.786,1");

// ── 2. domain model / serialization ─────────────────────────────────────────

console.log("\n[serialization]");
const trend = makeTrend();
const filePayload = {
  version: 1 as const,
  symbol: "EURUSD",
  savedAt: Date.now(),
  drawings: [
    trend,
    { ...trend, id: newDrawingId(), type: "hline", price: 1.08417 } as unknown as OryonDrawing,
  ],
};
const parsed = oryonDrawingsFileSchema.safeParse(filePayload);
ok("valid file envelope parses", parsed.success);

ok("non-finite anchor rejected", !oryonDrawingsFileSchema.safeParse({
  ...filePayload,
  drawings: [{ ...trend, a: { t: Number.NaN, p: 100 } }],
}).success);

ok("wrong version rejected", !oryonDrawingsFileSchema.safeParse({ ...filePayload, version: 2 }).success);

ok("unknown type rejected", !oryonDrawingsFileSchema.safeParse({
  ...filePayload,
  drawings: [{ ...trend, type: "ghost" }],
}).success);

ok("oversized text rejected", !oryonDrawingsFileSchema.safeParse({
  ...filePayload,
  drawings: [{ ...trend, type: "text", at: trend.a, text: "x".repeat(201) }],
}).success);

ok("width beyond 4 rejected", !oryonDrawingsFileSchema.safeParse({
  ...filePayload,
  drawings: [{ ...trend, style: { ...trend.style, width: 9 } }],
}).success);

// ── 3. history (undo/redo ≥ 50) ──────────────────────────────────────────────

console.log("\n[history]");
{
  const history = new DrawingHistory<number[]>();
  let state: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    history.push(state);
    state = [...state, i];
  }
  ok("history cap holds at 50 entries (depth ≤ 50)", history.depth <= 50);
  ok("canUndo after 60 pushes", history.canUndo);
  ok("redo empty before any undo", !history.canRedo);
  let undid = 0;
  let current = state;
  while (true) {
    const restored = history.undo(current);
    if (restored === null) break;
    current = restored;
    undid += 1;
  }
  ok("undo walks the full recorded chain", undid === 50);
  ok("redo populated after undoing everything", history.canRedo);

  const redoTarget = current;
  const redone = history.redo(current);
  ok("redo reapplies the undone state", redone !== null && history.canRedo);
  history.push(redoTarget);
  ok("new mutation clears the redo branch", !history.canRedo);
}
{
  // Batch semantics — each drag (begin→end) records exactly ONE entry.
  const history = new DrawingHistory<number[]>();
  const initial: number[] = [];
  let state: number[] = initial;
  for (let i = 0; i < 3; i += 1) {
    history.beginBatch(state);
    state = [...state, i];
    history.endBatch(state);
  }
  eq("three batch commits → three undo entries", history.depth, 3);
  const undid = history.undo(state);
  ok("undo returns the pre-state of the LAST batch", undid !== null && undid.length === 2);

  const history2 = new DrawingHistory<number[]>();
  const base: number[] = [];
  history2.beginBatch(base);
  history2.endBatch([...base, 1]);
  history2.endBatch([...base, 1]); // Nested close — no extra entry.
  ok("nested batch closes commit once", history2.depth === 1);

  const history3 = new DrawingHistory<number[]>();
  history3.beginBatch(base);
  history3.abortBatch();
  ok("aborted batch records nothing", history3.depth === 0 && !history3.canUndo);
}

// ── 4. store invariants ──────────────────────────────────────────────────────

console.log("\n[store]");
{
  const store = new OryonDrawingStore();
  store.add(makeTrend());
  ok("add selects the new drawing", store.selectedId !== null);
  eq("add commits one drawing", store.drawings.length, 1);
  ok("undo after add empties", (store.undo(), store.drawings.length === 0));
  ok("redo restores", (store.redo(), store.drawings.length === 1));

  const drawing = store.drawings[0]!;
  store.toggleLocked(drawing.id);
  ok("lock toggle works", store.drawings[0]!.locked);

  const before = store.drawings[0] as Extract<OryonDrawing, { type: "trend" }>;
  store.replace({ ...before, b: { t: 999, p: 999 } });
  ok("locked object refuses replace (geometry)", (store.drawings[0] as Extract<OryonDrawing, { type: "trend" }>).b.t === before.b.t);
  store.update(before.id, { style: { ...before.style, color: "loss" } });
  ok("locked object refuses style update", store.drawings[0]!.style.color === before.style.color);
  store.toggleVisible(drawing.id);
  ok("locked object still allows visibility toggle", store.drawings[0]!.visible === false);

  // Hidden objects cannot be selected.
  store.select(drawing.id); // currently hidden → refused
  ok("hidden object cannot be selected", store.selectedId === null);
  store.toggleVisible(drawing.id);
  store.select(drawing.id);
  ok("visible object can be selected", store.selectedId === drawing.id);

  store.toggleLocked(drawing.id);
  store.toggleVisible(drawing.id); // lock + hide again
  store.remove(drawing.id);
  eq("remove works regardless of lock (explicit user action)", store.drawings.length, 0);

  store.add(makeTrend());
  store.add(makeTrend());
  ok("clearAll empties the collection", (store.clearAll(), store.drawings.length === 0));
  ok("clearAll is undoable", (store.undo(), store.drawings.length === 2));

  // loadAll clears history (no cross-instrument undo).
  store.loadAll([makeTrend(), makeTrend()]);
  ok("loadAll replaces the collection", store.drawings.length === 2);
  ok("history cleared by loadAll — undo is a no-op", (store.undo(), store.drawings.length === 2));
  ok("history still empty after loadAll", !store.canUndo);
}

// ── 5. persistence (mocked localStorage) ─────────────────────────────────────

console.log("\n[persistence]");
{
  const backing = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
    },
  };

  const symbol = "EURUSD";
  const trendFixture = makeTrend();
  const hlineFixture = {
    ...trendFixture,
    type: "hline" as const,
    price: 1.1,
  } as unknown as OryonDrawing;
  const drawings = [trendFixture, hlineFixture];
  flushDrawingsForSymbol(symbol, drawings);
  const loaded = loadDrawingsForSymbol(symbol);
  eq("round-trip preserves the collection", loaded.length, 2);
  eq(
    "round-trip preserves anchors",
    (loaded[0] as Extract<OryonDrawing, { type: "trend" }>).a.p,
    (drawings[0] as Extract<OryonDrawing, { type: "trend" }>).a.p,
  );

  backing.set(`euforia.oryon.drawings.v1:${symbol}`, "{not json");
  ok("corrupt JSON → empty, no throw", loadDrawingsForSymbol(symbol).length === 0);

  backing.set(`euforia.oryon.drawings.v1:${symbol}`, JSON.stringify({ version: 9, symbol, savedAt: 1, drawings: [] }));
  ok("wrong version → dropped", loadDrawingsForSymbol(symbol).length === 0);

  backing.set(
    `euforia.oryon.drawings.v1:${symbol}`,
    JSON.stringify({
      version: 1,
      symbol,
      savedAt: 1,
      drawings: [
        {
          ...(drawings[0] as Extract<OryonDrawing, { type: "trend" }>),
          b: { t: "oops", p: 1 },
        },
      ],
    }),
  );
  ok("malformed record → dropped", loadDrawingsForSymbol(symbol).length === 0);

  backing.set(
    `euforia.oryon.drawings.v1:${symbol}`,
    JSON.stringify({
      version: 1,
      symbol,
      savedAt: 1,
      drawings: [
        {
          ...(drawings[0] as Extract<OryonDrawing, { type: "trend" }>),
          type: "ghost",
        },
      ],
    }),
  );
  ok("valid envelope + unknown type → filtered out", loadDrawingsForSymbol(symbol).length === 0);

  backing.clear();
  ok("missing key → empty", loadDrawingsForSymbol(symbol).length === 0);

  flushDrawingsForSymbol(symbol, []);
  ok("empty collection removes the key", !backing.has(`euforia.oryon.drawings.v1:${symbol}`));
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
