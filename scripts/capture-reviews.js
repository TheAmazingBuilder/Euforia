/** Capture Trade Reviews (desktop) pour le tour visuel. */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/trades/reviews", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "/home/z/my-project/download/preview-cosmoz/desktop/trade-reviews.png",
    fullPage: true,
  });
  await browser.close();
  console.log("OK -> download/preview-cosmoz/desktop/trade-reviews.png");
})();
