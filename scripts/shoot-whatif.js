/** Fresh viewport captures of the What-If tab (no fullPage fixed-artifact). */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/analytics", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: "What-If" }).click();
  await page.getByText("Peak capture").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.locator("main").screenshot({ path: "scripts/shots/p9/what-if-scatter-fresh.png" });
  await browser.close();
  console.log("done");
})();
