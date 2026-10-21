const { chromium } = require('playwright');
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 460 } })).newPage();
  p.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}]`, r.request().method(), r.url().slice(0, 140)); });
  await p.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await ensureLogin(p);
  await p.goto('http://localhost:3000/oryon', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  await b.close();
})();
