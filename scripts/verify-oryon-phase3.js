/**
 * verify-oryon-phase3.js — Oryon Phase 3 (technical indicator engine).
 * Contract under test:
 *  - PRD default template on first visit: Volume + RSI(14) chips,
 *    3 native panes (main + volume + rsi), 2 managed series
 *  - toolbar "Indicators" opens the management dialog; search filters the
 *    IMPLEMENTED registry (7 entries) only
 *  - add SMA (overlay) → chip + value, pane count unchanged; multiple
 *    instances of the same indicator coexist with distinct ids
 *  - add MACD → +1 native pane, +3 series (macd/signal/histogram)
 *  - hide/show keeps series+panes (visible flag); remove purges both
 *  - settings: parameter edit applies; invalid input → explicit message and
 *    the last VALID configuration is retained
 *  - persistence: reload restores the validated stack
 *  - instrument / timeframe switches keep the chart-level setup, values recalc
 *  - drawings keep working next to indicators (trend line + object list)
 *  - main chart still functional; 0 console errors · desktop 1440 · shots
 *
 * Run: node scripts/verify-oryon-phase3.js   (dev server on :3000, market
 * service on :3003, mocked auth — same harness as phase 2)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase3-probe.log");
fs.writeFileSync(LOG, `=== oryon phase3 probe — ${new Date().toISOString()} ===\n`);

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
  fs.appendFileSync(LOG, `signIn: after goto — ${app.url()}\n`);
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

/** Structural stats from the dev-only chart handle. */
async function chartStats(page) {
  return page.evaluate(() => {
    const read = window.__ORYON_CHART_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function chipCount(page) {
  return page.locator('[data-testid="oryon-indicator-chip"]').count();
}

async function chipLabels(page) {
  return page
    .locator('[data-testid="oryon-indicator-chip"] [data-testid="oryon-indicator-chip-open"]')
    .allInnerTexts();
}

async function openIndicatorDialog(page) {
  await page.click('[data-testid="oryon-indicators"]');
  await page.waitForSelector('[data-testid="oryon-indicator-dialog"]', { timeout: 5_000 });
  await page.waitForTimeout(200);
}

async function addIndicator(page, type) {
  await openIndicatorDialog(page);
  await page.click(`[data-testid="oryon-indicator-add-${type}"]`);
  await page.waitForTimeout(400); // dialog closes + engine syncs
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

  // ── 1. Sign in + navigate to /oryon ───────────────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 30_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_500); // history load + default template sync
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

  // ── 2. PRD default template: Volume + RSI(14) → 3 panes, 2 series ─────────
  ok("P3 — bouton toolbar Indicators présent", (await page.locator('[data-testid="oryon-indicators"]').count()) === 1);
  ok(`P3 — template par défaut: 2 chips (got ${await chipCount(page)})`, (await chipCount(page)) === 2);
  const labels0 = await chipLabels(page);
  ok("P3 — template contient RSI 14", labels0.some((l) => l.includes("RSI 14")));
  ok("P3 — template contient Vol", labels0.some((l) => l.includes("Vol")));
  let stats = await chartStats(page);
  ok("P3 — handle debug exposé (dev)", stats !== null);
  ok(`P3 — 3 panes natifs au premier avis (got ${stats?.panes})`, stats?.panes === 3);
  ok(`P3 — 3 séries live (main + volume + rsi) (got ${stats?.series})`, stats?.series === 3);
  const rsiValue = await page
    .locator('[data-indicator-type="rsi"] [data-testid="oryon-indicator-chip-open"]')
    .innerText()
    .catch(() => "");
  ok(`P3 — chip RSI affiche une valeur numérique (got "${rsiValue.replace(/\n/g, " ")}")`, /\d/.test(rsiValue));
  await page.screenshot({ path: `${OUT}/oryon-phase3-default-template.png` });

  // ── 3. Dialog: search over the IMPLEMENTED registry ───────────────────────
  await openIndicatorDialog(page);
  ok("P3 — dialogue indicateur ouvert", (await page.locator('[data-testid="oryon-indicator-dialog"]').count()) === 1);
  ok("P3 — 7 indicateurs implémentés listés", (await page.locator('[data-testid^="oryon-indicator-add-"]').count()) === 7);
  await page.fill('[data-testid="oryon-indicator-search"]', "moving");
  await page.waitForTimeout(150);
  ok("P3 — recherche «moving» → SMA+EMA seulement", (await page.locator('[data-testid^="oryon-indicator-add-"]').count()) === 2);
  await page.fill('[data-testid="oryon-indicator-search"]', "zzzz");
  await page.waitForTimeout(150);
  ok("P3 — recherche sans résultat affiche l'état vide", (await page.locator("text=No indicator matches").count()) >= 1);
  await page.fill('[data-testid="oryon-indicator-search"]', "");
  await page.click('[data-testid="oryon-indicator-add-sma"]');
  await page.waitForTimeout(400);
  ok("P3 — SMA ajoutée, dialogue fermé", (await page.locator('[data-testid="oryon-indicator-dialog"]').count()) === 0);

  // ── 4. Overlay SMA + multiple instances ───────────────────────────────────
  ok(`P3 — 3 chips après ajout SMA (got ${await chipCount(page)})`, (await chipCount(page)) === 3);
  const labels1 = await chipLabels(page);
  ok("P3 — chip SMA 20 présent", labels1.some((l) => l.includes("SMA 20")));
  stats = await chartStats(page);
  ok(`P3 — overlay: pane count inchangé (got ${stats?.panes})`, stats?.panes === 3);
  ok(`P3 — 4 séries live (main + vol + rsi + sma) (got ${stats?.series})`, stats?.series === 4);
  await addIndicator(page, "sma");
  const smaIds = await page.locator('[data-indicator-type="sma"]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-indicator-id")),
  );
  ok(`P3 — double instance: ids distincts (${smaIds.join(" / ")})`, smaIds.length === 2 && smaIds[0] !== smaIds[1]);
  ok(`P3 — 4 chips (got ${await chipCount(page)})`, (await chipCount(page)) === 4);
  await page.screenshot({ path: `${OUT}/oryon-phase3-overlays.png` });

  // ── 5. MACD in its own native pane ────────────────────────────────────────
  await addIndicator(page, "macd");
  stats = await chartStats(page);
  ok(`P3 — MACD crée son pane natif (got ${stats?.panes})`, stats?.panes === 4);
  ok(`P3 — 8 séries live (main + 7 gérées) (got ${stats?.series})`, stats?.series === 8);
  await page.screenshot({ path: `${OUT}/oryon-phase3-panes.png` });

  // ── 6. Hide/show keeps the series; remove cleans up ───────────────────────
  const rsiChip = page.locator('[data-indicator-type="rsi"]').first();
  await rsiChip.locator('[data-testid="oryon-indicator-chip-visibility"]').click();
  await page.waitForTimeout(300);
  stats = await chartStats(page);
  ok(`P3 — RSI masquée: séries conservées (got ${stats?.series})`, stats?.series === 8);
  ok(`P3 — RSI masquée: panes conservés (got ${stats?.panes})`, stats?.panes === 4);
  await rsiChip.locator('[data-testid="oryon-indicator-chip-visibility"]').click();
  await page.waitForTimeout(300);

  const macdChip = page.locator('[data-indicator-type="macd"]').first();
  await macdChip.locator('[data-testid="oryon-indicator-chip-remove"]').click();
  await page.waitForTimeout(400);
  stats = await chartStats(page);
  ok(`P3 — MACD retirée: pane purgé (got ${stats?.panes})`, stats?.panes === 3);
  ok(`P3 — MACD retirée: séries purgées (got ${stats?.series})`, stats?.series === 5);
  ok(`P3 — 4 chips après retrait (got ${await chipCount(page)})`, (await chipCount(page)) === 4);

  // ── 7. Settings: parameter edit + validation + last-valid retention ───────
  const smaChip = page.locator('[data-indicator-type="sma"]').first();
  await smaChip.locator('[data-testid="oryon-indicator-chip-open"]').click();
  await page.waitForSelector('[data-testid="oryon-indicator-settings"]', { timeout: 5_000 });
  ok("P3 — éditeur ouvert sur SMA 20", (await page.locator('[data-testid="oryon-indicator-dialog-title"]').innerText()).includes("SMA 20"));
  await page.fill('[data-testid="oryon-indicator-param-period"]', "50");
  await page.click('[data-testid="oryon-indicator-apply"]');
  await page.waitForTimeout(400);
  const labels2 = await chipLabels(page);
  ok("P3 — période 50 appliquée (chip SMA 50)", labels2.some((l) => l.includes("SMA 50")));

  await page.locator('[data-indicator-type="sma"]').first().locator('[data-testid="oryon-indicator-chip-open"]').click();
  await page.waitForSelector('[data-testid="oryon-indicator-settings"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-indicator-param-period"]', "1");
  await page.click('[data-testid="oryon-indicator-apply"]');
  await page.waitForTimeout(200);
  ok("P3 — paramètre invalide → message d'erreur affiché", (await page.locator('[data-testid="oryon-indicator-error"]').count()) === 1);
  await page.click('[data-testid="oryon-indicator-cancel"]');
  await page.waitForTimeout(300);
  const labels3 = await chipLabels(page);
  ok("P3 — annulation: la dernière config VALIDE est conservée", labels3.filter((l) => l.includes("SMA 50")).length === 1);

  // ── 8. Persistence across reload ──────────────────────────────────────────
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  // MSW reseeds on full reload — auth may be gone; re-sign-in when needed.
  const relanded = await page
    .waitForSelector('[data-testid="oryon-workspace"], [data-testid="login-form"]', { timeout: 30_000 })
    .catch(() => null);
  if (relanded !== null && (await page.locator('[data-testid="login-form"]').count()) > 0) {
    await signIn(page);
    const navAgain = page.locator('a[href="/oryon"]').first();
    await navAgain.waitFor({ state: "visible", timeout: 30_000 });
    await navAgain.click();
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  }
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_500);
  ok(`P3 — rechargement: 4 chips restaurées (got ${await chipCount(page)})`, (await chipCount(page)) === 4);
  stats = await chartStats(page);
  ok(`P3 — rechargement: 3 panes restaurés (got ${stats?.panes})`, stats?.panes === 3);
  const labels4 = await chipLabels(page);
  ok("P3 — rechargement: SMA 50 + RSI 14 + Vol présents", labels4.some((l) => l.includes("SMA 50")) && labels4.some((l) => l.includes("RSI 14")) && labels4.some((l) => l.includes("Vol")));

  // ── 9. Instrument switch — chart-level setup survives ─────────────────────
  const symbolBefore = (await page.locator('[data-testid="oryon-legend-symbol"]').innerText()).trim();
  await page.click('[data-testid="oryon-instrument-trigger"]');
  await page.waitForTimeout(500);
  const optionTestIds = await page.locator('[data-testid^="oryon-instrument-option-"]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-testid")),
  );
  const target = optionTestIds.map((t) => t.replace("oryon-instrument-option-", "")).find((s) => s !== symbolBefore);
  ok(`P3 — un autre instrument est disponible (${symbolBefore} → ${target ?? "?"})`, Boolean(target));
  await page.click(`[data-testid="oryon-instrument-option-${target}"]`);
  await page.waitForTimeout(2_500);
  const symbolNow = (await page.locator('[data-testid="oryon-legend-symbol"]').innerText()).trim();
  ok(`P3 — instrument changé (${symbolBefore} → ${symbolNow})`, symbolNow !== symbolBefore);
  ok(`P3 — setup indicateur conservé entre instruments (got ${await chipCount(page)})`, (await chipCount(page)) === 4);
  stats = await chartStats(page);
  ok(`P3 — panes recalculés pour le nouveau symbole (got ${stats?.panes})`, stats?.panes === 3);

  // ── 10. Timeframe switch — same setup, recalculated ───────────────────────
  await page.click('[data-testid="oryon-tf-1H"]');
  await page.waitForTimeout(2_000);
  ok("P3 — changement d'unité de temps: chips conservées", (await chipCount(page)) === 4);
  ok("P3 — unité de temps affichée", (await page.locator('[data-testid="oryon-legend-interval"]').innerText()).includes("1H"));

  // ── 11. Drawings keep working next to indicators ──────────────────────────
  await page.click('[data-testid="oryon-tool-trendline"]');
  const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-drawing-list-toggle"]');
  await page.waitForTimeout(300);
  ok("P3 — dessin + indicateurs coexistent (1 tendance dans la liste)", (await page.locator('[data-testid^="oryon-drawing-row-"]').count()) === 1);
  await page.screenshot({ path: `${OUT}/oryon-phase3-drawings.png` });

  // ── 12. Main chart still functional (type switch) ─────────────────────────
  await page.click('[data-testid="oryon-type-line"]');
  await page.waitForTimeout(600);
  stats = await chartStats(page);
  ok(`P3 — bascule type ligne: panes intactes (got ${stats?.panes})`, stats?.panes === 3);
  ok(`P3 — bascule type ligne: indicateurs intacts (got ${await chipCount(page)})`, (await chipCount(page)) === 4);
  await page.click('[data-testid="oryon-type-candles"]');
  await page.waitForTimeout(400);

  await page.screenshot({ path: `${OUT}/oryon-phase3-final.png` });

  // ── console errors ────────────────────────────────────────────────────────
  ok("P3 — zéro erreur de console", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `CONSOLE ERRORS:\n${errors.join("\n")}\n`);
    console.log("Console errors:", errors.slice(0, 5));
  }

  await browser.close();
  console.log(`\n=== ORYON PHASE 3: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== RESULT: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(2);
});
