/** Debug: dump panels debug + candle span + instrument class on /oryon. */
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 160));
  });
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 15_000 });
    const demo = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demo.count()) > 0) await demo.click();
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(3_000);
    if ((await page.locator('[data-testid="login-mfa-code"]').count()) > 0) {
      const hint = (await page.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
      if (hint) {
        await page.fill('[data-testid="login-mfa-code"]', hint[0]);
        await page.keyboard.press("Enter");
      }
    }
    await page.waitForTimeout(2_000);
  } catch (e) {
    console.log("signin path:", String(e).slice(0, 120));
  }
  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
  });
  await page.waitForTimeout(4_000);

  const data = await page.evaluate(async () => {
    const read = window.__ORYON_PANELS_DEBUG__;
    const panels = typeof read === "function" ? read() : null;
    const token = window.localStorage.getItem("token") ?? window.localStorage.getItem("auth-token");
    let instruments = null;
    try {
      const res = await fetch("/api/instruments", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      instruments = (await res.json()).instruments?.slice(0, 4)?.map((i) => ({ s: i.symbol, c: i.assetClass })) ?? null;
    } catch (e) {
      instruments = String(e).slice(0, 100);
    }
    return { panels, instruments };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
