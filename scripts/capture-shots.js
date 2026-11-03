/**
 * Full visual audit capture - reusable before/after design comparisons.
 * Usage: node scripts/capture-shots.js <label> [routesCSV]
 * Output: scripts/shots/<label>/{desktop,mobile,themes}/*.png
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const LABEL = process.argv[2] || "audit";
const ROUTES = (process.argv[3] ||
  "/,/session,/playbook,/analytics,/calendar,/trades,/journal,/discipline,/coach,/goals,/settings"
).split(",");
const MOBILE_ROUTES = (process.argv[4] || "/,/trades,/journal,/coach,/calendar").split(",");
const THEMES = ["dark-blue", "dark", "light"];

const OUT = path.join(__dirname, "shots", LABEL);
for (const d of ["desktop", "mobile", "themes"]) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

const slug = (r) => (r === "/" ? "dashboard" : r.replace(/^\//, ""));

async function settle(page) {
  await page.waitForLoadState("networkidle");
  // settle entrance animations so captures are valid evidence
  await page.waitForTimeout(1400);
}

(async () => {
  const browser = await chromium.launch();

  // Desktop full-page
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const route of ROUTES) {
    await desktop.goto(BASE + route, { waitUntil: "networkidle" });
    await settle(desktop);
    const file = path.join(OUT, "desktop", `${slug(route)}.png`);
    await desktop.screenshot({ path: file, fullPage: true });
    console.log("desktop", route, "->", path.basename(file));
  }

  // Mobile full-page
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const route of MOBILE_ROUTES) {
    await mobile.goto(BASE + route, { waitUntil: "networkidle" });
    await settle(mobile);
    const file = path.join(OUT, "mobile", `${slug(route)}.png`);
    await mobile.screenshot({ path: file, fullPage: true });
    console.log("mobile ", route, "->", path.basename(file));
  }

  // Theme variants of the dashboard
  const themed = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const theme of THEMES) {
    await themed.goto(BASE + "/", { waitUntil: "networkidle" });
    await themed.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      try { localStorage.setItem("cosmoz-theme", t); } catch {}
    }, theme);
    await settle(themed);
    const file = path.join(OUT, "themes", `${theme}.png`);
    await themed.screenshot({ path: file, fullPage: false });
    console.log("theme  ", theme, "->", path.basename(file));
  }

  await browser.close();
  console.log(`\nDone -> ${OUT}`);
})();
