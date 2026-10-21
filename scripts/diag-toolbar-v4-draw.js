// Mini-diag: arm trend, click canvas twice, report drawing state.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
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
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureLogin(page);
  await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);

  const armed = await page.locator('[data-testid="oryon-tool-trend"]').getAttribute('aria-pressed');
  console.log('trend group aria-pressed BEFORE:', armed);

  await page.locator('[data-testid="oryon-tool-trend"]').click();
  await page.waitForTimeout(300);
  console.log('trend group aria-pressed AFTER arm:', await page.locator('[data-testid="oryon-tool-trend"]').getAttribute('aria-pressed'));

  const canvas = page.locator('[data-testid="oryon-chart-canvas"]').first();
  const box = await canvas.boundingBox();
  console.log('canvas box:', box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) });

  // move into the canvas first (hover), then click
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await page.waitForTimeout(200);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65);
  await page.waitForTimeout(200);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(500);

  const clearEnabled = await page.locator('[data-testid="oryon-drawings-clear"]').isEnabled();
  const undoEnabled = await page.locator('[data-testid="oryon-drawing-undo"]').isEnabled();
  const listEnabled = await page.locator('[data-testid="oryon-drawing-list-toggle"]').isEnabled();
  console.log('clear enabled:', clearEnabled, '| undo enabled:', undoEnabled, '| list enabled:', listEnabled);

  // open the objects dock even if disabled-click fails: try clicking list
  if (listEnabled) {
    await page.locator('[data-testid="oryon-drawing-list-toggle"]').click();
    await page.waitForTimeout(600);
    console.log('rows:', await page.locator('[data-testid^="oryon-drawing-row-"]').count());
    const dockBox = await page.locator('[data-testid="oryon-panel-objects"]').boundingBox();
    console.log('objects dock box:', dockBox && { x: Math.round(dockBox.x), y: Math.round(dockBox.y), w: Math.round(dockBox.width) });
  }
  console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
  await page.screenshot({ path: '/home/z/my-project/scripts/toolbar-v4-drawdiag.png' });
  await browser.close();
})();
