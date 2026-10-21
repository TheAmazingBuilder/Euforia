/** Screenshots — pattern drill under different candle inks. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1600);
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(1800);

  const drill = page.locator('section[aria-label="Identify the pattern"]');
  await page.click('[data-testid="academy-ink-inverse"]');
  await page.waitForTimeout(400);
  await drill.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await drill.screenshot({ path: "scripts/shots/pattern-drill-inverse.png" });

  await page.click('[data-testid="academy-ink-ocean"]');
  await page.waitForTimeout(400);
  await drill.screenshot({ path: "scripts/shots/pattern-drill-ocean.png" });

  await browser.close();
  console.log("shots saved");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
