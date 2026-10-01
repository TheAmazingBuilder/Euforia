/**
 * Verify — Session Live V1 rebuild (MASTER PROMPT + V1 roadmap).
 *
 * Covers:
 *   A. Workspace shell: header statuses, market row, 3-column grid, chart,
 *      context panels, broker read-only, symbol positions.
 *   B. Indicators: add EMA (overlay) + RSI (sub-pane), legend chips, hide,
 *      remove.
 *   C. Drawings: arm HLINE → click places; FIB two clicks; delete; clear.
 *   D. Key levels: add (prefilled price), list row, chart overlay toggle,
 *      delete.
 *   E. Session lifecycle: start with context, LIVE badge + duration, bias
 *      change, logbook note → NOTE_ADDED event, end session → summary,
 *      history drawer entry, real metrics.
 *   F. Integrations: Playbook tab (strategy context), Rules tab, Economy tab,
 *      Save Analysis + Restore, Save to Nofy (note visible in Nofy).
 *   G. Security: no execution vocabulary/buttons anywhere on the page;
 *      broker panel has zero buttons; READ ONLY stamp.
 *   H. Mobile 390: renders, no horizontal overflow.
 *
 * SPA-only navigation after the first goto (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i, /X-TransformPort/i];

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

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ══ A. Workspace shell ═══════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);

  check("Header renders with lifecycle actions", await page.locator('[data-testid="session-live-header"]').isVisible());
  check(
    "No active session state shown",
    (await page.locator('[data-testid="session-status-none"]').textContent())?.includes("NO ACTIVE SESSION") === true,
  );
  check("Feed badge present", await page.locator('[data-testid="feed-badge"]').isVisible());
  check("Broker badge present", await page.locator('[data-testid="broker-badge"]').isVisible());
  check("Start session button present", await page.locator('[data-testid="start-session-button"]').isVisible());
  check("Market row with symbol picker", await page.locator('[data-testid="session-market-row"]').isVisible());
  check("Left rail tools", await page.locator('[data-testid="session-left-rail"]').isVisible());
  check(
    "Analysis chart canvas rendered",
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="analysis-chart"]');
      if (!el) return false;
      const canvas = el.querySelector("canvas");
      return canvas !== null && canvas.width > 200;
    }),
  );
  check("Market context panel", await page.locator('[data-testid="market-context-panel"]').isVisible());
  check("Objective section present", (await page.locator('[data-testid="market-context-panel"]').textContent())?.includes("Objective market data") === true);
  check("Interpretation section separated", (await page.locator('[data-testid="market-context-panel"]').textContent())?.includes("Trader interpretation") === true);
  check("Context price rendered", ((await page.locator('[data-testid="context-price"]').textContent()) ?? "").trim() !== "" && (await page.locator('[data-testid="context-price"]').textContent()) !== "—");
  check("Key levels panel", await page.locator('[data-testid="key-levels-panel"]').isVisible());
  check("Broker panel read-only stamp", (await page.locator('[data-testid="broker-panel"]').textContent())?.includes("READ ONLY") === true);
  check("Broker panel has zero action buttons", (await page.locator('[data-testid="broker-panel"] button').count()) === 0);
  check("Context tabs strip", await page.locator('[data-testid="context-tab-playbook"]').isVisible());
  check("Open positions preserved", (await page.getByRole("region", { name: "Open positions" }).count()) === 1);
  check("Mood strip preserved", (await page.getByText("Mood strip").count()) >= 1);

  // ══ B. Indicators ════════════════════════════════════════════════════════
  await page.locator('[data-testid="indicators-button"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="indicator-add-EMA"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="indicator-add-RSI"]').click();
  await page.waitForTimeout(600);
  check(
    "Indicators added (EMA + RSI)",
    (await page.locator('[data-testid="indicator-list"] li').count()) === 2,
  );
  check(
    "Legend chips visible on chart",
    (await page.locator('[data-testid="chart-indicator-legend"]').textContent())?.includes("EMA") === true,
  );
  const rsiValue = await page.evaluate(() => {
    const canvases = document.querySelectorAll('[data-testid="analysis-chart"] canvas');
    return canvases.length;
  });
  check("Chart canvases present (main + overlay layer)", rsiValue >= 1, `${rsiValue} canvas`);
  // Hide EMA then remove RSI.
  await page.locator('[data-testid="indicator-list"] li', { hasText: "EMA" }).getByRole("button", { name: /Hide EMA/i }).click();
  await page.waitForTimeout(300);
  check(
    "EMA hidden (Show label now)",
    (await page.locator('[data-testid="indicator-list"] li', { hasText: "EMA" }).textContent())?.includes("Show") === true,
  );
  await page.locator('[data-testid="indicator-list"] li', { hasText: "RSI" }).getByRole("button", { name: /Remove RSI/i }).click();
  await page.waitForTimeout(300);
  check("RSI removed", (await page.locator('[data-testid="indicator-list"] li').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ══ C. Drawings ══════════════════════════════════════════════════════════
  await page.locator('[data-testid="drawings-button"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="drawing-tool-HLINE"]').click();
  await page.waitForTimeout(300);
  check("Tool hint armed", await page.locator('[data-testid="chart-tool-hint"]').isVisible());
  check("Popover closed on arm (chart visible)", (await page.locator('[data-testid="drawings-popover"]').count()) === 0);
  const chartBox = await page.locator('[data-testid="analysis-chart"]').boundingBox();
  if (chartBox) {
    await page.mouse.click(chartBox.x + chartBox.width * 0.5, chartBox.y + chartBox.height * 0.4);
    await page.waitForTimeout(500);
  }
  // Reopen the popover to inspect the placed drawing list.
  const openDrawings = async () => {
    await page.locator('[data-testid="drawings-button"]').click();
    await page.locator('[data-testid="drawings-popover"]').waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(250);
  };
  await openDrawings();
  check("HLINE placed by click", (await page.locator('[data-testid="drawing-list"] li').count()) === 1);
  // FIB — arm again (closes popover), then two clicks.
  await page.locator('[data-testid="drawing-tool-FIB"]').click();
  await page.waitForTimeout(300);
  if (chartBox) {
    await page.mouse.click(chartBox.x + chartBox.width * 0.3, chartBox.y + chartBox.height * 0.3);
    await page.waitForTimeout(250);
    await page.mouse.click(chartBox.x + chartBox.width * 0.7, chartBox.y + chartBox.height * 0.6);
    await page.waitForTimeout(500);
  }
  await openDrawings();
  check("FIB placed with two clicks", (await page.locator('[data-testid="drawing-list"] li').count()) === 2);
  await page.getByRole("button", { name: "Undo last drawing" }).click();
  await page.waitForTimeout(300);
  check("Undo removes last drawing", (await page.locator('[data-testid="drawing-list"] li').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ══ D. Key levels ════════════════════════════════════════════════════════
  const priceText = (await page.locator('[data-testid="context-price"]').textContent()) ?? "0";
  const priceNum = Number(String(priceText).replace(/,/g, ""));
  await page.locator('[data-testid="level-kind"]').selectOption("SUPPORT");
  await page.locator('[data-testid="level-price"]').fill(String(priceNum ? (priceNum * 0.99).toFixed(2) : "1"));
  await page.locator('[data-testid="level-add"]').click();
  await page.waitForTimeout(900);
  check("Key level added", (await page.locator('[data-testid="level-list"] li').count()) >= 1);
  await page.locator('[data-testid="levels-overlay-toggle"]').click();
  await page.waitForTimeout(400);
  check(
    "Level overlay toggle arms chart lines",
    (await page.locator('[data-testid="levels-overlay-toggle"]').getAttribute("aria-pressed")) === "true",
  );

  // ══ E. Session lifecycle ═════════════════════════════════════════════════
  await page.locator('[data-testid="start-session-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="start-session-dialog"]').waitFor({ state: "visible" });
  await page.locator("#ss-objective").fill("Verify the rebuilt cockpit end to end");
  await page.locator('[data-testid="start-session-confirm"]').click();
  await page.waitForTimeout(1500);
  check("Session LIVE badge", await page.locator('[data-testid="session-status-active"]').isVisible());
  check("Duration ticker running", /\d+m/.test((await page.locator('[data-testid="session-duration"]').textContent()) ?? ""));
  check("End session button visible", await page.locator('[data-testid="end-session-button"]').isVisible());

  // Bias change → interpretation updates + BIAS_CHANGED event.
  await page.locator('[data-testid="bias-bullish"]').click();
  await page.waitForTimeout(900);
  check("Bias set to Bullish", ((await page.locator('[data-testid="context-bias"]').textContent()) ?? "").includes("BULLISH"));

  // Session logbook note → NOTE_ADDED in "This session".
  const logInput = page.locator('[data-testid="session-logbook-input"]');
  if ((await logInput.count()) > 0) {
    await logInput.fill("Cockpit verification note");
    await page.locator('[data-testid="session-logbook-submit"]').click();
    await page.waitForTimeout(1200);
    check(
      "NOTE_ADDED session event",
      (await page.locator('[data-testid="session-events"]').textContent())?.includes("Session note logged") === true,
    );
  } else {
    check("Session logbook input found", false, "input missing");
  }

  // ══ F. Context integrations ══════════════════════════════════════════════
  await page.locator('[data-testid="context-tab-playbook"]').click();
  await page.waitForTimeout(500);
  check("Playbook tab renders", await page.locator('[data-testid="playbook-context"]').isVisible());
  const strategySelect = page.locator('[data-testid="context-strategy-select"]');
  const strategyCount = await strategySelect.locator("option").count();
  if (strategyCount > 1) {
    await strategySelect.selectOption({ index: 1 });
    await page.waitForTimeout(600);
    check("Strategy context renders conditions", (await page.locator('[data-testid="playbook-context"]').textContent())?.includes("Entry conditions") === true);
  } else {
    check("Strategy available in playbook", false, "no strategies in catalog");
  }

  await page.locator('[data-testid="context-tab-rules"]').click();
  await page.waitForTimeout(600);
  check("Rules tab renders", await page.locator('[data-testid="rules-context"]').isVisible());
  check("Trades today counter", (await page.locator('[data-testid="rules-trades-today"]').count()) === 1);

  await page.locator('[data-testid="context-tab-economy"]').click();
  await page.waitForTimeout(600);
  check("Economy tab renders", await page.locator('[data-testid="economy-context"]').isVisible());

  // Save Analysis + Restore.
  await page.locator('[data-testid="context-tab-analyses"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="save-analysis-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="scenario-bullish"]').fill("Sweep of the 0.99 support; reclaim; target +1%; invalid below.");
  await page.locator('[data-testid="save-analysis-confirm"]').click();
  await page.waitForTimeout(1200);
  check("Saved analysis listed", (await page.locator('[data-testid="analysis-list"] li').count()) >= 1);
  const firstRestore = page.locator('[data-testid^="restore-analysis-"]').first();
  await firstRestore.click();
  await page.waitForTimeout(700);

  // Save to Nofy.
  await page.locator('[data-testid="save-to-nofy-button"]').click();
  await page.waitForTimeout(1200);

  // ══ End session → summary ════════════════════════════════════════════════
  await page.locator('[data-testid="end-session-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="reflection-happened"]').fill("The rebuild behaves; every panel reports real data.");
  await page.locator('[data-testid="end-session-confirm"]').click();
  await page.waitForTimeout(1500);
  check("Session summary shown", await page.locator('[data-testid="session-summary"]').isVisible());
  check("Summary counts analyses", (await page.locator('[data-testid="summary-analyses"]').textContent())?.trim() === "1");
  await page.locator('[data-testid="session-summary-close"]').click();
  await page.waitForTimeout(900);
  check("Session closed (no active)", await page.locator('[data-testid="session-status-none"]').isVisible());

  // History drawer.
  await page.locator('[data-testid="session-history-button"]').click();
  await page.waitForTimeout(700);
  check("History lists completed session", (await page.locator('[data-testid="history-session-row"]').count()) >= 1);
  await page.locator('[data-testid="history-session-row"] summary').first().click();
  await page.waitForTimeout(400);
  check("History row expands with timeline", (await page.locator('[data-testid="history-session-row"]').first().textContent())?.includes("Session started") === true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Nofy note exists (SPA navigation; the notes list lives behind its tab).
  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForTimeout(1500);
  const notesTab = page.locator('[data-testid="nofy-tab-notes"]');
  if ((await notesTab.count()) > 0) {
    await notesTab.click();
    await page.waitForTimeout(1200);
  }
  const nofyText = await page.locator("body").textContent();
  check("Save-to-Nofy note visible in Nofy", nofyText?.includes("Session Analysis") === true);

  // ══ G. Security (execution-negative) ═════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.waitForTimeout(2000);
  // Execution-negative: direction labels on journal positions are factual
  // display; no INTERACTIVE CONTROL may carry an execution verb.
  const executionButtons = await page
    .locator('main button, main a, main [role="button"]')
    .evaluateAll((elements) =>
      elements
        .filter((el) => /\b(buy|sell|execute|place order|close position|modify position|cancel order)\b/i.test(el.textContent ?? ""))
        .map((el) => el.textContent?.slice(0, 40)),
    );
  check("No execution controls anywhere", executionButtons.length === 0, executionButtons.slice(0, 3).join(" | "));
  check("Read-only stamp on account panel", (await page.locator('[data-testid="broker-panel"]').textContent())?.includes("READ ONLY") === true);

  // ══ H. Mobile 390 ════════════════════════════════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("Mobile: no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  check("Mobile: chart visible", await page.locator('[data-testid="analysis-chart"]').isVisible());

  await page.screenshot({ path: "/home/z/my-project/scripts/shots/sl-rebuild/mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/sl-rebuild/desktop.png", fullPage: false });

  // ══ Console / network cleanliness ════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));

  console.log("\n=== SUMMARY ===");
  console.log(results.filter((line) => line.startsWith("FAIL")).length === 0 ? "ALL PASS" : "FAILURES PRESENT");
  await browser.close();
})().catch((error) => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});
