const { chromium } = require('playwright');
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
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded' });
  await ensureLogin(p);
  await p.goto('http://localhost:3001/oryon', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(13000);
  const hasHandle = await p.evaluate(() => typeof window.__ORYON_ECO_APPROACH_DEBUG__);
  console.log('debug handle:', hasHandle);
  const hasFiredFn = await p.evaluate(() => { try { window.__ORYON_ECO_APPROACH_DEBUG__?.inject("Probe Rate Decision", "EUR", 3); return "injected"; } catch (e) { return "err " + e; } });
  console.log('inject:', hasFiredFn);
  for (let i = 0; i < 5; i++) {
    await p.waitForTimeout(5000);
    const toasts = await p.evaluate(() => {
      const region = document.querySelector('[data-sonner-toaster]');
      return { n: region ? region.querySelectorAll('[data-sonner-toast]').length : 0, text: region ? region.innerText.slice(0, 200) : "", testid: document.querySelectorAll('[data-testid="oryon-eco-approach-toast"]').length };
    });
    console.log(`t+${(i+1)*5}s toasts:`, toasts.n, '| testid hits:', toasts.testid, '|', toasts.text.replace(/\n/g, ' | ').slice(0, 110));
    if (toasts.n > 0) break;
  }
  const fired = await p.evaluate(() => window.__ORYON_ECO_APPROACH_DEBUG__?.hasFired("debug-eco-probe-rate-decision", 30));
  console.log('hasFired(milestone 30):', fired);
  await b.close();
})();
