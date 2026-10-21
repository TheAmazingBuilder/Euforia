/** One-off: render the sidebar + login to check the new orbital-comet logo. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const aside = page.locator("aside").first();
  await aside.screenshot({ path: "scripts/shots/logo-sidebar.png" });
  const logo = page.locator("aside a[aria-label='Cosmoz — Dashboard'] svg").first();
  await logo.screenshot({ path: "scripts/shots/logo-mark.png" });
  console.log("logo shots saved");
  await browser.close();
})();
