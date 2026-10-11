/** Final mobile + desktop shots of the coach with the fixed composer. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/coach-mobile-final.png" });

  // Mobile with one exchange
  await page.locator('button:has-text("How is my discipline trending?")').click();
  await page
    .locator('[aria-label="Coach is typing"]')
    .waitFor({ state: "detached", timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/shots/coach-mobile-exchange.png" });

  await browser.close();
  console.log("MOBILE SHOTS DONE");
})();
