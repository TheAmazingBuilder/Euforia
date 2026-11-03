/* Quick visual shots of /events and /tasky (desktop) - uses shared ensureLogin. */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/events-tasky";
const { ensureLogin } = require("/home/z/my-project/apps/web/scripts/helpers/login.js");

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${BASE}/login`);
  await ensureLogin(page);

  // Events
  await page.goto(`${BASE}/events`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/events-desktop.png` });

  // Tasky
  await page.goto(`${BASE}/tasky`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/tasky-desktop.png` });

  console.log("pageerrors:", errors.length ? errors : "none");
  await browser.close();
})();
