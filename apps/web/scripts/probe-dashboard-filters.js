/**
 * Dashboard filter-bar probe - Phase 03 (global filters & saved analytical
 * views), run against the ZERO-ENV mock preview (MSW on, default `next dev`).
 *
 * Covers: filter bar mount, period + direction filters with chips, active
 * count, "not filtered" badges on unaffected widgets (honest §8 rule), the
 * METRICS_CARD global-note once added through the library (suite-fed widget
 * consuming the shared context §7), saved-view create/apply/diverged/
 * rename/duplicate/delete lifecycle (§10), clear-all, responsive wrap at
 * 390px, console integrity.
 *
 * NOTE ON PERSISTENCE: in mock mode the preferences store lives in browser
 * memory and reseeds on reload - the reload-survival of views/filters is
 * proven SERVER-SIDE by the settings e2e suite (real PostgreSQL), not here.
 */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;
const pageErrors = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` - ${extra}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check("login succeeded", !page.url().includes("/login"), page.url());
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Dashboard + filter bar mount");
    await login(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);
    check("filter bar mounted", await page.locator('[data-testid="dashboard-filter-bar"]').isVisible().catch(() => false));
    check("period control present", await page.locator('[data-testid="dashboard-filter-period"]').isVisible().catch(() => false));
    check("clear-all disabled when unfiltered", !(await page.locator('[data-testid="dashboard-filter-clear"]').isEnabled().catch(() => true)));
    check("no active-filter count badge", (await page.locator('[data-testid="dashboard-filter-count"]').count()) === 0);

    console.log("\n[1] Period + direction filters → chips + badges");
    await page.click('[data-testid="dashboard-filter-period"]');
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "This month" }).click();
    await page.waitForTimeout(1200);
    check("active count = 1 after period", (await page.locator('[data-testid="dashboard-filter-count"]').innerText().catch(() => "")) === "1");
    check("period chip rendered", await page.locator('[data-testid="dashboard-filter-chips"]').isVisible().catch(() => false));
    check("clear-all enabled", await page.locator('[data-testid="dashboard-filter-clear"]').isEnabled());

    // Unaffected widgets carry the honest badge (default layout hosts only
    // UNAFFECTED widgets - the suite-fed ones are opt-in).
    const badges = await page.locator('[data-testid^="dashboard-widget-unfiltered-"]').count();
    check("unaffected widgets badged", badges >= 5, `${badges} badges`);
    const pnlBadge = page.locator('[data-testid="dashboard-widget-unfiltered-pnl_band"]');
    check("PNL_BAND badge present", (await pnlBadge.count()) === 1);

    console.log("\n[2] Suite-fed widget consumes the global context (§7)");
    // Add METRICS_CARD through the widget library (opt-in Phase 02 canon).
    await page.click('[data-testid="dashboard-customize"]');
    await page.waitForTimeout(500);
    await page.click('[data-testid="dashboard-toolbar-add"]');
    await page.waitForTimeout(600);
    const addMetrics = page.locator('[data-testid="dashboard-library-add-metrics_card"]');
    check("library lists Performance metrics", await addMetrics.isVisible().catch(() => false));
    await addMetrics.click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Exit edit mode - Save the layout so the widget persists.
    const saveBtn = page.locator('[data-testid="dashboard-toolbar-save"]');
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }
    const metricsWidget = page.locator('[data-testid="metrics-card-widget"]');
    check("METRICS_CARD rendered", await metricsWidget.isVisible().catch(() => false));
    check(
      "global-note visible under active filters",
      await page.locator('[data-testid="metrics-card-global-note"]').isVisible().catch(() => false),
    );
    const metricsBadge = page.locator('[data-testid="dashboard-widget-unfiltered-metrics_card"]');
    check("suite-fed widget NOT badged", (await metricsBadge.count()) === 0);

    console.log("\n[3] Saved-view lifecycle (§10)");
    await page.click('[data-testid="dashboard-view-save"]');
    await page.fill('[data-testid="dashboard-view-name-input"]', "Probe view");
    await page.press('[data-testid="dashboard-view-name-input"]', "Enter");
    await page.waitForTimeout(1200);
    // Radix registers item text on first open - open once, then read.
    await page.click('[data-testid="dashboard-view-select"]');
    await page.waitForTimeout(400);
    check("created view listed in the selector", await page.getByRole("option", { name: /Probe view/ }).isVisible().catch(() => false));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Manual edit → diverged badge (§10.7 - never a silent overwrite).
    await page.click('[data-testid="dashboard-filter-direction"]');
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "Long (BUY)" }).click();
    await page.waitForTimeout(1000);
    check("diverged badge after manual edit", await page.locator('[data-testid="dashboard-view-diverged"]').isVisible().catch(() => false));
    check("active count = 2", (await page.locator('[data-testid="dashboard-filter-count"]').innerText().catch(() => "")) === "2");

    // Re-apply the view via the "modified - apply again" restore button
    // (Radix never re-fires onValueChange for the already-selected item -
    // the restore affordance is the designed path, §10.7).
    await page.click('[data-testid="dashboard-view-diverged"]');
    await page.waitForTimeout(1000);
    check("re-apply restores the view filters", (await page.locator('[data-testid="dashboard-filter-count"]').innerText().catch(() => "")) === "1");
    check("diverged badge gone", (await page.locator('[data-testid="dashboard-view-diverged"]').count()) === 0);

    // Manage: duplicate → rename → delete (confirm dialog).
    await page.click('[data-testid="dashboard-view-manage"]');
    await page.waitForTimeout(400);
    const popover = page.locator('[data-testid="dashboard-view-manage-popover"]');
    await popover.getByRole("button", { name: /duplicate Probe view/i }).click();
    await page.waitForTimeout(800);
    check("duplicate listed", await popover.getByText("Probe view copy").isVisible().catch(() => false));

    await popover.getByRole("button", { name: /rename Probe view copy/i }).click();
    const renameInput = popover.locator('input[aria-label="New name for Probe view copy"]');
    await renameInput.fill("Probe renamed");
    await popover.getByRole("button", { name: /^ok$/i }).click();
    await page.waitForTimeout(800);
    check("rename applied", await popover.getByText("Probe renamed").isVisible().catch(() => false));

    await popover.getByRole("button", { name: /delete Probe renamed/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /delete view/i }).click();
    await page.waitForTimeout(800);
    check("delete removed the copy", (await page.getByText("Probe renamed").count()) === 0);
    await page.click('[data-testid="dashboard-view-manage"]'); // close popover
    await page.waitForTimeout(300);

    console.log("\n[4] Clear-all restores the unfiltered dashboard");
    await page.click('[data-testid="dashboard-filter-clear"]');
    await page.waitForTimeout(1000);
    check("no active-filter count badge", (await page.locator('[data-testid="dashboard-filter-count"]').count()) === 0);
    check("chips gone", (await page.locator('[data-testid="dashboard-filter-chips"]').count()) === 0);
    const badgesAfter = await page.locator('[data-testid^="dashboard-widget-unfiltered-"]').count();
    check("badges hidden when unfiltered", badgesAfter === 0, `${badgesAfter} badges`);

    console.log("\n[5] Mobile 390px - the bar wraps without horizontal overflow");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("no horizontal overflow", overflow <= 1, `${overflow}px`);
    check("period control reachable", await page.locator('[data-testid="dashboard-filter-period"]').isVisible().catch(() => false));

    console.log("\n[6] Console integrity");
    check("zero page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } catch (error) {
    failed += 1;
    console.error("PROBE CRASH:", error);
  } finally {
    await browser.close();
  }

  console.log(`\n=== dashboard-filters probe: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
