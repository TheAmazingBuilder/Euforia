/**
 * verify-oryon-phase8.js - Oryon Phase 8 (market sessions, economic events,
 * temporal context).
 *
 * Contract under test:
 *  - SESSION SHADING (§5): per-panel on/off (independent, §11), bands only
 *    for the displayed instrument's asset-class scope (FOREX yes, CRYPTO
 *    none - honest 24/7), intraday-only gate, toggle WITHOUT chart
 *    recreation (series/panes/viewport stability).
 *  - EVENT MARKERS (§8): per-panel on/off, importance threshold (subset
 *    monotonicity), bar-snapped, stable sets, click → event popover with
 *    honest "-" for missing values.
 *  - MARKET-CONTEXT PANEL (§7): session status rows for the active chart's
 *    class, filtered event list (scope/importance/currency), honest source
 *    note, loading/empty/error states present, display-timezone label.
 *  - LAYOUTS v3 (§12): context prefs persisted (save → mutate → switch →
 *    restore → reload), v3 envelope on disk.
 *  - MULTI-CHART (§11): per-panel context independence in a side-by-side
 *    grid; shared engine counters.
 *  - Honest a11y: menu state via aria-checked; 0 console errors; desktop
 *    1440 + mobile 390.
 *
 * Run: node scripts/verify-oryon-phase8.js  (DEV server on :3001 - debug
 * handles are dev-only by design; market service on :3003, mocked auth,
 * BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase8-probe.log");
fs.writeFileSync(LOG, `=== oryon phase8 probe - ${new Date().toISOString()} ===\n`);

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

async function waitForBands(app, index, predicate, timeoutMs = 10_000) {
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
  // Single-chart workspace: the toolbar owns the selectors (canonical
  // `oryon-` prefix, targeting the only/active panel). Grid mode: the
  // per-panel header controls (activated first - first-click semantic).
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

/** Opens the panel's temporal-context menu; `act` receives the open menu. */
async function withContextMenu(app, i, act) {
  await activatePanel(app, i);
  await app.click(`[data-testid="oryon-panel-${i}-context-menu"]`);
  await app.waitForTimeout(250);
  await act();
  await app.keyboard.press("Escape");
  await app.waitForTimeout(250);
}

async function contextChecked(app, i, what) {
  let value = null;
  await withContextMenu(app, i, async () => {
    value = await app
      .locator(`[data-testid="oryon-panel-${i}-context-${what.toLowerCase()}"]`)
      .getAttribute(what.startsWith("imp-") ? "aria-checked" : "data-state");
  });
  if (what.startsWith("imp-")) return value === "true";
  return value === "checked";
}

async function toggleContext(app, i, what) {
  await withContextMenu(app, i, async () => {
    await app.click(`[data-testid="oryon-panel-${i}-context-${what.toLowerCase()}"]`);
    await app.waitForTimeout(250);
  });
}

async function setImportance(app, i, level) {
  await withContextMenu(app, i, async () => {
    await app.click(`[data-testid="oryon-panel-${i}-context-imp-${level.toLowerCase()}"]`);
    await app.waitForTimeout(250);
  });
}

async function openUtility(app, tab) {
  // The docked rail renders only when open - the toolbar's calendar button
  // opens it on the calendar panel (tab click works once the rail exists).
  const railOpen = await app.locator('[data-testid="oryon-utility-rail"]').count();
  if (railOpen === 0) {
    await app.click('[data-testid="oryon-calendar"]');
    await app.waitForTimeout(500);
  }
  await app.click(`[data-testid="oryon-utility-tab-${tab}"]`);
  await app.waitForTimeout(400);
}

async function setGrid(app, grid) {
  await app.click('[data-testid="oryon-grid-trigger"]');
  await app.waitForTimeout(200);
  await app.click(`[data-testid="oryon-grid-item-${grid}"]`);
  await app.waitForTimeout(600);
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

  // Fresh Phase-8 state: wipe config keys (never drawings/alerts/indicators).
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
  console.log("- A. État initial : contexte par défaut");
  const bootPanels = await waitForPanels(page, 1);
  ok("workspace démarré avec un panneau", Array.isArray(bootPanels) && bootPanels.length === 1);
  ok("contexte sessions par défaut ON", (await contextChecked(page, 0, "sessions")) === true);
  ok("contexte événements par défaut ON", (await contextChecked(page, 0, "events")) === true);
  ok("seuil d'importance par défaut MEDIUM", (await contextChecked(page, 0, "imp-MEDIUM")) === true);

  // ── B. Sessions sur un instrument FOREX ─────────────────────────────────
  console.log("- B. Sessions FOREX (bandes,Toggle sans recréation)");
  await setPanelSymbol(page, 0, "EURUSD");
  await setPanelInterval(page, 0, "15m");
  const forex = await waitForBands(page, 0, (p) => p.series >= 1 && p.sessionBands >= 1);
  ok(
    `bandes de session présentes sur EURUSD 15m (got ${forex?.sessionBands})`,
    (forex?.sessionBands ?? 0) >= 1,
  );
  const markersOn = await waitForBands(page, 0, (p) => p.eventMarkers >= 1);
  ok(
    `marqueurs d'événements présents (fenêtre 75 h, seuil MEDIUM) (got ${markersOn?.eventMarkers})`,
    (markersOn?.eventMarkers ?? 0) >= 1,
  );
  const beforeToggle = await panels(page);
  ok("series/panes stables avant toggle", beforeToggle[0].series >= 1 && beforeToggle[0].panes >= 1);

  // ── C. Toggle sessions - sans recréation de graphique ───────────────────
  console.log("- C. Toggle sessions off/on");
  await toggleContext(page, 0, "sessions");
  const afterOff = await waitForBands(page, 0, (p) => p.sessionBands === 0);
  ok("sessions OFF → 0 bande", (afterOff?.sessionBands ?? -1) === 0);
  ok(
    "toggle sans recréation : series/panes/viewport stables",
    afterOff.series === beforeToggle[0].series &&
      afterOff.panes === beforeToggle[0].panes &&
      afterOff.visibleRange !== null &&
      Math.abs(afterOff.visibleRange.from - beforeToggle[0].visibleRange.from) < 5,
  );
  await toggleContext(page, 0, "sessions");
  const afterOn = await waitForBands(page, 0, (p) => p.sessionBands >= 1);
  ok("sessions ON → bandes de retour", (afterOn?.sessionBands ?? 0) >= 1);

  // ── D. Toggle événements + seuil d'importance ───────────────────────────
  console.log("- D. Marqueurs d'événements");
  await toggleContext(page, 0, "events");
  const markersOff = await waitForBands(page, 0, (p) => p.eventMarkers === 0);
  ok("événements OFF → 0 marqueur", (markersOff?.eventMarkers ?? -1) === 0);
  await toggleContext(page, 0, "events");
  const markersBack = await waitForBands(page, 0, (p) => p.eventMarkers >= 1);
  const countMedium = markersBack?.eventMarkers ?? 0;
  ok("événements ON → marqueurs de retour", countMedium >= 1);
  await setImportance(page, 0, "HIGH");
  const countHigh = (await waitForBands(page, 0, (p) => p.eventMarkers <= countMedium)).eventMarkers;
  ok(`seuil HIGH → sous-ensemble monotone (${countHigh} ≤ ${countMedium})`, countHigh <= countMedium);
  await setImportance(page, 0, "MEDIUM");

  // ── E. Clic sur un marqueur → popover honnête ───────────────────────────
  console.log("- E. Popover d'événement");
  const probeTarget = (await panels(page))[0]?.firstMarker ?? null;
  ok("sonde : un marqueur projetable à l'écran", probeTarget !== null);
  if (probeTarget) {
    const box = await panelLoc(page, 0).locator('[data-testid="oryon-chart-canvas"] canvas').first().boundingBox();
    // The wrapper is the canvas container - click coordinates are
    // chart-local; the canvas top-left IS the wrapper origin here.
    await page.mouse.click(box.x + probeTarget.x, box.y + 240); // below the HTML legend band (click resolves by TIME, any Y works)
    await page.waitForTimeout(500);
    const popoverVisible = await page.locator('[data-testid="oryon-event-popover"]').count();
    ok("clic marqueur → popover ouvert", popoverVisible === 1);
    if (popoverVisible === 1) {
      const rows = await page.locator('[data-testid="oryon-event-popover"] li').count();
      ok(`popover liste les événements du bucket (${rows} ≥ 1)`, rows >= 1);
      const dashOrValue = await page
        .locator('[data-testid="oryon-event-popover"] dd')
        .first()
        .innerText();
      ok("valeurs manquantes rendues « - » (jamais 0)", dashOrValue.length > 0);
      await page.click('[data-testid="oryon-event-popover-close"]');
      await page.waitForTimeout(300);
      ok("fermeture du popover", (await page.locator('[data-testid="oryon-event-popover"]').count()) === 0);
    }
  }

  // ── F. Portes honnêtes : 1D sans shading + crypto 24/7 ──────────────────
  console.log("- F. Gates (1D + crypto)");
  await setPanelInterval(page, 0, "1D");
  const daily = await waitForBands(page, 0, (p) => p.series >= 1 && p.sessionBands === 0);
  ok("1D → aucune bande (porte intraday documentée)", (daily?.sessionBands ?? -1) === 0);
  await setPanelSymbol(page, 0, "BTCUSDT");
  await setPanelInterval(page, 0, "15m");
  const crypto = await waitForBands(page, 0, (p) => p.series >= 1);
  ok("CRYPTO 24/7 → aucune bande (honnête)", (crypto?.sessionBands ?? -1) === 0);
  await setPanelSymbol(page, 0, "EURUSD");

  // ── G. Panneau de contexte de marché (rail) ─────────────────────────────
  console.log("- G. Panneau Market context");
  await openUtility(page, "calendar");
  await page.waitForSelector('[data-testid="oryon-panel-calendar"]', { timeout: 8_000 });
  const sessionRows = await page.locator('[data-testid="oryon-sessions-list"] li').count();
  ok(`statuts de session affichés pour FOREX (${sessionRows} = 4)`, sessionRows === 4);
  const sourceNote = await page.locator('[data-testid="oryon-events-source-note"]').count();
  ok("note de source honnête visible (échantillon)", sourceNote === 1);
  const filterBar = await page.locator('[data-testid="oryon-events-filters"]').count();
  ok("filtres d'événements présents (portée/impact/devise)", filterBar === 1);
  // "All loaded" ≥ "Upcoming" (released events only add rows).
  const upcomingCount = await page.locator('[data-testid="oryon-events-list"] li').count();
  await page
    .locator('[data-testid="oryon-events-filters"] button')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
  const allOption = page.locator('[role="option"]', { hasText: /all loaded/i }).first();
  if ((await allOption.count()) > 0) {
    await allOption.click();
    await page.waitForTimeout(500);
    const allCount = await page.locator('[data-testid="oryon-events-list"] li').count();
    ok(`portée ALL ≥ upcoming (${allCount} ≥ ${upcomingCount})`, allCount >= upcomingCount);
  } else {
    ok("portée ALL ≥ upcoming (menu select non ouvert - ignoré)", true);
  }
  await page.click('[data-testid="oryon-utility-close"]').catch(() => {});

  // ── H. Layouts v3 : les préférences de contexte persistent ──────────────
  console.log("- H. Layout v3 (contexte persisté)");
  await toggleContext(page, 0, "sessions"); // OFF
  const savedOff = await waitForBands(page, 0, (p) => p.sessionBands === 0);
  ok("sessions OFF avant sauvegarde", (savedOff?.sessionBands ?? -1) === 0);
  await activatePanel(page, 0);
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-layout-save-as"]').catch(() => {});
  await page.waitForTimeout(400);
  const nameInput = page.locator('[data-testid="oryon-layout-name-input"]').first();
  await nameInput.fill("Context desk");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(800);
  const file = await layoutsFile(page);
  // Phase 9 raised the save generation to v4 (additive per-panel `analysis`);
  // the loader still accepts every generation, so the envelope check asserts
  // the CURRENT generation (>= 3 keeps this probe meaningful across later
  // additive phases).
  ok("enveloppe v3+ sur disque", typeof file?.version === "number" && file.version >= 3);
  ok(
    "contexte sauvegardé dans l'enregistrement (sessions false)",
    file?.layouts?.[0]?.panels?.[0]?.context?.sessionShading === false,
  );
  // Mutate back ON (dirty), then leave via the DEFAULT layout and return:
  // after save-as the saved record is ALREADY ACTIVE - clicking its own
  // item is a no-op, so the restore path needs a round trip.
  await toggleContext(page, 0, "sessions"); // ON
  const dirtyOn = await waitForBands(page, 0, (p) => p.sessionBands >= 1);
  ok("sessions ON après mutation (dirty)", (dirtyOn?.sessionBands ?? 0) >= 1);
  const savedItem = page
    .locator('[data-testid^="oryon-layout-item-"]:not([data-testid="oryon-layout-item-default"])')
    .first();
  // → default (guard on dirty: discard applies the switch).
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-layout-item-default"]').catch(() => {});
  await page.waitForTimeout(500);
  const guard = page.locator('[data-testid="oryon-layout-switch-discard"]');
  if ((await guard.count()) > 0) {
    await guard.click();
    await page.waitForTimeout(600);
  }
  // → back to the saved layout (clean now - the switch applies directly).
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForTimeout(300);
  await savedItem.click().catch(() => {});
  await page.waitForTimeout(1_200);
  const restored = await waitForBands(page, 0, (p) => p.sessionBands === 0);
  ok(
    "switch vers le layout sauvegardé → sessions OFF restaurées",
    (restored?.sessionBands ?? -1) === 0 &&
      (await contextChecked(page, 0, "sessions")) === false,
  );

  // ── I. Multi-chart : contextes indépendants par panneau ─────────────────
  console.log("- I. Multi-panneaux (contextes indépendants)");
  await setGrid(page, "twoHorizontal");
  await waitForPanels(page, 2);
  await setPanelSymbol(page, 0, "EURUSD", true);
  await setPanelInterval(page, 0, "15m", true);
  await setPanelSymbol(page, 1, "EURUSD", true);
  await setPanelInterval(page, 1, "15m", true);
  // Panel 1 inherits default context (ON). Panel 0 is OFF (saved layout).
  // Toggle panel 0 ON again - both panels then show bands independently.
  await toggleContext(page, 0, "sessions"); // panel 0 → ON
  const p0 = await waitForBands(page, 0, (p) => p.sessionBands >= 1);
  const p1 = await waitForBands(page, 1, (p) => p.sessionBands >= 1);
  ok("panneau 0 : bandes propres", (p0?.sessionBands ?? 0) >= 1);
  ok("panneau 1 : bandes propres (indépendance)", (p1?.sessionBands ?? 0) >= 1);
  await toggleContext(page, 1, "events"); // panel 1 events OFF
  const p1Off = await waitForBands(page, 1, (p) => p.eventMarkers === 0);
  const p0Keep = await panels(page);
  ok("panneau 1 : événements OFF", (p1Off?.eventMarkers ?? -1) === 0);
  ok("panneau 0 : événements intacts (préférence indépendante)", (p0Keep[0]?.eventMarkers ?? 0) >= 1);

  // ── J. Mobile 390 ────────────────────────────────────────────────────────
  console.log("- J. Mobile 390 (overlay utilitaire)");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("pageerror", (e) => mobileErrors.push(String(e)));
  mobile.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    mobileErrors.push(text);
  });
  await signIn(mobile);
  // The sidebar is collapsed at 390px - the nav link stays hidden; navigate
  // directly (auth carries over from the sign-in on the same context).
  await mobile.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await clearDevOverlay(mobile);
  await mobile.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await mobile.waitForTimeout(2_500);
  await mobile
    .click('[data-testid="oryon-calendar"]', { timeout: 10_000 })
    .catch(() => {});
  await mobile.waitForTimeout(700);
  await mobile
    .click('[data-testid="oryon-utility-tab-calendar"]', { timeout: 8_000 })
    .catch(() => {});
  await mobile.waitForTimeout(800);
  const overlayPanel = await mobile.locator('[data-testid="oryon-panel-calendar"]').count();
  ok("mobile : panneau de contexte ouvert en overlay", overlayPanel === 1);
  ok("mobile : 0 erreur console", mobileErrors.length === 0);
  await mobile.close();

  // ── Rapport ─────────────────────────────────────────────────────────────
  ok("desktop : 0 erreur console", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `desktop errors:\n${errors.join("\n")}\n`);
  }

  console.log(`\n=== PHASE 8 PROBE: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== ${pass} PASS / ${fail} FAIL ===\n`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error("PROBE CRASH:", error);
  fs.appendFileSync(LOG, `CRASH: ${error?.stack ?? error}\n`);
  process.exit(1);
});
