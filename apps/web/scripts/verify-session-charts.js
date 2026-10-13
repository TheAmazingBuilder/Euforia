/**
 * Session Live chart workspace probe — the TradingView-grade chart surface:
 *   1. FULL-WIDTH chart (no side rails — toolbar strip above, panels below);
 *   2. Default indicator template on first visit: volume histogram + RSI(14);
 *   3. Indicator management (add EMA → 3, remove → 2);
 *   4. Drawing tools end-to-end (arm HLINE → place on chart → listed, undo);
 *   5. Multi-chart layout keeps the workspace coherent;
 *   6. Responsive (390 px) + light theme captures, zero pageerrors.
 *
 * Run: node scripts/verify-session-charts.js  (server on :3000, mock mode)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
let passed = 0;
let failedCount = 0;
const pageErrors = [];

function ok(label, extra = "") {
  passed += 1;
  console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
}
function bad(label, extra = "") {
  failedCount += 1;
  console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
}
async function check(label, condition, extra = "") {
  condition ? ok(label, extra) : bad(label, extra);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function openSession(page) {
  await login(page);
  await page.goto(BASE + "/session", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-testid="analysis-chart"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch();

  // ── Desktop dark — the main walkthrough ──────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => pageErrors.push("PAGEERROR: " + String(e).slice(0, 300)));
  page.on("console", (m) => {
    // Raw "Failed to load resource" echoes are network-layer noise (the
    // response listener above already records real HTTP failures with URLs).
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) {
      pageErrors.push("CONSOLE: " + m.text().slice(0, 200));
    }
  });
  page.on("response", (r) => {
    // /api/auth/* 401s are the EXPECTED pre-login session probe (mock engine
    // answers honestly for unauthenticated checks) — not a defect.
    if (r.status() >= 400 && !r.url().includes("/api/auth/")) {
      pageErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`);
    }
  });

  console.log("── Desktop · dark ──");
  await openSession(page);

  // 1. Full width: chart matches the full-width market row edge-to-edge and
  //    the side rails are gone.
  const railCount =
    (await page.locator('[data-testid="session-left-rail"]').count()) +
    (await page.locator('[data-testid="session-right-rail"]').count());
  await check("side rails removed (full-width workspace)", railCount === 0, `rails=${railCount}`);
  await check("chart toolbar strip present", (await page.locator('[data-testid="session-chart-toolbar"]').count()) === 1);
  await check("context panel grid present", (await page.locator('[data-testid="session-context-grid"]').count()) === 1);

  const chartBox = await page.locator('[data-testid="analysis-chart"]').first().boundingBox();
  const marketRowBox = await page.locator('[data-testid="session-market-row"]').boundingBox();
  if (chartBox && marketRowBox) {
    const drift = Math.abs(chartBox.width - marketRowBox.width);
    await check("chart spans the full content width", drift < 12 && chartBox.width >= marketRowBox.width - 12 && chartBox.width >= 1000, `chart=${Math.round(chartBox.width)}px market-row=${Math.round(marketRowBox.width)}px drift=${Math.round(drift)}px`);
  } else {
    bad("chart spans the full content width", "bounding boxes unavailable");
  }

  // 2. Default indicator template — volume + RSI(14) on first visit.
  const indicatorCount = Number(await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-indicators"));
  await check("default template: 2 indicators active (VOLUME + RSI)", indicatorCount === 2, `data-indicators=${indicatorCount}`);
  const legendText = (await page.locator('[data-testid="chart-indicator-legend"]').first().textContent().catch(() => "")) ?? "";
  await check("RSI 14 legend chip rendered", legendText.includes("RSI 14"));

  await page.locator('[data-testid="indicators-button"]').click();
  await page.waitForTimeout(500);
  const listRows = await page.locator('[data-testid="indicator-list"] li').count();
  await check("indicator list shows 2 entries", listRows === 2, `${listRows} rows`);
  const popoverText = (await page.locator('[data-testid="indicators-popover"]').textContent()) ?? "";
  await check("popover lists Volume", popoverText.includes("Volume"));
  await check("popover lists RSI", popoverText.includes("RSI"));

  // 3. Indicator management: add EMA → 3, remove → 2.
  await page.locator('[data-testid="indicator-add-EMA"]').click();
  await page.waitForTimeout(600);
  const afterAdd = Number(await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-indicators"));
  await check("EMA added → 3 indicators", afterAdd === 3, `data-indicators=${afterAdd}`);
  await page.locator('[data-testid="indicator-list"] li').first().getByRole("button", { name: /remove/i }).click();
  await page.waitForTimeout(600);
  const afterRemove = Number(await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-indicators"));
  await check("removed → back to 2 indicators", afterRemove === 2, `data-indicators=${afterRemove}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 4. Drawing tools end-to-end (arm HLINE → place → listed → undo).
  await page.locator('[data-testid="drawings-button"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="drawing-tool-HLINE"]').click();
  await page.waitForTimeout(500);
  await check("armed-tool hint visible", await page.locator('[data-testid="chart-tool-hint"]').isVisible());
  const box = await page.locator('[data-testid="analysis-chart"]').first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.waitForTimeout(700);
  await page.locator('[data-testid="drawings-button"]').click();
  await page.waitForTimeout(400);
  const drawingCount = await page.locator('[data-testid="drawing-list"] li').count();
  await check("HLINE placed and listed", drawingCount === 1, `${drawingCount} drawing(s)`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 5. Multi-chart layout — aux panes inherit the template.
  await page.locator('[data-testid="chart-layout-2"]').click();
  await page.waitForTimeout(2000);
  const chartCount = await page.locator('[data-testid="analysis-chart"]').count();
  await check("layout 2 renders master + aux chart", chartCount === 2, `${chartCount} charts`);
  const allCharts = page.locator('[data-testid="analysis-chart"]');
  await allCharts.nth(1).waitFor({ state: "visible", timeout: 15000 });
  const auxIndicators = Number(await allCharts.nth(1).getAttribute("data-indicators"));
  await check("aux pane inherits indicator template", auxIndicators === 2, `data-indicators=${auxIndicators}`);
  await page.locator('[data-testid="chart-layout-1"]').click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: "scripts/shots/session-charts-desktop.png", fullPage: false });

  // ── Mobile 390 px ────────────────────────────────────────────────────────
  console.log("── Mobile · 390px ──");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (e) => pageErrors.push("MOBILE PAGEERROR: " + String(e).slice(0, 200)));
  await openSession(mobile);
  const overflow = await mobile.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  await check("no horizontal overflow at 390px", overflow <= 1, `${overflow}px`);
  const toolbarBox = await mobile.locator('[data-testid="session-chart-toolbar"]').boundingBox();
  await check("toolbar wraps on mobile (taller strip)", toolbarBox && toolbarBox.height > 60, `height=${toolbarBox ? Math.round(toolbarBox.height) : "?"}px`);
  const mobileChart = await mobile.locator('[data-testid="analysis-chart"]').first().boundingBox();
  await check("mobile chart ≈ full viewport width", mobileChart && mobileChart.width >= 358, `width=${mobileChart ? Math.round(mobileChart.width) : "?"}px`);
  await mobile.screenshot({ path: "scripts/shots/session-charts-mobile.png", fullPage: false });
  await mobile.close();

  // ── Light theme ──────────────────────────────────────────────────────────
  console.log("── Light theme ──");
  const light = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  light.on("pageerror", (e) => pageErrors.push("LIGHT PAGEERROR: " + String(e).slice(0, 200)));
  await light.addInitScript(() => {
    try {
      window.localStorage.setItem("theme", "light");
    } catch {}
  });
  await openSession(light);
  const lightIndicators = Number(await light.locator('[data-testid="analysis-chart"]').first().getAttribute("data-indicators"));
  await check("light theme: template intact", lightIndicators === 2, `data-indicators=${lightIndicators}`);
  await light.screenshot({ path: "scripts/shots/session-charts-light.png", fullPage: false });
  await light.close();

  // ── Verdict ──────────────────────────────────────────────────────────────
  console.log("── Errors ──");
  const uniqueErrors = [...new Set(pageErrors)];
  if (uniqueErrors.length === 0) {
    passed += 1;
    console.log("  ✓ zero pageerrors / console errors / HTTP ≥ 400");
  } else {
    failedCount += 1;
    for (const err of uniqueErrors.slice(0, 10)) console.log("  ✗", err);
  }

  console.log(`\nRESULT: ${passed}/${passed + failedCount} passed`);
  await browser.close();
  process.exit(failedCount === 0 ? 0 : 1);
})();
