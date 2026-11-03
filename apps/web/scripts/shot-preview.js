/**
 * shot-preview.js - real screenshots of the current build for the IM preview.
 *   1. / (dashboard shell) - desktop dark 1440x900
 * Saves PNGs to /home/z/my-project/download/.
 * Run: node scripts/shot-preview.js  (server on :3000, mock mode)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/download";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // ── Dashboard shell ──
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: false });
  console.log("SHOT OK: dashboard.png");
  const body = await page.locator("body").textContent();
  console.log("BODY has Charty:", body?.includes("Charty"));

  await browser.close();
})().catch((e) => { console.error("FATAL:", String(e).slice(0, 400)); process.exit(1); });
