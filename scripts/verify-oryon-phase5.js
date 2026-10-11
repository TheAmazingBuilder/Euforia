/**
 * verify-oryon-phase5.js — Oryon Phase 5 (measurement, crosshair, alerts).
 * Contract under test:
 *  - MEASURE: two-click creation persists a measure object (localStorage,
 *    per-symbol envelope); Escape cancels a draft (nothing persisted);
 *    Ctrl+Z removes the committed object; the readout is canvas-painted
 *    (financial math verified in bun tests — here: lifecycle + no crash).
 *  - CROSSHAIR: hovering a bar shows the UTC timestamp in the legend;
 *    OHLC stays populated; volume appears ONLY for real positive data
 *    (BTCUSDT = REAL Binance feed carries volume; EURUSD SIM may not);
 *    indicator chips show a numeric readout while hovering.
 *  - ALERTS: toolbar entry → compact dialog (instrument = active chart);
 *    invalid target rejected inline; valid creation → panel row (active) +
 *    ONE chart price line (exact instrument match); disable removes the
 *    line, enable restores it; deterministic trigger via the dev-only
 *    handle (prime below → cross above) → status triggered + in-app toast
 *    + line removed; re-arm restores; delete cleans everything; an alert
 *    on another instrument never draws on this chart; instrument switch
 *    round-trip restores without leaks.
 *  - REGRESSIONS: positions panel + overlays, indicator chips/panes,
 *    drawings, 0 console errors · desktop 1440 · shots.
 *
 * Run: node scripts/verify-oryon-phase5.js   (DEV server on :3001 — the
 * structural debug handles are dev-only by design, phases 1-4 convention —
 * market service on :3003, mocked auth, BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase5-probe.log");
fs.writeFileSync(LOG, `=== oryon phase5 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

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
  await app.waitForSelector('[data-testid="oryon-workspace"], a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
}

async function chartStats(page) {
  return page.evaluate(() => {
    const read = window.__ORYON_CHART_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function chartSymbol(page) {
  const raw = await page.locator('[data-testid="oryon-instrument-trigger"]').innerText();
  return raw.split("\n")[0].trim().toUpperCase();
}

/** Selects a chart instrument through the toolbar combobox (keyboard path). */
async function selectInstrument(page, symbol) {
  await page.click('[data-testid="oryon-instrument-trigger"]');
  await page.waitForSelector('[data-testid="oryon-instrument-search"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-instrument-search"]', symbol);
  await page.waitForTimeout(250);
  await page.click(`[data-testid="oryon-instrument-option-${symbol}"]`);
  await page.waitForTimeout(1_500);
}

async function drawingKey(page, symbol) {
  return page.evaluate((sym) => {
    const raw = window.localStorage.getItem(`euforia.oryon.drawings.v1:${sym}`);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.drawings) ? parsed.drawings : [];
    } catch {
      return [];
    }
  }, symbol);
}

async function measureCount(page, symbol) {
  const drawings = await drawingKey(page, symbol);
  return drawings.filter((d) => d.type === "measure").length;
}

async function alertRows(page) {
  return page.locator('[data-testid="oryon-alert-row"]').count();
}

async function openAlertsTab(page) {
  // Open the utility rail (any panel), then the alerts tab.
  await page.click('[data-testid="oryon-notifications"]');
  await page.waitForSelector('[data-testid="oryon-utility-tab-alerts"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-utility-tab-alerts"]');
  await page.waitForSelector('[data-testid="oryon-alerts-panel"]', { timeout: 5_000 });
}

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

  // ── 1. Sign in + /oryon ───────────────────────────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 40_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 20_000 });
  await page.waitForTimeout(3_000);

  const symbol = await chartSymbol(page);
  ok(`P5 — workspace chargé sur ${symbol}`, symbol.length > 0);

  // ── 2. MEASURE — creation persists, Escape cancels, undo removes ──────────
  const canvas = page.locator('[data-testid="oryon-chart-canvas"] canvas').first();
  const box = await canvas.boundingBox();
  ok("P5 — canvas mesurable", box !== null && box.width > 400 && box.height > 300);
  if (box !== null) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Escape mid-draft: arm, first click, Escape → nothing persisted.
    await page.click('[data-testid="oryon-tool-measure"]');
    await page.mouse.click(cx, cy);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    ok("P5 — Escape annule un draft de mesure (rien de persisté)", (await measureCount(page, symbol)) === 0);

    // Two-click creation → persisted measure object.
    await page.click('[data-testid="oryon-tool-measure"]');
    await page.mouse.click(cx - 120, cy + 40);
    await page.mouse.click(cx + 120, cy - 40);
    await page.waitForTimeout(500);
    ok("P5 — mesure deux clics persistée (enveloppe par symbole)", (await measureCount(page, symbol)) === 1);
    const measure = (await drawingKey(page, symbol)).find((d) => d.type === "measure");
    ok(
      "P5 — mesure ancrée temps+prix (domaine chart, pas pixels)",
      measure !== null && Number.isFinite(measure.a?.t) && Number.isFinite(measure.a?.p) && Number.isFinite(measure.b?.t) && Number.isFinite(measure.b?.p),
    );
    // Tool disarmed after creation (TV behavior).
    ok(
      "P5 — outil désarmé après création",
      (await page.locator('[data-testid="oryon-tool-measure"]').getAttribute("aria-pressed")) === "false",
    );
    await page.screenshot({ path: `${OUT}/oryon-phase5-measure.png` });

    // Ctrl+Z removes it (undo), redo restores.
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(600);
    ok("P5 — Ctrl+Z retire la mesure", (await measureCount(page, symbol)) === 0);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(600);
    ok("P5 — Ctrl+Shift+Z la restaure", (await measureCount(page, symbol)) === 1);
  }

  // ── 3. CROSSHAIR — time + OHLC + volume (REAL feed) + chips ───────────────
  if (box !== null) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(400);
    ok("P5 — horodatage UTC affiché au survol", (await page.locator('[data-testid="oryon-legend-time"]').count()) === 1);
    const ohlc = await page.locator('[data-testid="oryon-legend-ohlc"]').innerText();
    ok("P5 — OHLC toujours peuplé au survol", /[0-9]/.test(ohlc));
    const chipText = await page.locator('[data-testid="oryon-indicator-chip"]').first().innerText();
    ok("P5 — chip indicateur avec valeur numérique au survol", /[0-9]/.test(chipText));
    await page.mouse.move(box.x + 5, box.y + 5); // leave
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/oryon-phase5-crosshair.png` });

  // REAL instrument (BTCUSDT via Binance) carries volume — the legend shows it.
  await selectInstrument(page, "BTCUSDT");
  const canvas2 = page.locator('[data-testid="oryon-chart-canvas"] canvas').first();
  const box2 = await canvas2.boundingBox();
  if (box2 !== null) {
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(500);
    ok("P5 — BTCUSDT (REAL) : volume affiché au survol", (await page.locator('[data-testid="oryon-legend-volume"]').count()) === 1);
  }
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);

  // ── 4. ALERTS — création, validation, overlay, cycle de vie ───────────────
  await openAlertsTab(page);
  ok("P5 — onglet alerts ouvert (rail utilité existant)", (await page.locator('[data-testid="oryon-alerts-panel"]').count()) === 1);
  ok("P5 — état vide honnête", (await page.locator('[data-testid="oryon-alerts-empty"]').count()) === 1);
  const feedPhase = await page.locator('[data-testid="oryon-alerts-feed-status"]').getAttribute("data-phase");
  ok(`P5 — statut d'évaluation "${feedPhase}" = live (honnête)`, feedPhase === "live");

  const symbol5 = await chartSymbol(page); // BTCUSDT here
  await page.click('[data-testid="oryon-alert-create"]');
  await page.waitForSelector('[data-testid="oryon-alert-dialog"]', { timeout: 5_000 });
  ok("P5 — dialogue d'alerte ouvert depuis la toolbar", (await page.locator('[data-testid="oryon-alert-dialog"]').count()) === 1);
  ok(
    `P5 — instrument prérempli = instrument actif (${symbol5})`,
    (await page.locator('[data-testid="oryon-alert-dialog-symbol"]').innerText()).trim().toUpperCase() === symbol5,
  );

  // Invalid target rejected inline, dialog stays open.
  await page.fill('[data-testid="oryon-alert-target"]', "");
  await page.click('[data-testid="oryon-alert-submit"]');
  await page.waitForTimeout(300);
  ok("P5 — cible vide rejetée avec message inline", (await page.locator('[data-testid="oryon-alert-target-error"]').count()) === 1);
  ok("P5 — dialogue toujours ouvert après rejet", (await page.locator('[data-testid="oryon-alert-dialog"]').count()) === 1);

  // Valid creation: target 5% ABOVE the current price (never reachable in the
  // SIM window → deterministic), condition crosses-above.
  const quotePrice = Number(await page.locator('[data-testid="oryon-alert-target"]').inputValue());
  const target = (quotePrice > 0 ? quotePrice * 1.05 : 100_000).toFixed(2);
  await page.fill('[data-testid="oryon-alert-target"]', target);
  await page.click('[data-testid="oryon-alert-submit"]');
  await page.waitForTimeout(700);
  ok("P5 — création valide → dialogue fermé", (await page.locator('[data-testid="oryon-alert-dialog"]').count()) === 0);
  ok("P5 — ligne active dans le panneau", (await alertRows(page)) === 1);
  const rowStatus = await page.locator('[data-testid="oryon-alert-row"]').getAttribute("data-status");
  ok("P5 — statut initial = active", rowStatus === "active");
  let stats = await chartStats(page);
  ok(`P5 — overlay alerte = 1 ligne de prix (got ${stats?.alertLines})`, stats?.alertLines === 1);
  await page.screenshot({ path: `${OUT}/oryon-phase5-alert-overlay.png` });

  // Persistence: browser-local envelope written.
  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.alerts.v1");
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.alerts) ? parsed.alerts.length : null;
    } catch {
      return null;
    }
  });
  ok("P5 — alerte persistée navigateur-local (enveloppe v1)", persisted === 1);

  // Deterministic trigger via the dev-only handle: prime below → cross above.
  const triggerable = await page.evaluate(() => typeof window.__ORYON_ALERTS_DEBUG__?.inject === "function");
  ok("P5 — handle dev d'injection disponible (dev only)", triggerable);
  if (triggerable) {
    const targetNum = Number(target);
    await page.evaluate(({ below, above }) => {
      window.__ORYON_ALERTS_DEBUG__.inject("BTCUSDT", below);
      window.__ORYON_ALERTS_DEBUG__.inject("BTCUSDT", above);
    }, { below: targetNum * 0.98, above: targetNum * 1.01 });
    await page.waitForTimeout(800);
    const triggeredStatus = await page.locator('[data-testid="oryon-alert-row"]').getAttribute("data-status");
    ok("P5 — franchissement confirmé → statut triggered", triggeredStatus === "triggered");
    stats = await chartStats(page);
    ok(`P5 — alerte triggered → ligne retirée du graphique (got ${stats?.alertLines})`, stats?.alertLines === 0);
    const toastCount = await page.locator("[data-sonner-toast]").count();
    ok(`P5 — notification in-app (toast) émise (${toastCount})`, toastCount > 0);
    await page.screenshot({ path: `${OUT}/oryon-phase5-triggered.png` });

    // Re-arm → active again → line restored.
    await page.click('[data-testid="oryon-alert-rearm"]');
    await page.waitForTimeout(600);
    ok("P5 — re-arm → statut active", (await page.locator('[data-testid="oryon-alert-row"]').getAttribute("data-status")) === "active");
    stats = await chartStats(page);
    ok(`P5 — re-arm → overlay restauré (got ${stats?.alertLines})`, stats?.alertLines === 1);
  }

  // Disable → line removed; enable → restored (update-in-place, no dup).
  await page.click('[data-testid="oryon-alert-toggle"]');
  await page.waitForTimeout(500);
  ok("P5 — désactivation → statut disabled", (await page.locator('[data-testid="oryon-alert-row"]').getAttribute("data-status")) === "disabled");
  stats = await chartStats(page);
  ok(`P5 — désactivée → ligne retirée (got ${stats?.alertLines})`, stats?.alertLines === 0);
  await page.click('[data-testid="oryon-alert-toggle"]');
  await page.waitForTimeout(500);
  stats = await chartStats(page);
  ok(`P5 — réactivée → exactement 1 ligne, pas de doublon (got ${stats?.alertLines})`, stats?.alertLines === 1);

  // ── 5. Matching exact + round-trip d'instrument ───────────────────────────
  // The alert lives on the CURRENT instrument; switch away → 0 lines, back → 1.
  const alertSymbol = symbol5;
  await selectInstrument(page, "EURUSD");
  stats = await chartStats(page);
  ok(
    `P5 — EURUSD : 0 ligne d'alerte (${alertSymbol} ≠ EURUSD, matching exact) (got ${stats?.alertLines})`,
    stats?.alertLines === 0,
  );
  // Create a SECOND alert on EURUSD while it is displayed.
  await page.click('[data-testid="oryon-alert-create"]');
  await page.waitForSelector('[data-testid="oryon-alert-dialog"]', { timeout: 5_000 });
  const eurusdQuote = Number(await page.locator('[data-testid="oryon-alert-target"]').inputValue());
  await page.fill('[data-testid="oryon-alert-target"]', (eurusdQuote > 0 ? eurusdQuote * 0.9 : 0.5).toFixed(5));
  await page.click('[data-testid="oryon-alert-submit"]');
  await page.waitForTimeout(700);
  stats = await chartStats(page);
  ok("P5 — alerte EURUSD créée → 1 ligne sur EURUSD", stats?.alertLines === 1);
  ok("P5 — panneau : 2 alertes au total", (await alertRows(page)) === 2);

  await selectInstrument(page, alertSymbol);
  stats = await chartStats(page);
  ok(`P5 — retour ${alertSymbol} : seule l'alerte ${alertSymbol} dessine (got ${stats?.alertLines})`, stats?.alertLines === 1);
  await selectInstrument(page, "EURUSD");
  stats = await chartStats(page);
  ok(`P5 — retour EURUSD : seule l'alerte EURUSD dessine (got ${stats?.alertLines})`, stats?.alertLines === 1);

  // Delete the EURUSD alert → row gone + line gone (no orphans).
  await page.locator('[data-testid="oryon-alert-row"][data-status="active"] [data-testid="oryon-alert-delete"]').first().click();
  await page.waitForTimeout(600);
  stats = await chartStats(page);
  const remaining = await alertRows(page);
  ok(`P5 — suppression → ligne retirée, ${remaining} ligne(s) restante(s) dans le panneau`, stats?.alertLines === 0 && remaining === 1);

  // ── 6. REGRESSIONS — positions, indicateurs, dessins ──────────────────────
  await page.click('[data-testid="oryon-lower-toggle"]');
  await page.waitForSelector('[data-testid="oryon-lower-panel"]', { timeout: 5_000 });
  await page.waitForSelector('[data-testid="oryon-position-row"]', { timeout: 15_000 });
  const rowCount = await page.locator('[data-testid="oryon-position-row"]').count();
  ok(`P5 — panneau positions intact (${rowCount} lignes)`, rowCount >= 1);
  // Structural: every book row matching the displayed symbol draws entry+SL+TP.
  const cells = await page.locator('[data-testid="oryon-position-row"] td:first-child').allInnerTexts();
  const rowSymbols = cells.map((text) => text.split("\n")[0].trim().toUpperCase());
  const expectedPositionLines = rowSymbols.filter((s) => s === "EURUSD").length * 3;
  stats = await chartStats(page);
  ok(
    `P5 — overlays positions intacts (attendu ${expectedPositionLines}, got ${stats?.priceLines})`,
    stats?.priceLines === expectedPositionLines,
  );
  const chipCount = await page.locator('[data-testid="oryon-indicator-chip"]').count();
  ok(`P5 — chips indicateurs intactes (got ${chipCount})`, chipCount === 2);
  stats = await chartStats(page);
  ok(`P5 — panes natifs intacts (got ${stats?.panes})`, stats?.panes === 3);
  // Drawings survived everything (the measure created in section 2).
  ok("P5 — dessins intacts (mesure toujours là)", (await measureCount(page, "EURUSD")) === 1);
  await page.click('[data-testid="oryon-lower-close"]');

  // ── console errors ────────────────────────────────────────────────────────
  ok("P5 — zéro erreur de console", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `CONSOLE ERRORS:\n${errors.join("\n")}\n`);
    console.log("Console errors:", errors.slice(0, 5));
  }

  await browser.close();
  console.log(`\n=== ORYON PHASE 5: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== RESULT: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(2);
});
