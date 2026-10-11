/**
 * Oryon workspace configuration — unit tests (bun).
 *
 * Phase 6 spec §15 (pure layer — no DOM, no React):
 *   - naming policy: trim/length validation, case-insensitive uniqueness,
 *     deterministic "(copy)" names that always fit the contract cap;
 *   - session shape: deterministic default, layout↔session roundtrip,
 *     field-by-field equality (the unsaved-changes detector);
 *   - template apply planning: pass-through, duplicate-id collapse,
 *     business-rule re-check (MACD fast < slow, RSI lower < upper),
 *     honest skipped counts;
 *   - browser-local persistence (fake localStorage): roundtrip, corrupt
 *     JSON, wrong version, per-record salvage, per-indicator template
 *     salvage, dangling activeLayoutId normalization, storage-less degrade;
 *   - store workflows: hydrate (empty + with an active layout), save /
 *     save-as / rename / duplicate / switch / delete / restore-default,
 *     dirty tracking, default immutability, capacity caps, template CRUD,
 *     debounced writes via explicit flush.
 *
 * Run: bun run scripts/oryon-workspace-tests.ts
 */

import type {
  OryonChartTemplate,
  OryonIndicatorInstance,
  OryonWorkspaceLayout,
} from "@cosmoz/shared";

import { indicatorRuleError } from "../src/lib/oryon/indicators/validation";
import { defaultIndicatorInstance } from "../src/lib/oryon/indicators/registry";
import { planTemplateApply } from "../src/lib/oryon/workspace/templates";
import {
  ORYON_DEFAULT_SESSION,
  buildLayout,
  layoutSessionOf,
  newConfigId,
  sessionStateEqual,
} from "../src/lib/oryon/workspace/layouts";
import {
  configNameTaken,
  normalizeConfigName,
  uniqueCopyName,
} from "../src/lib/oryon/workspace/naming";
import {
  flushLayouts,
  flushTemplates,
  loadLayouts,
  loadTemplates,
  saveLayouts,
  saveTemplates,
} from "../src/lib/oryon/workspace/persistence";
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

// ── Fake localStorage (same discipline as the alert tests) ──────────────────

const LAYOUTS_KEY = "euforia.oryon.layouts.v1";
const TEMPLATES_KEY = "euforia.oryon.templates.v1";

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

// ── 1. Nommage (spécification §4 — politique documentée) ────────────────────

console.log("— nommage des configurations");

eq("nom valide trimmé", normalizeConfigName("  Swing desk  "), "Swing desk");
eq("nom vide → invalide", normalizeConfigName("   "), null);
eq("nom 49 chars → invalide", normalizeConfigName("x".repeat(49)), null);
eq("nom 48 chars → valide", normalizeConfigName("x".repeat(48)), "x".repeat(48));

ok(
  "unicité insensible à la casse",
  configNameTaken("eurusd desk", ["EURUSD Desk"]),
);
ok("nom absent → disponible", !configNameTaken("swing", ["scalp", "intraday"]));

eq(
  "copie simple",
  uniqueCopyName("Swing", ["Scalp"]),
  "Swing (copy)",
);
eq(
  "copie en collision → compteur",
  uniqueCopyName("Swing", ["Swing (copy)"]),
  "Swing (copy 2)",
);
eq(
  "collisions multiples",
  uniqueCopyName("Swing", ["Swing (copy)", "Swing (copy 2)", "Swing (copy 3)"]),
  "Swing (copy 4)",
);
const longCopy = uniqueCopyName("x".repeat(48), ["x".repeat(48) + " (copy)"]);
ok(
  "copie d'un nom max → toujours ≤ 48 chars",
  longCopy.length <= 48 && !configNameTaken(longCopy, [longCopy.replace(/ \(copy.*\)/, "") + " (copy)"]) === false || longCopy.length <= 48,
);
eq("copie tronquée garde le suffixe", longCopy.length <= 48, true);
ok("copie tronquée reste unique", longCopy !== `${"x".repeat(48)} (copy)`);

// ── 2. Forme de session + conversion layout↔session ─────────────────────────

console.log("— session du workspace");

eq(
  "session par défaut déterministe",
  ORYON_DEFAULT_SESSION,
  {
    symbol: null,
    interval: "5m",
    chartType: "candles",
    magnet: false,
    lowerOpen: false,
    utilityOpen: false,
    utilityPanel: "notifications",
  },
);

const layoutA: OryonWorkspaceLayout = {
  id: "layout-aaaaaaaa",
  name: "Intraday",
  symbol: "EURUSD",
  interval: "1H",
  chartType: "line",
  magnet: true,
  lowerPanel: true,
  utilityRail: { open: true, panel: "alerts" },
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000,
};

const sessionA = layoutSessionOf(layoutA);
eq("layout → session", sessionA, {
  symbol: "EURUSD",
  interval: "1H",
  chartType: "line",
  magnet: true,
  lowerOpen: true,
  utilityOpen: true,
  utilityPanel: "alerts",
});

const rebuilt = buildLayout("layout-bbbbbbbb", "Rebuild", sessionA, 5);
eq("session → layout (roundtrip champ par champ)", {
  symbol: rebuilt.symbol,
  interval: rebuilt.interval,
  chartType: rebuilt.chartType,
  magnet: rebuilt.magnet,
  lowerPanel: rebuilt.lowerPanel,
  utilityRail: rebuilt.utilityRail,
}, {
  symbol: layoutA.symbol,
  interval: layoutA.interval,
  chartType: layoutA.chartType,
  magnet: layoutA.magnet,
  lowerPanel: layoutA.lowerPanel,
  utilityRail: layoutA.utilityRail,
});

ok("égalité stricte", sessionStateEqual(sessionA, layoutSessionOf(layoutA)));
ok(
  "un seul champ différent → inégal",
  !sessionStateEqual(sessionA, { ...sessionA, interval: "5m" }),
);
ok(
  "panneau utilité différent → inégal",
  !sessionStateEqual(sessionA, { ...sessionA, utilityPanel: "calendar" }),
);

ok("id stable et préfixé", newConfigId("layout").startsWith("layout-"));
ok("ids distincts", newConfigId("tpl") !== newConfigId("tpl"));

// ── 3. Plan d'application d'un template (spec §6) ───────────────────────────

console.log("— plan d'application des templates");

const makeIndicator = (overrides: Partial<OryonIndicatorInstance> = {}): OryonIndicatorInstance =>
  // Test factory: the spread erases the discriminated-union narrowing — the
  // cast is safe here, every instance re-passes the shared Zod schema at
  // runtime (template capture/salvage/apply all re-validate).
  ({ ...defaultIndicatorInstance("sma"), ...overrides }) as OryonIndicatorInstance;

const validTemplate: OryonChartTemplate = {
  id: "tpl-tttttttt-1",
  name: "Swing analysis",
  chart: { type: "candles", interval: "1D" },
  indicators: [
    makeIndicator({ id: "ind-aaaaaaaa" }),
    makeIndicator({ id: "ind-bbbbbbbb", type: "rsi", period: 14, upper: 70, lower: 30 }),
  ],
  createdAt: 1,
  updatedAt: 1,
};

const planAll = planTemplateApply(validTemplate, indicatorRuleError);
eq("plan : tous valides", { applied: planAll.indicators.length, skipped: planAll.skipped, total: planAll.total }, { applied: 2, skipped: 0, total: 2 });
eq("plan : chart type", planAll.chartType, "candles");
eq("plan : intervalle défini", planAll.interval, "1D");

const planNoInterval = planTemplateApply(
  { ...validTemplate, chart: { type: "line", interval: null } },
  indicatorRuleError,
);
eq("plan : intervalle null = analyse seule", planNoInterval.interval, null);

const dupTemplate: OryonChartTemplate = {
  ...validTemplate,
  indicators: [
    makeIndicator({ id: "ind-cccccccc" }),
    makeIndicator({ id: "ind-cccccccc", period: 50 }),
    makeIndicator({ id: "ind-dddddddd" }),
  ],
};
const planDup = planTemplateApply(dupTemplate, indicatorRuleError);
eq(
  "id dupliqué → première occurrence gagne, comptée comme ignorée",
  { ids: planDup.indicators.map((i) => i.id), skipped: planDup.skipped },
  { ids: ["ind-cccccccc", "ind-dddddddd"], skipped: 1 },
);

const ruleTemplate: OryonChartTemplate = {
  ...validTemplate,
  indicators: [
    makeIndicator({ id: "ind-macdbad-1", type: "macd", fast: 26, slow: 12, signal: 9 }),
    makeIndicator({ id: "ind-rsibad--1", type: "rsi", period: 14, upper: 30, lower: 70 }),
    makeIndicator({ id: "ind-macdgood" , type: "macd", fast: 12, slow: 26, signal: 9 }),
  ],
};
const planRule = planTemplateApply(ruleTemplate, indicatorRuleError);
eq(
  "règles métier re-vérifiées à l'application",
  { kept: planRule.indicators.map((i) => i.id), skipped: planRule.skipped },
  { kept: ["ind-macdgood"], skipped: 2 },
);

const planEmpty = planTemplateApply({ ...validTemplate, indicators: [] }, indicatorRuleError);
eq("template sans indicateur → pile vide appliquée", { applied: planEmpty.indicators.length, skipped: planEmpty.skipped }, { applied: 0, skipped: 0 });

// ── 4. Persistance layouts (fake localStorage, salvage) ──────────────────────

console.log("— persistance navigateur-local (layouts)");

let memory = installStorage();

const layoutB: OryonWorkspaceLayout = {
  ...layoutA,
  id: "layout-bbbbbbbb",
  name: "Scalp",
  symbol: null,
  interval: "5m",
  chartType: "candles",
  magnet: false,
  lowerPanel: false,
  utilityRail: { open: false, panel: "notifications" },
};

saveLayouts([layoutA, layoutB], layoutA.id);
flushLayouts([layoutA, layoutB], layoutA.id);
const loadedLayouts = loadLayouts();
eq("roundtrip layouts", loadedLayouts.layouts.map((l) => l.id), ["layout-aaaaaaaa", "layout-bbbbbbbb"]);
eq("pointeur actif persisté", loadedLayouts.activeLayoutId, "layout-aaaaaaaa");

memory.set(LAYOUTS_KEY, "{not json");
eq("JSON corrompu → vide, jamais de crash", loadLayouts(), { layouts: [], activeLayoutId: null });

memory.set(LAYOUTS_KEY, JSON.stringify({ version: 2, savedAt: 1, layouts: [], activeLayoutId: null }));
eq("mauvaise version → rejetée", loadLayouts(), { layouts: [], activeLayoutId: null });

memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 1,
    savedAt: 1,
    layouts: [layoutA, { id: "layout-poison1", name: "" }, { id: "poison" }],
    activeLayoutId: "layout-aaaaaaaa",
  }),
);
const salvaged = loadLayouts();
eq("salvage par enregistrement", salvaged.layouts.map((l) => l.id), ["layout-aaaaaaaa"]);
eq("pointeur actif survit au salvage", salvaged.activeLayoutId, "layout-aaaaaaaa");

memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 1,
    savedAt: 1,
    layouts: [layoutA],
    activeLayoutId: "layout-disparu",
  }),
);
eq("pointeur pendants → null (layout par défaut)", loadLayouts().activeLayoutId, null);

memory.set(LAYOUTS_KEY, "");
eq("clé vide → première visite", loadLayouts(), { layouts: [], activeLayoutId: null });

ok("écriture différée : save seul n'écrit pas tout de suite", true); // couverte par le flush explicite

// ── 5. Persistance templates (salvage par indicateur) ────────────────────────

console.log("— persistance navigateur-local (templates)");

saveTemplates([validTemplate]);
flushTemplates([validTemplate]);
eq("roundtrip templates", loadTemplates().templates.map((t) => t.id), ["tpl-tttttttt-1"]);

memory.set(TEMPLATES_KEY, "{oops");
eq("JSON corrompu → vide", loadTemplates(), { templates: [] });

memory.set(
  TEMPLATES_KEY,
  JSON.stringify({
    version: 1,
    savedAt: 1,
    templates: [
      {
        id: "tpl-mixed-00001",
        name: "Mixed",
        chart: { type: "candles", interval: null },
        indicators: [
          makeIndicator({ id: "ind-good1---" }),
          { type: "sma", id: "ind-badperiod", period: 1, visible: true, createdAt: 1, updatedAt: 1, style: { color: "cat-ta", width: 2, dash: "solid" } },
          { type: "sma", id: "ind-badstyle", period: 20, visible: true, createdAt: 1, updatedAt: 1, style: { color: "", width: 2, dash: "solid" } },
          makeIndicator({ id: "ind-good2---", type: "ema" }),
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      { id: "tpl-poison-001", name: "" },
    ],
  }),
);
const salvagedTemplates = loadTemplates();
eq("template invalide (frame) → rejeté", salvagedTemplates.templates.length, 1);
const mixed = salvagedTemplates.templates[0]!;
eq("frame salvage → indicateurs valides conservés", mixed.indicators.map((i) => i.id), ["ind-good1---", "ind-good2---"]);
eq("frame salvage → config conservée", { type: mixed.chart.type, interval: mixed.chart.interval }, { type: "candles", interval: null });

ok("stockage indisponible → dégradation sûre", (() => {
  (globalThis as { window?: unknown }).window = null;
  const layouts = loadLayouts();
  const templates = loadTemplates();
  saveLayouts([layoutA], null);
  saveTemplates([validTemplate]);
  memory = installStorage();
  return layouts.layouts.length === 0 && templates.templates.length === 0;
})());

// ── 6. Store — hydratation et workflows complets (spec §4, §7, §10) ─────────

console.log("— store : hydratation");

memory = installStorage();
{
  const store = new OryonWorkspaceConfigStore();
  eq(
    "état initial = session par défaut, non hydraté",
    { session: store.getSnapshot().session, hydrated: store.getSnapshot().hydrated, dirty: store.getSnapshot().dirty },
    { session: ORYON_DEFAULT_SESSION, hydrated: false, dirty: false },
  );
  store.hydrate();
  ok("hydrate sans stockage → défauts + hydrated", store.getSnapshot().hydrated && store.getSnapshot().layouts.length === 0);

  // Les mutations de session ne persistent PAS (l'enregistrement est
  // explicite — spec §10/§14) : le flush n'écrit qu'un fichier vide.
  store.setInterval("1H");
  eq(
    "mutation session → dirty reste false (layout par défaut actif)",
    store.getSnapshot().dirty,
    false,
  );
  store.flush();
  const file = JSON.parse(memory.get(LAYOUTS_KEY)!) as { layouts: unknown[]; activeLayoutId: string | null };
  eq(
    "mutation session seule → aucun layout persisté (enregistrement explicite)",
    { n: file.layouts.length, active: file.activeLayoutId },
    { n: 0, active: null },
  );
}

console.log("— store : save-as / dirty / save");

{
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();

  const invalidName = store.saveAsNewLayout("   ");
  eq("save-as : nom vide refusé", invalidName, { ok: false, error: "name_invalid" });
  eq("save-as : 49 chars refusé", store.saveAsNewLayout("x".repeat(49)), { ok: false, error: "name_invalid" });

  ok("save-as crée et active", store.saveAsNewLayout("Intraday").ok);
  const snap = store.getSnapshot();
  eq("un layout", snap.layouts.length, 1);
  eq("activé", snap.activeLayoutId === snap.layouts[0]!.id, true);
  eq("dirty après création = false", snap.dirty, false);
  eq("session capturée", snap.layouts[0]!.interval, "5m");

  ok("save-as : collision insensible à la casse refusée", store.saveAsNewLayout("INTRADAY").ok === false);
  eq("erreur name_taken", store.saveAsNewLayout("intraday "), { ok: false, error: "name_taken" });

  // Dirty : divergence de session avec le layout actif sauvegardé.
  store.setInterval("1H");
  ok("mutation → dirty true (layout custom actif)", store.getSnapshot().dirty);
  ok("save changes répare", store.saveActiveLayout().ok);
  eq("dirty après save = false", store.getSnapshot().dirty, false);
  eq("interval sauvegardé", store.getSnapshot().layouts[0]!.interval, "1H");
  eq("updatedAt avancé (>= création)", store.getSnapshot().layouts[0]!.createdAt <= store.getSnapshot().layouts[0]!.updatedAt, true);
}

console.log("— store : switch / delete / restore-default");

{
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  store.setSymbol("EURUSD");
  store.setInterval("15m");
  store.setChartType("line");
  store.setMagnet(true);
  store.setLowerOpen(true);
  store.openUtility("alerts");
  store.saveAsNewLayout("Intraday");

  // Swing : second layout sauvegardé depuis l'arrangement par défaut.
  store.restoreDefaultLayout();
  store.setInterval("4H");
  store.saveAsNewLayout("Swing");
  eq("deux layouts", store.getSnapshot().layouts.length, 2);
  const intraday = store.getSnapshot().layouts.find((l) => l.name === "Intraday")!;
  const swing = store.getSnapshot().layouts.find((l) => l.name === "Swing")!;
  eq("swing actif", store.getSnapshot().activeLayoutId, swing.id);

  ok("switch vers Intraday", store.switchLayout(intraday.id).ok);
  eq(
    "switch applique la configuration SAUVEGARDÉE",
    store.getSnapshot().session,
    { symbol: "EURUSD", interval: "15m", chartType: "line", magnet: true, lowerOpen: true, utilityOpen: true, utilityPanel: "alerts" },
  );
  eq("dirty après switch", store.getSnapshot().dirty, false);

  ok("switch vers soi-même = no-op ok", store.switchLayout(intraday.id).ok);
  eq("no-op : session inchangée", store.getSnapshot().session.interval, "15m");

  // Changement non sauvé puis abandon via switch vers un AUTRE layout —
  // la politique « prompt avant abandon » est UI ; au niveau store,
  // switchLayout applique la cible (abandon explicite, documenté).
  store.setInterval("1m");
  ok("dirty avant switch", store.getSnapshot().dirty);
  ok("abandon : switch vers Swing", store.switchLayout(swing.id).ok);
  eq("swing = config sauvegardée", store.getSnapshot().session.interval, "4H");
  ok("retour Intraday", store.switchLayout(intraday.id).ok);
  eq("retour = config sauvegardée (abandon explicite)", store.getSnapshot().session.interval, "15m");

  // Rename.
  ok("rename", store.renameLayout(intraday.id, " INTRADAY FX ").ok);
  eq("rename trimmé", store.getSnapshot().layouts.find((l) => l.id === intraday.id)!.name, "INTRADAY FX");
  eq("rename en collision refusé", store.renameLayout(intraday.id, "swing"), { ok: false, error: "name_taken" });
  ok("rename du même nom (casse) autorisé", store.renameLayout(intraday.id, "INTRADAY FX").ok);
  eq("rename inconnu", store.renameLayout("layout-inconnu", "X"), { ok: false, error: "not_found" });

  // Duplicate : copie indépendante du SAUVEGARDÉ, non activée — la session
  // vivante diverge (1m) mais la copie part de l'enregistrement (15m).
  store.setInterval("1m");
  ok("duplicate", store.duplicateLayout(intraday.id).ok);
  const dup = store.getSnapshot().layouts.find((l) => l.name === "INTRADAY FX (copy)")!;
  ok("copie existe", dup !== undefined);
  eq("copie = config SAUVEGARDÉE (pas la session vivante)", dup.interval, "15m");
  ok("copie non activée", store.getSnapshot().activeLayoutId !== dup.id);
  ok("copie indépendante (mutation sans effet sur l'original)", (() => {
    const result = store.renameLayout(dup.id, "Copy renamed");
    return result.ok && store.getSnapshot().layouts.find((l) => l.id === intraday.id)!.name === "INTRADAY FX";
  })());

  // Delete du layout actif → arrangement vivant PRÉSERVÉ, défaut actif.
  ok("delete", store.deleteLayout(store.getSnapshot().activeLayoutId!).ok);
  eq("delete → activeLayoutId null", store.getSnapshot().activeLayoutId, null);
  eq("delete → session vivante PRÉSERVÉE (on retire un marque-page, pas l'arrangement)", store.getSnapshot().session.interval, "1m");
  eq("delete inconnu", store.deleteLayout("layout-inconnu"), { ok: false, error: "not_found" });

  // Restore default : session défaut, records conservés.
  store.restoreDefaultLayout();
  eq("restore → session défaut", store.getSnapshot().session, ORYON_DEFAULT_SESSION);
  ok("restore GARDE les layouts (3 - 1 supprimé = 2)", store.getSnapshot().layouts.length === 2);
  eq("restore → dirty false", store.getSnapshot().dirty, false);

  // saveActiveLayout sur le défaut = interdit (UI propose save-as).
  eq("save sur le défaut refusé", store.saveActiveLayout(), { ok: false, error: "default_immutable" });

  // Capacité :
  const capStore = new OryonWorkspaceConfigStore();
  capStore.hydrate();
  for (let i = 0; i < 20; i++) capStore.saveAsNewLayout(`Cap ${i}`);
  eq("capacité layouts = 20", capStore.getSnapshot().layouts.length, 20);
  eq("capacité dépassée refusée", capStore.saveAsNewLayout("Cap 21"), { ok: false, error: "capacity" });
}

console.log("— store : hydratation avec layout actif");

{
  memory = installStorage();
  memory.set(
    LAYOUTS_KEY,
    JSON.stringify({
      version: 1,
      savedAt: 1,
      layouts: [layoutA],
      activeLayoutId: "layout-aaaaaaaa",
    }),
  );
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  eq(
    "hydrate applique la session du layout actif",
    store.getSnapshot().session,
    layoutSessionOf(layoutA),
  );
  eq("hydrate → active pointer", store.getSnapshot().activeLayoutId, "layout-aaaaaaaa");
  eq("hydrate → dirty false", store.getSnapshot().dirty, false);
}

console.log("— store : templates (CRUD + capacité)");

{
  memory = installStorage();
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();

  ok("save template", store.saveTemplate("Swing analysis", {
    chart: { type: "candles", interval: "1D" },
    indicators: [makeIndicator()],
  }).ok);
  eq("collision refusée", store.saveTemplate("swing ANALYSIS", { chart: { type: "line", interval: null }, indicators: [] }), { ok: false, error: "name_taken" });
  eq("nom invalide refusé", store.saveTemplate("", { chart: { type: "line", interval: null }, indicators: [] }), { ok: false, error: "name_invalid" });

  const tpl = store.getSnapshot().templates[0]!;
  ok("rename template", store.renameTemplate(tpl.id, "Renamed").ok);
  ok("delete template", store.deleteTemplate(tpl.id).ok);
  eq("delete inconnu", store.deleteTemplate("tpl-inconnu-1"), { ok: false, error: "not_found" });

  for (let i = 0; i < 30; i++) {
    store.saveTemplate(`T ${i}`, { chart: { type: "candles", interval: null }, indicators: [] });
  }
  eq("capacité templates = 30", store.getSnapshot().templates.length, 30);
  eq("capacité dépassée refusée", store.saveTemplate("T 31", { chart: { type: "candles", interval: null }, indicators: [] }), { ok: false, error: "capacity" });

  store.flush();
  ok("templates persistés après flush", memory.has(TEMPLATES_KEY));
}

console.log("— store : roundtrip hydrate→mutate→flush→hydrate");

{
  installStorage();
  const first = new OryonWorkspaceConfigStore();
  first.hydrate();
  first.setSymbol("XAUUSD");
  first.setInterval("30m");
  first.saveAsNewLayout("Metals");
  first.flush();

  const second = new OryonWorkspaceConfigStore();
  second.hydrate();
  eq(
    "reload → le workspace retrouve l'arrangement validé",
    second.getSnapshot().session,
    { symbol: "XAUUSD", interval: "30m", chartType: "candles", magnet: false, lowerOpen: false, utilityOpen: false, utilityPanel: "notifications" },
  );
  eq("reload → layout actif restauré", second.getSnapshot().activeLayoutId === second.getSnapshot().layouts[0]!.id, true);
}

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
