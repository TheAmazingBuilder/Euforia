/**
 * TOOLS section probe — Lot Size + Compounding calculators.
 * Definition-of-done walkthrough: login → sidebar TOOLS section → /tools
 * redirect → lot-size flow (defaults, calculate, spec vector 0.10 lots,
 * breakdown, validation paths, direction rules, RR) → compounding flow
 * (spec vector 1000/5%/20 → $2,653.30, live recompute, negative rates,
 * table + mobile cards, chart) → responsive + theme captures, with a
 * zero-pageerror guarantee.
 *
 * Run: node scripts/verify-tools.js  (server on :3000, mock mode)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
let passed = 0;
let failedCount = 0;
const pageErrors = [];

function ok(label, extra = "") {
  passed += 1;
  console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
}
function bad(label, extra = "") {
  failedCount += 1;
  console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
}
async function check(label, condition, extra = "") {
  condition ? ok(label, extra) : bad(label, extra);
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

async function ensureLoggedIn(page, context) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  if (page.url().includes("/login")) {
    await login(page);
    if (page.url().includes("/login")) {
      await page.waitForTimeout(2000);
    }
  }
  void context;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    // ── 1. Login + sidebar TOOLS section ───────────────────────────────────
    console.log("\n[1] Login + sidebar");
    await login(page);
    const toolsSectionVisible = await page
      .locator('aside, [class*="sidebar"], nav')
      .getByText("Tools", { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    await check("TOOLS section title visible", toolsSectionVisible);
    const lotSizeLink = page.getByRole("link", { name: "Lot Size Calculator" }).first();
    const compoundingLink = page.getByRole("link", { name: "Compounding Calculator" }).first();
    await check("Lot Size Calculator link", await lotSizeLink.isVisible().catch(() => false));
    await check("Compounding Calculator link", await compoundingLink.isVisible().catch(() => false));

    // ── 2. /tools redirect ─────────────────────────────────────────────────
    console.log("\n[2] /tools redirect");
    await page.goto(`${BASE}/tools`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await check("redirected to /tools/lot-size", page.url().includes("/tools/lot-size"), page.url());

    // ── 3. Lot Size — console header + defaults ────────────────────────────
    console.log("\n[3] Lot Size — header + defaults");
    await page.goto(`${BASE}/tools/lot-size`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await check("console meta visible", await page.locator('[data-testid="lotsize-console-meta"]').isVisible().catch(() => false));
    await check("instrument select present", await page.locator('[data-testid="lotsize-instrument"]').isVisible().catch(() => false));
    await check(
      "XAUUSD default",
      (await page.locator('[data-testid="lotsize-instrument"]').innerText()).includes("XAUUSD"),
    );
    await check("calculate button present", await page.locator('[data-testid="lotsize-calculate"]').isVisible().catch(() => false));
    await check("result panel present", await page.locator('[data-testid="lotsize-result"]').isVisible().catch(() => false));
    await check(
      "empty state before calculate",
      (await page.locator('[data-testid="lotsize-result"]').innerText()).length > 0 &&
        (await page.locator('[data-testid="lotsize-status"]').count()) === 0,
    );

    // ── 4. Lot Size — spec vector: 10,000 / 1% / XAUUSD 2650→2640 → 0.10 ───
    console.log("\n[4] Lot Size — spec vector");
    await page.fill('[data-testid="lotsize-entry"]', "2650");
    await page.fill('[data-testid="lotsize-stop"]', "2640");
    await page.fill('[data-testid="lotsize-tp"]', "2673.50");
    await page.click('[data-testid="lotsize-calculate"]');
    await page.waitForTimeout(600);
    const resultText = await page.locator('[data-testid="lotsize-result"]').innerText();
    await check("position size 0.10", resultText.includes("0.10"), "");
    await check("risk amount $100", resultText.includes("100"), "");
    await check("status stamp VALID", (await page.locator('[data-testid="lotsize-status"]').innerText()).toUpperCase().includes("WITHIN"));
    await check("RR 1 : 2.35 displayed (spec §14)", resultText.includes("2.35"), "");
    await page.screenshot({ path: "scripts/shots/tools-lotsize-desktop.png", fullPage: true });

    // Breakdown ledger content (ledger-label renders UPPERCASE — match loosely)
    const breakdownVisible = await page
      .getByText(/calculation breakdown/i)
      .first()
      .isVisible()
      .catch(() => false);
    await check("breakdown visible", breakdownVisible);

    // Copy payload exists
    await check("copy result button", await page.locator('[data-testid="lotsize-copy"]').isVisible().catch(() => false));

    // ── 5. Lot Size — validation paths ─────────────────────────────────────
    console.log("\n[5] Lot Size — validation");
    await page.fill('[data-testid="lotsize-stop"]', "2650");
    await page.waitForTimeout(400);
    let bodyText = await page.locator("body").innerText();
    await check("same-price error", bodyText.includes("must be different from entry price"));
    await page.fill('[data-testid="lotsize-stop"]', "2640");
    await page.click('[data-testid="lotsize-direction-sell"]');
    await page.waitForTimeout(300);
    bodyText = await page.locator("body").innerText();
    await check("short-side error", bodyText.includes("stop loss must be above the entry price"));
    await page.click('[data-testid="lotsize-direction-buy"]');
    await page.fill('[data-testid="lotsize-stop"]', "2600");
    await page.fill('[data-testid="lotsize-risk"]', "150");
    await page.click('[data-testid="lotsize-calculate"]');
    await page.waitForTimeout(400);
    bodyText = await page.locator("body").innerText();
    await check("risk range error", bodyText.includes("between 0% and 100%"));

    // Advanced parameters disclosure
    await page.click('[data-testid="lotsize-advanced-toggle"]');
    await page.waitForTimeout(300);
    await check("advanced fields shown", await page.locator('[data-testid="lotsize-pipsize"]').isVisible().catch(() => false));

    // ── 6. Compounding — spec vector: 1000 / 20 × 5% → $2,653.30 ───────────
    console.log("\n[6] Compounding — spec vector");
    await page.goto(`${BASE}/tools/compounding`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    await check("console meta visible", await page.locator('[data-testid="comp-console-meta"]').isVisible().catch(() => false));
    const summaryText = await page.locator('[data-testid="comp-summary"]').innerText();
    await check("initial $1,000.00", summaryText.includes("1,000.00"), "");
    await check("final $2,653.30", summaryText.includes("2,653.30"), "");
    await check("total profit +$1,653.30", summaryText.includes("1,653.30"), "");
    await check("total gain +165.33%", summaryText.includes("165.33"), "");
    await check("chart rendered", await page.locator('[data-testid="comp-chart"] canvas').count() >= 1);
    const tableRows = await page.locator('[data-testid="comp-table"] tbody tr').count();
    await check("table has 20 rows", tableRows === 20, `${tableRows} rows`);
    const firstRowText = await page.locator('[data-testid="comp-table"] tbody tr').first().innerText();
    await check("row 1 ends at 1,050.00", firstRowText.includes("1,050.00"), "");
    await check("copy summary button", await page.locator('[data-testid="comp-copy"]').isVisible().catch(() => false));
    await page.screenshot({ path: "scripts/shots/tools-compounding-desktop.png", fullPage: true });

    // ── 7. Compounding — live recompute + negative rate ────────────────────
    console.log("\n[7] Compounding — live recompute");
    await page.fill('[data-testid="comp-gain"]', "10");
    await page.waitForTimeout(800);
    const liveText = await page.locator('[data-testid="comp-summary"]').innerText();
    await check("gain 10% → final $6,727.50", liveText.includes("6,727.50"), "");
    await page.fill('[data-testid="comp-gain"]', "-2");
    await page.waitForTimeout(800);
    const lossText = await page.locator('[data-testid="comp-summary"]').innerText();
    await check("negative rate renders a loss", lossText.includes("-"), "");
    await check("loss token colored", (await page.locator('[data-testid="comp-summary"]').locator(".text-loss").count()) >= 1);
    await page.fill('[data-testid="comp-gain"]', "5");

    // Validation: periods out of range
    await page.fill('[data-testid="comp-periods"]', "0");
    await page.waitForTimeout(500);
    const periodsError = await page.getByText("Periods must be an integer").isVisible().catch(() => false);
    await check("periods range error", periodsError);
    await page.fill('[data-testid="comp-periods"]', "20");

    // ── 8. Mobile layouts ──────────────────────────────────────────────────
    console.log("\n[8] Mobile (390px)");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    const lotOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await check("lot-size mobile: no horizontal overflow", lotOverflow <= 1, `${lotOverflow}px`);
    await page.screenshot({ path: "scripts/shots/tools-lotsize-mobile.png", fullPage: true });
    await page.goto(`${BASE}/tools/compounding`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const cardsCount = await page.locator('[data-testid="comp-cards"] > div').count();
    await check("mobile period cards (20)", cardsCount === 20, `${cardsCount} cards`);
    await check("desktop table hidden on mobile", !(await page.locator('[data-testid="comp-table"]').isVisible().catch(() => false)));
    await page.screenshot({ path: "scripts/shots/tools-compounding-mobile.png", fullPage: true });

    // ── 9. Light theme capture ─────────────────────────────────────────────
    console.log("\n[9] Light theme");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.goto(`${BASE}/tools/compounding`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: "scripts/shots/tools-compounding-light.png", fullPage: true });
    await page.goto(`${BASE}/tools/lot-size`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "scripts/shots/tools-lotsize-light.png", fullPage: true });
    await page.evaluate(() => window.localStorage.setItem("theme", "dark"));

    // ── 10. Sidebar navigation through the section ─────────────────────────
    console.log("\n[10] Sidebar navigation");
    await ensureLoggedIn(page);
    await page.getByRole("link", { name: "Compounding Calculator" }).first().click();
    await page.waitForTimeout(1200);
    await check("sidebar navigates to compounding", page.url().includes("/tools/compounding"), page.url());
  } catch (error) {
    bad(`probe crashed: ${error}`);
  }

  console.log(`\n${"=".repeat(56)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failedCount}   PAGE ERRORS: ${pageErrors.length}`);
  for (const error of pageErrors) console.log(`  pageerror: ${error}`);
  console.log(`${"=".repeat(56)}`);
  process.exit(failedCount > 0 || pageErrors.length > 0 ? 1 : 0);
})();
