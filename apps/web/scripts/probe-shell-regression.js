/**
 * Spot regression probe — shell integrity after the FEATURES navigation
 * change. SPA-only: login, then walk existing pages through the sidebar and
 * confirm each still renders its header + primary surface.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node probe script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(600);

  const walk = [
    ["/accounts", /accounts/i],
    ["/", /dashboard|cosmoz|net p&l/i],
    ["/trades", /trades/i],
    ["/playbook", /playbook/i],
    ["/journal", /trade review|review/i],
    ["/analytics", /analytics/i],
    ["/settings", /settings/i],
  ];
  let pass = 0;
  for (const [href, pattern] of walk) {
    await page.locator(`nav[aria-label="Main navigation"] a[href="${href}"]`).first().click();
    await page.waitForURL(new RegExp(href.replace(/\//g, "\\/") === "\\/" ? /\/$/.source : href.replace(/\//g, "\\/")), { timeout: 30_000 }).catch(async () => {
      if (href === "/") await page.waitForURL(/\/$/, { timeout: 30_000 });
    });
    await page.waitForTimeout(700);
    const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    const ok = pattern.test(h1) || (await page.locator("main, section").first().innerText()).length > 100;
    console.log(`${ok ? "PASS" : "FAIL"} — ${href} (h1="${h1}")`);
    if (ok) pass += 1;
  }
  console.log(`\n${pass}/${walk.length} shell pages OK; pageerrors=${errors.length}`);
  await browser.close();
  process.exit(pass === walk.length && errors.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  process.exit(1);
});
