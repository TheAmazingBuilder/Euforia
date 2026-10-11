/**
 * Oryon position domain — unit tests (bun).
 *
 * Same honest convention as oryon-indicator-tests.ts / oryon-drawing-tests.ts:
 * the repository has NO JS unit-test runner, so these are bun-run TypeScript
 * with plain assertions. Coverage follows the Phase 4 spec §13 (data and
 * contract tests):
 *   - exact symbol matching (BTCUSD ≠ BTCUSDT, trim/case, empty strings)
 *   - chart filtering and short labels
 *   - record sanitization (valid long/short, malformed numerics, unknown
 *     shapes, duplicate ids last-write-wins, never throws)
 *   - freshness classification (connecting/live/stale/disconnected, 8 s rule)
 *   - view helpers (digits from decimal strings, signed P&L, tone, cents-safe
 *     aggregation, deterministic table order, opened-at formatting)
 *   - overlay spec building (entry always, SL/TP only when valid, selection)
 *   - structural diff (create/update/remove, idempotent replay, no duplicates)
 *
 * Run: bun run scripts/oryon-position-tests.ts
 */

import type { BrokerPosition } from "@cosmoz/shared";

import {
  canonicalSymbol,
  positionShortLabel,
  positionsForChart,
  sameInstrument,
  sideLabel,
} from "../src/lib/oryon/positions/match";
import { sanitizePositions } from "../src/lib/oryon/positions/sanitize";
import {
  classifyPositionsStatus,
  snapshotAgeSeconds,
} from "../src/lib/oryon/positions/status";
import {
  buildPositionLineSpecs,
  diffPositionLines,
  positionLineSpecsFor,
  type PositionLineSpec,
} from "../src/lib/oryon/positions/overlay";
import {
  digitsFromDecimalString,
  formatOpenedAt,
  formatSignedAmount,
  pnlTone,
  positionPriceDigits,
  sortPositionsForTable,
  summarizePnl,
} from "../src/lib/oryon/positions/view";

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
  ok(`${name} (${a} === ${b})`, a === b);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePosition(overrides: Partial<BrokerPosition> = {}): BrokerPosition {
  return {
    id: "sim-user1234-eurusd-1",
    symbol: "EURUSD",
    direction: "BUY",
    volume: "0.50",
    entryPrice: "1.08650",
    currentPrice: "1.08700",
    stopLoss: "1.08200",
    takeProfit: "1.09500",
    unrealizedPnl: "25.10",
    openedAt: "2026-10-11T09:30:00.000Z",
    ...overrides,
  };
}

// ── 1. Symbol matching ──────────────────────────────────────────────────────

console.log("— match: canonical equality");
eq("canonique trim+upper", canonicalSymbol("  eurusd "), "EURUSD");
ok("exact match EURUSD", sameInstrument("EURUSD", "EURUSD"));
ok("casse/espaces tolérés", sameInstrument(" eurusd", "EURUSD "));
ok("BTCUSD ≠ BTCUSDT (jamais de substring)", !sameInstrument("BTCUSD", "BTCUSDT"));
ok("chaîne vide ne matche rien", !sameInstrument("", "EURUSD") && !sameInstrument("EURUSD", ""));
ok("symboles distincts", !sameInstrument("XAUUSD", "GBPUSD"));

console.log("— match: filtre du graphique");
const mixed = [
  makePosition({ id: "p1", symbol: "EURUSD" }),
  makePosition({ id: "p2", symbol: "btcusd" }),
  makePosition({ id: "p3", symbol: "XAUUSD" }),
  makePosition({ id: "p4", symbol: " BTCUSD " }),
];
eq("seuls les matches exacts passent", positionsForChart(mixed, "EURUSD").map((p) => p.id), ["p1"]);
eq("BTCUSDT ne reçoit PAS les positions BTCUSD", positionsForChart(mixed, "BTCUSDT").length, 0);
eq("BTCUSD reçoit les deux BTCUSD (casse/trim)", positionsForChart(mixed, "BTCUSD").map((p) => p.id), ["p2", "p4"]);
eq("symbole vide → aucune overlay", positionsForChart(mixed, "").length, 0);

console.log("— match: labels");
eq("label numérique en fin d'id", positionShortLabel("sim-abcd1234-eurusd-2"), "#2");
eq("label de repli sur la queue", positionShortLabel("pos-9f3a"), "#9f3a");
eq("sideLabel BUY→LONG / SELL→SHORT", [sideLabel("BUY"), sideLabel("SELL")], ["LONG", "SHORT"]);

// ── 2. Sanitization ─────────────────────────────────────────────────────────

console.log("— sanitize: records valides et malformés");
const validLong = makePosition();
const validShort = makePosition({
  id: "sim-user1234-xauusd-1",
  symbol: "XAUUSD",
  direction: "SELL",
  entryPrice: "2385.10",
  currentPrice: null,
  stopLoss: null,
  takeProfit: null,
  unrealizedPnl: null,
});
const sanitized = sanitizePositions([
  validLong,
  validShort,
  { id: "x", symbol: "EURUSD", direction: "BUY", volume: "0", entryPrice: "NaN", openedAt: "2026-10-11T09:30:00.000Z" },
  { garbage: true },
  null,
  "string",
  makePosition({ id: "p-dup", volume: "1.00" }),
  makePosition({ id: "p-dup", volume: "2.00" }),
]);
eq("3 positions valides (2 + 1 doublon dédupliqué)", sanitized.positions.length, 3);
eq("rejets comptés honnêtement", sanitized.dropped, 4);
eq("1 doublon id → last-write-wins", sanitized.positions.find((p) => p.id === "p-dup")?.volume ?? null, "2.00");
ok("schéma complet : direction/volume/entrée",
  sanitized.positions[0]!.direction === "BUY" && sanitized.positions[1]!.direction === "SELL");
const malformed = sanitizePositions([
  makePosition({ entryPrice: "not-a-number" }),
  makePosition({ direction: "SIDEWAYS" as BrokerPosition["direction"] }),
  makePosition({ unrealizedPnl: "12,50" }),
]);
ok("numériques malformés rejetés", malformed.positions.length === 0 && malformed.dropped === 3);
ok("décimal négatif syntaxiquement valide passe le CONTRAT ('-1' = regex OK) — le schéma partagé fait foi",
  sanitizePositions([makePosition({ volume: "-1" })]).positions.length === 1);
eq("entrée vide → aucun rejet, aucune position", sanitizePositions([]).dropped, 0);

console.log("— sanitize: nulls du contrat (feed gap)");
const nullable = sanitizePositions([
  makePosition({ currentPrice: null, stopLoss: null, takeProfit: null, unrealizedPnl: null }),
]);
ok("nullable currentPrice/SL/TP/PnL acceptés (jamais devinés)", nullable.positions.length === 1);

// ── 3. Freshness classification ─────────────────────────────────────────────

console.log("— status: machine de fraîcheur");
const NOW = 1_000_000_000_000;
eq("jamais de snapshot → connecting", classifyPositionsStatus({ connected: false, lastEventAt: 0, now: NOW }), "connecting");
eq("connecté sans snapshot → connecting", classifyPositionsStatus({ connected: true, lastEventAt: 0, now: NOW }), "connecting");
eq("flux vivant", classifyPositionsStatus({ connected: true, lastEventAt: NOW - 1_000, now: NOW }), "live");
eq("transport vivant mais figé > 8 s → stale", classifyPositionsStatus({ connected: true, lastEventAt: NOW - 9_000, now: NOW }), "stale");
eq("transport perdu → disconnected", classifyPositionsStatus({ connected: false, lastEventAt: NOW - 1_000, now: NOW }), "disconnected");
eq("exactement 8 s → stale", classifyPositionsStatus({ connected: true, lastEventAt: NOW - 8_001, now: NOW }), "stale");
eq("âge du snapshot", snapshotAgeSeconds(NOW - 5_000, NOW), 5);
eq("âge inconnu → null", snapshotAgeSeconds(0, NOW), null);

// ── 4. View helpers ─────────────────────────────────────────────────────────

console.log("— view: précisions et formats");
eq("digits depuis decimal string", digitsFromDecimalString("1.08650"), 5);
eq("digits entier", digitsFromDecimalString("2385"), 0);
eq("digits invalide → null", digitsFromDecimalString("abc"), null);
eq("digits chaîne vide → null", digitsFromDecimalString(""), null);
eq("digits position : instrument d'abord", positionPriceDigits(makePosition(), 5), 5);
eq("digits position : repli sur l'entrée", positionPriceDigits(makePosition(), null), 5);
eq("digits position : repli courant puis 2", positionPriceDigits(makePosition({ entryPrice: "bad", currentPrice: "2385.1" }), null), 1);
eq("digits position : repli final 2", positionPriceDigits(makePosition({ entryPrice: "bad", currentPrice: null }), null), 2);
eq("montant signé positif", formatSignedAmount("25.104", 2), "+25.10");
eq("montant signé négatif", formatSignedAmount("-3.05", 2), "-3.05");
eq("montant signé zéro", formatSignedAmount("0", 2), "0.00");
eq("montant invalide → null", formatSignedAmount("n/a"), null);
eq("tone profit/loss/neutral", [pnlTone("12.00"), pnlTone("-1.00"), pnlTone("0")], ["profit", "loss", "neutral"]);

console.log("— view: agrégation P&L");
const book = [
  makePosition({ id: "a", unrealizedPnl: "12.34" }),
  makePosition({ id: "b", unrealizedPnl: "-2.00" }),
  makePosition({ id: "c", unrealizedPnl: null }),
];
const summary = summarizePnl(book);
eq("somme cents-safe 2 décimales", summary.total, "10.34");
eq("comptés vs disponibles", [summary.counted, summary.available], [2, 2]);
const emptyBook = summarizePnl([makePosition({ id: "d", unrealizedPnl: null })]);
eq("aucune valeur → total null (jamais fabriqué)", emptyBook.total, null);

console.log("— view: ordre de table déterministe");
const ordered = sortPositionsForTable([
  makePosition({ id: "old", symbol: "EURUSD", openedAt: "2026-10-11T08:00:00.000Z" }),
  makePosition({ id: "new", symbol: "EURUSD", openedAt: "2026-10-11T09:00:00.000Z" }),
  makePosition({ id: "gold", symbol: "XAUUSD", openedAt: "2026-10-11T07:00:00.000Z" }),
]);
eq("symbole asc puis ouvert le plus récent d'abord", ordered.map((p) => p.id), ["new", "old", "gold"]);

ok("openedAt formaté", (formatOpenedAt("2026-10-11T09:30:00.000Z") ?? "").length > 0);
eq("openedAt invalide → null", formatOpenedAt("nope"), null);

// ── 5. Overlay specs ────────────────────────────────────────────────────────

console.log("— overlay: niveaux et sélection");
const full = makePosition({ id: "pos-1" });
const specsFull = positionLineSpecsFor(full, null);
eq("3 niveaux pour une position complète", specsFull.map((s) => s.level), ["entry", "sl", "tp"]);
eq("clés stables", specsFull.map((s) => s.key), ["pos-1:entry", "pos-1:sl", "pos-1:tp"]);
eq("titre d'entrée = side volume label", specsFull[0]!.title, "LONG 0.50 #1");
eq("titre SL", specsFull[1]!.title, "#1 SL");
eq("titre TP", specsFull[2]!.title, "#1 TP");
eq("side LONG sur toutes les lignes", specsFull.every((s) => s.side === "LONG"), true);

const partial = makePosition({ id: "pos-2", stopLoss: null, takeProfit: null });
eq("SL/TP absents → entry seule", positionLineSpecsFor(partial, null).map((s) => s.level), ["entry"]);

const invalid = makePosition({
  id: "pos-3",
  stopLoss: "0",
  takeProfit: "-5",
});
eq("SL/TP non positifs jamais dessinés", positionLineSpecsFor(invalid, null).map((s) => s.level), ["entry"]);

eq("sélection marquée sur toutes les lignes", positionLineSpecsFor(full, "pos-1").every((s) => s.selected), true);
eq("non-sélection", positionLineSpecsFor(full, "other").every((s) => !s.selected), true);

const batch = buildPositionLineSpecs([full, partial], null);
eq("build multi-positions", batch.length, 4);

// ── 6. Structural diff ──────────────────────────────────────────────────────

console.log("— overlay: diff structurel");
const base: PositionLineSpec[] = [
  { key: "p1:entry", positionId: "p1", level: "entry", price: 10, side: "LONG", title: "LONG 1 #1", selected: false },
  { key: "p1:sl", positionId: "p1", level: "sl", price: 9, side: "LONG", title: "#1 SL", selected: false },
];
const identical = diffPositionLines(base, base);
eq("snapshot rejoué → diff vide (idempotent)", identical.length, 0);

const moved = base.map((s) => (s.key === "p1:entry" ? { ...s, price: 10.5 } : s));
const diffMoved = diffPositionLines(base, moved);
eq("prix changé → 1 update", diffMoved, [{ op: "update", spec: moved[0] }]);

const selected = base.map((s) => ({ ...s, selected: true }));
const diffSelected = diffPositionLines(base, selected);
eq("sélection → 2 updates, identités préservées", diffSelected.length, 2);

const withNew: PositionLineSpec[] = [...base, { key: "p2:entry", positionId: "p2", level: "entry", price: 11, side: "SHORT", title: "SHORT 1 #2", selected: false }];
const diffAdd = diffPositionLines(base, withNew);
eq("ajout → 1 create", diffAdd, [{ op: "create", spec: withNew[2] }]);

const diffRemove = diffPositionLines(withNew, base);
eq("retrait → 1 remove", diffRemove, [{ op: "remove", key: "p2:entry" }]);

const mixedDiff = diffPositionLines(base, [
  { key: "p1:entry", positionId: "p1", level: "entry", price: 10.5, side: "LONG", title: "LONG 1 #1", selected: false },
  { key: "p3:tp", positionId: "p3", level: "tp", price: 12, side: "LONG", title: "#3 TP", selected: false },
]);
eq("mix : remove, update (prix changé), create — ordre stable",
  mixedDiff.map((o) => o.op), ["remove", "update", "create"]);
const closedSameId = makePosition({ id: "pos-1", stopLoss: null, takeProfit: null });
const closedDiff = diffPositionLines(buildPositionLineSpecs([full], null), buildPositionLineSpecs([closedSameId], null));
ok("SL/TP effacés → leurs lignes retirées, entry conservée", closedDiff.length === 2 && closedDiff.every((o) => o.op === "remove"));

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
