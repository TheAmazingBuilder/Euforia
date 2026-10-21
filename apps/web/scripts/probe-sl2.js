const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0, 400)));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.waitForTimeout(5000);
  const body = (await page.locator("body").textContent()) ?? "";
  console.log("has skeleton:", await page.locator(".animate-pulse").count());
  console.log("has ErrorSession:", body.includes("Session data unavailable"));
  console.log("has header:", await page.locator('[data-testid="session-live-header"]').count());
  console.log("ERRS:");
  for (const e of [...new Set(errs)].slice(0, 10)) console.log(" ", e);
  await browser.close();
})();
