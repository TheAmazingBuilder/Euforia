/**
 * verify-oryon.js — Phase 1 browser verification of the Oryon workspace.
 *
 * Checks (cahier de charge Phase 1 §12):
 *   1.  The /oryon route resolves through the app router (sidebar click).
 *   2.  The Oryon tab lives in the TRADING navigation section (user NB).
 *   3.  The chart initializes (canvas) and renders candle data (legend OHLC).
 *   4.  Timeframe change updates the chart without duplicating instances.
 *   5.  Instrument change updates the chart (palette → EURUSD).
 *   6.  Notifications + calendar utility panels open (existing journal feed).
 *   7.  Positions panel shows its honest deferred state.
 *   8.  Navigate away/back — no duplicate chart instances (cleanup works).
 *   9.  Mobile fallback (390px): rails hidden, no horizontal overflow.
 *   10. Page errors collected — the probe fails on any unfiltered error.
 *
 * Screenshots → /home/z/my-project/download/ (desktop + tablet + mobile).
 * Run: node scripts/verify-oryon.js   (server on :3000, mock mode)
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/download";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Known console noise: the documented auth boot 401 pair + favicon. */
function isNoise(text) {
  return (
    /401/.test(text) ||
    /\/api\/auth\/(me|refresh)/.test(text) ||
    /favicon/.test(text) ||
    /\[MSW\]/.test(text)
  );
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)));
  page.on("console", (message) => {
    if (message.type() === "error" && !isNoise(message.text())) {
      consoleErrors.push(message.text().slice(0, 300));
    }
  });

  try {
    // ── 1. Authenticated session ────────────────────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await ensureLogin(page);
    check("authenticated session", true);

    // ── 2. Oryon tab inside the TRADING section (user NB) ──────────────────
    const oryonLink = page.locator('a[href="/oryon"]').first();
    await oryonLink.waitFor({ state: "visible", timeout: 15_000 });
    const inTrading = await oryonLink.evaluate((el) => {
      let node = el;
      for (let depth = 0; depth < 10 && node; depth += 1) {
        node = node.parentElement;
        if (node && node.textContent && node.textContent.includes("Trading")) {
          return true;
        }
      }
      return false;
    });
    check("Oryon tab visible in sidebar", true);
    check("Oryon tab is in the Trading section", inTrading);

    // ── 3. Route resolves through the router (sidebar click) ──────────────
    await oryonLink.click();
    await page.locator('[data-testid="oryon-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
    check("/oryon route resolves (workspace mounted)", true);
    check("toolbar present", (await page.locator('[data-testid="oryon-toolbar"]').count()) === 1);
    check("drawing rail present", (await page.locator('[data-testid="oryon-drawing-rail"]').count()) === 1);

    // ── 4. Chart engine + candle data ──────────────────────────────────────
    await page
      .locator('[data-testid="oryon-chart-canvas"] canvas')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    check("chart canvas initialized", true);
    const canvasCount = await page.locator('[data-testid="oryon-chart-canvas"] canvas').count();
    // LW Charts v5 renders ~7 canvas LAYERS per instance (pane base/top, axes,
    // crosshair). A leak shows up as GROWTH of that count — snapshot baseline.
    const canvasBaseline = canvasCount;
    check("canvas layers snapshot", canvasCount >= 1, `count=${canvasCount}`);

    await page.locator('[data-testid="oryon-legend"]').waitFor({ state: "visible", timeout: 30_000 });
    const legend = await page.locator('[data-testid="oryon-legend"]').textContent();
    check("legend shows instrument", /XAUUSD/.test(legend ?? ""), legend ?? "");
    check("legend shows OHLC", /[OHC]/.test(legend ?? "") && /\d/.test(legend ?? ""));

    const source = await page.locator('[data-testid="oryon-source-badge"]').textContent();
    check("source badge honest (SIM/REAL)", /SIM|REAL/.test(source ?? ""), source ?? "");

    // ── 5. Timeframe switch ────────────────────────────────────────────────
    await page.locator('[data-testid="oryon-tf-1H"]').click();
    await page.waitForTimeout(1_500);
    const canvasAfterTf = await page.locator('[data-testid="oryon-chart-canvas"] canvas').count();
    const legendAfterTf = await page.locator('[data-testid="oryon-legend"]').textContent();
    check("timeframe switch: no duplicated chart instance", canvasAfterTf === canvasBaseline, `count=${canvasAfterTf}`);
    check("timeframe switch keeps instrument", /XAUUSD/.test(legendAfterTf ?? ""));

    // ── 6. Instrument switch (palette) ─────────────────────────────────────
    await page.locator('[data-testid="oryon-instrument-trigger"]').click();
    await page.locator('[data-testid="oryon-instrument-palette"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.locator('[data-testid="oryon-instrument-option-EURUSD"]').click();
    await page.waitForTimeout(2_000);
    const legendAfterInstrument = await page.locator('[data-testid="oryon-legend"]').textContent();
    check("instrument switch updates chart", /EURUSD/.test(legendAfterInstrument ?? ""), legendAfterInstrument ?? "");

    // ── 7. Right utility panels ────────────────────────────────────────────
    await page.locator('[data-testid="oryon-notifications-toggle"]').click();
    await page.locator('[data-testid="oryon-utility-rail"][data-panel="notifications"]').waitFor({ state: "visible", timeout: 10_000 });
    check("notifications panel opens", true);
    await page.locator('[data-testid="oryon-calendar-toggle"]').click();
    await page.locator('[data-testid="oryon-utility-rail"][data-panel="calendar"]').waitFor({ state: "visible", timeout: 10_000 });
    check("calendar panel opens", true);
    await page.locator('[data-testid="oryon-utility-close"]').click();
    await page.waitForTimeout(300);

    // ── 8. Positions panel — honest deferred state ─────────────────────────
    await page.locator('[data-testid="oryon-positions-toggle"]').click();
    const deferred = await page
      .locator("text=Positions are not integrated into Oryon yet")
      .count();
    check("positions panel shows deferred state", deferred > 0);
    await page.locator('[data-testid="oryon-positions-toggle"]').click();

    // ── 9. Desktop screenshot (panels closed, chart visible) ──────────────
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/oryon-phase1-desktop.png` });
    check("desktop screenshot saved", true, `${OUT}/oryon-phase1-desktop.png`);

    // ── 10. Cleanup: leave and return — no duplicate instances ─────────────
    await page.locator('[data-testid="oryon-exit"]').click();
    await page.waitForTimeout(1_000);
    await page.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator('[data-testid="oryon-chart-canvas"] canvas').first().waitFor({ state: "visible", timeout: 30_000 });
    const canvasAfterReturn = await page.locator('[data-testid="oryon-chart-canvas"] canvas').count();
    check("no duplicate chart after leave/return", canvasAfterReturn === canvasBaseline, `count=${canvasAfterReturn}`);

    // ── 11. Tablet + mobile fallback ───────────────────────────────────────
    const tablet = await context.newPage();
    await tablet.setViewportSize({ width: 900, height: 1_180 });
    await tablet.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tablet.locator('[data-testid="oryon-chart-canvas"] canvas').first().waitFor({ state: "visible", timeout: 30_000 });
    await tablet.waitForTimeout(800);
    await tablet.screenshot({ path: `${OUT}/oryon-phase1-tablet.png` });
    check("tablet layout renders", true, `${OUT}/oryon-phase1-tablet.png`);

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await mobile.locator('[data-testid="oryon-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
    await mobile.waitForTimeout(1_000);
    const railHidden = await mobile.locator('[data-testid="oryon-drawing-rail"]').isHidden().catch(() => true);
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("mobile: drawing rail hidden", railHidden);
    check("mobile: no horizontal overflow", overflow === 0, `overflow=${overflow}px`);
    await mobile.screenshot({ path: `${OUT}/oryon-phase1-mobile.png` });
    await tablet.close();
    await mobile.close();

    // ── 12. Runtime errors ─────────────────────────────────────────────────
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
    check("no unexpected console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  } finally {
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log("FAILED:", failed.map((entry) => entry.name).join(", "));
    process.exit(1);
  }
  console.log("ORYON PHASE 1 VERIFICATION: ALL GREEN");
})().catch((error) => {
  console.error("PROBE CRASH:", error);
  process.exit(1);
});
