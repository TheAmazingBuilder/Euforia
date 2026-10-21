/**
 * Phase 9 verification — analytics suite (6 tabs).
 * Captures: 1 per tab (desktop 1440), What-If with filters active
 * (differentiated curves), 3 themes on Overview, mobile 390 tabs scroll.
 * Also probes: low-n indicators, tabs scrollability at 390px, chart canvases.
 * Usage: node scripts/verify-phase9.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = __dirname;

const TABS = ["overview", "strategy", "time", "psychology", "mistakes", "what-if"];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1400);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const issues = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      issues.push(`[${msg.type()}] ${msg.text().slice(0, 140)}`);
    }
  });
  page.on("pageerror", (err) => issues.push(`[pageerror] ${String(err).slice(0, 140)}`));

  // ── Desktop: capture each tab ────────────────────────────────────────────
  await page.goto(`${BASE}/analytics`);
  await settle(page);

  const TAB_LABELS = {
    overview: "Overview",
    strategy: "By Strategy",
    time: "By Time",
    psychology: "By Psychology",
    mistakes: "Mistakes",
    "what-if": "What-If",
  };

  for (const tab of TABS) {
    await page.getByRole("tab", { name: TAB_LABELS[tab] }).click();
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `${OUT}/p9-tab-${tab}.png`,
      fullPage: true,
    });
    console.log(`captured tab: ${tab}`);
  }

  // ── What-If with filters active (differentiated curves) ─────────────────
  await page.getByRole("tab", { name: "What-If" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /No Fridays/i }).click();
  await page.getByRole("button", { name: /Stops never moved/i }).click();
  await page.waitForTimeout(800);
  const deltaChip = await page
    .locator("text=/trades kept/")
    .first()
    .textContent()
    .catch(() => null);
  console.log(`what-if filters on — kept chip: ${deltaChip ? deltaChip.trim() : "NOT FOUND"}`);
  await page.screenshot({ path: `${OUT}/p9-what-if-active.png`, fullPage: true });

  // What-If probes: two ECharts canvas + delta chip present
  const canvases = await page.locator("canvas").count();
  const deltaText = await page.locator("text=/^Δ/").first().textContent().catch(() => null);
  console.log(`what-if canvases: ${canvases}, delta chip: ${deltaText ? deltaText.trim().slice(0, 24) : "MISSING"}`);

  // Reset back to baseline
  await page.getByRole("button", { name: /Reset/i }).click();
  await page.waitForTimeout(500);

  // ── Overview probes: heatmap low-n treatment + summary cards ─────────────
  await page.getByRole("tab", { name: "Overview" }).click();
  await settle(page);
  const summaryValues = await page.locator("p.font-mono.text-3xl").count();
  console.log(`overview summary cards rendered: ${summaryValues} (expect 5)`);

  // ── 3 themes on Overview ─────────────────────────────────────────────────
  const themeSwitch = page.locator("[data-testid=\"theme-switch\"], header button[aria-label*='theme' i]").first();
  const themes = ["dark-blue", "dark", "light"];
  for (const theme of themes) {
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      try { localStorage.setItem("cosmoz-theme", t); } catch { /* ignore */ }
    }, theme);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${OUT}/p9-theme-${theme}.png`, fullPage: false });
    console.log(`captured theme: ${theme}`);
  }
  void themeSwitch;

  // ── Mobile 390px: horizontal scrollable tabs ─────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => issues.push(`[mobile pageerror] ${String(err).slice(0, 140)}`));
  await mobile.goto(`${BASE}/analytics`);
  await settle(mobile);
  const list = mobile.locator('[role="tablist"]').first();
  const metrics = await list.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    overflowX: getComputedStyle(el).overflowX,
  }));
  console.log(
    `mobile tablist: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} overflowX=${metrics.overflowX} → scrollable=${metrics.scrollWidth > metrics.clientWidth}`,
  );
  await mobile.screenshot({ path: `${OUT}/p9-mobile-tabs.png`, fullPage: false });
  // scroll the tablist to the last tab (What-If) to prove horizontal scroll
  await list.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: `${OUT}/p9-mobile-tabs-scrolled.png`, fullPage: false });
  console.log("mobile captures done");

  const filtered = issues.filter(
    (i) => !i.includes("Download the React DevTools") && !i.includes("[MSW]"),
  );
  console.log(`console issues: ${filtered.length === 0 ? "CLEAN" : filtered.join(" | ")}`);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
