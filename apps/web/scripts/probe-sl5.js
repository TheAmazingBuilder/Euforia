const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 250)));
  page.on("response", (r) => { if (r.url().includes("/session-live/")) console.log("API:", r.status(), r.request().method(), r.url().slice(28)); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(800);

  await page.locator('[data-testid="start-session-button"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="start-session-confirm"]').click();
  await page.waitForTimeout(1500);
  console.log("active:", await page.locator('[data-testid="session-status-active"]').count());

  await page.locator('[data-testid="end-session-button"]').click();
  await page.waitForTimeout(700);
  console.log("end dialog:", await page.locator('[data-testid="end-session-dialog"]').count());
  await page.locator('[data-testid="reflection-happened"]').fill("Probe review.");
  await page.locator('[data-testid="end-session-confirm"]').click();
  await page.waitForTimeout(2000);
  console.log("summary:", await page.locator('[data-testid="session-summary"]').count());
  console.log("dialog text:", (await page.locator('[data-testid="end-session-dialog"]').textContent())?.slice(0, 200));
  await browser.close();
})();
