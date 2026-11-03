/**
 * smoke-p6-prod.js - Phase 6 production-build smoke (preview :3000).
 * Light checks on the FINAL build (no dev-only debug handles here):
 *  - /oryon renders the workspace;
 *  - the layouts trigger shows the active layout name (default state);
 *  - the layouts menu opens with its honest empty state and the
 *    restore-default action;
 *  - the templates menu opens with its honest empty state;
 *  - a full layout save-as roundtrip works against the production build;
 *  - 0 console errors.
 * Run: node scripts/smoke-p6-prod.js
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase6-prod-smoke.log");
fs.writeFileSync(LOG, `=== oryon phase6 prod smoke - ${new Date().toISOString()} ===\n`);

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
  if ((await demoButton.count()) > 0) await demoButton.click();
  else {
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
  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 30_000 });
  await page.waitForTimeout(2_500);

  ok("P1 workspace rendu en production", true);
  ok("P2 déclencheur layouts présent", (await page.locator('[data-testid="oryon-layouts"]').count()) === 1);
  ok(
    "P3 nom actif affiché (Default layout)",
    ((await page.locator('[data-testid="oryon-layout-active-name"]').innerText()).trim()) === "Default layout",
  );

  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  ok(
    "P4 menu layouts : état vide honnête",
    (await page.locator('[data-testid="oryon-layout-menu"]', { hasText: "No saved layouts yet" }).count()) === 1,
  );

  // Roundtrip save-as sur le build final.
  await page.click('[data-testid="oryon-layout-save-as"]');
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-layout-name-input"]', "Prod Smoke");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(800);
  ok(
    "P5 save-as fonctionne en production",
    ((await page.locator('[data-testid="oryon-layout-active-name"]').innerText()).trim()) === "Prod Smoke",
  );
  const file = await page.evaluate(() => window.localStorage.getItem("euforia.oryon.layouts.v1"));
  ok("P6 enveloppe layouts persistée", file !== null && JSON.parse(file).layouts.length === 1);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.click('[data-testid="oryon-templates"]');
  await page.waitForSelector('[data-testid="oryon-template-menu"]', { timeout: 5_000 });
  ok(
    "P7 menu templates : état vide honnête",
    (await page.locator('[data-testid="oryon-template-menu"]', { hasText: "No templates yet" }).count()) === 1,
  );
  await page.keyboard.press("Escape");

  ok("P8 0 erreur console", errors.length === 0);
  if (errors.length > 0) fs.appendFileSync(LOG, `errors: ${JSON.stringify(errors.slice(0, 5))}\n`);

  await browser.close();
  console.log(`\nPROD SMOKE P6: ${pass} PASS / ${fail} FAIL`);
  fs.appendFileSync(LOG, `\n${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("smoke crashed:", e);
  fs.appendFileSync(LOG, `crashed: ${e}\n`);
  process.exit(1);
});
