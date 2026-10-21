/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text().slice(0, 200)}`); });

  await page.goto(`${BASE}/nofy`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);

  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1500);

  const row = page.locator('[data-testid="nofy-note-row"]', { hasText: "Why I entered too early" });
  console.log("row count:", await row.count());
  await row.click();
  await page.waitForTimeout(2200);

  console.log("url:", page.url());
  console.log("editor count:", await page.locator('[data-testid="nofy-editor"]').count());
  console.log("editor-loading count:", await page.locator('[data-testid="nofy-editor-loading"]').count());
  console.log("editor-error count:", await page.locator('[data-testid="nofy-editor-error"]').count());
  console.log("note-menu count:", await page.locator('[data-testid="nofy-note-menu"]').count());
  console.log("blocks:", await page.locator('[data-testid="nofy-block"]').count());
  console.log("errors:", errors.slice(0, 8));

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("--- body ---\n", bodyText);

  await browser.close();
})();
