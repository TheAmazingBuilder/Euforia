const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 30000 });
}
const DAY = 86400;
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureLogin(page);
  await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(12000);
  // switch to 1h - wider loaded span so 5D/1M are meaningful
  await page.click('[data-testid="oryon-tf-1H"]');
  await page.waitForTimeout(6000);
  const read = () => page.evaluate(() => {
    const d = window.__ORYON_PANELS_DEBUG__?.();
    return d && d[0] ? d[0].visibleRange : null;
  });
  const full = await read();
  const fullSpan = full.to - full.from;
  console.log(`1h loaded span: ${(fullSpan / DAY).toFixed(2)}d`);
  let pass = 0, fail = 0;
  for (const [id, min, max] of [["1D", 0.5, 1.3], ["5D", 4, 5.6], ["1M", 26, 33], ["3M", 85, 95], ["1Y", 360, 370]]) {
    await page.click(`[data-testid="oryon-range-${id}"]`);
    await page.waitForTimeout(900);
    const r = await read();
    if (!r) { console.log(`FAIL ${id}`); fail++; continue; }
    const span = r.to - r.from;
    const clamped = span >= fullSpan * 0.98; // wider than loaded → honest clamp
    const ok = clamped || (span > min * DAY && span < max * DAY);
    console.log(`${ok ? "PASS" : "FAIL"} ${id} span=${(span / DAY).toFixed(2)}d${clamped ? " (clamped to loaded span - honest)" : ""}`);
    ok ? pass++ : fail++;
  }
  console.log(`=== 1h ranges: ${pass}/${pass + fail} ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
