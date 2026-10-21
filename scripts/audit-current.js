/**
 * Audit harness — captures ALL main routes (full page) for the
 * "professional interactions" quality pass.
 * Usage: node scripts/audit-current.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/audit";
const ROUTES = [
  ["/", "dashboard"],
  ["/trades", "trades"],
  ["/session", "session"],
  ["/playbook", "playbook"],
  ["/discipline", "discipline"],
  ["/journal", "journal"],
  ["/goals", "goals"],
  ["/calendar", "calendar"],
  ["/settings", "settings"],
  ["/analytics", "analytics"],
];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();

  // Desktop 1440×900, dark-blue, full-page captures.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await settle(page);
  for (const [route, name] of ROUTES) {
    await page.goto(`${BASE}${route}`);
    await settle(page);
    await page.screenshot({ path: `${OUT}/au-${name}.png`, fullPage: true });
    console.log(`au-${name}.png`);
  }
  await page.close();

  // Mobile 390 — key routes.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const [route, name] of [["/", "dashboard"], ["/trades", "trades"], ["/session", "session"]]) {
    await mobile.goto(`${BASE}${route}`);
    await settle(mobile);
    await mobile.screenshot({ path: `${OUT}/au-${name}-m390.png`, fullPage: false });
    console.log(`au-${name}-m390.png`);
  }
  await mobile.close();

  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
