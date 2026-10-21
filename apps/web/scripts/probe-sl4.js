const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.text().includes("sl-debug")) console.log("DBG:", m.text().slice(0, 160)); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.waitForTimeout(2500);
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 10000 });

  // Arm HLINE
  await page.locator('[data-testid="drawings-button"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="drawing-tool-HLINE"]').click();
  await page.waitForTimeout(500);
  console.log("hint visible:", await page.locator('[data-testid="chart-tool-hint"]').isVisible());
  console.log("popover still open:", await page.locator('[data-testid="drawings-popover"]').count());

  // Click on the chart
  const box = await page.locator('[data-testid="analysis-chart"]').boundingBox();
  console.log("chart box:", box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "null");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.waitForTimeout(700);

  // Reopen popover to check list
  await page.locator('[data-testid="drawings-button"]').click();
  await page.waitForTimeout(400);
  const count = await page.locator('[data-testid="drawing-list"] li').count();
  console.log("drawing count:", count);
  await browser.close();
})();
