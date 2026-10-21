const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 200)); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.waitForTimeout(4000);
  console.log("URL:", page.url());
  console.log("H1:", await page.locator("h1").first().textContent().catch(() => "none"));
  console.log("header testid count:", await page.locator('[data-testid="session-live-header"]').count());
  console.log("market row count:", await page.locator('[data-testid="session-market-row"]').count());
  const body = await page.locator("body").textContent();
  console.log("BODY has 'Session Live':", body?.includes("Session Live"));
  console.log("ERRORS:", errs.slice(0, 8));
  await browser.close();
})();
