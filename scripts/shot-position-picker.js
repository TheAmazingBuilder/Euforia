// Screenshots: position TP/SL edge handles + TradingView palette picker.
const { chromium } = require('playwright');
const { armTool } = require('./oryon-probe-helpers.js');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) === 0) {
    await page.locator("#login-email").fill("trader@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz-demo-2026");
    await page.locator('[data-testid="login-submit"]').click();
    await sidebar.waitFor({ state: "visible", timeout: 20000 });
  }
  await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
  await page.waitForTimeout(8000);

  const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
  const x0 = box.x + box.width * 0.42;
  const y0 = box.y + box.height * 0.32;

  // Long position + select → handles visible.
  await armTool(page, "longpos");
  await page.mouse.click(x0 - 80, y0);
  await page.waitForTimeout(200);
  await page.mouse.click(x0 + 80, y0 + 60);
  await page.waitForTimeout(400);
  await page.mouse.click(x0, y0 + 30);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'scripts/position-handles.png' });

  // Settings → Symbol → picker open.
  await page.mouse.click(box.x + box.width * 0.68, box.y + box.height * 0.55, { button: 'right' });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="oryon-ctx-settings"]').click();
  await page.locator('[data-testid="oryon-chart-settings-dialog"]').waitFor({ state: "visible", timeout: 5000 });
  await page.locator('[data-testid="oryon-settings-tab-symbol"]').click();
  await page.locator('[data-testid="oryon-settings-up-color"]').click();
  await page.locator('[data-testid="oryon-settings-up-color-popover"]').waitFor({ state: "visible", timeout: 5000 });
  await page.locator('[data-testid="oryon-settings-up-color-swatch-2962ff"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scripts/tv-color-picker.png' });

  await browser.close();
  console.log("shots saved");
})();
