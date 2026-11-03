/** Diagnose Phase 9 tab failures - dumps tabpanel text + console errors. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e).slice(0, 400)}`));
  await page.goto("http://localhost:3000/analytics", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: "Strategy" }).click();
  await page.waitForTimeout(800);
  console.log("STRATEGY text:", (await page.locator('[role="tabpanel"]:visible').textContent()).slice(0, 300));
  await page.getByRole("tab", { name: "What-If" }).click();
  await page.waitForTimeout(1000);
  console.log("WHATIF text:", (await page.locator('[role="tabpanel"]:visible').textContent()).slice(0, 300));
  console.log("--- ERRORS ---");
  errors.slice(0, 10).forEach((e) => console.log(e.slice(0, 250)));
  await browser.close();
})();
