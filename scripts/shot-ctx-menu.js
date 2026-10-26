// Beauty shots: context menu open + settings dialog.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
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
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4, { button: 'right' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/z/my-project/scripts/ctx-menu-open.png' });

  await page.locator('[data-testid="oryon-ctx-settings"]').click();
  await page.waitForTimeout(700);
  // Symbol tab is the default - pick a preset up-color to show the live apply.
  await page.locator('[data-testid="oryon-settings-up-color"]').fill('#22c55e').catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/z/my-project/scripts/ctx-settings-open.png' });
  await page.keyboard.press('Escape');
  await browser.close();
  console.log("shots saved");
})();
