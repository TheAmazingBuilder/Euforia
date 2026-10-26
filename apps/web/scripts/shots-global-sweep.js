/**
 * Visual QA - full-page screenshots of every app page (desktop 1440) plus a
 * mobile 390 sample set, and a light-theme sample. Output: scripts/shots/global-sweep/
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/apps/web/scripts/shots/global-sweep";
const FS = require("node:fs");

const PAGES = [
  ["dashboard", "/"],
  ["accounts", "/accounts"],
  ["session", "/session"],
  ["trades", "/trades"],
  ["journal", "/journal"],
  ["playbook", "/playbook"],
  ["planner", "/planner"],
  ["import", "/import"],
  ["analytics", "/analytics"],
  ["calendar", "/calendar"],
  ["discipline", "/discipline"],
  ["academy", "/academy"],
  ["events", "/events"],
  ["tasky", "/tasky"],
  ["nofy", "/nofy"],
  ["lot-size", "/features/lot-size"],
  ["compounding", "/features/compounding"],
  ["pips", "/features/pip-value"],
  ["monitoring", "/monitoring"],
  ["integrations", "/integrations"],
  ["security", "/security"],
  ["settings", "/settings"],
  ["profile", "/profile"],
];

const MOBILE_SET = ["dashboard", "accounts", "tasky", "events", "nofy", "session"];

(async () => {
  FS.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ensureLogin(page);
  await page.waitForTimeout(1500);

  for (const [name, href] of PAGES) {
    try {
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2400);
      await page.screenshot({ path: `${OUT}/desktop-${name}.png`, fullPage: false });
      console.log(`shot desktop-${name}.png`);
    } catch (e) {
      console.log(`FAIL desktop-${name}: ${String(e).slice(0, 80)}`);
    }
  }

  // Account detail (click-through)
  await page.goto(`${BASE}/accounts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2200);
  await page.locator('[data-testid^="accounts-card-"] [role="link"]').first().click();
  await page.waitForURL(/\/accounts\/.+/, { timeout: 15_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/desktop-account-detail.png` });
  console.log("shot desktop-account-detail.png");

  // Mobile sample
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of MOBILE_SET) {
    const href = PAGES.find(([n]) => n === name)[1];
    try {
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2400);
      await page.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: false });
      console.log(`shot mobile-${name}.png`);
    } catch (e) {
      console.log(`FAIL mobile-${name}: ${String(e).slice(0, 80)}`);
    }
  }

  // Light theme sample
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, href] of [["dashboard", "/"], ["accounts", "/accounts"], ["analytics", "/analytics"]]) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/light-${name}.png` });
    console.log(`shot light-${name}.png`);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));

  await browser.close();
  console.log("DONE");
})();
