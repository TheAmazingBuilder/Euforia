// Diagnose "This page couldn't load" on /oryon - capture console + page errors
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// --- login bootstrap (mirrors apps/web/scripts/helpers/login.js) ---
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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      errors.push(`[console.${m.type()}] ${m.text().slice(0, 500)}`);
    }
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e && e.stack ? e.stack : e).slice(0, 1500)}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} :: ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`);
  });

  console.log('== goto', BASE + '/oryon');
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureLogin(page);
    await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);
  } catch (e) {
    console.log('NAV FAILED:', String(e).slice(0, 800));
  }

  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 600);
  console.log('== URL:', page.url());
  console.log('== body text (first 600):\n', bodyText);
  console.log('== captured (' + errors.length + ') ==');
  for (const e of errors.slice(0, 40)) console.log(e);

  await page.screenshot({ path: '/home/z/my-project/scripts/diag-oryon-load.png' });
  await browser.close();
})();
