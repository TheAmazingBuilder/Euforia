/**
 * Dashboard insights probe — Phase 05 (performance insights, pattern
 * analysis & trading behavior), run against the ZERO-ENV mock preview
 * (MSW on, default `next dev`).
 *
 * Covers: the four opt-in Phase 05 widgets add through the library and
 * render with real mock-suite data (breakdown table, behavioral insights
 * list or honest empty state, streak profile, weekly trend), the breakdown
 * dimension setting applies, suite-fed widgets are NOT badged "not
 * filtered" under active filters (they ARE filtered — Phase 05 §10 closed
 * the ALL-window wiring gap), filters change → widgets still render,
 * responsive 390px, console integrity.
 *
 * NOTE ON PERSISTENCE: mock preferences live in browser memory; the
 * server-side persistence of the dashboard domain is proven by the
 * settings e2e suite (real PostgreSQL), not here.
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
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Wait for hydration (the form is client-rendered) instead of a fixed delay.
  await page.waitForSelector("#login-email", { state: "visible", timeout: 30000 });
  await page.fill("#login-email", "trader@cosmoz.app");
  await page.fill("#login-password", "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check("login succeeded", !page.url().includes("/login"), page.url());
}

/** Wait until the dashboard is interactive (dev-mode cold compiles are
 * slow — never a fixed sleep). */
async function waitDashboardReady(page) {
  await page.waitForSelector('[data-testid="dashboard-customize"]', {
    state: "visible",
    timeout: 60000,
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="dashboard-customize"]')?.disabled,
    { timeout: 60000 },
  );
  await page.waitForTimeout(800);
}

async function saveLayout(page) {
  const saveBtn = page.locator('[data-testid="dashboard-toolbar-save"]');
  if (await saveBtn.isEnabled().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(1500);
  }
}

/** Enter edit mode ONCE and add every widget inside the SAME library
 * session — `dashboard-customize` only exists in view mode. */
async function addWidgetsInOneEditSession(page, keys) {
  await page.click('[data-testid="dashboard-customize"]');
  await page.waitForTimeout(500);
  await page.click('[data-testid="dashboard-toolbar-add"]');
  await page.waitForTimeout(600);
  for (const key of keys) {
    await page.click(`[data-testid="dashboard-library-add-${key}"]`);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await saveLayout(page);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Mount + library opt-in");
    await login(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitDashboardReady(page);

    await addWidgetsInOneEditSession(page, [
      "performance_breakdown",
      "behavioral_insights",
      "loss_streaks",
      "performance_trend",
    ]);

    check("PERFORMANCE_BREAKDOWN rendered", await page.locator('[data-testid="performance-breakdown-widget"]').isVisible().catch(() => false));
    check("BEHAVIORAL_INSIGHTS rendered", await page.locator('[data-testid="behavioral-insights-widget"]').isVisible().catch(() => false));
    check("LOSS_STREAKS rendered", await page.locator('[data-testid="loss-streaks-widget"]').isVisible().catch(() => false));
    check("PERFORMANCE_TREND rendered", await page.locator('[data-testid="performance-trend-widget"]').isVisible().catch(() => false));

    console.log("\n[1] Breakdown table content (strategy dimension default)");
    check("breakdown table present", await page.locator('[data-testid="performance-breakdown-table"]').isVisible().catch(() => false));
    const rows = await page.locator('[data-testid="performance-breakdown-table"] tbody tr').count();
    check("breakdown has rows from mock suite", rows > 0, `${rows} rows`);

    console.log("\n[2] Behavioral insights — findings or honest silence, never blank");
    const insightsList = await page.locator('[data-testid="behavioral-insights-list"]').count();
    const insightsEmpty = await page.locator('[data-testid="behavioral-insights-empty"]').count();
    check("insights render a list or the explicit empty state", insightsList + insightsEmpty === 1);
    if (insightsList === 1) {
      const findings = await page.locator('[data-testid^="insight-"]').count();
      check("findings carry reliability chips + n", findings > 0, `${findings} findings`);
      check(
        "methodology footnote present",
        await page.getByText("How these findings are labeled").isVisible().catch(() => false),
      );
    } else {
      const emptyText = await page.locator('[data-testid="behavioral-insights-empty"]').innerText();
      check("empty state explains the thresholds", emptyText.includes("5 observations"), emptyText.slice(0, 60));
    }

    console.log("\n[3] Streak profile + weekly trend content");
    check("streak summary rendered", await page.locator('[data-testid="loss-streaks-summary"]').isVisible().catch(() => false));
    check("breakeven rule rendered verbatim", await page.getByText(/Breakeven trades/).isVisible().catch(() => false));
    const trendRows = await page.locator('[data-testid="performance-trend-table"] tbody tr').count();
    check("trend table has weekly rows", trendRows > 0, `${trendRows} weeks`);
    check("trend honesty footnote", await page.getByText(/not a forecast/).isVisible().catch(() => false));

    console.log("\n[4] Breakdown dimension setting applies");
    // Exit edit mode without saving so the settings persist path runs in view mode.
    const cancelBtn = page.locator('[data-testid="dashboard-toolbar-cancel"]');
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(600);
    }
    // In view mode the gear floats over the grid SECTION (a sibling of the
    // card, opacity-60 at sm+) — locate it globally, not inside the card.
    const gear = page.locator('[data-testid="dashboard-widget-settings-performance_breakdown"]');
    if (await gear.isVisible().catch(() => false)) {
      await gear.click();
      await page.waitForTimeout(600);
      await page.locator('[data-testid="widget-settings-select-dimension"]').click();
      await page.waitForTimeout(300);
      await page.getByRole("option", { name: /Instrument/ }).click();
      await page.waitForTimeout(300);
      await page.click('[data-testid="widget-settings-save"]');
      await page.waitForTimeout(2000);
      const widgetText = await page
        .locator('[data-testid="performance-breakdown-widget"]')
        .innerText()
        .catch(() => "");
      check(
        "dimension switch reflected in header + rows",
        widgetText.includes("Instrument populations"),
        widgetText.slice(0, 60).replace(/\n/g, " | "),
      );
    } else {
      check("breakdown settings gear reachable", false, "gear not found");
    }

    console.log("\n[5] Global filters → suite-fed widgets stay badge-free and render");
    await page.click('[data-testid="dashboard-filter-period"]');
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "This month" }).click();
    await page.waitForTimeout(1500);
    check(
      "breakdown NOT badged 'not filtered'",
      (await page.locator('[data-testid="dashboard-widget-unfiltered-performance_breakdown"]').count()) === 0,
    );
    check(
      "insights NOT badged",
      (await page.locator('[data-testid="dashboard-widget-unfiltered-behavioral_insights"]').count()) === 0,
    );
    check("breakdown still renders under filters", await page.locator('[data-testid="performance-breakdown-widget"]').isVisible().catch(() => false));
    check("trend still renders under filters", await page.locator('[data-testid="performance-trend-widget"]').isVisible().catch(() => false));

    console.log("\n[6] Mobile 390px");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("no horizontal overflow", overflow <= 1, `${overflow}px`);

    console.log("\n[7] Console integrity");
    check("zero page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } catch (error) {
    failed += 1;
    console.error("PROBE CRASH:", error);
  } finally {
    await browser.close();
  }

  console.log(`\n=== dashboard-insights probe: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
