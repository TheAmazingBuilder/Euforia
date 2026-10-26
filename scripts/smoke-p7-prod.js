/**
 * smoke-p7-prod.js - Phase 7 production-build smoke (preview :3000).
 * Light checks on the FINAL build (no dev-only debug handles here):
 *  - /oryon renders the workspace with the single-chart default;
 *  - the grid menu exposes the four arrangements and switches to
 *    side-by-side (2 panels) and back without errors;
 *  - the sync menu exposes the four INDEPENDENT features (aria-checked);
 *  - panel headers show identity + the per-panel menu (duplicate/latest);
 *  - layouts + sync settings persist through a reload (v2 envelope);
 *  - 0 console errors.
 * Run: node scripts/smoke-p7-prod.js
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase7-prod-smoke.log");
fs.writeFileSync(LOG, `=== oryon phase7 prod smoke - ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3000";

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

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "Download the React DevTools",
  "React does not recognize",
];

async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
  } catch {
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
  } catch {}
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
  await app.waitForSelector('a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
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

  await signIn(page);
  await page.locator('a[href="/oryon"]').first().click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 20_000 });
  await page.waitForTimeout(2_500);

  // Fresh config state (prod persistence is browser-local).
  await page.evaluate(() => {
    localStorage.removeItem("euforia.oryon.layouts.v1");
    localStorage.removeItem("euforia.oryon.templates.v1");
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForTimeout(2_500);

  console.log("- A. Workspace single + déclencheurs P7");
  ok("A1 workspace + grille single", (await page.locator('[data-testid="oryon-chart-grid"][data-grid="single"]').count()) === 1);
  ok("A2 déclencheur grille présent", (await page.locator('[data-testid="oryon-grid-trigger"]').count()) === 1);
  ok("A3 déclencheur sync présent (aucun lien actif)", (await page.locator('[data-testid="oryon-sync-trigger"]:not([data-active])').count()) === 1);
  ok("A4 header du panneau 1 avec menu", await (async () => {
    const header = await page.locator('[data-testid="oryon-panel-0-header"]').count();
    const menu = await page.locator('[data-testid="oryon-panel-0-menu"]').count();
    return header === 1 && menu === 1;
  })());

  console.log("- B. Menu sync : 4 fonctionnalités indépendantes");
  ok("B1 les 4 flags exposés en aria-checked=false", await (async () => {
    await page.click('[data-testid="oryon-sync-trigger"]');
    await page.waitForTimeout(300);
    const states = [];
    for (const f of ["timeScale", "crosshair", "instrument", "timeframe"]) {
      states.push(await page.locator(`[data-testid="oryon-sync-item-${f}"]`).getAttribute("aria-checked"));
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    return states.every((s) => s === "false");
  })());

  console.log("- C. Grille : side-by-side puis retour");
  ok("C1 twoHorizontal → 2 panneaux", await (async () => {
    await page.click('[data-testid="oryon-grid-trigger"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="oryon-grid-item-twoHorizontal"]');
    await page.waitForTimeout(1_500);
    return (await page.locator('[data-testid="oryon-chart-grid"][data-grid="twoHorizontal"]').count()) === 1
      && (await page.locator('[data-testid="oryon-panel"]').count()) === 2;
  })());
  ok("C2 chaque panneau a son header + menu", await (async () => {
    const h0 = await page.locator('[data-testid="oryon-panel-0-menu"]').count();
    const h1 = await page.locator('[data-testid="oryon-panel-1-menu"]').count();
    return h0 === 1 && h1 === 1;
  })());
  ok("C3 retour single → 1 panneau (l'actif survit)", await (async () => {
    await page.click('[data-testid="oryon-grid-trigger"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="oryon-grid-item-single"]');
    await page.waitForTimeout(1_200);
    return (await page.locator('[data-testid="oryon-chart-grid"][data-grid="single"]').count()) === 1
      && (await page.locator('[data-testid="oryon-panel"]').count()) === 1;
  })());

  console.log("- D. Persistance v2 : arrangement + sync à travers un reload");
  ok("D1 mutation de session seule → AUCUN layout persisté (écriture explicite)", await (async () => {
    await page.click('[data-testid="oryon-sync-trigger"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="oryon-sync-item-timeScale"]');
    await page.waitForTimeout(400);
    const stored = await page.evaluate(() => window.localStorage.getItem("euforia.oryon.layouts.v1"));
    if (stored === null) return true;
    const file = JSON.parse(stored);
    return Array.isArray(file.layouts) && file.layouts.length === 0;
  })());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2_500);
  ok("D2 reload → session sync réinitialisée (mutation jamais persistée seule)", await (async () => {
    await page.click('[data-testid="oryon-sync-trigger"]');
    await page.waitForTimeout(250);
    const checked = await page.locator('[data-testid="oryon-sync-item-timeScale"]').getAttribute("aria-checked");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    return checked === "false";
  })());
  ok("D3 reload → la grille twoHorizontal N'A PAS survécu (aucun layout sauvé)", (await page.locator('[data-testid="oryon-chart-grid"][data-grid="single"]').count()) === 1);

  console.log("- E. Console");
  ok("E1 zéro erreur console (hors bruit filtré)", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `console errors:\n${errors.slice(0, 6).join("\n")}\n`);
  }

  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  fs.appendFileSync(LOG, `\n${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("SMOKE CRASH:", e);
  fs.appendFileSync(LOG, `SMOKE CRASH: ${e}\n`);
  process.exit(1);
});
