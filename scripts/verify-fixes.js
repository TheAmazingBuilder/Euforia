/**
 * Re-capture after interaction fixes: dashboard / trades / session.
 * Usage: node scripts/verify-fixes.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/audit";

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await settle(page);
  await page.screenshot({ path: `${OUT}/fix-dashboard.png`, fullPage: true });
  console.log("fix-dashboard.png");

  await page.goto(`${BASE}/trades`);
  await settle(page);
  // Scrolled state to check the sticky header.
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-testid='trades-table'] .overflow-y-auto, [data-testid='trades-table'] .overflow-x-auto");
    if (scroller) scroller.scrollTop = 600;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fix-trades-scrolled.png`, fullPage: false });
  console.log("fix-trades-scrolled.png");

  await page.goto(`${BASE}/session`);
  await settle(page);
  await page.screenshot({ path: `${OUT}/fix-session.png`, fullPage: false });
  console.log("fix-session.png");
  await page.close();

  // Mobile: dashboard + session (toast offset) + trades (fade hint).
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/session`);
  await settle(mobile);
  await mobile.screenshot({ path: `${OUT}/fix-session-m390.png`, fullPage: false });
  console.log("fix-session-m390.png");

  await mobile.goto(`${BASE}/trades`);
  await settle(mobile);
  await mobile.screenshot({ path: `${OUT}/fix-trades-m390.png`, fullPage: false });
  console.log("fix-trades-m390.png");
  await mobile.close();

  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
