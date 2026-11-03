/**
 * Verify - Chart preferences wired into the Session Live price chart.
 * Probes (in ONE SPA session - the mock store reseeds on full reload):
 *  1. Default: chart-style=CANDLES, show-volume=false, show-grid=true
 *  2. Style LINE → session chart reflects LINE
 *  3. Style AREA → session chart reflects AREA
 *  4. Volume ON → show-volume=true
 *  5. Grid OFF → show-grid=false
 *  6. Card reset → back to safe defaults everywhere
 *  7. Zero console errors
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  // Failed network loads surface as console errors WITHOUT the URL in
  // msg.text() - track responses directly so the noise filter can match.
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  const chartAttrs = async () => {
    const el = page.locator('[data-testid="price-chart"]');
    await el.waitFor({ state: "visible", timeout: 30000 });
    return {
      style: await el.getAttribute("data-chart-style"),
      volume: await el.getAttribute("data-show-volume"),
      grid: await el.getAttribute("data-show-grid"),
    };
  };

  const setChartPref = async (fn) => {
    // Client-side nav to Settings → Trading (no reload: keep store state).
    await page.locator('aside a[href="/settings"]').click();
    await page.locator('[data-testid="settings-nav-trading"]').click();
    await fn();
    await page.locator('[data-testid="settings-trading-save"]').click();
    await page.waitForTimeout(600);
    // Client-side nav back to Session Live.
    await page.locator('aside a[href="/session"]').click();
    await page.waitForTimeout(1500);
  };

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="settings-nav-trading"]').click();
  await page.waitForTimeout(400);

  // ── 1. Defaults on a fresh session ───────────────────────────────────────
  await page.locator('aside a[href="/session"]').click();
  await page.waitForTimeout(2000);
  const def = await chartAttrs();
  check("Default style is CANDLES", def.style === "CANDLES", JSON.stringify(def));
  check("Default volume OFF", def.volume === "false");
  check("Default grid ON", def.grid === "true");
  await page.screenshot({ path: "scripts/shots/chart-prefs-default.png" });

  // ── 2. Style = LINE ──────────────────────────────────────────────────────
  await setChartPref(() =>
    page.locator('[data-testid="settings-trading-chart-style"]').selectOption("LINE"),
  );
  const line = await chartAttrs();
  check("Style pref LINE reaches the session chart", line.style === "LINE", JSON.stringify(line));
  await page.screenshot({ path: "scripts/shots/chart-prefs-line.png" });

  // ── 3. Style = AREA + volume ON ──────────────────────────────────────────
  await setChartPref(() => {
    page.locator('[data-testid="settings-trading-chart-style"]').selectOption("AREA");
    page.locator('[data-testid="settings-trading-chart-volume-switch"]').click();
  });
  const area = await chartAttrs();
  check("Style pref AREA reaches the session chart", area.style === "AREA", JSON.stringify(area));
  check("Volume pref ON reaches the session chart", area.volume === "true");
  await page.screenshot({ path: "scripts/shots/chart-prefs-area-volume.png" });

  // ── 4. Grid OFF ──────────────────────────────────────────────────────────
  await setChartPref(() =>
    page.locator('[data-testid="settings-trading-chart-grid-switch"]').click(),
  );
  const noGrid = await chartAttrs();
  check("Grid pref OFF reaches the session chart", noGrid.grid === "false", JSON.stringify(noGrid));
  await page.screenshot({ path: "scripts/shots/chart-prefs-no-grid.png" });

  // ── 5. Reset card → safe defaults ────────────────────────────────────────
  await page.locator('aside a[href="/settings"]').click();
  await page.locator('[data-testid="settings-nav-trading"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="settings-trading-reset"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="settings-trading-reset-confirm"]').click();
  await page.waitForTimeout(800);
  await page.locator('aside a[href="/session"]').click();
  await page.waitForTimeout(2000);
  const reset = await chartAttrs();
  check(
    "Reset restores CANDLES / no volume / grid on",
    reset.style === "CANDLES" && reset.volume === "false" && reset.grid === "true",
    JSON.stringify(reset),
  );

  // ── 6. Console health (socket.io 404 + candles 400 are documented noise
  // from the offline market service - identical without this feature) ──────
  const noise = errors.filter(
    (e) => e.includes("socket.io") || (e.includes("404") && e.includes("candles")),
  );
  check("Zero console errors (known market-service noise excluded)", errors.length - noise.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n═══ CHART PREFS WIRING - RESULTS ═══");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
