/**
 * Shell probe - header sidebar toggle (collapse affordance moved from the
 * rail's bottom button into the Topbar, reference "Collspase header.png").
 * Checks: toggle present in header, rail width 240<->72 on click, state
 * persists across reload, no "Collapse" button left inside the sidebar.
 */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;

function check(label, ok, extra = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}${extra ? ` - ${extra}` : ""}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${extra ? ` - ${extra}` : ""}`);
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await check("login succeeded", !page.url().includes("/login"), page.url());
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  try {
    console.log("\n[1] Header toggle");
    await login(page);
    await page.goto(`${BASE}/trades`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);

    const toggle = page.locator('[data-testid="sidebar-toggle"]');
    await check("toggle visible in header", await toggle.isVisible().catch(() => false));

    const aside = page.locator("aside").first();
    const w0 = await aside.evaluate((el) => el.getBoundingClientRect().width);
    await check("rail expanded (240px)", Math.round(w0) === 240, `${w0}px`);

    await toggle.click();
    await page.waitForTimeout(400);
    const w1 = await aside.evaluate((el) => el.getBoundingClientRect().width);
    await check("rail collapsed after click (72px)", Math.round(w1) === 72, `${w1}px`);

    const bottomCollapse = await page
      .locator('aside button:has-text("Collapse")')
      .count();
    await check("no Collapse button left in the rail", bottomCollapse === 0);

    console.log("\n[2] Persistence");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const w2 = await aside.evaluate((el) => el.getBoundingClientRect().width);
    await check("collapsed state persisted across reload", Math.round(w2) === 72, `${w2}px`);

    await toggle.click();
    await page.waitForTimeout(400);
    const w3 = await aside.evaluate((el) => el.getBoundingClientRect().width);
    await check("re-expand works", Math.round(w3) === 240, `${w3}px`);

    console.log("\n[3] Mobile: toggle hidden, hamburger present");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await check("desktop toggle hidden on mobile", !(await toggle.isVisible()));
    const hamburger = page.locator('header button[aria-label="Open navigation menu"]');
    await check("mobile hamburger present", await hamburger.isVisible().catch(() => false));

    await check("zero pageerrors", errors.length === 0, errors.join(" | ").slice(0, 200));
  } catch (error) {
    failed += 1;
    console.log(`  ✗ probe crashed: ${error}`);
  } finally {
    await browser.close();
  }

  console.log("========================================================");
  console.log(`PASSED: ${passed}   FAILED: ${failed}   PAGE ERRORS: ${errors.length}`);
  console.log("========================================================");
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
})();
