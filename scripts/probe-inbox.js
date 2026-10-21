const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("request", (req) => {
    if (req.url().includes("/alerts")) console.log("REQ:", req.method(), req.url().slice(28, 90));
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="notification-bell"]').click();
  await page.waitForTimeout(800);
  const items = page.locator('[data-testid="notification-item"]');
  console.log("items:", await items.count());
  const firstText = await items.first().textContent();
  console.log("first item:", firstText?.slice(0, 80));
  console.log("aria:", await items.first().getAttribute("aria-label"));
  await items.first().click();
  await page.waitForTimeout(1200);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
