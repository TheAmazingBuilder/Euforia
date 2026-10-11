/**
 * Verify the design/interaction adjustment pass:
 *  1. Trades loading skeleton (delayed API) + first-class empty state (empty API)
 *  2. Playbook staggered entrance (capture right after load + settled)
 *  3. Theme crossfade (html.theme-fade toggles on switch)
 * Usage: node scripts/verify-adjustments.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/audit";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err).slice(0, 120)));

  // --- 1a. Trades skeleton: delay the trades response, capture early.
  await page.route("**/api/trades**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${BASE}/trades`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/adj-trades-skeleton.png` });
  console.log("adj-trades-skeleton.png");

  // --- 1b. Trades empty state: fulfill with an empty list.
  await page.unroute("**/api/trades**");
  await page.route("**/api/trades**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trades: [], total: 0 }),
    }),
  );
  await page.goto(`${BASE}/trades`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/adj-trades-empty.png` });
  console.log("adj-trades-empty.png");
  await page.unroute("**/api/trades**");

  // --- 2. Playbook stagger: capture mid-entrance then settled.
  await page.goto(`${BASE}/playbook`);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/adj-playbook-entering.png` });
  console.log("adj-playbook-entering.png");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/adj-playbook-settled.png` });
  console.log("adj-playbook-settled.png");

  // --- 3. Theme crossfade: open menu, pick Light, check fade class.
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: /Light/ }).click();
  const fadeApplied = await page.evaluate(() =>
    document.documentElement.classList.contains("theme-fade"),
  );
  await page.waitForTimeout(600);
  const fadeRemoved = await page.evaluate(() =>
    !document.documentElement.classList.contains("theme-fade"),
  );
  const isLight = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  console.log(`theme-fade applied=${fadeApplied} removed=${fadeRemoved} theme=${isLight}`);
  await page.screenshot({ path: `${OUT}/adj-dashboard-light.png` });
  console.log("adj-dashboard-light.png");
  // Back to dark-blue (default) for consistency.
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: /Dark blue/ }).click();
  await page.waitForTimeout(500);

  console.log(`pageerrors: ${errors.length === 0 ? "NONE" : errors.join(" | ")}`);
  await page.close();
  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
