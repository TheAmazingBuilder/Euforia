/**
 * verify-oryon-phase9.js - Oryon Phase 9 (market structure & key levels).
 *
 * Contract under test:
 *  - STRUCTURE (§4/§6): per-panel enable + visibility toggles, confirmed
 *    pivots counted via the dev probe, provisional opt-in WIDENS the set
 *    monotonically, wick mode fires AT LEAST as often as close mode,
 *    toggles WITHOUT chart recreation (series/panes/viewport stability).
 *  - KEY LEVELS (§5/§6): PDH/PDL + PWH/PWL price lines from the SHARED 1D
 *    series (cumulative counts), open/close opt-in adds 2 more.
 *  - OPENING RANGE (§5.3): session-scoped asset classes only (crypto → 0
 *    boxes, honest), intraday gate (1D → 0 boxes), window never extends.
 *  - MULTI-CHART (§9.3): per-panel independence in a side-by-side grid.
 *  - PERSISTENCE (§9.2): v4 envelope on disk, save → default → restore
 *    round-trips the analysis config.
 *  - REGRESSIONS: Phase 8 context menu + session bands still work; P4
 *    positions panel opens; 0 console errors; desktop 1440 + mobile 390.
 *
 * Run: node scripts/verify-oryon-phase9.js  (DEV server on :3001 - debug
 * handles are dev-only by design; market service on :3003, mocked auth,
 * BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase9-probe.log");
fs.writeFileSync(LOG, `=== oryon phase9 probe - ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3001";

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
    fs.appendFileSync(LOG, `  PASS  ${label}\n`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
    fs.appendFileSync(LOG, `  FAIL  ${label}\n`);
  }
};

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "Download the React DevTools",
  "React does not recognize",
  "WebSocket",
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
  } catch {
    fs.appendFileSync(LOG, "signIn: no login form (already authed?)\n");
    return;
  }
  const demoButton = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
  } else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  try {
    await app.waitForSelector('[data-testid="login-mfa-code"]', { timeout: 15_000 });
  } catch {
    /* fall through */
  }
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
  await app.waitForSelector('a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
}

// ── Observers ────────────────────────────────────────────────────────────────

async function panels(app) {
  return app.evaluate(() => {
    const read = window.__ORYON_PANELS_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function waitForPanels(app, count, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await panels(app);
    if (Array.isArray(last) && last.length === count && last.every((p) => p.series >= 1)) {
      return last;
    }
    await app.waitForTimeout(250);
  }
  return last;
}

async function waitForPanelState(app, index, predicate, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await panels(app);
    const panel = Array.isArray(last) ? last[index] : null;
    if (panel && predicate(panel)) return panel;
    await app.waitForTimeout(250);
  }
  return Array.isArray(last) ? last[index] ?? null : null;
}

async function layoutsFile(app) {
  return app.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.layouts.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

// ── Interaction helpers ──────────────────────────────────────────────────────

const panelLoc = (app, i) => app.locator('[data-testid="oryon-panel"]').nth(i);

async function activatePanel(app, i) {
  await panelLoc(app, i).locator(`[data-testid="oryon-panel-${i}-identity"]`).click();
  await app.waitForTimeout(250);
}

async function setPanelSymbol(app, i, symbol, multi = false) {
  const prefix = multi ? `oryon-panel-${i}` : "oryon";
  if (multi) await activatePanel(app, i);
  await app.click(`[data-testid="${prefix}-instrument-trigger"]`);
  await app.waitForSelector(`[data-testid="${prefix}-instrument-search"]`, { timeout: 5_000 });
  await app.fill(`[data-testid="${prefix}-instrument-search"]`, symbol);
  await app.waitForTimeout(250);
  await app.click(`[data-testid="${prefix}-instrument-option-${symbol}"]`);
  await app.waitForTimeout(1_400);
}

async function setPanelInterval(app, i, interval, multi = false) {
  const prefix = multi ? `oryon-panel-${i}` : "oryon";
  if (multi) await activatePanel(app, i);
  await app.click(`[data-testid="${prefix}-timeframes"]`);
  await app.waitForTimeout(200);
  await app.click(`[data-testid="${prefix}-tf-${interval}"]`);
  await app.waitForTimeout(1_400);
}

/** Opens the panel's analysis menu; `act` receives the open menu. */
async function withAnalysisMenu(app, i, act) {
  await activatePanel(app, i);
  await app.click(`[data-testid="oryon-panel-${i}-analysis-menu"]`);
  await app.waitForTimeout(250);
  await act();
  await app.keyboard.press("Escape");
  await app.waitForTimeout(250);
}

async function analysisChecked(app, i, what) {
  let value = null;
  await withAnalysisMenu(app, i, async () => {
    value = await app
      .locator(`[data-testid="oryon-panel-${i}-analysis-${what}"]`)
      .first()
      .getAttribute("data-state");
  });
  return value === "checked";
}

async function toggleAnalysis(app, i, what) {
  await withAnalysisMenu(app, i, async () => {
    await app.click(`[data-testid="oryon-panel-${i}-analysis-${what}"]`);
    await app.waitForTimeout(300);
  });
}

async function pickAnalysisRadio(app, i, testid) {
  await withAnalysisMenu(app, i, async () => {
    await app.click(`[data-testid="oryon-panel-${i}-analysis-${testid}"]`);
    await app.waitForTimeout(300);
  });
}

async function setGrid(app, grid) {
  await app.click('[data-testid="oryon-grid-trigger"]');
  await app.waitForTimeout(200);
  await app.click(`[data-testid="oryon-grid-item-${grid}"]`);
  await app.waitForTimeout(600);
}

async function saveLayoutAs(app, name) {
  await app.click('[data-testid="oryon-layouts"]');
  await app.waitForTimeout(250);
  await app.click('[data-testid="oryon-layout-save-as"]');
  await app.waitForSelector('[data-testid="oryon-layout-name-input"]', { timeout: 5_000 });
  await app.fill('[data-testid="oryon-layout-name-input"]', name);
  await app.click('[data-testid="oryon-layout-name-submit"]');
  await app.waitForTimeout(700);
}

/** Switches to the saved layout whose NAME matches (resolves the id). */
async function switchLayout(app, name) {
  const file = await layoutsFile(app);
  const target = (file?.layouts ?? []).find((l) => l.name === name);
  if (!target) throw new Error(`layout introuvable: ${name}`);
  await app.click('[data-testid="oryon-layouts"]');
  await app.waitForTimeout(250);
  await app.click(`[data-testid="oryon-layout-item-${target.id}"]`);
  await app.waitForTimeout(900);
  await app.keyboard.press("Escape");
  await app.waitForTimeout(400);
}

async function switchDefaultLayout(app) {
  await app.click('[data-testid="oryon-layouts"]');
  await app.waitForTimeout(250);
  await app.click('[data-testid="oryon-layout-item-default"]');
  await app.waitForTimeout(900);
  await app.keyboard.press("Escape");
  await app.waitForTimeout(400);
}

// ── Main flow ────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  // ── Setup ────────────────────────────────────────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 40_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });

  // Fresh state: wipe config keys (never drawings/alerts/indicators).
  await page.evaluate(() => {
    window.localStorage.removeItem("euforia.oryon.layouts.v1");
    window.localStorage.removeItem("euforia.oryon.templates.v1");
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await waitForPanels(page, 1);
  await page.waitForTimeout(2_000);

  // ── A. État initial ─────────────────────────────────────────────────────
  console.log("- A. État initial : analyse neutre par défaut");
  const boot = await waitForPanels(page, 1);
  ok("workspace démarré avec un panneau", Array.isArray(boot) && boot.length === 1);
  ok(
    "défaut : 0 marqueur structure / 0 ligne niveau / 0 boîte OR",
    boot[0].structureMarkers === 0 && boot[0].keyLevelLines === 0 && boot[0].orBoxes === 0,
  );
  ok("défaut : structure OFF (menu)", (await analysisChecked(page, 0, "structure")) === false);
  ok("défaut : PDH/L OFF (menu)", (await analysisChecked(page, 0, "pdhl")) === false);
  ok("défaut : OR OFF (menu)", (await analysisChecked(page, 0, "or")) === false);

  // ── B. Structure sur EURUSD 15m ─────────────────────────────────────────
  console.log("- B. Structure de marché (pivots confirmés)");
  await setPanelSymbol(page, 0, "EURUSD");
  await setPanelInterval(page, 0, "15m");
  await toggleAnalysis(page, 0, "structure");
  const structOn = await waitForPanelState(page, 0, (p) => p.structureMarkers >= 1);
  ok(
    `structure ON → pivots confirmés rendus (got ${structOn?.structureMarkers})`,
    (structOn?.structureMarkers ?? 0) >= 1,
  );
  const baseline = await panels(page);
  ok("baseline series/panes stables", baseline[0].series >= 1 && baseline[0].panes >= 1);

  // ── C. Toggles de visibilité - sans recréation ──────────────────────────
  console.log("- C. Toggles (hauteurs/bas, provisional, labels)");
  await toggleAnalysis(page, 0, "highs");
  const highsOff = await waitForPanelState(page, 0, (p) => p.structureMarkers < baseline[0].structureMarkers);
  ok(
    `swing highs OFF → sous-ensemble strict (${highsOff?.structureMarkers} < ${baseline[0].structureMarkers})`,
    (highsOff?.structureMarkers ?? 0) < baseline[0].structureMarkers,
  );
  ok(
    "toggle sans recréation : series/panes/viewport stables",
    highsOff.series === baseline[0].series &&
      highsOff.panes === baseline[0].panes &&
      highsOff.visibleRange !== null &&
      Math.abs(highsOff.visibleRange.from - baseline[0].visibleRange.from) < 5,
  );
  await toggleAnalysis(page, 0, "highs");
  await toggleAnalysis(page, 0, "provisional");
  const withProvisional = await waitForPanelState(
    page,
    0,
    (p) => p.structureMarkers > highsOff.structureMarkers,
  );
  ok(
    `provisional ON → ensemble élargi monotone (${withProvisional?.structureMarkers} ≥ ${highsOff?.structureMarkers})`,
    (withProvisional?.structureMarkers ?? 0) >= (highsOff?.structureMarkers ?? 0),
  );
  await toggleAnalysis(page, 0, "provisional");

  // ── D. BOS/CHoCH - modes close/wick ─────────────────────────────────────
  console.log("- D. BOS/CHoCH (close puis wick)");
  // REFINEMENT (structure-lines): breaks render as pivot→break LINES with
  // boxed labels (structureLines counter) - the bare break circle markers
  // are suppressed while lines are ON (the line owns the annotation).
  await toggleAnalysis(page, 0, "breaks");
  const breaksClose = await waitForPanelState(page, 0, (p) => (p.structureLines ?? 0) >= 1);
  ok(
    `breaks ON (close) → lignes de structure rendues (got ${breaksClose?.structureLines})`,
    (breaksClose?.structureLines ?? 0) >= 1,
  );
  await pickAnalysisRadio(page, 0, "break-wick");
  const breaksWick = await waitForPanelState(page, 0, (p) => (p.structureLines ?? 0) >= (breaksClose?.structureLines ?? 1));
  ok(
    `mode wick ⊇ mode close (${breaksWick?.structureLines} ≥ ${breaksClose?.structureLines})`,
    (breaksWick?.structureLines ?? 0) >= (breaksClose?.structureLines ?? 0),
  );
  await pickAnalysisRadio(page, 0, "break-close");
  await toggleAnalysis(page, 0, "breaks");
  const breaksOff = await waitForPanelState(page, 0, (p) => (p.structureLines ?? 0) === 0);
  ok(
    `breaks OFF → lignes retirées (got ${breaksOff?.structureLines})`,
    (breaksOff?.structureLines ?? -1) === 0,
  );

  // ── E. Key levels (série 1D partagée) ───────────────────────────────────
  console.log("- E. Key levels (PDH/L + PWH/L)");
  await toggleAnalysis(page, 0, "pdhl");
  const pdOn = await waitForPanelState(page, 0, (p) => p.keyLevelLines >= 2);
  ok(`PDH/L ON → 2 lignes (got ${pdOn?.keyLevelLines})`, (pdOn?.keyLevelLines ?? 0) >= 2);
  await toggleAnalysis(page, 0, "pwhl");
  const pwOn = await waitForPanelState(page, 0, (p) => p.keyLevelLines >= 4);
  ok(`PWH/L ON → 4 lignes cumulées (got ${pwOn?.keyLevelLines})`, (pwOn?.keyLevelLines ?? 0) >= 4);
  await toggleAnalysis(page, 0, "pdoc");
  const pdocOn = await waitForPanelState(page, 0, (p) => p.keyLevelLines >= 6);
  ok(`PDO/C ON → 6 lignes cumulées (got ${pdocOn?.keyLevelLines})`, (pdocOn?.keyLevelLines ?? 0) >= 6);
  await toggleAnalysis(page, 0, "pdoc");

  // ── F. Opening range - gates honnêtes ───────────────────────────────────
  console.log("- F. Opening range (session NY, gates)");
  await toggleAnalysis(page, 0, "or");
  const orOn = await waitForPanelState(page, 0, (p) => p.orBoxes >= 1, 10_000);
  ok(
    `OR ON (EURUSD 15m, session-scoped) → boîte rendue (got ${orOn?.orBoxes})`,
    (orOn?.orBoxes ?? 0) >= 1,
  );
  ok("OR : window bornée - 1 seule boîte (dernière session)", (orOn?.orBoxes ?? 0) === 1);

  // 1D → intraday gate : pas d'OR (le panneau porte déjà la porte Phase 8).
  await setPanelInterval(page, 0, "1D");
  const dailyGate = await waitForPanelState(page, 0, (p) => p.orBoxes === 0);
  ok("1D → OR gate intraday : 0 boîte", (dailyGate?.orBoxes ?? -1) === 0);
  ok("1D → PDH/L toujours calculés (série 1D = source directe)", (dailyGate?.keyLevelLines ?? 0) >= 4);
  // Structure sur 1D reste possible (pivots journaliers).
  ok("1D → structure toujours rendue", (dailyGate?.structureMarkers ?? 0) >= 1);
  await setPanelInterval(page, 0, "15m");

  // Crypto → sessions non applicables → pas d'OR (honnête).
  // NOTE (environment): this check depends on the market service's BTCUSDT
  // 1D series - Binance currently answers 418 (sandbox IP rate-limited),
  // so the daily series cannot load and key levels honestly stay empty.
  // The assertion stays; it passes again when the provider unblocks.
  await setPanelSymbol(page, 0, "BTCUSDT");
  const cryptoGate = await waitForPanelState(page, 0, (p) => p.orBoxes === 0 && p.keyLevelLines >= 4);
  ok("BTCUSDT : OR = 0 boîte (sessions non applicables)", (cryptoGate?.orBoxes ?? -1) === 0);
  ok("BTCUSDT : PDH/L + PWH/L toujours disponibles", (cryptoGate?.keyLevelLines ?? 0) >= 4);
  await setPanelSymbol(page, 0, "EURUSD");
  await waitForPanels(page, 1);

  // ── G. Multi-chart : indépendance par panneau ───────────────────────────
  console.log("- G. Multi-chart (indépendance par panneau)");
  await setGrid(page, "twoHorizontal");
  const twoPanels = await waitForPanels(page, 2);
  ok("grille 2 panneaux montée", Array.isArray(twoPanels) && twoPanels.length === 2);
  // A NEW panel takes the documented DEFAULTS (analysis all OFF) -
  // isolation rules (§9.3: never reuse another panel's calculated data).
  // Assert the isolation in both directions.
  const afterGrid = await panels(page);
  ok(
    "panneau 1 (nouveau) : défauts neutres - 0 marqueur structure",
    (afterGrid[1]?.structureMarkers ?? -1) === 0,
  );
  ok(
    "panneau 0 : structure intacte (isolation par panneau)",
    (afterGrid[0]?.structureMarkers ?? 0) >= 1,
  );
  // Toggle panel 1 ON → its own set appears; panel 0 unchanged.
  await toggleAnalysis(page, 1, "structure");
  const p1On = await waitForPanelState(page, 1, (p) => p.structureMarkers >= 1);
  ok(
    `panneau 1 : structure ON → son propre jeu de pivots (${p1On?.structureMarkers})`,
    (p1On?.structureMarkers ?? 0) >= 1,
  );
  const both = await panels(page);
  ok(
    "panneau 0 : jeu inchangé pendant la mutation du panneau 1",
    both[0]?.structureMarkers === afterGrid[0]?.structureMarkers,
  );
  await toggleAnalysis(page, 1, "structure");
  await waitForPanelState(page, 1, (p) => p.structureMarkers === 0);

  // ── H. Persistance v4 ───────────────────────────────────────────────────
  console.log("- H. Persistance (enveloppe v4, save → défaut → restore)");
  // Panel 0 garde: structure ON + PDH/L + PWH/L + OR. Save.
  await saveLayoutAs(page, "Analyse9");
  const saved = await layoutsFile(page);
  ok("enveloppe v4 sur disque", saved?.version === 4);
  ok(
    "analyse persistée dans le record",
    saved?.layouts?.[0]?.panels?.[0]?.analysis?.structure?.enabled === true &&
      saved?.layouts?.[0]?.panels?.[0]?.analysis?.levels?.prevDayHighLow === true,
  );
  // Back to default → overlays gone.
  await switchDefaultLayout(page);
  const onDefault = await waitForPanelState(page, 0, (p) => p.structureMarkers === 0 && p.keyLevelLines === 0);
  ok(
    "layout par défaut : analyse neutre (0 marqueur / 0 ligne)",
    (onDefault?.structureMarkers ?? -1) === 0 && (onDefault?.keyLevelLines ?? -1) === 0,
  );
  // Restore the saved layout → analysis comes back.
  await switchLayout(page, "Analyse9");
  const restored = await waitForPanelState(page, 0, (p) => p.structureMarkers >= 1 && p.keyLevelLines >= 4);
  ok(
    `restore : analyse restaurée (structure ${restored?.structureMarkers}, lignes ${restored?.keyLevelLines})`,
    (restored?.structureMarkers ?? 0) >= 1 && (restored?.keyLevelLines ?? 0) >= 4,
  );

  // ── I. Régressions Phase 8 + coque ──────────────────────────────────────
  console.log("- I. Régressions (contexte P8, positions P4)");
  // Session shading still works (Phase 8 context menu untouched).
  await page.click('[data-testid="oryon-panel-0-context-menu"]');
  await page.waitForTimeout(250);
  const sessionsState = await page
    .locator('[data-testid="oryon-panel-0-context-sessions"]')
    .getAttribute("data-state");
  ok("menu contexte P8 toujours fonctionnel (sessions ON)", sessionsState === "checked");
  await page.keyboard.press("Escape");
  // Bands still counted (EURUSD 15m restored by the layout).
  await setPanelInterval(page, 0, "15m");
  const bandsBack = await waitForPanelState(page, 0, (p) => p.sessionBands >= 1);
  ok(`bandes de session P8 intactes (got ${bandsBack?.sessionBands})`, (bandsBack?.sessionBands ?? 0) >= 1);
  // Positions lower panel still opens (Phase 4 shell).
  await page.click('[data-testid="oryon-lower-toggle"]');
  await page.waitForTimeout(500);
  ok("lower panel P4 s'ouvre", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 1);
  await page.click('[data-testid="oryon-lower-close"]');
  await page.waitForTimeout(300);

  // ── J. Mobile 390 : menu analysis accessible ────────────────────────────
  console.log("- J. Mobile 390");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1_200);
  await clearDevOverlay(page);
  const mobilePanels = await panels(page);
  ok("mobile : workspace toujours vivant", Array.isArray(mobilePanels) && mobilePanels.length >= 1);
  const menuVisible = await panelLoc(page, 0).locator('[data-testid="oryon-panel-0-analysis-menu"]').isVisible();
  ok("mobile : trigger analysis visible", menuVisible);
  await panelLoc(page, 0).locator('[data-testid="oryon-panel-0-analysis-menu"]').click();
  await page.waitForTimeout(400);
  const menuOpen = await page.locator('[data-testid="oryon-panel-0-analysis-structure"]').first().isVisible();
  ok("mobile : menu analysis s'ouvre", menuOpen);
  await page.keyboard.press("Escape");

  // ── Console errors ──────────────────────────────────────────────────────
  console.log(`- Console: ${errors.length} erreur(s)`);
  for (const error of errors.slice(0, 10)) {
    console.log(`  console: ${error.slice(0, 220)}`);
    fs.appendFileSync(LOG, `  console: ${error}\n`);
  }
  ok("0 erreur console sur toute la session", errors.length === 0);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  fs.appendFileSync(LOG, `\nRESULT: ${pass} PASS / ${fail} FAIL\n`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(1);
});
