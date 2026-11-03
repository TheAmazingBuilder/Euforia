/**
 * Design verification harness (playwright skill → visual verification).
 * Captures the redesigned COSMOZ screens across themes × viewports.
 * Usage: node scripts/verify-redesign.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts";
const THEMES = ["dark-blue", "dark", "light"];

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  // Let CSS variables settle after the attribute flip.
  await page.waitForTimeout(250);
}

async function settle(page) {
  // Let data + fonts + entrance choreography finish.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();

  // Desktop 1440×900 - 3 themes on the dashboard.
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(BASE);
  await settle(desktop);
  for (const theme of THEMES) {
    await setTheme(desktop, theme);
    await desktop.screenshot({ path: `${OUT}/rd-dashboard-${theme}.png`, fullPage: false });
    console.log(`rd-dashboard-${theme}.png`);
  }

  // Route sweep (dark-blue) - shell + reveal + cards on key screens.
  const routes = [
    ["/trades", "trades"],
    ["/session", "session"],
    ["/playbook", "playbook"],
    ["/analytics", "analytics"],
  ];
  await setTheme(desktop, "dark-blue");
  for (const [route, name] of routes) {
    await desktop.goto(`${BASE}${route}`);
    await settle(desktop);
    await desktop.screenshot({ path: `${OUT}/rd-${name}.png`, fullPage: false });
    console.log(`rd-${name}.png`);
  }
  await desktop.close();

  // Mobile 390×844 - bottom nav + FAB + KPI stacking.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(BASE);
  await settle(mobile);
  await setTheme(mobile, "dark-blue");
  await mobile.screenshot({ path: `${OUT}/rd-dashboard-mobile-390.png`, fullPage: false });
  console.log("rd-dashboard-mobile-390.png");
  await mobile.goto(`${BASE}/session`);
  await settle(mobile);
  await mobile.screenshot({ path: `${OUT}/rd-session-mobile-390.png`, fullPage: false });
  console.log("rd-session-mobile-390.png");
  await mobile.close();

  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
