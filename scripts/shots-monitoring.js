const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/monitoring?tab=api", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove())).catch(() => {});
  await page.screenshot({ path: "scripts/shots/monitoring-api-dark.png" });
  await page.goto("http://localhost:3000/monitoring?tab=market-data", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove())).catch(() => {});
  await page.screenshot({ path: "scripts/shots/monitoring-market-dark.png" });
  await browser.close();
  console.log("shots OK");
})();
