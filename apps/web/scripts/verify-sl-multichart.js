/**
 * Verify — Session Live multi-chart synchronisé (increment ①).
 *
 * Covers:
 *   A. Baseline layout 1 (identical single-chart workspace, no toolbar).
 *   B. Layout 2: toolbar appears, master + 1 observation pane (auto
 *      suggestion), sync group bound on both charts, aux canvas rendered.
 *   C. Crosshair sync toggle binds/unbinds the ECharts group.
 *   D. Timeframe sync: left-rail timeframe applies to every pane; off →
 *      aux timeframes stay local.
 *   E. Aux local timeframe override.
 *   F. Aux symbol change (compact picker → XAUUSD).
 *   G. Aux remove → "Pick a market" empty state; re-pick restores chart.
 *   H. Layout 4: 4 charts, 2×2 grid at xl width; per-slot remove.
 *   I. Persistence through SPA navigation (layout + picked symbol + interval).
 *   J. Security: still zero execution controls.
 *   K. Mobile 390: no horizontal overflow with stacked panes.
 * SPA-only navigation after the first goto (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i, /X-TransformPort/i];
const SHOTS = "/home/z/my-project/scripts/shots/sl-multichart";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const attrOf = (locator, name) => locator.getAttribute(name);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ══ A. Baseline layout 1 ═════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1800);

  const grid = page.locator('[data-testid="chart-grid"]');
  check("Chart grid present", (await grid.count()) === 1);
  check("Baseline layout is 1", (await attrOf(grid, "data-layout")) === "1");
  check("Toolbar always available (entry point to multi-chart)", await page.locator('[data-testid="chart-grid-toolbar"]').isVisible());
  check("Single chart rendered", (await page.locator('[data-testid="analysis-chart"]').count()) === 1);
  check("Master chart canvas live", await page.evaluate(() => {
    const el = document.querySelector('[data-testid="analysis-chart"]');
    const canvas = el?.querySelector("canvas");
    return canvas !== null && canvas !== undefined && canvas.width > 200;
  }));

  // ══ B. Layout 2 ══════════════════════════════════════════════════════════
  await page.locator('[data-testid="chart-layout-2"]').click();
  await page.waitForTimeout(1200);
  check("Toolbar visible in multi layout", await page.locator('[data-testid="chart-grid-toolbar"]').isVisible());
  check("Grid reports layout 2", (await attrOf(grid, "data-layout")) === "2");
  check("Two charts rendered", (await page.locator('[data-testid="analysis-chart"]').count()) === 2);
  const aux1 = page.locator('[data-testid="aux-pane-1"]');
  check("Aux pane 1 present", (await aux1.count()) === 1);
  const aux1Symbol = await attrOf(aux1, "data-symbol");
  check("Aux pane auto-suggested a market", typeof aux1Symbol === "string" && aux1Symbol.length > 0, `symbol=${aux1Symbol}`);
  check("Aux chart canvas rendered", await page.evaluate(() => {
    const el = document.querySelector('[data-testid="aux-pane-1"] [data-testid="analysis-chart"]');
    const canvas = el?.querySelector("canvas");
    return canvas !== null && canvas !== undefined && canvas.width > 100;
  }));
  const syncGroups = await page.locator('[data-testid="analysis-chart"][data-sync-group="cosmoz.session-live.charts"]').count();
  check("Crosshair sync group bound on both charts (default on)", syncGroups === 2, `${syncGroups} charts`);

  // ══ C. Crosshair toggle ══════════════════════════════════════════════════
  await page.locator('[data-testid="chart-sync-crosshair"]').click();
  await page.waitForTimeout(500);
  check(
    "Crosshair off → group unbound",
    (await page.locator('[data-testid="analysis-chart"][data-sync-group]').count()) === 0,
  );
  check("Crosshair toggle aria-pressed=false", (await attrOf(page.locator('[data-testid="chart-sync-crosshair"]'), "aria-pressed")) === "false");
  await page.locator('[data-testid="chart-sync-crosshair"]').click();
  await page.waitForTimeout(500);
  check(
    "Crosshair on → group rebound on 2 charts",
    (await page.locator('[data-testid="analysis-chart"][data-sync-group="cosmoz.session-live.charts"]').count()) === 2,
  );

  // ══ D. Timeframe sync ════════════════════════════════════════════════════
  await page.locator('[data-testid="chart-sync-timeframe"]').click();
  await page.waitForTimeout(300);
  check("Timeframe sync armed", (await attrOf(page.locator('[data-testid="chart-sync-timeframe"]'), "aria-pressed")) === "true");
  await page.locator('[data-testid="tf-15m"]').click();
  await page.waitForTimeout(900);
  check(
    "Timeframe sync: master follows left rail",
    (await attrOf(page.locator('[data-testid="session-chart-area"] [data-testid="analysis-chart"]').first(), "data-interval")) === "15m",
  );
  check(
    "Timeframe sync: aux pane follows too",
    (await attrOf(aux1.locator('[data-testid="analysis-chart"]'), "data-interval")) === "15m",
  );
  await page.locator('[data-testid="chart-sync-timeframe"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="tf-5m"]').click();
  await page.waitForTimeout(900);
  check(
    "Sync off: master switches alone",
    (await attrOf(page.locator('[data-testid="session-chart-area"] [data-testid="analysis-chart"]').first(), "data-interval")) === "5m",
  );
  check(
    "Sync off: aux keeps its own timeframe",
    (await attrOf(aux1.locator('[data-testid="analysis-chart"]'), "data-interval")) === "15m",
  );

  // ══ E. Aux local timeframe ═══════════════════════════════════════════════
  await page.locator('[data-testid="aux-tf-1-1H"]').click();
  await page.waitForTimeout(900);
  check("Aux local timeframe override (1H)", (await attrOf(aux1.locator('[data-testid="analysis-chart"]'), "data-interval")) === "1H");
  check(
    "Master untouched by aux-local change",
    (await attrOf(page.locator('[data-testid="session-chart-area"] [data-testid="analysis-chart"]').first(), "data-interval")) === "5m",
  );

  // ══ F. Aux symbol change ═════════════════════════════════════════════════
  await aux1.locator('[data-testid="symbol-picker-trigger"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="symbol-search"]').fill("XAU");
  await page.waitForTimeout(300);
  await page.locator('[data-testid="symbol-picker-list"] button', { hasText: "XAUUSD" }).first().click();
  await page.waitForTimeout(1200);
  check("Aux symbol switched to XAUUSD", (await attrOf(aux1, "data-symbol")) === "XAUUSD");
  check("Aux chart follows the picked symbol", (await attrOf(aux1.locator('[data-testid="analysis-chart"]'), "data-symbol")) === "XAUUSD");

  await page.screenshot({ path: `${SHOTS}/layout2.png` });

  // ══ G. Remove + re-pick ══════════════════════════════════════════════════
  await page.locator('[data-testid="aux-remove-1"]').click();
  await page.waitForTimeout(700);
  check("Removed pane shows empty state", (await aux1.textContent())?.includes("Pick a market") === true);
  check("Removed pane frees its chart", (await page.locator('[data-testid="analysis-chart"]').count()) === 1);
  await aux1.locator('[data-testid="symbol-picker-trigger"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="symbol-picker-list"] button', { hasText: "XAUUSD" }).first().click();
  await page.waitForTimeout(1200);
  check("Re-picked market restores the chart", (await page.locator('[data-testid="analysis-chart"]').count()) === 2);

  // ══ H. Layout 4 (2×2 at xl) ══════════════════════════════════════════════
  await page.locator('[data-testid="chart-layout-4"]').click();
  await page.waitForTimeout(1400);
  check("Grid reports layout 4", (await attrOf(grid, "data-layout")) === "4");
  check("Four charts rendered", (await page.locator('[data-testid="analysis-chart"]').count()) === 4);
  const tracks = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="chart-grid"]');
    return el === null ? 0 : getComputedStyle(el).gridTemplateColumns.split(" ").length;
  });
  check("2-column grid at xl width", tracks === 2, `${tracks} tracks`);
  check("Aux pane 2 auto-suggested", ((await attrOf(page.locator('[data-testid="aux-pane-2"]'), "data-symbol")) ?? "").length > 0);
  check("Aux pane 3 auto-suggested", ((await attrOf(page.locator('[data-testid="aux-pane-3"]'), "data-symbol")) ?? "").length > 0);
  await page.screenshot({ path: `${SHOTS}/layout4.png` });
  await page.locator('[data-testid="aux-remove-3"]').click();
  await page.waitForTimeout(700);
  check("Layout 4 keeps removed slot empty", ((await attrOf(page.locator('[data-testid="aux-pane-3"]'), "data-symbol")) ?? "x") === "");

  // ══ I. Persistence through SPA navigation ════════════════════════════════
  await page.locator('[data-testid="chart-layout-2"]').click();
  await page.waitForTimeout(800);
  await page.locator('nav[aria-label="Main navigation"] a[href="/"]').click();
  await page.waitForTimeout(1500);
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1800);
  check("Layout persists across SPA navigation", (await attrOf(grid, "data-layout")) === "2");
  check("Picked aux symbol persists", (await attrOf(page.locator('[data-testid="aux-pane-1"]'), "data-symbol")) === "XAUUSD");
  check(
    "Aux interval persists",
    (await attrOf(page.locator('[data-testid="aux-pane-1"] [data-testid="analysis-chart"]'), "data-interval")) === "1H",
  );

  // ══ J. Security (execution-negative, unchanged) ══════════════════════════
  const executionButtons = await page
    .locator('main button, main a, main [role="button"]')
    .evaluateAll((elements) =>
      elements
        .filter((el) => /\b(buy|sell|execute|place order|close position|modify position|cancel order)\b/i.test(el.textContent ?? ""))
        .map((el) => el.textContent?.slice(0, 40)),
    );
  check("No execution controls anywhere", executionButtons.length === 0, executionButtons.slice(0, 3).join(" | "));

  // ══ K. Mobile 390 ════════════════════════════════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("Mobile: no horizontal overflow (stacked panes)", overflow <= 0, `overflow=${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/mobile.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  // ══ Console / network cleanliness ═══════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));

  console.log("\n=== SUMMARY ===");
  console.log(results.filter((line) => line.startsWith("FAIL")).length === 0 ? "ALL PASS" : "FAILURES PRESENT");
  await browser.close();
})().catch((error) => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});
