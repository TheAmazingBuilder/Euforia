/**
 * Profile redesign captures - the four tabs (personal/account/security/
 * notifications) against the reference design shots.
 * Run: node scripts/capture-profile.js   (dev server on :3000)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  const tabs = ["personal", "account", "security", "notifications"];
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="profile-view"]', { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "scripts/shots/profile-personal.png", fullPage: true });

  for (const tab of tabs.slice(1)) {
    await page.evaluate((t) => {
      const el = document.querySelector(`[data-testid="profile-tab-${t}"]`);
      if (el instanceof HTMLElement) el.click();
    }, tab);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `scripts/shots/profile-${tab}.png`, fullPage: true });
    console.log("captured", tab);
  }

  // Events + Tasky standalone modules
  for (const [path, name] of [["/events", "module-events"], ["/tasky", "module-tasky"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: false });
    console.log("captured", name);
  }

  await browser.close();
  console.log("DONE");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
