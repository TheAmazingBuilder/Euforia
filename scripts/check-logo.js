/** Quick logo check: sidebar brand (desktop + collapsed) + mobile sheet. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/shots/logo-desktop.png" });
  await page.goto(BASE + "/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/shots/logo-settings.png" });
  // Mobile sheet
  const mp = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mp.goto(BASE + "/", { waitUntil: "networkidle" });
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: "scripts/shots/logo-mobile.png" });
  await browser.close();
  console.log("done");
})();
