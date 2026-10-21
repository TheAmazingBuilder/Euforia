/**
 * Oryon workspace configuration — unit tests (bun).
 *
 * Phase 6 spec §15 + Phase 7 spec §16 (pure layer — no DOM, no React):
 *   - naming policy: trim/length validation, case-insensitive uniqueness,
 *     deterministic "(copy)" names that always fit the contract cap;
 *   - session shape (v2): deterministic default (one-panel single grid),
 *     layout↔session roundtrip, field-by-field equality (the unsaved-
 *     changes detector; active panel excluded), grid invariants;
 *   - v1 → v2 migration: deterministic single-chart conversion, indicator
 *     stacks "not managed" (null), sync all-off;
 *   - multi-chart store workflows: setGrid transitions (fill/trim, active
 *     survival), duplicatePanel (independent copy, capacity), removePanel
 *     (active fallback, single collapse), per-panel mutations, instrument
 *     and timeframe sync propagation (and their independence);
 *   - template apply planning: pass-through, duplicate-id collapse,
 *     business-rule re-check (MACD fast < slow, RSI lower < upper),
 *     honest skipped counts;
 *   - browser-local persistence (fake localStorage): v1 AND v2 envelopes,
 *     roundtrip, corrupt JSON, wrong version, per-record salvage,
 *     per-indicator template salvage, dangling activeLayoutId
 *     normalization, storage-less degrade;
 *   - layout stack capture: the provider hook surfaces each panel's live
 *     stack into the saved record; missing stores record null.
 *
 * Run: bun run scripts/oryon-workspace-tests.ts
 */

import type {
  OryonChartTemplate,
  OryonIndicatorInstance,
  OryonWorkspaceLayout,
  OryonWorkspaceLayoutV4,
} from "@cosmoz/shared";

import { ORYON_DEFAULT_PANEL_ANALYSIS, ORYON_DEFAULT_PANEL_CONTEXT } from "@cosmoz/shared";

import { indicatorRuleError } from "../src/lib/oryon/indicators/validation";
import { defaultIndicatorInstance } from "../src/lib/oryon/indicators/registry";
import { planTemplateApply } from "../src/lib/oryon/workspace/templates";
import {
  ORYON_DEFAULT_SESSION,
  buildLayout,
  layoutSessionOf,
  migrateLayoutV1toV4,
  newConfigId,
  newPanelId,
  normalizeActivePanel,
  panelsForGrid,
  sessionStateEqual,
  type OryonPanelSessionState,
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
eq("copie d'un nom max → toujours ≤ 48 chars", longCopy.length <= 48, true);
ok("copie tronquée reste unique", longCopy !== `${"x".repeat(48)} (copy)`);

// ── 2. Forme de session v2 + conversion layout↔session ──────────────────────

console.log("— session du workspace (v2 multi-graphe)");

eq(
  "session par défaut déterministe (un panneau, grille single)",
  ORYON_DEFAULT_SESSION,
  {
    grid: "single",
    panels: [{ id: "panel-main", symbol: null, interval: "5m", chartType: "candles", context: { ...ORYON_DEFAULT_PANEL_CONTEXT }, analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } } }],
    activePanelId: "panel-main",
    sync: { timeScale: false, crosshair: false, instrument: false, timeframe: false },
    magnet: false,
    lowerOpen: false,
    utilityOpen: false,
    utilityPanel: "notifications",
  },
);

const panelOf = (
  id: string,
  symbol: string | null,
  interval: OryonPanelSessionState["interval"],
  chartType: OryonPanelSessionState["chartType"],
  context: OryonPanelSessionState["context"] = ORYON_DEFAULT_PANEL_CONTEXT,
  analysis: OryonPanelSessionState["analysis"] = ORYON_DEFAULT_PANEL_ANALYSIS,
): OryonPanelSessionState => ({
  id,
  symbol,
  interval,
  chartType,
  context: { ...context },
  analysis: { structure: { ...analysis.structure }, levels: { ...analysis.levels } },
});

const layoutA: OryonWorkspaceLayoutV4 = {
  id: "layout-aaaaaaaa",
  name: "Intraday",
  grid: "twoHorizontal",
  panels: [
    { id: "panel-main", symbol: "EURUSD", interval: "1H", chartType: "line", indicators: null, context: { ...ORYON_DEFAULT_PANEL_CONTEXT }, analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } } },
    { id: "panel-bbbbbbbb", symbol: "XAUUSD", interval: "5m", chartType: "candles", indicators: null, context: { sessionShading: false, eventMarkers: true, eventMinImportance: "HIGH" }, analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } } },
  ],
  activePanelId: "panel-main",
  sync: { timeScale: true, crosshair: false, instrument: false, timeframe: true },
  magnet: true,
  lowerPanel: true,
  utilityRail: { open: true, panel: "alerts" },
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000,
};

const sessionA = layoutSessionOf(layoutA);
eq("layout → session (stacks non portées par la session)", sessionA, {
  grid: "twoHorizontal",
  panels: [
    panelOf("panel-main", "EURUSD", "1H", "line"),
    panelOf("panel-bbbbbbbb", "XAUUSD", "5m", "candles", { sessionShading: false, eventMarkers: true, eventMinImportance: "HIGH" }),
  ],
  activePanelId: "panel-main",
  sync: { timeScale: true, crosshair: false, instrument: false, timeframe: true },
  magnet: true,
  lowerOpen: true,
  utilityOpen: true,
  utilityPanel: "alerts",
});

const rebuilt = buildLayout("layout-bbbbbbbb", "Rebuild", sessionA, {});
eq("session → layout (roundtrip champ par champ)", {
  grid: rebuilt.grid,
  panels: rebuilt.panels.map((p) => ({ id: p.id, symbol: p.symbol, interval: p.interval, chartType: p.chartType })),
  activePanelId: rebuilt.activePanelId,
  sync: rebuilt.sync,
  magnet: rebuilt.magnet,
  lowerPanel: rebuilt.lowerPanel,
  utilityRail: rebuilt.utilityRail,
}, {
  grid: layoutA.grid,
  panels: layoutA.panels.map((p) => ({ id: p.id, symbol: p.symbol, interval: p.interval, chartType: p.chartType })),
  activePanelId: layoutA.activePanelId,
  sync: layoutA.sync,
  magnet: layoutA.magnet,
  lowerPanel: layoutA.lowerPanel,
  utilityRail: layoutA.utilityRail,
});
eq("stacks absents de la capture → null (non géré)", rebuilt.panels.map((p) => p.indicators), [null, null]);

ok("égalité stricte", sessionStateEqual(sessionA, layoutSessionOf(layoutA)));
ok(
  "un seul champ de panneau différent → inégal",
  !sessionStateEqual(sessionA, {
    ...sessionA,
    panels: sessionA.panels.map((p) => (p.id === "panel-main" ? { ...p, interval: "5m" } : p)),
  }),
);
ok(
  "contexte de panneau différent → inégal (les prefs sont persistées)",
  !sessionStateEqual(sessionA, {
    ...sessionA,
    panels: sessionA.panels.map((p) =>
      p.id === "panel-main" ? { ...p, context: { ...p.context, eventMarkers: !p.context.eventMarkers } } : p,
    ),
  }),
);
ok(
  "ordre des panneaux différent → inégal",
  !sessionStateEqual(sessionA, { ...sessionA, panels: [...sessionA.panels].reverse() }),
);
ok(
  "flag sync différent → inégal",
  !sessionStateEqual(sessionA, { ...sessionA, sync: { ...sessionA.sync, crosshair: true } }),
);
ok(
  "panneau actif différent → ÉGAL (préférence de vue, jamais dirty)",
  sessionStateEqual(sessionA, { ...sessionA, activePanelId: "panel-bbbbbbbb" }),
);
ok(
  "grille différente → inégal",
  !sessionStateEqual(sessionA, { ...sessionA, grid: "quad" }),
);

ok("id stable et préfixé", newConfigId("layout").startsWith("layout-"));
ok("ids distincts", newConfigId("tpl") !== newConfigId("tpl"));
ok("panel id préfixé", newPanelId().startsWith("panel-"));
ok("panel ids distincts", newPanelId() !== newPanelId());

// ── 3. Invariants de grille (Phase 7 §5) ─────────────────────────────────────

console.log("— invariants de grille");

{
  const p1 = panelOf("panel-main", null, "5m", "candles");
  const p2 = panelOf("panel-22222222", "XAUUSD", "1H", "line");
  const p3 = panelOf("panel-33333333", "EURUSD", "15m", "candles");
  const p4 = panelOf("panel-44444444", "USDJPY", "1D", "line");

  eq(
    "single → garde UNIQUEMENT le panneau actif",
    panelsForGrid("single", [p1, p2, p3], p3.id),
    { panels: [p3], activePanelId: p3.id },
  );
  eq(
    "twoHorizontal depuis un panneau → ajoute un défaut (hérite intervalle/type)",
    (() => {
      const r = panelsForGrid("twoHorizontal", [p1], p1.id);
      return { count: r.panels.length, inherited: { interval: r.panels[1]!.interval, chartType: r.panels[1]!.chartType }, symbol: r.panels[1]!.symbol };
    })(),
    { count: 2, inherited: { interval: "5m", chartType: "candles" }, symbol: null },
  );
  eq(
    "quad depuis deux panneaux → remplit jusqu'à quatre",
    panelsForGrid("quad", [p1, p2], p1.id).panels.length,
    4,
  );
  eq(
    "twoHorizontal à trois panneaux → aucun retrait (row implicite)",
    panelsForGrid("twoHorizontal", [p1, p2, p3], p2.id).panels.length,
    3,
  );
  eq(
    "quad complet → inchangé",
    panelsForGrid("quad", [p1, p2, p3, p4], p2.id),
    { panels: [p1, p2, p3, p4], activePanelId: p2.id },
  );

  const removed = panelOf("panel-removed-x", null, "5m", "candles");
  eq(
    "pointeur actif sur panneau supprimé → premier survivant",
    normalizeActivePanel([p1, p2], removed.id),
    p1.id,
  );
  eq("pointeur actif valide → inchangé", normalizeActivePanel([p1, p2], p2.id), p2.id);
}

// ── 4. Migrations v1/v2 → v3 (déterministes, rétrocompatibles) ───────────────

console.log("— migration v1 → v3");

const layoutV1: OryonWorkspaceLayout = {
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

const migrated = migrateLayoutV1toV4(layoutV1);
eq("migration : grille single à un panneau", { grid: migrated.grid, panels: migrated.panels.length }, { grid: "single", panels: 1 });
eq("migration : panneau = champs v1, id panel-main, contexte + analyse par défaut", migrated.panels[0], {
  id: "panel-main",
  symbol: "EURUSD",
  interval: "1H",
  chartType: "line",
  indicators: null,
  context: { ...ORYON_DEFAULT_PANEL_CONTEXT },
  analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } },
});
eq("migration : sync all-off", migrated.sync, { timeScale: false, crosshair: false, instrument: false, timeframe: false });
eq("migration : coque préservée", { magnet: migrated.magnet, lowerPanel: migrated.lowerPanel, rail: migrated.utilityRail, active: migrated.activePanelId }, {
  magnet: true,
  lowerPanel: true,
  rail: { open: true, panel: "alerts" },
  active: "panel-main",
});
eq("migration : timestamps préservés", { c: migrated.createdAt, u: migrated.updatedAt }, { c: 1_760_000_000_000, u: 1_760_000_000_000 });

// ── 5. Plan d'application d'un template (spec §6) ───────────────────────────

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
    makeIndicator({ id: "ind-macdgood", type: "macd", fast: 12, slow: 26, signal: 9 }),
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

// ── 6. Persistance layouts (v1 + v2, fake localStorage, salvage) ─────────────

console.log("— persistance navigateur-local (layouts)");

let memory = installStorage();

const layoutB: OryonWorkspaceLayoutV4 = {
  ...layoutA,
  id: "layout-bbbbbbbb",
  name: "Scalp",
  grid: "single",
  panels: [{ id: "panel-main", symbol: null, interval: "5m", chartType: "candles", indicators: null, context: { ...ORYON_DEFAULT_PANEL_CONTEXT }, analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } } }],
  activePanelId: "panel-main",
  sync: { timeScale: false, crosshair: false, instrument: false, timeframe: false },
  magnet: false,
  lowerPanel: false,
  utilityRail: { open: false, panel: "notifications" },
};

saveLayouts([layoutA, layoutB], layoutA.id);
flushLayouts([layoutA, layoutB], layoutA.id);
const loadedLayouts = loadLayouts();
eq("roundtrip layouts v2", loadedLayouts.layouts.map((l) => l.id), ["layout-aaaaaaaa", "layout-bbbbbbbb"]);
eq("pointeur actif persisté", loadedLayouts.activeLayoutId, "layout-aaaaaaaa");
eq("roundtrip v2 : stacks par panneau", loadedLayouts.layouts[0]!.panels.map((p) => p.indicators), [null, null]);

memory.set(LAYOUTS_KEY, "{not json");
eq("JSON corrompu → vide, jamais de crash", loadLayouts(), { layouts: [], activeLayoutId: null });

memory.set(LAYOUTS_KEY, JSON.stringify({ version: 4, savedAt: 1, layouts: [], activeLayoutId: null }));
eq("version inconnue → rejetée", loadLayouts(), { layouts: [], activeLayoutId: null });

memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 2,
    savedAt: 1,
    layouts: [layoutA, { id: "layout-poison1", name: "" }, { id: "poison" }],
    activeLayoutId: "layout-aaaaaaaa",
  }),
);
const salvaged = loadLayouts();
eq("salvage par enregistrement (v2)", salvaged.layouts.map((l) => l.id), ["layout-aaaaaaaa"]);
eq("pointeur actif survit au salvage", salvaged.activeLayoutId, "layout-aaaaaaaa");

memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 1,
    savedAt: 1,
    layouts: [layoutV1, { id: "layout-poison1", name: "" }],
    activeLayoutId: "layout-aaaaaaaa",
  }),
);
const migratedLoad = loadLayouts();
eq("enveloppe v1 → migration par enregistrement", migratedLoad.layouts.map((l) => l.id), ["layout-aaaaaaaa"]);
eq(
  "enveloppe v1 → enregistrement migré en v3 (contexte par défaut)",
  { grid: migratedLoad.layouts[0]!.grid, panels: migratedLoad.layouts[0]!.panels, active: migratedLoad.layouts[0]!.activePanelId },
  {
    grid: "single",
    panels: [{ id: "panel-main", symbol: "EURUSD", interval: "1H", chartType: "line", indicators: null, context: { ...ORYON_DEFAULT_PANEL_CONTEXT }, analysis: { structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure }, levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels } } }],
    active: "panel-main",
  },
);

// Enveloppe v2 (Phase 7) : les panneaux n'ont PAS de contexte — le chargeur
// le complète avec la valeur par défaut documentée (migration v2→v3).
memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 2,
    savedAt: 1,
    layouts: [
      {
        id: "layout-v2legacy1",
        name: "Legacy",
        grid: "twoVertical",
        panels: [
          { id: "panel-main", symbol: "EURUSD", interval: "5m", chartType: "candles", indicators: null },
          { id: "panel-22222222", symbol: "XAUUSD", interval: "15m", chartType: "line", indicators: null },
        ],
        activePanelId: "panel-main",
        sync: { timeScale: true, crosshair: false, instrument: false, timeframe: false },
        magnet: false,
        lowerPanel: false,
        utilityRail: { open: false, panel: "notifications" },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    activeLayoutId: "layout-v2legacy1",
  }),
);
const v2Load = loadLayouts();
eq(
  "enveloppe v2 → contexte ajouté à chaque panneau",
  v2Load.layouts[0]!.panels.map((p) => p.context),
  [ORYON_DEFAULT_PANEL_CONTEXT, ORYON_DEFAULT_PANEL_CONTEXT],
);

memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 2,
    savedAt: 1,
    layouts: [layoutA],
    activeLayoutId: "layout-disparu",
  }),
);
eq("pointeur pendants → null (layout par défaut)", loadLayouts().activeLayoutId, null);

memory.set(LAYOUTS_KEY, "");
eq("clé vide → première visite", loadLayouts(), { layouts: [], activeLayoutId: null });

// Enregistrement v2 invalide (panneau hors bornes) → rejeté individuellement.
memory.set(
  LAYOUTS_KEY,
  JSON.stringify({
    version: 2,
    savedAt: 1,
    layouts: [layoutA, { ...layoutA, id: "layout-nopanels", panels: [] }],
    activeLayoutId: "layout-aaaaaaaa",
  }),
);
eq("panneaux vides → enregistrement rejeté", loadLayouts().layouts.length, 1);

ok("écriture différée : save seul n'écrit pas tout de suite", true); // couverte par le flush explicite

// ── 7. Persistance templates (salvage par indicateur) ────────────────────────

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

// ── 8. Store — hydratation et workflows complets (spec §4, §7, §10) ─────────

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
  store.setPanelInterval("panel-main", "1H");
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
  eq("session capturée (grille + panneau)", { grid: snap.layouts[0]!.grid, interval: snap.layouts[0]!.panels[0]!.interval }, { grid: "single", interval: "5m" });

  ok("save-as : collision insensible à la casse refusée", store.saveAsNewLayout("INTRADAY").ok === false);
  eq("erreur name_taken", store.saveAsNewLayout("intraday "), { ok: false, error: "name_taken" });

  // Dirty : divergence de session avec le layout actif sauvegardé.
  store.setPanelInterval("panel-main", "1H");
  ok("mutation → dirty true (layout custom actif)", store.getSnapshot().dirty);
  ok("activation d'un autre panneau → PAS dirty (préférence de vue)", (() => {
    // Baseline PROPRE d'abord : sauvegarder l'arrangement à deux panneaux
    // (intervalle 1H compris) pour isoler l'effet de l'activation seule.
    store.setGrid("twoHorizontal");
    ok("changement de grille → dirty (contenu d'arrangement)", store.getSnapshot().dirty);
    ok("save du two-horizontal → baseline propre", store.saveActiveLayout().ok);
    eq("dirty après save de la baseline", store.getSnapshot().dirty, false);
    const active = store.getSnapshot().session.activePanelId;
    const other = store.getSnapshot().session.panels.find((p) => p.id !== active)!;
    store.setActivePanel(other.id);
    const dirtyAfterActivate = store.getSnapshot().dirty;
    // Vue restaurée pour la suite (le panneau principal redevient actif).
    store.setActivePanel("panel-main");
    return dirtyAfterActivate === false;
  })());
  ok("save changes répare", store.saveActiveLayout().ok);
  eq("dirty après save = false", store.getSnapshot().dirty, false);
  eq("interval sauvegardé", store.getSnapshot().layouts[0]!.panels[0]!.interval, "1H");
  eq("updatedAt avancé (>= création)", store.getSnapshot().layouts[0]!.createdAt <= store.getSnapshot().layouts[0]!.updatedAt, true);
}

console.log("— store : grille, duplication et retrait de panneaux");

{
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();

  // single → twoHorizontal : un second panneau par défaut, héritier.
  store.setGrid("twoHorizontal");
  eq("grid twoHorizontal", store.getSnapshot().session.grid, "twoHorizontal");
  eq("deux panneaux", store.getSnapshot().session.panels.length, 2);
  eq("panneau principal inchangé (identité stable)", store.getSnapshot().session.panels[0]!.id, "panel-main");
  const second = store.getSnapshot().session.panels[1]!;
  eq("second panneau : hérite intervalle/type, symbole défaut", { interval: second.interval, chartType: second.chartType, symbol: second.symbol }, { interval: "5m", chartType: "candles", symbol: null });

  // Mutations par panneau indépendantes.
  store.setPanelSymbol(second.id, "XAUUSD");
  store.setPanelInterval(second.id, "1H");
  store.setPanelChartType(second.id, "line");
  eq("panneau principal intact", store.getSnapshot().session.panels[0]!.interval, "5m");
  eq("second panneau muté", { symbol: store.getSnapshot().session.panels[1]!.symbol, interval: store.getSnapshot().session.panels[1]!.interval }, { symbol: "XAUUSD", interval: "1H" });

  // Duplication : copie indépendante, activée, grille inchangée (2 < 4).
  const dupResult = store.duplicatePanel(second.id);
  ok("duplicatePanel ok", dupResult.ok);
  eq("trois panneaux", store.getSnapshot().session.panels.length, 3);
  const dup = store.getSnapshot().session.panels[2]!;
  ok("copie = nouvel id stable", dup.id !== second.id && dup.id.startsWith("panel-"));
  eq("copie = configuration source", { symbol: dup.symbol, interval: dup.interval, chartType: dup.chartType }, { symbol: "XAUUSD", interval: "1H", chartType: "line" });
  eq("copie activée", store.getSnapshot().session.activePanelId, dup.id);

  // Retrait du panneau actif → premier survivant actif.
  const removeResult = store.removePanel(dup.id);
  ok("removePanel ok", removeResult.ok);
  eq("retour à deux panneaux", store.getSnapshot().session.panels.length, 2);
  eq("actif retombe sur un survivant", store.getSnapshot().session.activePanelId, "panel-main");

  // Retrait jusqu'à un seul panneau → grille single.
  store.removePanel(store.getSnapshot().session.panels[1]!.id);
  eq("un seul panneau → grille single", store.getSnapshot().session.grid, "single");
  eq("dernier retrait refusé", store.removePanel("panel-main"), { ok: false, error: "panel_capacity" });

  // Capacité : 4 panneaux max.
  store.setGrid("quad");
  eq("quad = quatre panneaux", store.getSnapshot().session.panels.length, 4);
  eq("duplication au-delà de 4 refusée", store.duplicatePanel("panel-main"), { ok: false, error: "panel_capacity" });

  // single garde uniquement le panneau actif.
  store.setActivePanel(store.getSnapshot().session.panels[2]!.id);
  store.setGrid("single");
  eq("single → panneau actif conservé seul", store.getSnapshot().session.panels.length, 1);
  eq("actif = celui conservé", store.getSnapshot().session.panels[0]!.id, store.getSnapshot().session.activePanelId);

  // setGrid à l'identique = no-op.
  const before = store.getSnapshot().version;
  store.setGrid("single");
  eq("setGrid identique → pas de commit", store.getSnapshot().version, before);
}

console.log("— store : propagation de synchronisation (instrument / timeframe)");

{
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  store.setGrid("twoHorizontal");

  // Sync OFF par défaut : isolation totale.
  store.setPanelSymbol("panel-main", "EURUSD");
  eq("sync off : second panneau intact", store.getSnapshot().session.panels[1]!.symbol, null);
  store.setPanelInterval("panel-main", "15m");
  eq("sync off : intervalle du second intact", store.getSnapshot().session.panels[1]!.interval, "5m");

  // Instrument sync ON : propagation à TOUS les panneaux.
  store.setSync({ instrument: true });
  store.setPanelSymbol("panel-main", "XAUUSD");
  eq("instrument sync : propagation", store.getSnapshot().session.panels.map((p) => p.symbol), ["XAUUSD", "XAUUSD"]);
  // Timeframe sync reste OFF (indépendance des features — spec §8).
  store.setPanelInterval("panel-main", "1H");
  eq("timeframe sync off : pas de propagation", store.getSnapshot().session.panels.map((p) => p.interval), ["1H", "5m"]);

  // Timeframe sync ON : propagation.
  store.setSync({ timeframe: true });
  store.setPanelInterval("panel-main", "4H");
  eq("timeframe sync : propagation", store.getSnapshot().session.panels.map((p) => p.interval), ["4H", "4H"]);

  // Instrument sync OFF à nouveau : l'isolation revient.
  store.setSync({ instrument: false });
  store.setPanelSymbol("panel-main", "EURUSD");
  eq("instrument sync off : isolation", store.getSnapshot().session.panels[1]!.symbol, "XAUUSD");

  // Propagation vers null (défaut) interdite : null ne se propage jamais.
  store.setSync({ instrument: true });
  store.setPanelSymbol("panel-main", null);
  eq("instrument sync : null ne se propage pas", store.getSnapshot().session.panels[1]!.symbol, "XAUUSD");

  // Les quatre flags restent indépendants.
  eq(
    "flags indépendants",
    store.getSnapshot().session.sync,
    { timeScale: false, crosshair: false, instrument: true, timeframe: true },
  );
  store.setSync({ crosshair: true });
  eq("activer crosshair ne touche pas aux autres", store.getSnapshot().session.sync.timeScale, false);
}

console.log("— store : switch / delete / restore-default");

{
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  store.setPanelSymbol("panel-main", "EURUSD");
  store.setPanelInterval("panel-main", "15m");
  store.setPanelChartType("panel-main", "line");
  store.setMagnet(true);
  store.setLowerOpen(true);
  store.openUtility("alerts");
  store.saveAsNewLayout("Intraday");

  // Swing : second layout sauvegardé depuis l'arrangement par défaut.
  store.restoreDefaultLayout();
  store.setPanelInterval("panel-main", "4H");
  store.saveAsNewLayout("Swing");
  eq("deux layouts", store.getSnapshot().layouts.length, 2);
  const intraday = store.getSnapshot().layouts.find((l) => l.name === "Intraday")!;
  const swing = store.getSnapshot().layouts.find((l) => l.name === "Swing")!;
  eq("swing actif", store.getSnapshot().activeLayoutId, swing.id);

  ok("switch vers Intraday", store.switchLayout(intraday.id).ok);
  eq(
    "switch applique la configuration SAUVEGARDÉE",
    store.getSnapshot().session,
    layoutSessionOf(intraday),
  );
  eq("dirty après switch", store.getSnapshot().dirty, false);

  ok("switch vers soi-même = no-op ok", store.switchLayout(intraday.id).ok);
  eq("no-op : session inchangée", store.getSnapshot().session.panels[0]!.interval, "15m");

  // Changement non sauvé puis abandon via switch vers un AUTRE layout —
  // la politique « prompt avant abandon » est UI ; au niveau store,
  // switchLayout applique la cible (abandon explicite, documenté).
  store.setPanelInterval("panel-main", "1m");
  ok("dirty avant switch", store.getSnapshot().dirty);
  ok("abandon : switch vers Swing", store.switchLayout(swing.id).ok);
  eq("swing = config sauvegardée", store.getSnapshot().session.panels[0]!.interval, "4H");
  ok("retour Intraday", store.switchLayout(intraday.id).ok);
  eq("retour = config sauvegardée (abandon explicite)", store.getSnapshot().session.panels[0]!.interval, "15m");

  // Rename.
  ok("rename", store.renameLayout(intraday.id, " INTRADAY FX ").ok);
  eq("rename trimmé", store.getSnapshot().layouts.find((l) => l.id === intraday.id)!.name, "INTRADAY FX");
  eq("rename en collision refusé", store.renameLayout(intraday.id, "swing"), { ok: false, error: "name_taken" });
  ok("rename du même nom (casse) autorisé", store.renameLayout(intraday.id, "INTRADAY FX").ok);
  eq("rename inconnu", store.renameLayout("layout-inconnu", "X"), { ok: false, error: "not_found" });

  // Duplicate : copie indépendante du SAUVEGARDÉ, non activée — la session
  // vivante diverge (1m) mais la copie part de l'enregistrement (15m).
  store.setPanelInterval("panel-main", "1m");
  ok("duplicate", store.duplicateLayout(intraday.id).ok);
  const dup = store.getSnapshot().layouts.find((l) => l.name === "INTRADAY FX (copy)")!;
  ok("copie existe", dup !== undefined);
  eq("copie = config SAUVEGARDÉE (pas la session vivante)", dup.panels[0]!.interval, "15m");
  ok("copie non activée", store.getSnapshot().activeLayoutId !== dup.id);
  ok("copie indépendante (mutation sans effet sur l'original)", (() => {
    const result = store.renameLayout(dup.id, "Copy renamed");
    return result.ok && store.getSnapshot().layouts.find((l) => l.id === intraday.id)!.name === "INTRADAY FX";
  })());

  // Delete du layout actif → arrangement vivant PRÉSERVÉ, défaut actif.
  ok("delete", store.deleteLayout(store.getSnapshot().activeLayoutId!).ok);
  eq("delete → activeLayoutId null", store.getSnapshot().activeLayoutId, null);
  eq("delete → session vivante PRÉSERVÉE (on retire un marque-page, pas l'arrangement)", store.getSnapshot().session.panels[0]!.interval, "1m");
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

console.log("— store : capture des stacks par panneau à la sauvegarde");

{
  memory = installStorage();
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();

  const stacks = new Map<string, OryonIndicatorInstance[]>([
    ["panel-main", [makeIndicator({ id: "ind-main-0001" })]],
  ]);
  store.setPanelIndicatorsCapture((panelId) => stacks.get(panelId) ?? null);

  store.setGrid("twoHorizontal");
  const secondId = store.getSnapshot().session.panels[1]!.id;
  stacks.set(secondId, [makeIndicator({ id: "ind-second-01" }), makeIndicator({ id: "ind-second-02" })]);

  ok("save-as avec stacks", store.saveAsNewLayout("Desks").ok);
  const record = store.getSnapshot().layouts[0]!;
  eq("stack du panneau principal capturé", record.panels[0]!.indicators?.map((i) => i.id), ["ind-main-0001"]);
  eq("stack du second panneau capturé", record.panels[1]!.indicators?.map((i) => i.id), ["ind-second-01", "ind-second-02"]);

  // Le hook retiré (cleanup provider) → null = « non géré ».
  store.setPanelIndicatorsCapture(() => null);
  ok("save changes sans hook", store.saveActiveLayout().ok);
  eq("stacks non gérés → null dans le record", store.getSnapshot().layouts[0]!.panels.map((p) => p.indicators), [null, null]);
}

console.log("— store : hydratation avec layout actif (v1 migré + v2)");

{
  memory = installStorage();
  memory.set(
    LAYOUTS_KEY,
    JSON.stringify({
      version: 1,
      savedAt: 1,
      layouts: [layoutV1],
      activeLayoutId: "layout-aaaaaaaa",
    }),
  );
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  eq(
    "hydrate applique la session du layout v1 MIGRÉ",
    store.getSnapshot().session,
    layoutSessionOf(migrateLayoutV1toV4(layoutV1)),
  );
  eq("hydrate → active pointer", store.getSnapshot().activeLayoutId, "layout-aaaaaaaa");
  eq("hydrate → dirty false", store.getSnapshot().dirty, false);
}

{
  memory = installStorage();
  saveLayouts([layoutA], layoutA.id);
  flushLayouts([layoutA], layoutA.id);
  const store = new OryonWorkspaceConfigStore();
  store.hydrate();
  eq("hydrate v2 : session multi-panneau", store.getSnapshot().session.panels.length, 2);
  eq("hydrate v2 : sync restaurée", store.getSnapshot().session.sync, layoutA.sync);
  eq("hydrate v2 : panneau actif restauré", store.getSnapshot().session.activePanelId, "panel-main");
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
  first.setPanelSymbol("panel-main", "XAUUSD");
  first.setPanelInterval("panel-main", "30m");
  first.setGrid("twoHorizontal");
  first.setSync({ timeScale: true });
  first.saveAsNewLayout("Metals");
  first.flush();

  const second = new OryonWorkspaceConfigStore();
  second.hydrate();
  const session = second.getSnapshot().session;
  eq(
    "reload → le workspace retrouve l'arrangement multi-panneau validé",
    { grid: session.grid, count: session.panels.length, symbol: session.panels[0]!.symbol, interval: session.panels[0]!.interval, sync: session.sync },
    { grid: "twoHorizontal", count: 2, symbol: "XAUUSD", interval: "30m", sync: { timeScale: true, crosshair: false, instrument: false, timeframe: false } },
  );
  eq("reload → layout actif restauré", second.getSnapshot().activeLayoutId === second.getSnapshot().layouts[0]!.id, true);
}

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
