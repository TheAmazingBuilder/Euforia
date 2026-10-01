/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shots = [];
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.click('a[href="/academy"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/shots/academy-final-overview.png" });
  // Weekly plan + reader with vignette + TOC
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "scripts/shots/academy-final-paths.png" });
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(1100);
  await page.locator('[data-testid^="academy-lesson-item-"]').first().click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "scripts/shots/academy-final-lesson.png" });
  // Practice (flashcards + ledger)
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/shots/academy-final-practice.png" });
  // Progress (milestones + certs)
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('[data-testid="academy-milestones"]')?.scrollIntoView());
  await page.waitForTimeout(900);
  await page.screenshot({ path: "scripts/shots/academy-final-progress.png" });
  await browser.close();
  console.log("SHOTS_OK");
})();
