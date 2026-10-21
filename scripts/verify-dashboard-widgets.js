/**
 * Verify — Dashboard Customization Phase 02 (widget settings + analytics widgets).
 * Probes (ONE SPA session — the mock store reseeds on full reload):
 *   [A] Default view unchanged: the designed 7-widget layout (opt-in policy)
 *   [B] New analytics widgets appear in the library; METRICS_CARD add → default
 *       metrics render → Save persists
 *   [C] View-mode settings (gear): PNL_BAND range 30→7 + chart type BAR → widget
 *       reacts immediately, PATCH persists
 *   [D] Settings transactional: Cancel discards the draft
 *   [E] Restore defaults inside the dialog
 *   [F] METRICS_CARD settings: metric list add/remove, period THIS_WEEK, comparison
 *       baseline note renders; CUSTOM period requires dates (validation error)
 *   [G] STRATEGY_COMPARE: empty-selection hint → settings adds populations → rows
 *   [H] LONG_SHORT: BUY/SELL columns with server data
 *   [I] ACTIVITY_HEATMAP: canvas/tooltip grid renders
 *   [J] Edit-mode gear mutates the DRAFT: Save commits, then a second change +
 *       Cancel discards (confirmed flow untouched)
 *   [K] Mobile 390: no horizontal overflow with the new widgets present
 * Console: zero unexpected errors.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const CANONICAL = ["PNL_BAND", "EQUITY_ROW", "GOALS_PACE", "WEEK_COMPARE", "HEATMAP", "BEST_WORST", "ALERTS"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  let patchCount = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/me/preferences/dashboard")) patchCount++;
  });

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  const widgetOrder = async () =>
    page.$$eval('[data-page="dashboard"] section[data-widget]', (nodes) =>
      nodes.map((node) => node.getAttribute("data-widget")),
    );

  const enterEdit = async () => {
    await page.locator('[data-testid="dashboard-customize"]').click();
    await page.locator('[data-testid="dashboard-edit-toolbar"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
  };

  const saveEdit = async () => {
    await page.locator('[data-testid="dashboard-toolbar-save"]').click();
    await page.waitForTimeout(1200);
  };

  const addWidgetViaLibrary = async (type) => {
    await page.locator('[data-testid="dashboard-toolbar-add"]').click();
    await page.locator('[data-testid="dashboard-widget-library"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.locator(`[data-testid="dashboard-library-add-${type.toLowerCase()}"]`).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  };

  // ── Sign in (mock demo account) ────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const fillDemo = page.locator('[data-testid="fill-demo"]');
  if (await fillDemo.isVisible().catch(() => false)) {
    await fillDemo.click();
  } else {
    await page.locator("#login-email").fill("trader@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz-demo-2026");
  }
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 15000 });
  await page.locator('[data-testid="dashboard-widget-goals_pace"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // ── [A] Default view unchanged ──────────────────────────────────────────────
  check("[A] Designed 7-widget default (opt-in policy)", (await widgetOrder()).join() === CANONICAL.join(), (await widgetOrder()).join(","));

  // ── [B] Library shows the new analytics widgets; add METRICS_CARD ──────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-toolbar-add"]').click();
  await page.locator('[data-testid="dashboard-widget-library"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  for (const type of ["metrics_card", "strategy_compare", "long_short", "activity_heatmap"]) {
    check(
      `[B] Library lists ${type}`,
      (await page.locator(`[data-testid="dashboard-library-add-${type}"]`).count()) === 1,
    );
  }
  await page.locator('[data-testid="dashboard-library-add-metrics_card"]').click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("[B] METRICS_CARD added to the draft", (await widgetOrder()).includes("METRICS_CARD"));
  check("[B] METRICS_CARD renders default cells", (await page.locator('[data-testid="metrics-card-cell"]').count()) === 4);
  check(
    "[B] Comparison baseline note renders",
    (await page.locator('[data-testid="metrics-card-widget"]').textContent()).includes("closed trade"),
  );
  await saveEdit();
  check("[B] Save persisted the new widget", patchCount >= 1, `patches=${patchCount}`);

  // ── [C] View-mode settings gear: PNL_BAND range + chart type ───────────────
  await page.locator('[data-testid="dashboard-widget-settings-pnl_band"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  check("[C] Dialog opens with grouped settings", (await page.locator('[data-testid="widget-settings-group-period"]').count()) === 1);
  // Range → Last 7 days
  await page.locator('[data-testid="widget-settings-select-window"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: "Last 7 days" }).click();
  await page.waitForTimeout(200);
  // Chart type → Bars
  await page.locator('[data-testid="widget-settings-select-chart-type"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: /Bars/ }).click();
  await page.waitForTimeout(200);
  // Toggle the end marker OFF to prove checkboxes are live too
  await page.locator("#widget-setting-end-of-curve-marker").click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(1000);
  const cumulativeCard = page.locator('[data-testid="cumulative-pnl-card"]');
  check(
    "[C] PNL_BAND reacts to saved settings",
    (await cumulativeCard.getAttribute("data-range")) === "7" &&
      (await cumulativeCard.getAttribute("data-chart")) === "bar",
    `range=${await cumulativeCard.getAttribute("data-range")} chart=${await cumulativeCard.getAttribute("data-chart")}`,
  );
  check("[C] Settings PATCH persisted", patchCount >= 2, `patches=${patchCount}`);

  // ── [D] Cancel discards the draft ───────────────────────────────────────────
  await page.locator('[data-testid="dashboard-widget-settings-pnl_band"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="widget-settings-select-chart-type"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: /Area/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(600);
  check("[D] Cancel keeps the saved config", (await cumulativeCard.getAttribute("data-chart")) === "bar");

  // ── [E] Restore defaults inside the dialog ─────────────────────────────────
  await page.locator('[data-testid="dashboard-widget-settings-pnl_band"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="widget-settings-restore"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(1000);
  check(
    "[E] Restore defaults → range 30 / area chart",
    (await cumulativeCard.getAttribute("data-range")) === "30" &&
      (await cumulativeCard.getAttribute("data-chart")) === "area",
  );

  // ── [F] METRICS_CARD settings: metrics + period + validation ───────────────
  await page.locator('[data-testid="dashboard-widget-settings-metrics_card"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  // CUSTOM period without dates must refuse to save
  await page.locator('[data-testid="widget-settings-select-aggregation-window"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: "Custom range" }).click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(400);
  check(
    "[F] CUSTOM without dates surfaces a validation error",
    await page.locator('[data-testid="widget-settings-error"]').isVisible(),
    await page.locator('[data-testid="widget-settings-error"]').textContent().catch(() => ""),
  );
  // Fill the custom dates with a window that actually holds trades
  const dayKey = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  await page.locator('[data-testid="widget-settings-date-from"]').fill(dayKey(14));
  await page.locator('[data-testid="widget-settings-date-to"]').fill(dayKey(0));
  // Add a metric (Gross profit)
  await page.locator('[data-testid="widget-settings-metric-add"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: "Gross profit" }).click();
  await page.waitForTimeout(200);
  check("[F] Metric list preview grows", (await page.locator('[data-testid="widget-settings-metric-row"]').count()) === 5);
  // Comparison still set; save
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(1200);
  check(
    "[F] Saved period lands on the widget",
    (await page.locator('[data-testid="metrics-card-widget"]').getAttribute("data-period")) === "CUSTOM",
  );
  check("[F] 5 cells render after the metric add", (await page.locator('[data-testid="metrics-card-cell"]').count()) === 5);

  // Back to THIS_MONTH + PREVIOUS for the baseline-note probe
  await page.locator('[data-testid="dashboard-widget-settings-metrics_card"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="widget-settings-select-aggregation-window"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: "This week" }).click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(1200);
  check(
    "[F] THIS_WEEK renders with baseline note",
    (await page.locator('[data-testid="metrics-card-widget"]').getAttribute("data-period")) === "THIS_WEEK" &&
      (await page.locator('[data-testid="metrics-card-baseline"]').count()) > 0,
  );

  // ── [G] STRATEGY_COMPARE ────────────────────────────────────────────────────
  await enterEdit();
  await addWidgetViaLibrary("strategy_compare");
  check(
    "[G] Empty selection shows the purposeful hint",
    await page.locator('[data-testid="strategy-compare-empty"]').isVisible(),
  );
  await page.locator('[data-testid="dashboard-widget-settings-strategy_compare"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="widget-settings-strategy-add"]').click();
  await page.waitForTimeout(200);
  const firstOption = page.getByRole("option").first();
  check("[G] Strategy options resolve from the playbook", (await firstOption.count()) === 1);
  await firstOption.click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-strategy-add"]').click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: "Out of playbook" }).click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(1000);
  check("[G] Compared rows render after selection", (await page.locator('[data-testid="strategy-compare-row"]').count()) === 2);

  // ── [H] LONG_SHORT ──────────────────────────────────────────────────────────
  await addWidgetViaLibrary("long_short");
  await page.waitForTimeout(800);
  check("[H] Long/short columns render", (await page.locator('[data-testid="long-short-grid"]').count()) === 1);
  check(
    "[H] Both directions carry server metrics",
    (await page.locator('[data-testid="long-short-metric"]').count()) >= 8,
  );

  // ── [I] ACTIVITY_HEATMAP ────────────────────────────────────────────────────
  await addWidgetViaLibrary("activity_heatmap");
  await page.waitForTimeout(1200);
  const heatmapWidget = page.locator('[data-testid="activity-heatmap-widget"]');
  const heatmapReady =
    (await heatmapWidget.locator("canvas").count()) > 0 ||
    (await page.locator('[data-testid="activity-heatmap-empty"]').count()) > 0;
  check("[I] Heatmap renders canvas or honest empty state", heatmapReady);
  await saveEdit();
  check("[I] All adds saved", patchCount >= 6, `patches=${patchCount}`);
  await page.screenshot({ path: "scripts/shots/widgets-phase02-final.png", fullPage: false });

  // ── [J] Edit-mode gear mutates the DRAFT ───────────────────────────────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-widget-settings-heatmap"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator("#widget-setting-day-p-l-in-cells").click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(400);
  check(
    "[J] Draft reflects the change before Save (values hidden)",
    (await page.locator('[data-testid="heatmap-cell-value"]').count()) === 0,
  );
  await saveEdit();
  check("[J] Draft config committed by Save", patchCount >= 7, `patches=${patchCount}`);

  // Second change then CANCEL — confirmed discard keeps the saved config
  await enterEdit();
  await page.locator('[data-testid="dashboard-widget-settings-heatmap"]').first().click();
  await page.locator('[data-testid="widget-settings-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.locator("#widget-setting-day-p-l-in-cells").click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="widget-settings-save"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-toolbar-cancel"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(600);
  check(
    "[J] Cancel keeps the saved config (values still hidden)",
    (await page.locator('[data-testid="heatmap-cell-value"]').count()) === 0,
  );

  // ── [K] Mobile 390 with the new widgets present ────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForTimeout(800);
  const mobileFill = mobile.locator('[data-testid="fill-demo"]');
  if (await mobileFill.isVisible().catch(() => false)) {
    await mobileFill.click();
  } else {
    await mobile.locator("#login-email").fill("trader@cosmoz.app");
    await mobile.locator("#login-password").fill("cosmoz-demo-2026");
  }
  await mobile.getByRole("button", { name: /Sign in/ }).click();
  await mobile.waitForFunction(() => window.location.pathname === "/", null, { timeout: 15000 });
  await mobile.locator('[data-testid="dashboard-widget-goals_pace"]').waitFor({ timeout: 20000 });
  await mobile.waitForTimeout(1500);
  const noMobileOverflow = await mobile.evaluate(() => {
    const grid = document.querySelector('[data-testid="dashboard-grid"]');
    return grid ? document.documentElement.scrollWidth <= window.innerWidth + 1 : false;
  });
  check("[K] Mobile 390: no horizontal overflow", noMobileOverflow);
  await mobile.screenshot({ path: "scripts/shots/widgets-phase02-mobile.png", fullPage: false });
  await mobile.close();

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log("\n=== Phase 02 widget customization — results ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL"));
  // Expected pre-login session probes: the auth provider checks /me, gets a
  // 401, attempts a refresh, gets a 401 — the designed anonymous flow.
  const noise = errors.filter(
    (entry) =>
      !entry.includes("favicon") &&
      !entry.includes("ResizeObserver loop") &&
      !entry.includes("401 http://localhost:3000/api/auth/me") &&
      !entry.includes("401 http://localhost:3000/api/auth/refresh") &&
      // The browser's generic console echo of the (expected) auth 401s.
      !(entry.includes("Failed to load resource") && entry.includes("401")),
  );
  console.log(`\nConsole/network noise: ${noise.length}`);
  if (noise.length > 0) console.log(noise.slice(0, 10).join("\n"));
  console.log(`\n${failed.length === 0 && noise.length === 0 ? "ALL GREEN" : `${failed.length} FAIL / ${noise.length} noise`}`);
  await browser.close();
  process.exit(failed.length === 0 && noise.length === 0 ? 0 : 1);
})().catch((error) => {
  console.error("PROBE CRASH:", error);
  process.exit(1);
});
