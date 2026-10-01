const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/academy", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/shots/academy-color-overview-full.png", fullPage: true });
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scripts/shots/academy-color-courses-full.png", fullPage: true });
  await browser.close();
  console.log("done");
})();
