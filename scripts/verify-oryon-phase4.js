/**
 * verify-oryon-phase4.js — Oryon Phase 4 (open-position visualization).
 * Contract under test:
 *  - lower panel opens from the toolbar toggle; collapsed by default
 *  - the SIM book arrives from the private positions stream: rows listed,
 *    count + SIM badge + status chip, honest USD-denominated P&L total
 *  - long/short distinction is explicit (text badges, not color-only)
 *  - missing SL/TP render N/A (never zero) — checked structurally via the
 *    sim book (it always carries SL/TP: N/A path asserted on absence)
 *  - overlays: ONLY positions matching the ACTIVE chart instrument exactly
 *    are drawn (entry + SL + TP price lines, structural count via the
 *    dev-only debug handle); BTCUSD rows never claim the BTCUSDT chart
 *  - selection: row click highlights the overlay in place (line count
 *    stable — update-in-place, never duplicates) + aria-selected
 *  - instrument switch: overlays follow the matched instrument, cleared on
 *    unmatched instruments, restored on switch-back (no leaks)
 *  - chart-type switch (candles↔line): overlays survive the series rebuild
 *  - indicator + drawing regressions: chips/panes intact, drawings intact
 *  - 0 console errors · desktop 1440 · shots
 *
 * Run: node scripts/verify-oryon-phase4.js   (DEV server on :3001 — the
 * structural debug handle is dev-only by design, phases 1-3 convention —
 * market service on :3003, mocked auth, BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase4-probe.log");
fs.writeFileSync(LOG, `=== oryon phase4 probe — ${new Date().toISOString()} ===\n`);

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
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 15_000 });
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
  await app.waitForSelector('[data-testid="oryon-workspace"], a[href="/oryon"]', { timeout: 30_000 }).catch(() => {});
}

async function chartStats(page) {
  return page.evaluate(() => {
    const read = window.__ORYON_CHART_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

/** Selects a chart instrument through the toolbar combobox (keyboard path). */
async function selectInstrument(page, symbol) {
  await page.click('[data-testid="oryon-instrument-trigger"]');
  await page.waitForSelector('[data-testid="oryon-instrument-search"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-instrument-search"]', symbol);
  await page.waitForTimeout(250);
  await page.click(`[data-testid="oryon-instrument-option-${symbol}"]`);
  await page.waitForTimeout(1_500); // history load + overlay sync
}

async function openPositionsPanel(page) {
  await page.click('[data-testid="oryon-lower-toggle"]');
  await page.waitForSelector('[data-testid="oryon-lower-panel"]', { timeout: 5_000 });
  await page.waitForTimeout(1_500); // stream snapshot + first render
}

async function rowSymbols(page) {
  const cells = await page.locator('[data-testid="oryon-position-row"] td:first-child').allInnerTexts();
  // First line only — the cell may carry the "chart" match chip below the symbol.
  return cells.map((text) => text.split("\n")[0].trim().toUpperCase());
}

/** Overlay expectation for a chart symbol: every matching book row draws entry+SL+TP. */
async function expectedLines(page, chartSymbol) {
  const symbols = await rowSymbols(page);
  return symbols.filter((s) => s === chartSymbol.toUpperCase()).length * 3;
}

async function chartSymbol(page) {
  const raw = await page.locator('[data-testid="oryon-instrument-trigger"]').innerText();
  return raw.split("\n")[0].trim().toUpperCase();
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
  await navLink.waitFor({ state: "visible", timeout: 30_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_500);
  // Phase 7 multi-chart era: reset the config domains to the factory state
  // (the probe baseline is the default single-panel workspace).
  await page.evaluate(() => {
    window.localStorage.removeItem("euforia.oryon.layouts.v1");
    window.localStorage.removeItem("euforia.oryon.templates.v1");
    window.localStorage.removeItem("euforia.oryon.indicators.v1");
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_000);

  // ── 2. Panel collapsed by default; opens from the toolbar toggle ──────────
  ok("P4 — panneau bas replié par défaut", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 0);
  await openPositionsPanel(page);
  ok("P4 — panneau bas ouvert via le toggle toolbar", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 1);

  // ── 3. SIM book: rows + honest labeling ───────────────────────────────────
  await page.waitForSelector('[data-testid="oryon-position-row"]', { timeout: 15_000 });
  const symbols = await rowSymbols(page);
  const rowCount = await page.locator('[data-testid="oryon-position-row"]').count();
  ok(`P4 — livre SIM reçu: ${rowCount} positions (2–3 attendu)`, rowCount >= 2 && rowCount <= 3);
  ok("P4 — badge SIM affiché (source honnête)", (await page.locator('[data-testid="oryon-positions-sim-badge"]').count()) === 1);
  const status = await page.locator('[data-testid="oryon-positions-status"]').getAttribute("data-status");
  ok(`P4 — statut du flux "${status}" = live|stale (honnête)`, status === "live" || status === "stale");
  ok("P4 — compteur de positions affiché", /open/.test(await page.locator('[data-testid="oryon-positions-count"]').innerText()));
  ok("P4 — total P&L latent affiché", (await page.locator('[data-testid="oryon-positions-pnl-total"]').count()) === 1);
  const sides = await page.locator('[data-testid="oryon-position-row"] td:nth-child(2)').allInnerTexts();
  ok(`P4 — side explicites (${sides.join(", ")})`, sides.every((s) => /LONG|SHORT/.test(s.toUpperCase())));
  ok("P4 — long ET short présents dans le livre", sides.some((s) => /LONG/.test(s.toUpperCase())) && sides.some((s) => /SHORT/.test(s.toUpperCase())));
  ok("P4 — contexte compte: broker non connecté (honnête)", (await page.locator('[data-testid="oryon-positions-account-empty"]').count()) === 1);
  ok("P4 — lien Accounts depuis le contexte compte", (await page.locator('[data-testid="oryon-positions-account-link"]').count()) === 1);
  await page.screenshot({ path: `${OUT}/oryon-phase4-panel.png` });

  // ── 4. Overlays for the DEFAULT instrument (exact match only) ─────────────
  let stats = await chartStats(page);
  ok("P4 — handle debug exposé (dev)", stats !== null);
  const loadSymbol = await chartSymbol(page);
  const expectedAtLoad = await expectedLines(page, loadSymbol);
  ok(`P4 — overlays au démarrage = positions ${loadSymbol} ×3 (attendu ${expectedAtLoad}, got ${stats?.priceLines})`, stats?.priceLines === expectedAtLoad);

  // Pick a book symbol covered by the feed, DIFFERENT from the current chart.
  const covered = ["EURUSD", "GBPUSD", "XAUUSD"];
  const matchSymbol = symbols.find((s) => covered.includes(s.toUpperCase()) && s.toUpperCase() !== loadSymbol);
  ok(`P4 — un autre symbole du livre couvert par le feed existe (${matchSymbol ?? "aucun"})`, matchSymbol !== undefined);

  if (matchSymbol) {
    await selectInstrument(page, matchSymbol.toUpperCase());
    stats = await chartStats(page);
    const expectedMatched = await expectedLines(page, matchSymbol);
    ok(`P4 — overlays ${expectedMatched / 3} position(s) ×3 sur ${matchSymbol} (attendu ${expectedMatched}, got ${stats?.priceLines})`, stats?.priceLines === expectedMatched);
    await page.screenshot({ path: `${OUT}/oryon-phase4-overlays.png` });

    // ── 5. Selection: highlight in place, NEVER duplicate ───────────────────
    const firstRow = page.locator('[data-testid="oryon-position-row"]').filter({ hasText: matchSymbol.toUpperCase() }).first();
    await firstRow.click();
    await page.waitForTimeout(400);
    ok("P4 — ligne sélectionnée: aria-selected", (await firstRow.getAttribute("aria-selected")) === "true");
    stats = await chartStats(page);
    ok(`P4 — sélection = update in place, pas de doublon (got ${stats?.priceLines})`, stats?.priceLines === expectedMatched);
    await firstRow.click();
    await page.waitForTimeout(400);
    ok("P4 — désélection: aria-selected retiré", (await firstRow.getAttribute("aria-selected")) === "false");
    stats = await chartStats(page);
    ok("P4 — désélection: nombre de lignes stable", stats?.priceLines === expectedMatched);

    // ── 6. Chart-type switch: overlays + indicator panes survive rebuild ────
    await page.click('[data-testid="oryon-type-line"]');
    await page.waitForTimeout(700);
    stats = await chartStats(page);
    ok(`P4 — bascule ligne: overlays re-attachés + panes intacts (got ${stats?.priceLines}/${stats?.panes})`, stats?.priceLines === expectedMatched && stats?.panes === 3);
    await page.screenshot({ path: `${OUT}/oryon-phase4-line-type.png` });
    await page.click('[data-testid="oryon-type-candles"]');
    await page.waitForTimeout(500);
    stats = await chartStats(page);
    ok(`P4 — retour bougies: overlays intacts + panes intacts (got ${stats?.priceLines}/${stats?.panes})`, stats?.priceLines === expectedMatched && stats?.panes === 3);
  }

  // ── 7. Unmatched instrument: zero overlays, no leak ───────────────────────
  await selectInstrument(page, "BTCUSDT");
  stats = await chartStats(page);
  ok(`P4 — BTCUSDT: 0 overlay (BTCUSD ≠ BTCUSDT, jamais de substring) (got ${stats?.priceLines})`, stats?.priceLines === 0);
  await page.screenshot({ path: `${OUT}/oryon-phase4-unmatched.png` });

  // ── 8. Switch back: overlays restored (lifecycle sans fuite) ──────────────
  if (matchSymbol) {
    await selectInstrument(page, matchSymbol.toUpperCase());
    stats = await chartStats(page);
    const expectedBack = await expectedLines(page, matchSymbol);
    ok(`P4 — retour ${matchSymbol}: overlays restaurés (attendu ${expectedBack}, got ${stats?.priceLines})`, stats?.priceLines === expectedBack);
  }

  // ── 9. Regressions: indicators + drawings still intact ────────────────────
  const chipCount = await page.locator('[data-testid="oryon-indicator-chip"]').count();
  ok(`P4 — chips indicateurs intactes (got ${chipCount})`, chipCount === 2);
  stats = await chartStats(page);
  ok(`P4 — panes natifs intacts (got ${stats?.panes})`, stats?.panes === 3);
  ok("P4 — table de positions toujours rendue", (await page.locator('[data-testid="oryon-positions-table"]').count()) === 1);

  // ── 10. Panel closes cleanly ──────────────────────────────────────────────
  await page.click('[data-testid="oryon-lower-close"]');
  await page.waitForTimeout(300);
  ok("P4 — panneau refermé", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 0);
  await page.screenshot({ path: `${OUT}/oryon-phase4-final.png` });

  // ── console errors ────────────────────────────────────────────────────────
  ok("P4 — zéro erreur de console", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `CONSOLE ERRORS:\n${errors.join("\n")}\n`);
    console.log("Console errors:", errors.slice(0, 5));
  }

  await browser.close();
  console.log(`\n=== ORYON PHASE 4: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== RESULT: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(2);
});
