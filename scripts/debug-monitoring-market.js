const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 200)); });

  await page.goto(`${BASE}/monitoring?tab=market-data`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3_000);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove())).catch(() => {});
  console.log("URL:", page.url());
  console.log("h1:", await page.locator("h1").innerText().catch(() => "NONE"));
  console.log("market testid count:", await page.locator('[data-testid="monitoring-market"]').count());
  console.log("tab count:", await page.locator('[data-testid="monitoring-tablist"] [role="tab"]').count());
  console.log("body snippet:", (await page.evaluate(() => document.body.innerText)).slice(0, 600).replace(/\n+/g, " | "));
  console.log("ERRORS:", errors.length);
  errors.slice(0, 8).forEach((e) => console.log("  -", e));
  await page.screenshot({ path: "scripts/shots/debug-market-tab.png" });
  await browser.close();
})();
