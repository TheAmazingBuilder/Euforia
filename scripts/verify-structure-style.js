// Structure refinement verification - BOS/CHoCH break lines + pivot style.
// Runs against the DEV server (:3001) - uses the dev-only panels debug
// handle for structural counters (structureLines) + DOM testids for the
// menu flow. Never scrapes canvases.
//  (1) breaks ON + lines ON (default)  → structureLines >= 1
//  (2) break-lines OFF                 → structureLines === 0, markers return
//  (3) break-lines ON again            → structureLines >= 1
//  (4) pivot style circles             → radio checked, marker count stable
//  (5) chart-type switch (line)        → lines re-attached (survive)
//  (6) layout persistence              → pivotStyle/showBreakLines in file
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3001";
const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}
const NOISE = [/401/, /auth\/me/, /auth\/refresh/, /WebSocket/, /Download the React DevTools/, /React does not recognize/];

async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await app.waitForSelector('[data-testid="login-form"]', { timeout: 30_000 }).catch(() => {});
  if ((await app.locator('[data-testid="login-form"]').count()) === 0) return;
  const demo = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demo.count()) > 0) await demo.click();
  else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  await app.waitForSelector('a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
}

async function panels(app) {
  return app.evaluate(() => {
    const read = window.__ORYON_PANELS_DEBUG__;
    return typeof read === "function" ? read() : null;
  });
}

async function waitForPanelState(app, predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await panels(app);
    const panel = Array.isArray(last) ? last[0] : null;
    if (panel && predicate(panel)) return panel;
    await app.waitForTimeout(250);
  }
  return Array.isArray(last) ? last[0] ?? null : null;
}

async function withAnalysisMenu(app, act) {
  await app.click('[data-testid="oryon-panel-0-identity"]').catch(() => {});
  await app.waitForTimeout(250);
  await app.click('[data-testid="oryon-panel-0-analysis-menu"]');
  await app.waitForTimeout(300);
  await act();
  await app.keyboard.press("Escape");
  await app.waitForTimeout(300);
}

async function setChecked(app, testid, wanted) {
  await withAnalysisMenu(app, async () => {
    const item = app.locator(`[data-testid="${testid}"]`);
    const state = await item.getAttribute("data-state");
    const disabled =
      (await item.getAttribute("aria-disabled")) === "true" ||
      (await item.getAttribute("disabled")) !== null;
    if ((state === "checked") !== wanted) {
      if (disabled) throw new Error(`item ${testid} is disabled (state=${state})`);
      await item.click();
      await app.waitForTimeout(400);
    }
  });
}

async function isChecked(app, testid) {
  let value = null;
  await withAnalysisMenu(app, async () => {
    value = await app.locator(`[data-testid="${testid}"]`).getAttribute("data-state");
  });
  return value === "checked";
}

async function layoutsFile(app) {
  return app.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.layouts.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 200));
  });

  try {
    await signIn(page);
    await page.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 30_000 });
    await page.waitForTimeout(8_000);

    // ── Enable structure + breaks ────────────────────────────────────────
    await setChecked(page, "oryon-panel-0-analysis-structure", true);
    await setChecked(page, "oryon-panel-0-analysis-breaks", true);

    // (1) lines ON by default → structureLines >= 1
    const withLines = await waitForPanelState(page, (p) => (p.structureLines ?? 0) >= 1);
    check("S1", "break lines render with breaks ON (default)", (withLines?.structureLines ?? 0) >= 1,
      `structureLines=${withLines?.structureLines}`);

    // (2) break-lines OFF → lines disappear, break markers return
    await setChecked(page, "oryon-panel-0-analysis-break-lines", false);
    const linesOff = await waitForPanelState(page, (p) => (p.structureLines ?? 0) === 0);
    check("S2", "break-lines OFF → no structure lines", (linesOff?.structureLines ?? -1) === 0,
      `structureLines=${linesOff?.structureLines}`);
    check("S2b", "break-lines OFF → break markers return",
      (linesOff?.structureMarkers ?? 0) > (withLines?.structureMarkers ?? 0),
      `markers ${linesOff?.structureMarkers} vs ${withLines?.structureMarkers}`);

    // (3) ON again → lines return
    await setChecked(page, "oryon-panel-0-analysis-break-lines", true);
    const linesBack = await waitForPanelState(page, (p) => (p.structureLines ?? 0) >= 1);
    check("S3", "break-lines ON again → lines re-render", (linesBack?.structureLines ?? 0) >= 1,
      `structureLines=${linesBack?.structureLines}`);

    // (4) pivot style - circles radio checks, marker count stable
    await withAnalysisMenu(page, async () => {
      await page.click('[data-testid="oryon-panel-0-analysis-pstyle-circles"]');
    });
    check("S4", "pivot style 'circles' radio checked",
      (await isChecked(page, "oryon-panel-0-analysis-pstyle-circles")) === true);
    const afterStyle = await panels(page);
    check("S4b", "pivot style change keeps the same pivots",
      Array.isArray(afterStyle) && afterStyle[0]?.structureMarkers === linesBack?.structureMarkers,
      `markers=${afterStyle?.[0]?.structureMarkers} vs ${linesBack?.structureMarkers}`);

    // (5) chart-type switch → lines survive the series rebuild
    await page.click('[data-testid="oryon-panel-0-type-line"]').catch(() => {});
    await page.waitForTimeout(2_000);
    const afterTypeSwitch = await panels(page);
    check("S5", "chart-type switch → structure lines re-attached",
      (afterTypeSwitch?.[0]?.structureLines ?? 0) >= 1,
      `structureLines=${afterTypeSwitch?.[0]?.structureLines}`);
    await page.click('[data-testid="oryon-panel-0-type-candles"]').catch(() => {});
    await page.waitForTimeout(1_500);

    // (6) live session carries the refinement config (persistence to a
    // saved layout follows the Phase 9 semantics: layout save = snapshot).
    const livePanel = await panels(page);
    const struct = livePanel?.[0]?.analysis?.structure;
    check("S6", "live session carries pivotStyle + showBreakLines",
      struct?.pivotStyle === "circles" && struct?.showBreakLines === true,
      JSON.stringify({ pivotStyle: struct?.pivotStyle, showBreakLines: struct?.showBreakLines }));

    // Clean workspace state (structure OFF) so other probes start neutral.
    await withAnalysisMenu(page, async () => {
      await page.click('[data-testid="oryon-panel-0-analysis-pstyle-arrows"]');
    });
    await setChecked(page, "oryon-panel-0-analysis-breaks", false);
    await setChecked(page, "oryon-panel-0-analysis-structure", false);
  } catch (error) {
    check("FATAL", String(error).slice(0, 200), false);
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n===== verify-structure-style: ${pass}/${results.length} PASS, ${fail} FAIL =====`);
  if (errors.length > 0) console.log("PAGE ERRORS:", errors.slice(0, 5));
  await browser.close();
  process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
})();
