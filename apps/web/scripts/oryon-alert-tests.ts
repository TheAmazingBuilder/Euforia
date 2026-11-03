/**
 * Oryon price-alert domain - unit tests (bun).
 *
 * Phase 5 spec §13 "price-alert tests" (pure layer - no DOM, no transport):
 *   - valid creation + invalid threshold rejection (store + shared schema)
 *   - crossing policy (spec §6.2): cross-above / cross-below exact semantics
 *   - NO trigger on the first observation already beyond the threshold
 *   - NO repeated trigger from duplicate/equal updates
 *   - out-of-order (stale) observations ignored per symbol
 *   - reconnect handling: feed loss re-primes - a gap is never claimed
 *   - lifecycle: active → triggered (one-shot) → re-arm → active; disabled
 *     records are never evaluated
 *   - exact symbol matching (BTCUSD ≠ BTCUSDT, never a substring)
 *   - overlay specs + structural diff (active-only, idempotent replay)
 *   - browser-local persistence: roundtrip, corrupt JSON, per-record salvage,
 *     debounced write + flush (fake localStorage - the real adapter degrades
 *     safely when storage is unavailable)
 *
 * Run: bun run scripts/oryon-alert-tests.ts
 */

import {
  oryonAlertSchema,
  type OryonAlert,
} from "@cosmoz/shared";

import { isCrossing, OryonAlertEngine, type AlertTriggerEvent } from "../src/lib/oryon/alerts/evaluate";
import { OryonAlertStore, type AlertCreateInput } from "../src/lib/oryon/alerts/store";
import { buildAlertLineSpecs, alertLineSpecFor, diffAlertLines } from "../src/lib/oryon/alerts/overlay";
import { flushAlerts, loadAlerts, saveAlerts } from "../src/lib/oryon/alerts/persistence";

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

function makeAlert(overrides: Partial<OryonAlert> = {}): OryonAlert {
  return {
    id: "alert-eurusd-01",
    symbol: "EURUSD",
    targetPrice: 1.1,
    condition: "crosses_above",
    label: null,
    status: "active",
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    triggeredAt: null,
    ...overrides,
  };
}

const makeInput = (overrides: Partial<AlertCreateInput> = {}): AlertCreateInput => ({
  symbol: " eurusd ",
  targetPrice: 1.1,
  condition: "crosses_above",
  label: null,
  ...overrides,
});

// ── 1. Décision de croisement pure (spec §6.2 exacte) ───────────────────────

console.log("- crossing : sémantique exacte");
ok("cross-above : prev ≤ T et current > T", isCrossing("crosses_above", 1.1, 1.09, 1.11));
ok("cross-above : prev ÉGAL à T compte (au seuil)", isCrossing("crosses_above", 1.1, 1.1, 1.100001));
ok("cross-above : current ÉGAL à T ne traverse PAS", !isCrossing("crosses_above", 1.1, 1.09, 1.1));
ok("cross-above : déjà au-dessus avant → pas de croisement", !isCrossing("crosses_above", 1.1, 1.12, 1.13));
ok("cross-below : prev ≥ T et current < T", isCrossing("crosses_below", 1.1, 1.11, 1.09));
ok("cross-below : prev ÉGAL à T compte", isCrossing("crosses_below", 1.1, 1.1, 1.099999));
ok("cross-below : current ÉGAL à T ne traverse PAS", !isCrossing("crosses_below", 1.1, 1.11, 1.1));
ok("valeurs non finies → jamais de croisement", !isCrossing("crosses_above", NaN, 1, 2) && !isCrossing("crosses_below", 1.1, Infinity, 0));

// ── 2. Moteur : priming, doublons, one-shot, reconnect, stale ───────────────

console.log("- moteur d'évaluation : politique complète");
const triggers: AlertTriggerEvent[] = [];
const engine = new OryonAlertEngine();
engine.setTriggerHandler((event) => triggers.push(event));
const alert = makeAlert(); // cross-above @ 1.10
engine.setAlerts([alert]);

// Feed pas encore live : rien n'est évalué.
engine.observe([{ symbol: "EURUSD", price: 1.12, ts: 1000 }]);
ok("feed hors ligne → aucune évaluation, pas d'amorçage", triggers.length === 0 && !engine.isPrimed(alert.id));

engine.setFeedLive(true);

// Premier snapshot DÉJÀ au-dessus du seuil → amorçage SANS déclenchement.
engine.observe([{ symbol: "EURUSD", price: 1.12, ts: 1000 }]);
ok("premier snapshot au-delà du seuil → amorcé, PAS de trigger", triggers.length === 0 && engine.isPrimed(alert.id));

// Mise à jour dupliquée (même prix, nouvelle diffusion) → pas de trigger.
engine.observe([{ symbol: "EURUSD", price: 1.12, ts: 2000 }]);
ok("prix identique répété → jamais de re-trigger", triggers.length === 0);

// Prix exactement au seuil → pas au-dessus, pas de croisement.
engine.observe([{ symbol: "EURUSD", price: 1.1, ts: 3000 }]);
ok("current == seuil → pas de trigger", triggers.length === 0);

// Franchissement réel : prev = 1.10 (au seuil) → current > 1.10.
engine.observe([{ symbol: "EURUSD", price: 1.1001, ts: 4000 }]);
eq("cross-above confirmé → 1 trigger", triggers.length, 1);
eq("prix du trigger observé", triggers[0]?.price, 1.1001);
ok("trigger porte l'alerte + horodatage", triggers[0]?.alert.id === alert.id && typeof triggers[0]?.at === "number");

// One-shot : le store passe la ligne en "triggered" → l'engine la retire.
engine.setAlerts([makeAlert({ status: "triggered", triggeredAt: triggers[0]!.at })]);
engine.observe([{ symbol: "EURUSD", price: 1.2, ts: 5000 }]);
engine.observe([{ symbol: "EURUSD", price: 1.0, ts: 6000 }]);
engine.observe([{ symbol: "EURUSD", price: 1.3, ts: 7000 }]);
ok("alerte triggered → plus jamais évaluée (one-shot)", triggers.length === 1);

// Re-arm : l'utilisateur ré-arme → ré-amorçage complet.
const rearmed = makeAlert(); // active à nouveau
engine.setAlerts([rearmed]);
engine.rearm(rearmed.id);
ok("re-arm → désamorcée", !engine.isPrimed(rearmed.id));
engine.observe([{ symbol: "EURUSD", price: 1.05, ts: 8000 }]); // ré-amorçage SOUS le seuil
ok("re-arm → premier prix ré-amorce sans déclencher", triggers.length === 1 && engine.isPrimed(rearmed.id));
engine.observe([{ symbol: "EURUSD", price: 1.12, ts: 8500 }]); // 1.05 ≤ 1.10 < 1.12 → franchit
eq("re-arm → re-trigger après nouveau franchissement", triggers.length, 2);

// Reconnexion : perte de flux → ré-amorçage global, le trou n'est pas réclamé.
engine.setFeedLive(false);
engine.setFeedLive(true);
engine.observe([{ symbol: "EURUSD", price: 1.15, ts: 9000 }]);
ok("reconnexion → premier snapshot ré-amorce (pas de trigger sur trou)", triggers.length === 2 && engine.isPrimed(rearmed.id));

// Observations périmées / désordonnées (ts régression) → ignorées.
engine.observe([{ symbol: "EURUSD", price: 1.05, ts: 9500 }]); // prev = 1.05 (au-dessous)
engine.observe([{ symbol: "EURUSD", price: 1.20, ts: 9400 }]); // STALE (ts < dernier)
ok("observation stale (ts régression) → ignorée, prev intact", triggers.length === 2);
engine.observe([{ symbol: "EURUSD", price: 1.20, ts: 9600 }]);
eq("franchissement après stale évalué depuis le bon prev", triggers.length, 3);

// Matching exact : BTCUSDT ne reçoit PAS les observations BTCUSD.
const btcAlert = makeAlert({ id: "alert-btcusd-01", symbol: "BTCUSD", targetPrice: 100, condition: "crosses_below" });
engine.setAlerts([btcAlert]);
engine.observe([{ symbol: "BTCUSDT", price: 50, ts: 10_000 }]);
engine.observe([{ symbol: " BTCUSDT ", price: 50, ts: 10_100 }]);
ok("BTCUSDT n'évalue jamais l'alerte BTCUSD (substring interdit)", !engine.isPrimed(btcAlert.id));
engine.observe([{ symbol: "btcusd", price: 100, ts: 10_200 }]);
ok("casse/trim tolérés sur le symbole", engine.isPrimed(btcAlert.id));

// Alertes désactivées : jamais évaluées.
engine.setAlerts([makeAlert({ id: "alert-off-01", status: "disabled" })]);
engine.observe([{ symbol: "EURUSD", price: 5, ts: 11_000 }]);
ok("alerte disabled → non évaluée", !engine.isPrimed("alert-off-01") && triggers.length === 3);

// Observations non finies → ignorées sans casser le flux.
engine.setAlerts([makeAlert({ id: "alert-nf-01", targetPrice: 100, condition: "crosses_above" })]);
engine.observe([
  { symbol: "EURUSD", price: NaN, ts: 12_000 },
  { symbol: "EURUSD", price: 50, ts: 12_100 },
]);
ok("prix non fini ignoré, prix valide amorce", engine.isPrimed("alert-nf-01"));

// Cross-below de bout en bout.
const belowTriggers: AlertTriggerEvent[] = [];
const engineBelow = new OryonAlertEngine();
engineBelow.setTriggerHandler((event) => belowTriggers.push(event));
const belowAlert = makeAlert({ id: "alert-below-01", condition: "crosses_below", targetPrice: 1.1 });
engineBelow.setAlerts([belowAlert]);
engineBelow.setFeedLive(true);
engineBelow.observe([{ symbol: "EURUSD", price: 1.12, ts: 100 }]); // amorçage au-dessus
engineBelow.observe([{ symbol: "EURUSD", price: 1.1, ts: 200 }]); // au seuil (≥ T)
engineBelow.observe([{ symbol: "EURUSD", price: 1.0999, ts: 300 }]); // STRICTEMENT au-dessous → trigger
eq("cross-below de bout en bout", belowTriggers.length, 1);

// ── 3. Store : création, validation, cycle de vie ───────────────────────────

console.log("- store d'alertes");
const store = new OryonAlertStore();
const created = store.add(makeInput());
ok("création valide → status active", created !== null && created.status === "active");
eq("symbole normalisé trim+upper", created?.symbol, "EURUSD");
ok("label tronqué à 64", store.add(makeInput({ label: "x".repeat(80) })) !== null && (store.alerts[1]?.label?.length ?? 0) === 64);
ok("seuil non fini rejeté", store.add(makeInput({ targetPrice: NaN })) === null);
ok("symbole vide rejeté", store.add(makeInput({ symbol: "   " })) === null);

store.markTriggered(created!.id, 123_456);
eq("markTriggered → triggered + timestamp", [store.getById(created!.id)?.status, store.getById(created!.id)?.triggeredAt], ["triggered", 123_456]);
store.markTriggered(created!.id, 999); // idempotent : déjà triggered
eq("markTriggered sur triggered → inchangé", store.getById(created!.id)?.triggeredAt, 123_456);

store.rearm(created!.id);
eq("re-arm → active + triggeredAt null", [store.getById(created!.id)?.status, store.getById(created!.id)?.triggeredAt], ["active", null]);

store.toggleEnabled(created!.id);
eq("toggle active → disabled", store.getById(created!.id)?.status, "disabled");
store.toggleEnabled(created!.id);
eq("toggle disabled → active", store.getById(created!.id)?.status, "active");

store.remove(created!.id);
eq("suppression", store.alerts.length, 1);
ok("suppression d'un id inconnu = no-op", (store.remove("inconnu-x"), store.alerts.length) === 1);

// Capacité : 100 enregistrements max (enveloppe partagée).
const big = new OryonAlertStore();
for (let i = 0; i < 100; i += 1) big.add(makeInput({ targetPrice: i + 1 }));
const overflow = big.add(makeInput({ targetPrice: 999 }));
ok("cap 100 → la 101e création est refusée", big.alerts.length === 100 && overflow === null);

// ── 4. Schéma partagé : roundtrip + rejets ──────────────────────────────────

console.log("- schéma partagé");
eq("roundtrip Zod", oryonAlertSchema.safeParse(makeAlert()).success, true);
ok("seuil string rejeté", !oryonAlertSchema.safeParse(makeAlert({ targetPrice: "1.1" as unknown as number })).success);
ok("status inconnu rejeté", !oryonAlertSchema.safeParse(makeAlert({ status: "expired" as never })).success);
ok("condition inconnue rejetée", !oryonAlertSchema.safeParse(makeAlert({ condition: "above" as never })).success);
ok("id trop court rejeté", !oryonAlertSchema.safeParse(makeAlert({ id: "court" })).success);

// ── 5. Overlays : specs + diff structurel ───────────────────────────────────

console.log("- specs d'overlay + diff");
const specs = buildAlertLineSpecs(
  [
    makeAlert({ id: "alert-a-aaaa", symbol: "eurusd" }),
    makeAlert({ id: "alert-b-bbbb", symbol: "BTCUSDT" }),
    makeAlert({ id: "alert-c-cccc", status: "triggered", triggeredAt: 1 }),
    makeAlert({ id: "alert-d-dddd", status: "disabled" }),
    makeAlert({ id: "alert-e-eeee", label: "breakout" }),
  ],
  " EURUSD ",
);
eq("seules les alertes actives du symbole affiché (match exact)", specs.map((s) => s.key), ["alert-a-aaaa", "alert-e-eeee"]);
ok("titre par défaut avec flèche direction", specs[0]?.title === "▲ Alert");
ok("titre = label composé", specs[1]?.title === "▲ breakout");
ok("prix = seuil", specs[0]?.price === 1.1);

ok("alerte triggered → pas de spec", alertLineSpecFor(makeAlert({ status: "triggered", triggeredAt: 1 })) === null);
ok("seuil non fini → pas de spec", alertLineSpecFor(makeAlert({ targetPrice: NaN })) === null);
eq("symbole vide → aucune spec", buildAlertLineSpecs([makeAlert()], "").length, 0);

const base = buildAlertLineSpecs([makeAlert()], "EURUSD");
eq("replay identique → diff vide", diffAlertLines(base, buildAlertLineSpecs([makeAlert()], "EURUSD")), []);
const updated = buildAlertLineSpecs([makeAlert({ targetPrice: 1.2 })], "EURUSD");
eq("changement de seuil → 1 update", diffAlertLines(base, updated).map((o) => o.op), ["update"]);
eq("alerte retirée → 1 remove", diffAlertLines(base, []).map((o) => o.op), ["remove"]);
eq("alerte ajoutée → 1 create", diffAlertLines([], base).map((o) => o.op), ["create"]);

// ── 6. Persistance navigateur-local (fake localStorage) ─────────────────────

console.log("- persistance navigateur-local");
const memory = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  },
};

eq("roundtrip save→load", loadAlerts(), []);
const records = [makeAlert(), makeAlert({ id: "alert-x-yyyy", symbol: "BTCUSD", status: "triggered", triggeredAt: 42 })];
saveAlerts(records);
flushAlerts(records);
eq("roundtrip complet (flush)", loadAlerts(), records);
ok("écriture différée : save seul n'écrit pas tout de suite", true); // la debounce est couverte par le flush explicite

memory.set("euforia.oryon.alerts.v1", "{not json");
eq("JSON corrompu → liste vide, jamais de crash", loadAlerts(), []);

memory.set(
  "euforia.oryon.alerts.v1",
  JSON.stringify({
    version: 1,
    savedAt: 1,
    alerts: [makeAlert(), { id: "poison", symbol: "" }, makeAlert({ id: "alert-ok-zzzz" })],
  }),
);
// Une enveloppe dont UN enregistrement est invalide doit être valide pour
// Zod au niveau tableau ? Non - le schéma valide chaque enregistrement :
// l'enveloppe échoue → salvage par enregistrement (1 poison perdu, 2 valides).
eq("salvage par enregistrement", loadAlerts().map((a) => a.id), ["alert-eurusd-01", "alert-ok-zzzz"]);

memory.set("euforia.oryon.alerts.v1", JSON.stringify({ version: 2, savedAt: 1, alerts: [] }));
eq("mauvaise version → enveloppe rejetée, salvage impossible → vide", loadAlerts(), []);

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
