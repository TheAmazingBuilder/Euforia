// Chart color presets verification - Settings ▸ Symbol tab preset strip.
// PROD-SAFE (:3000): DOM/testids + localStorage only, no debug handles.
//  (1) preset strip renders 7 chips
//  (2) TradingView preset applies #089981/#f23645 live (chip active)
//  (3) Neon preset switches (aria-pressed moves)
//  (4) Ok persists into chart-prefs localStorage
//  (5) Escape (cancel) reverts the live edit
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}
const NOISE = [/401/, /auth\/me/, /auth\/refresh/, /WebSocket/];

async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const tally = () => {
    pass = results.filter((r) => r.ok).length;
    fail = results.filter((r) => !r.ok).length;
  };

  const viewport = { width: 1440, height: 900 };
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 200));
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureLogin(page);
    await page.goto(BASE + "/oryon", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(8000);

    // Open the context menu → Settings…
    const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4, { button: "right" });
    await page.waitForSelector('[data-testid="oryon-ctx-menu"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-ctx-settings"]');
    await page.waitForSelector('[data-testid="oryon-chart-settings-dialog"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-settings-tab-symbol"]');
    await page.waitForTimeout(300);

    // (1) preset strip
    const strip = page.locator('[data-testid="oryon-settings-color-presets"]');
    check("P1", "preset strip renders", (await strip.count()) === 1);
    const chips = await strip.locator("button").count();
    check("P1b", "7 curated presets", chips === 7, `chips=${chips}`);

    // (2) TradingView preset applies live
    await page.click('[data-testid="oryon-settings-preset-tradingview"]');
    await page.waitForTimeout(300);
    const tvActive = await page
      .locator('[data-testid="oryon-settings-preset-tradingview"]')
      .getAttribute("aria-pressed");
    check("P2", "TradingView preset becomes active", tvActive === "true", `aria-pressed=${tvActive}`);

    // (3) Neon preset switches
    await page.click('[data-testid="oryon-settings-preset-neon"]');
    await page.waitForTimeout(300);
    const neonActive = await page
      .locator('[data-testid="oryon-settings-preset-neon"]')
      .getAttribute("aria-pressed");
    const tvAfter = await page
      .locator('[data-testid="oryon-settings-preset-tradingview"]')
      .getAttribute("aria-pressed");
    check("P3", "Neon preset switches (single-active)", neonActive === "true" && tvAfter === "false",
      `neon=${neonActive} tv=${tvAfter}`);

    // (4) Ok persists
    await page.click('[data-testid="oryon-settings-ok"]');
    await page.waitForTimeout(800); // debounced save
    const prefs = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("euforia.oryon.chart-prefs.v1") || "{}"),
    );
    const panels = prefs.panels ?? {};
    const firstPanel = Object.values(panels)[0] ?? null;
    check("P4", "Neon colors persist in chart-prefs",
      firstPanel?.appearance?.upColor === "#00e676" && firstPanel?.appearance?.downColor === "#ff1744",
      JSON.stringify(firstPanel?.appearance ?? null));

    // (5) cancel reverts - open again, apply Gold, Escape
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4, { button: "right" });
    await page.waitForSelector('[data-testid="oryon-ctx-menu"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-ctx-settings"]');
    await page.waitForSelector('[data-testid="oryon-chart-settings-dialog"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-settings-tab-symbol"]');
    await page.click('[data-testid="oryon-settings-preset-gold"]');
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape"); // cancel = revert
    await page.waitForTimeout(800);
    const prefs2 = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("euforia.oryon.chart-prefs.v1") || "{}"),
    );
    const firstPanel2 = Object.values(prefs2.panels ?? {})[0] ?? null;
    check("P5", "cancel reverts the preset edit",
      firstPanel2?.appearance?.upColor === "#00e676" && firstPanel2?.appearance?.downColor === "#ff1744",
      JSON.stringify(firstPanel2?.appearance ?? null));

    await page.screenshot({ path: "scripts/color-presets.png" });
  } catch (error) {
    check("FATAL", String(error).slice(0, 200), false);
  }

  tally();
  console.log(`\n===== verify-color-presets: ${pass}/${results.length} PASS, ${fail} FAIL =====`);
  if (errors.length > 0) console.log("PAGE ERRORS:", errors.slice(0, 5));
  await browser.close();
  process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
})();
