/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]');
  await page.waitForTimeout(1500);
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1000);
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(1000);
  await page.locator('[data-testid^="academy-lesson-item-"]').first().click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "scripts/shots/academy-phase1-lesson-vignette.png", fullPage: false });
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "scripts/shots/academy-phase1-progress-ring.png", fullPage: false });
  await browser.close();
})();
