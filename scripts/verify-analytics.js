/**
 * verify-analytics.js — Analytics module (MASTER PROMPT) + logo/logout fixes.
 *
 * Contract under test:
 *  - 13 tabs (§4) persisted in the URL (?tab=)
 *  - Overview KPI band with definitions + honest "—" when data is missing (§6/§34)
 *  - Global filter system (§5): ONE dataset definition, filters update every
 *    tab, URL-persisted, reset, saved presets, dataset echo line
 *  - Performance charts, drawdown drill-down (§11/§33), strategy factual rows (§12)
 *  - Monte Carlo labelled SIMULATION (§25), reports + CSV export (§26)
 *  - Brand: original triangle logo on sidebar; Log out INSIDE the nav below the
 *    SYSTEM section with destructive hover
 *  - light theme + mobile 390 · 0 console errors
 */
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedUrls = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failedUrls.push(res.url());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  const isEnvNoise = (text) =>
    text.includes("socket.io") ||
    text.includes("XTransformPort") ||
    // Generic resource errors are matched against the failed URLs below.
    (text.includes("Failed to load resource") &&
      failedUrls.every((url) => url.includes("socket.io") || url.includes("XTransformPort")));

  // ── 1. Brand: triangle logo + logout below SYSTEM ─────────────────────────
  console.log("\n■ Brand & logout");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  const brandHasSvg = await page.locator("aside a[data-slot?] svg, aside a svg").first().isVisible().catch(() => false);
  const logoSvg = await page.locator("aside a[aria-label='Euforia — Dashboard'] svg").first();
  ok("Sidebar brand renders an SVG mark", brandHasSvg || (await logoSvg.isVisible().catch(() => false)));
  // Logo: the ORBITAL COMET artwork (orbit arc ending in a comet head).
  const cometShape = await logoSvg.locator("path[d^='M 74.43 43.11']").count().catch(() => 0);
  ok("Brand mark is the orbital-comet artwork (orbit arc path)", cometShape >= 1);

  const nav = page.locator("aside nav[aria-label='Main navigation']");
  const logout = nav.locator("[data-testid='sidebar-logout']");
  ok("Log out lives INSIDE the sidebar nav (below System)", (await logout.count()) === 1);
  const securityLink = nav.locator("a[href='/security']");
  const logoutIsAfterSecurity = await securityLink.evaluate(
    (sec, log) => Boolean(log && (sec.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING)),
    await logout.elementHandle().catch(() => null),
  );
  ok("Log out sits after the last SYSTEM item (Security)", logoutIsAfterSecurity);
  const logoutClass = await logout.getAttribute("class");
  ok("Log out hover turns destructive (class contains hover:text-destructive)", (logoutClass ?? "").includes("hover:text-destructive"));
  await logout.hover();
  await page.waitForTimeout(350);
  const hoverColor = await logout.evaluate((el) => getComputedStyle(el).color);
  const baseColor = await page.locator("aside nav a[href='/monitoring']").evaluate((el) => getComputedStyle(el).color).catch(() => "");
  console.log(`    (hover color: ${hoverColor} vs nav ${baseColor})`);
  ok("Log out hover changes the text color", hoverColor !== baseColor);
  const bottomBarText = await page.locator("aside > div.border-t").innerText().catch(() => "");
  ok("Bottom bar no longer holds the logout (Collapse only)", !bottomBarText.includes("Log out"));

  // ── 2. Analytics module ───────────────────────────────────────────────────
  console.log("\n■ Analytics — Overview");
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  ok("Dataset echo line renders", await page.locator("[data-testid='analytics-dataset']").isVisible());
  const datasetText = await page.locator("[data-testid='analytics-dataset']").innerText();
  ok("Dataset line shows closed-trade count", /\d+ closed trades/.test(datasetText));
  ok("Dataset line shows resolved range", /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/.test(datasetText));

  const tabs = page.locator("[role='tablist'] [role='tab']");
  ok("13 tabs render", (await tabs.count()) === 13);

  // Overview KPIs
  const overviewBlock = page.locator("[data-testid='analytics-tab-overview']");
  ok("Overview: Net P&L card", await overviewBlock.getByText("Net P&L", { exact: true }).isVisible());
  ok("Overview: Profit factor card", await overviewBlock.getByText("Profit factor", { exact: true }).isVisible());
  ok("Overview: Expectancy card", await overviewBlock.getByText("Expectancy", { exact: true }).isVisible());
  ok("Overview: equity chart canvas", (await overviewBlock.locator("canvas").count()) >= 1);
  // Definition tooltip present (§6)
  const infoButtons = await overviewBlock.locator("button[aria-label$='definition']").count();
  ok("Overview KPI cards expose definition tooltips", infoButtons >= 6);

  console.log("\n■ Analytics — tabs");
  for (const tabId of ["performance", "risk", "strategy", "market", "time", "psychology", "quality", "mistakes", "events", "advanced", "montecarlo", "reports"]) {
    await page.locator(`[role='tab']:has-text('${labelFor(tabId)}')`).first().click();
    await page.waitForTimeout(650);
    const panel = page.locator(`[data-testid='analytics-tab-${tabId}']`);
    ok(`Tab « ${tabId} » renders its panel`, await panel.isVisible());
  }
  ok("Tab persisted in URL (?tab=)", (await page.url()).includes("tab=reports"));

  // ── 3. Global filters (§5) ────────────────────────────────────────────────
  console.log("\n■ Analytics — global filters");
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2200);

  const baseCount = await page.locator("[data-testid='analytics-dataset']").innerText();
  // Direction filter changes the dataset
  await page.locator("[data-testid='filter-direction']").click();
  await page.getByRole("option", { name: "Short only" }).click();
  await page.waitForTimeout(1200);
  const sellCount = await page.locator("[data-testid='analytics-dataset']").innerText();
  ok("Direction filter changes the dataset echo", baseCount !== sellCount && /Short only|SELL/.test(sellCount));
  ok("Filter persisted in URL (?dir=SELL)", (await page.url()).includes("dir=SELL"));

  // Period filter
  await page.locator("[data-testid='filter-period']").click();
  await page.getByRole("option", { name: "Last 30 Days" }).click();
  await page.waitForTimeout(1200);
  ok("Period filter persisted (?period=LAST_30)", (await page.url()).includes("period=LAST_30"));

  // Reset
  await page.locator("[data-testid='analytics-reset']").click();
  await page.waitForTimeout(1000);
  const resetCount = await page.locator("[data-testid='analytics-dataset']").innerText();
  ok("Reset restores the full dataset", resetCount === baseCount);
  ok("Reset clears URL filters", !(await page.url()).includes("dir=SELL"));

  // Empty-state honesty (§34): today has only 2-3 closed trades → small-sample warnings
  await page.locator("[data-testid='filter-period']").click();
  await page.getByRole("option", { name: "Today" }).click();
  await page.waitForTimeout(1200);
  const todayDataset = await page.locator("[data-testid='analytics-dataset']").innerText();
  ok("Small-sample warning displayed when n < 10", /Small sample/.test(todayDataset));
  await page.locator("[data-testid='analytics-reset']").click();
  await page.waitForTimeout(900);

  // Strategy drill-through (§33)
  await page.locator("[role='tab']:has-text('Strategy')").first().click();
  await page.waitForTimeout(900);
  const strategyRows = page.locator("[data-testid='analytics-tab-strategy'] tbody tr:not([aria-hidden])");
  const rowCount = await strategyRows.count();
  ok("Strategy table renders rows", rowCount >= 2);
  const firstStrategyLabel = await strategyRows.first().locator("td").first().innerText();
  await strategyRows.first().click();
  await page.waitForTimeout(1100);
  const datasetAfterDrill = await page.locator("[data-testid='analytics-dataset']").innerText();
  ok("Clicking a strategy row filters the whole module", datasetAfterDrill.includes(firstStrategyLabel) || (await page.url()).includes("strat="));
  await page.locator("[data-testid='analytics-reset']").click();
  await page.waitForTimeout(900);

  // Drawdown drill-down rows (§11)
  await page.locator("[role='tab']:has-text('Risk')").first().click();
  await page.waitForTimeout(900);
  const ddChips = await page.locator("[data-testid='analytics-tab-risk'] tbody tr[aria-hidden] span").count();
  ok("Drawdown periods expose the responsible trades", ddChips >= 3);

  // Saved presets (localStorage)
  await page.locator("button:has-text('Save preset')").click();
  await page.locator("input[aria-label='Preset name']").fill("My edge");
  await page.locator("button:has-text('Save')").last().click();
  await page.waitForTimeout(500);
  ok("Saved preset appears in the selector", await page.locator("[role='combobox'][aria-label='Saved filter presets']").isVisible());

  // Monte Carlo honesty (§25)
  await page.locator("[role='tab']:has-text('Monte Carlo')").first().click();
  await page.waitForTimeout(900);
  ok("Monte Carlo labelled SIMULATION", (await page.locator("[data-testid='analytics-tab-montecarlo'] text:has-text('Simulation')").count()) >= 1 || (await page.locator("[data-testid='analytics-tab-montecarlo']").getByText("SIMULATION").count()) >= 1);
  ok("Monte Carlo renders percentile bands canvas", (await page.locator("[data-testid='analytics-tab-montecarlo'] canvas").count()) >= 1);

  // CSV export (§26)
  await page.locator("[role='tab']:has-text('Reports')").first().click();
  await page.waitForTimeout(700);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    page.locator("[data-testid='analytics-export-csv']").click(),
  ]);
  ok("CSV export triggers a download", download !== null);

  // ── 4. Zero console errors so far ─────────────────────────────────────
  const appErrors = consoleErrors.filter((text) => !isEnvNoise(text));
  ok("0 console errors (desktop flow)", appErrors.length === 0);
  if (appErrors.length > 0) console.log(appErrors.slice(0, 4));

  // ── 5. Light theme ────────────────────────────────────────────────────────
  console.log("\n■ Light theme");
  await page.goto(`${BASE}/analytics?tab=overview`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "analytics-light.png"), fullPage: false });
  ok("Light theme screenshot captured", true);

  // ── 6. Mobile 390 ─────────────────────────────────────────────────────────
  console.log("\n■ Mobile 390");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark-blue");
    localStorage.setItem("theme", "dark-blue");
  });
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2200);
  ok("Mobile: dataset line visible", await page.locator("[data-testid='analytics-dataset']").isVisible());
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok("Mobile: no horizontal overflow", !hasHorizontalScroll);
  // Mobile sheet logout
  await page.locator("button[aria-label='Open navigation menu']").click();
  await page.waitForTimeout(700);
  const sheetLogout = await page
    .locator("[data-testid='sidebar-logout']")
    .filter({ visible: true })
    .first()
    .isVisible()
    .catch(() => false);
  ok("Mobile sheet: Log out visible inside nav", sheetLogout);
  await page.screenshot({ path: path.join(OUT, "analytics-mobile.png") });

  // Screenshots desktop
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${BASE}/analytics?tab=overview`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, "analytics-overview.png"), fullPage: false });
  await page.screenshot({ path: path.join(OUT, "logo-logout-sidebar.png"), clip: { x: 0, y: 0, width: 260, height: 960 } }).catch(() => {});

  await browser.close();

  console.log(`\n════════════════════════════════`);
  console.log(`  PASS ${pass}  /  FAIL ${fail}`);
  console.log(`════════════════════════════════`);
  process.exit(fail > 0 ? 1 : 0);
})();

function labelFor(tabId) {
  const map = {
    performance: "Performance",
    risk: "Risk",
    strategy: "Strategy",
    market: "Market",
    time: "Time",
    psychology: "Psychology",
    quality: "Trade Quality",
    mistakes: "Mistakes",
    events: "Events",
    advanced: "Advanced",
    montecarlo: "Monte Carlo",
    reports: "Reports",
  };
  return map[tabId] ?? tabId;
}
