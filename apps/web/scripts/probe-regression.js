const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 120)));
  page.on("response", (r) => { if (r.status() >= 400 && !/socket\.io|candles|favicon|X-TransformPort/i.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url().slice(28, 90)}`); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const routes = ["/", "/trades", "/journal", "/playbook", "/analytics", "/calendar", "/discipline", "/academy", "/nofy", "/monitoring", "/settings"];
  for (const route of routes) {
    await page.locator(`nav[aria-label="Main navigation"] a[href="${route}"]`).click();
    await page.waitForTimeout(1600);
    const h1 = await page.locator("h1").first().textContent().catch(() => "NONE");
    console.log(`${route} → ${h1?.trim().slice(0, 40)}`);
  }
  console.log("ERRORS:", errors.length === 0 ? "none" : errors.slice(0, 6));
  await browser.close();
})();
