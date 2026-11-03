/**
 * Typography audit captures - dashboard vs recognition vs accounts vs profile.
 * Run: node scripts/capture-audit-typo.js   (server on :3000, mock mode)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const shots = [
    ["/", "audit-dashboard"],
    ["/recognition", "audit-recognition"],
    ["/accounts", "audit-accounts"],
    ["/profile", "audit-profile"],
    ["/analytics", "audit-analytics"],
  ];
  for (const [path, name] of shots) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: false });
    console.log("captured", name);
  }

  await browser.close();
  console.log("DONE");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
