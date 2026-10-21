/** Probe: client-side Link to /settings#risk — what does the app show? */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/risk`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.click('[data-testid="risk-engine-card"] a[href="/settings#risk"]');
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    visibleCards: [...document.querySelectorAll('[data-testid^="settings-"]')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.getAttribute("data-testid"))
      .slice(0, 10),
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
