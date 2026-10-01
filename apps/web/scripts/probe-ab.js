/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.locator('nav[aria-label="Main navigation"] a[href="/analytics"]').click();
  await page.waitForTimeout(2200);

  await page.locator('[data-testid="analytics-reset"]').click();
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: "Strategy" }).first().click();
  await page.waitForTimeout(2500);

  const card = page.locator('[data-testid="ab-comparator"]');
  console.log("ab-comparator visible:", await card.isVisible());
  console.log("ab-comparator text (first 500):", (await card.innerText().catch(() => "<gone>")).slice(0, 500).replace(/\n/g, " | "));
  const selA = page.locator('[data-testid="ab-strategy-a"]');
  console.log("select A count:", await selA.count());
  if (await selA.count()) {
    console.log("select A value:", await selA.locator("select, [role=combobox]").first().innerText().catch(() => "?"));
  }
  console.log("ab-comparator-table count:", await page.locator('[data-testid="ab-comparator-table"]').count());
  await browser.close();
})();
