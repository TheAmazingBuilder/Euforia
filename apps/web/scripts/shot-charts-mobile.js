/** Mobile viewport shot of /charts - responsive + touch affordances. */
/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  // Login directly - on mobile the nav is a closed drawer (ensureLogin waits
  // for it forever), so authenticate, then navigate straight to the module.
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("**/", { timeout: 20_000 }).catch(() => {});
  await page.goto("http://localhost:3000/charts", { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-testid="trading-chart"] canvas').first();
  await canvas.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(1500);
  const box = await canvas.boundingBox();
  console.log(`mobile canvas: ${Math.round(box.width)}x${Math.round(box.height)}`);
  await page.screenshot({ path: "scripts/shots/charts-mobile.png", fullPage: false });
  await browser.close();
  console.log("MOBILE_SHOT_OK");
})().catch((error) => {
  console.error("CRASH:", error.message);
  process.exit(1);
});
