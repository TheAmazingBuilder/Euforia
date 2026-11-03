/* Diagnostic probe - dump per-tab visible strings of the Playbook module. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-playbook";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.locator('button[data-testid="tab-overview"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);

  // FR context to read FR strings
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-fr"]').click();
  await page.waitForTimeout(600);

  const dump = async (tab, name) => {
    await page.locator(`button[data-testid="tab-${tab}"]`).click();
    await page.waitForTimeout(1200);
    const txt = await page.locator("main, body").first().innerText();
    const idx = txt.indexOf("Nouvelle stratégie");
    console.log(`\n===== ${name} (${tab}) =====`);
    console.log(txt.slice(idx >= 0 ? idx : 0).slice(0, 2000).replace(/\n{2,}/g, "\n"));
    await page.screenshot({ path: `${SHOTS}/probe-${tab}.png`, fullPage: true });
  };

  await dump("overview", "OVERVIEW FR");
  await dump("rules", "RULES FR");
  await dump("checklists", "CHECKLISTS FR");
  await dump("performance", "PERFORMANCE FR");

  await browser.close();
})().catch((e) => { console.error("PROBE ERROR:", e.message); process.exit(2); });
