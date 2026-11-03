/**
 * Charts module probe - browser-verified interactivity (skill mandate).
 *
 * Golden path: login → sidebar TRADING → Charts → canvas renders with
 * candles → legend/badges visible → timeframe switch → range button →
 * symbol switch → trades toggle. Screenshots + console error capture.
 *
 * Run: node scripts/verify-charts.js
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */

const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const NOISE = [
  /\/api\/auth\/(me|refresh)\b/, // expected fresh-context 401 pair (AUTH-1)
  /X-Frame-Options/i,
  /favicon/i,
];

function isNoise(message) {
  return NOISE.some((pattern) => pattern.test(message));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 950 } });

  const consoleErrors = [];
  page.on("console", (entry) => {
    if (entry.type() === "error" && !isNoise(entry.text())) {
      consoleErrors.push(entry.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  };

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await ensureLogin(page);
  check("login + shell visible", true);

  // Navigate to /charts through the SIDEBAR (the module entry is TRADING).
  const chartsLink = page.locator('a[href="/charts"]').first();
  await chartsLink.waitFor({ state: "visible", timeout: 10_000 });
  await chartsLink.click();
  await page.waitForURL("**/charts", { timeout: 10_000 });
  check("sidebar entry /charts (TRADING section)", true);

  // Heading + toolbar.
  await page.locator("h1", { hasText: "Charts" }).waitFor({ timeout: 10_000 });
  check("page header", true);

  // The chart canvas (lightweight-charts) must be present and sized.
  const canvas = page.locator('[data-testid="trading-chart"] canvas').first();
  await canvas.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(1500); // allow candles to paint
  const box = await canvas.boundingBox();
  check("chart canvas rendered", Boolean(box), box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "no box");
  const container = await page.locator('[data-testid="trading-chart"]').boundingBox();
  const pane = await page.locator(".relative.h-\\[min\\(66vh\\,720px\\)\\]").first().boundingBox();
  if (box && container) {
    const fullBleed = box.width > 600;
    check("chart takes full width", fullBleed, `canvas ${Math.round(box.width)}px in ${Math.round(container.width)}px container`);
  }

  // Legend + bid/ask badges (SIM honesty must be visible).
  const legendText = await page.locator("section[aria-label='Charts']").last().innerText();
  check("OHLC legend present", /O\s|H\s|L\s|C\s|SELL|BUY/.test(legendText));
  check("SIM feed labeled honestly", /simulated feed|SIM/.test(legendText));
  check("symbol shown (XAUUSD)", /Gold Spot \/ U\.S\. Dollar|XAUUSD/.test(legendText));

  await page.screenshot({ path: "scripts/shots/charts-initial.png", fullPage: false });

  // Timeframe switch - click 1H tab, data refetches, canvas still painted.
  await page.getByRole("tab", { name: "1h" }).click();
  await page.waitForTimeout(1200);
  check("timeframe switch 1h", (await canvas.isVisible()) === true);

  await page.getByRole("tab", { name: "D" }).click();
  await page.waitForTimeout(1200);
  check("timeframe switch D", (await canvas.isVisible()) === true);
  await page.getByRole("tab", { name: "5m", exact: true }).click();
  await page.waitForTimeout(1200);

  // Range bar - click 1M (uses the imperative handle).
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "ALL", exact: true }).click();
  await page.waitForTimeout(700);
  check("range buttons apply", (await canvas.isVisible()) === true);

  // Symbol switch via dropdown.
  await page.getByRole("button", { name: "Choose instrument" }).click();
  await page.getByText("Euro / U.S. Dollar", { exact: false }).first().click();
  await page.waitForTimeout(1500);
  const legendAfter = await page.locator("section[aria-label='Charts']").last().innerText();
  check("symbol switch EURUSD", /Euro \/ U\.S\. Dollar/.test(legendAfter));
  await page.screenshot({ path: "scripts/shots/charts-eurusd.png", fullPage: false });

  // Back to gold, toggle overlays.
  await page.getByRole("button", { name: "Choose instrument" }).click();
  await page.getByText("Gold Spot / U.S. Dollar", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "MA 20", exact: true }).click(); // off
  await page.getByRole("button", { name: "Trades", exact: true }).click(); // off
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Trades", exact: true }).click(); // on
  await page.waitForTimeout(600);
  check("overlay toggles", (await canvas.isVisible()) === true);

  // Crosshair hover → legend follows the hovered bar (no crash).
  const chartBox = await page.locator('[data-testid="trading-chart"]').boundingBox();
  if (chartBox) {
    await page.mouse.move(chartBox.x + chartBox.width * 0.5, chartBox.y + chartBox.height * 0.5);
    await page.mouse.move(chartBox.x + chartBox.width * 0.55, chartBox.y + chartBox.height * 0.45);
    await page.waitForTimeout(400);
    check("crosshair hover", true);
  }
  await page.screenshot({ path: "scripts/shots/charts-final.png", fullPage: false });

  const failures = results.filter((result) => !result.ok);
  console.log(`\n== CHARTS PROBE: ${results.length - failures.length}/${results.length} checks passed ==`);
  console.log(`console errors (non-noise): ${consoleErrors.length}`);
  consoleErrors.slice(0, 8).forEach((message) => console.log(`  ERR: ${message}`));

  await browser.close();
  process.exit(failures.length > 0 || consoleErrors.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("PROBE CRASH:", error.message);
  process.exit(1);
});
