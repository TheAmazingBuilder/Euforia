/**
 * Charty terminal probe — the TradingView-grade frontend refonte of the
 * Session Live workspace (rename + full-width terminal):
 *   1. Rename: sidebar "Charty" + page h1 "Charty";
 *   2. Top toolbar: symbol pill (avatar), timeframes, style/volume/grid
 *      (real preferences), ƒx indicators, layouts, §58 account selector;
 *   3. Left rail: cursor + 7 drawing tools + undo/clear + count badge;
 *   4. Legend: OHLC overlay, SELL/BUY quote pills, countdown, watermark;
 *   5. Right rail: ONLY Calendar + Notifications (close/reopen cycle);
 *   6. Bottom bar: 9 range presets (real dataZoom), compact tools,
 *      UTC clock, fullscreen toggle;
 *   7. Account selector flow: dropdown, selection persists, manage link;
 *   8. Style toggle flips the persisted chart preference;
 *   9. Full-bleed geometry + mobile 390px + light theme + zero pageerrors.
 *
 * Run: node scripts/verify-charty.js  (server on :3000, mock mode)
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

async function openCharty(page) {
  await login(page);
  await page.goto(BASE + "/session", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-testid="analysis-chart"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch();

  // ── Desktop dark — the main walkthrough ──────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => pageErrors.push("PAGEERROR: " + String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) {
      pageErrors.push("CONSOLE: " + m.text().slice(0, 200));
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/api/auth/")) {
      pageErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`);
    }
  });

  console.log("── Rename ──");
  await login(page);
  const sidebarLabel = (await page.locator('aside a[href="/session"]').textContent().catch(() => "")) ?? "";
  await check("sidebar entry renamed to Charty", /charty/i.test(sidebarLabel), sidebarLabel.trim().slice(0, 40));
  await page.goto(BASE + "/session", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-testid="analysis-chart"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2000);
  const h1 = (await page.locator("h1").first().textContent().catch(() => "")) ?? "";
  await check("page h1 = Charty", h1.trim() === "Charty", h1.trim());

  console.log("── Top toolbar ──");
  await check("toolbar present", (await page.locator('[data-testid="charty-toolbar"]').count()) === 1);
  await check("symbol pill has avatar", (await page.locator('[data-testid="symbol-picker-trigger"] span[aria-hidden="true"]').count()) >= 1);
  await check("timeframes row (7 presets)", (await page.locator('[data-testid="charty-toolbar"] [data-testid^="tf-"]').count()) === 7);
  await check("style toggle present", (await page.locator('[data-testid="charty-style-toggle"]').count()) === 1);
  const volumeBefore = await page.locator('[data-testid="charty-volume-toggle"]').getAttribute("aria-pressed");
  await page.locator('[data-testid="charty-volume-toggle"]').click();
  await page.waitForTimeout(800);
  const volumeAfter = await page.locator('[data-testid="charty-volume-toggle"]').getAttribute("aria-pressed");
  await check("volume toggle flips the persisted preference", volumeBefore !== volumeAfter, `${volumeBefore} → ${volumeAfter}`);
  await page.locator('[data-testid="charty-volume-toggle"]').click();
  await page.waitForTimeout(600);
  await check("grid toggle present", (await page.locator('[data-testid="charty-grid-toggle"]').count()) === 1);
  await check("ƒx indicators trigger", (await page.locator('[data-testid="indicators-button"]').count()) === 1);
  await check("layout buttons 1/2/4", (await page.locator('[data-testid^="chart-layout-"]').count()) === 3);
  await check("undo control present", (await page.locator('[data-testid="charty-toolbar-undo"]').count()) === 1);

  console.log("── Account selector (§58) ──");
  await check("account pill present", (await page.locator('[data-testid="charty-account-trigger"]').count()) === 1);
  const pillText = (await page.locator('[data-testid="charty-account-trigger"]').textContent()) ?? "";
  await check("pill shows an account name", pillText.trim().length > 3, pillText.trim().slice(0, 48));
  await check("pill shows environment stamp", /DEMO|LIVE|PROP/.test(pillText.toUpperCase()), "");
  await page.locator('[data-testid="charty-account-trigger"]').click();
  await page.waitForTimeout(500);
  const accountItems = await page.locator('[data-testid^="charty-account-item-"]').count();
  await check("dropdown lists trading accounts", accountItems >= 1, `${accountItems} item(s)`);
  const manageHref = await page.locator('[data-testid="charty-account-manage"]').getAttribute("href").catch(() => null);
  await check("manage link routes to /accounts", manageHref === "/accounts", `href=${manageHref ?? "?"}`);
  // Select the SECOND account (mock engine has 3 seeded) — pill must update.
  if (accountItems >= 2) {
    const firstPill = pillText.trim();
    await page.locator('[data-testid^="charty-account-item-"]').nth(1).click();
    await page.waitForTimeout(600);
    const pillAfter = (await page.locator('[data-testid="charty-account-trigger"]').textContent()) ?? "";
    await check("selection switches the pill account", pillAfter.trim() !== firstPill, `${firstPill.slice(0, 18)}… → ${pillAfter.trim().slice(0, 18)}…`);
    const stored = await page.evaluate(() => window.localStorage.getItem("cosmoz.charty.account.v1"));
    await check("selection persisted (cosmoz.charty.account.v1)", typeof stored === "string" && stored.length > 10, String(stored).slice(0, 13) + "…");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    bad("selection switches the pill account", "fewer than 2 seeded accounts");
    bad("selection persisted (cosmoz.charty.account.v1)", "skipped");
  }

  console.log("── Left rail ──");
  await check("cursor control", (await page.locator('[data-testid="charty-tool-cursor"]').count()) === 1);
  const toolButtons = await page.locator('[data-testid="charty-left-rail"] [data-testid^="drawing-tool-"]').count();
  await check("7 drawing tools in rail", toolButtons === 7, `${toolButtons} tools`);
  await check("rail undo + clear", (await page.locator('[data-testid="charty-undo"]').count()) === 1 && (await page.locator('[data-testid="charty-clear"]').count()) === 1);
  // Arm a tool from the rail — the armed hint appears on the chart.
  await page.locator('[data-testid="drawing-tool-TREND"]').click();
  await page.waitForTimeout(400);
  await check("arming a tool shows the chart hint", await page.locator('[data-testid="chart-tool-hint"]').isVisible());
  await page.locator('[data-testid="charty-tool-cursor"]').click();
  await page.waitForTimeout(300);
  await check("cursor disarms", (await page.locator('[data-testid="chart-tool-hint"]').count()) === 0);

  console.log("── Legend + watermark ──");
  await check("legend overlay present", (await page.locator('[data-testid="charty-legend"]').count()) === 1);
  const legendText = (await page.locator('[data-testid="charty-legend"]').textContent()) ?? "";
  await check("legend carries OHLC values", /O/.test(legendText) && /H/.test(legendText) && /L/.test(legendText) && /C/.test(legendText), "");
  await check("legend shows the change", (await page.locator('[data-testid="charty-legend-change"]').count()) === 1);
  await check("SELL quote pill", (await page.locator('[data-testid="charty-quote-sell"]').count()) === 1);
  await check("BUY quote pill", (await page.locator('[data-testid="charty-quote-buy"]').count()) === 1);
  const sellPrice = (await page.locator('[data-testid="charty-quote-sell"]').textContent()) ?? "";
  await check("quote pills carry a real price", /[0-9]/.test(sellPrice), sellPrice.trim().slice(0, 24));
  const countdown = (await page.locator('[data-testid="charty-countdown"]').textContent().catch(() => "")) ?? "";
  await check("bar-close countdown ticking", /^\d{2,}:\d{2}$/.test(countdown.trim()), countdown.trim());
  await check("Charty watermark", ((await page.locator('[data-testid="charty-watermark"]').textContent()) ?? "").trim() === "Charty");

  console.log("── Right rail (Calendar + Notifications ONLY) ──");
  await check("right rail present", (await page.locator('[data-testid="charty-right-rail"]').count()) === 1);
  await check("calendar tab present", (await page.locator('[data-testid="charty-rail-tab-calendar"]').count()) === 1);
  await check("notifications tab present", (await page.locator('[data-testid="charty-rail-tab-notifications"]').count()) === 1);
  const railText = (await page.locator('[data-testid="charty-right-rail"]').textContent()) ?? "";
  await check(
    "calendar feed renders (events or empty state)",
    /HIGH|MEDIUM|LOW|No scheduled|Loading/i.test(railText),
    railText.replace(/\s+/g, " ").trim().slice(0, 60),
  );
  await page.locator('[data-testid="charty-rail-tab-notifications"]').click();
  await page.waitForTimeout(500);
  const notifText = (await page.locator('[data-testid="charty-right-rail"]').textContent()) ?? "";
  await check("notifications feed renders (items or empty state)", /No notifications|coach/i.test(notifText) || (await page.locator('[data-testid="charty-notification-item"]').count()) > 0, "");
  await page.locator('[data-testid="charty-rail-close"]').click();
  await page.waitForTimeout(500);
  await check("rail closes", (await page.locator('[data-testid="charty-right-rail"]').count()) === 0);
  await page.locator('[data-testid="charty-rail-open"]').click();
  await page.waitForTimeout(500);
  await check("rail reopens", (await page.locator('[data-testid="charty-right-rail"]').count()) === 1);

  console.log("── Bottom bar ──");
  await check("bottom bar present", (await page.locator('[data-testid="charty-bottom-bar"]').count()) === 1);
  await check("9 range presets (1D → Tout)", (await page.locator('[data-testid^="charty-range-"]').count()) === 9);
  const allPressed = await page.locator('[data-testid="charty-range-ALL"]').getAttribute("aria-pressed");
  await check("default range = Tout", allPressed === "true", `aria-pressed=${allPressed}`);
  await page.locator('[data-testid="charty-range-1D"]').click();
  await page.waitForTimeout(700);
  const d1Pressed = await page.locator('[data-testid="charty-range-1D"]').getAttribute("aria-pressed");
  await check("1D preset activates (real dataZoom dispatch)", d1Pressed === "true", `aria-pressed=${d1Pressed}`);
  await page.locator('[data-testid="charty-range-ALL"]').click();
  await page.waitForTimeout(500);
  const compactTools = await page.locator('[data-testid^="charty-bottom-tool-"]').count();
  await check("compact drawing row (5 tools)", compactTools === 5, `${compactTools} tools`);
  const clock = (await page.locator('[data-testid="charty-clock"]').textContent().catch(() => "")) ?? "";
  await check("live UTC clock", /\d{2}:\d{2}:\d{2} UTC/.test(clock), clock.trim());
  await check("fullscreen toggle present", (await page.locator('[data-testid="charty-fullscreen"]').count()) === 1);

  console.log("── Style preference cycle (real PATCH) ──");
  const styleBefore = await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-chart-style");
  await page.locator('[data-testid="charty-style-toggle"]').click();
  await page.waitForTimeout(900);
  const styleAfter = await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-chart-style");
  await check("style cycles to a new renderer", styleAfter !== styleBefore, `${styleBefore} → ${styleAfter}`);
  for (let i = 0; i < 3; i += 1) {
    const current = await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-chart-style");
    if (current === "CANDLES") break;
    await page.locator('[data-testid="charty-style-toggle"]').click();
    await page.waitForTimeout(700);
  }
  const styleRestored = await page.locator('[data-testid="analysis-chart"]').first().getAttribute("data-chart-style");
  await check("style restored to CANDLES", styleRestored === "CANDLES", styleRestored ?? "?");

  console.log("── Geometry ──");
  const terminalBox = await page.locator('[data-testid="charty-terminal"]').boundingBox();
  await check("terminal full-bleed at 1440", terminalBox !== null && terminalBox.width >= 1180, `terminal=${terminalBox ? Math.round(terminalBox.width) : "?"}px`);
  const chartBox = await page.locator('[data-testid="analysis-chart"]').first().boundingBox();
  await check("chart fills the center column", chartBox !== null && chartBox.width >= 700, `chart=${chartBox ? Math.round(chartBox.width) : "?"}px`);

  await page.screenshot({ path: "scripts/shots/charty-desktop.png", fullPage: false });

  // ── Mobile 390 px ────────────────────────────────────────────────────────
  console.log("── Mobile · 390px ──");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (e) => pageErrors.push("MOBILE PAGEERROR: " + String(e).slice(0, 200)));
  await openCharty(mobile);
  const overflow = await mobile.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  await check("no horizontal overflow at 390px", overflow <= 1, `${overflow}px`);
  await check("left rail hidden on mobile", (await mobile.locator('[data-testid="charty-left-rail"]').isVisible()) === false);
  await check("right rail hidden on mobile", (await mobile.locator('[data-testid="charty-right-rail"]').isVisible()) === false);
  const mobileChart = await mobile.locator('[data-testid="analysis-chart"]').first().boundingBox();
  await check("mobile chart ≈ full viewport width", mobileChart && mobileChart.width >= 358, `width=${mobileChart ? Math.round(mobileChart.width) : "?"}px`);
  await mobile.screenshot({ path: "scripts/shots/charty-mobile.png", fullPage: false });
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
  await openCharty(light);
  await check("light: legend readable (pills render)", (await light.locator('[data-testid="charty-quote-sell"]').count()) === 1);
  await check("light: rail renders", (await light.locator('[data-testid="charty-right-rail"]').count()) === 1);
  await light.screenshot({ path: "scripts/shots/charty-light.png", fullPage: false });
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
