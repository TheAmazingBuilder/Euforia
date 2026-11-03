// Position-tool edge handles (TP/SL) + TradingView palette picker - E2E probe.
// PROD-SAFE: DOM/testids only, no dev handles. Run against :3000 (build).
//
// Part 1 (handles): create a long position, drag the TARGET mid-line handle
//   → rr follows the drag; drag the STOP mid-line handle → stop price moves
//   with the target PRESERVED (rr absorbs); undo ×2 restores.
// Part 2 (picker): settings → Symbol → 10×7 grid, swatch pick, opacity →
//   #RRGGBBAA persisted, custom color via the "+" native input, reload
//   persistence, Escape revert.
const { chromium } = require('playwright');
const { armTool } = require('./oryon-probe-helpers.js');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";

async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}

const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}

function noiseFiltered(errors) {
  return errors.filter((e) => !/401|auth\/me|auth\/refresh|Failed to load resource.*401/i.test(e));
}

/** React-safe value setter + input/change dispatch (range/color inputs). */
async function setNativeValue(page, selector, value) {
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`setNativeValue: missing ${sel}`);
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value]);
}

async function readRr(page) {
  const input = page.locator('[data-testid="oryon-ctx-rr"] input');
  await input.waitFor({ state: "visible", timeout: 3000 });
  const raw = await input.inputValue();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function storedPrefs(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.chart-prefs.v1");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Object.values(parsed.panels ?? {}).map((p) => p.appearance);
    } catch {
      return null;
    }
  });
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const tally = () => {
    pass = results.filter(r => r.ok).length;
    fail = results.filter(r => !r.ok).length;
  };

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    const tag = `${viewport.height}`;
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    console.log(`\n===== viewport ${viewport.width}x${viewport.height} =====`);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureLogin(page);
    await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(8000);

    /** Chart-canvas-local coordinates, re-measured each call. */
    const boxOf = async () => await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();

    // ── Part 1: position TP/SL edge handles ────────────────────────────────
    await armTool(page, "longpos");

    let box = await boxOf();
    const x0 = box.x + box.width * 0.42;
    const y0 = box.y + box.height * 0.32; // entry price (upper band, no legend)
    const RISK = 60; // px entry→stop

    await page.mouse.click(x0 - 80, y0);
    await page.waitForTimeout(200);
    await page.mouse.click(x0 + 80, y0 + RISK);
    await page.waitForTimeout(400);

    // Select the body (risk zone interior).
    await page.mouse.click(x0, y0 + RISK / 2);
    await page.waitForTimeout(250);

    // TP handle: nominal (midX ≈ x0, targetY = y0 − RISK). Drag +80px up.
    const tpTargetY = y0 - RISK;
    await page.mouse.move(x0, tpTargetY);
    await page.mouse.down();
    await page.mouse.move(x0, tpTargetY - 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.mouse.click(x0, y0 + RISK / 2, { button: 'right' });
    await page.waitForTimeout(350);
    const editorAfterTp = await page.locator('[data-testid="oryon-drawing-ctx-editor"]').isVisible().catch(() => false);
    let rr = editorAfterTp ? await readRr(page) : NaN;
    check(`H1-${tag}`, "TP edge drag → rr = risk/60 ≈ 2.33 (editor)", Math.abs(rr - 140 / 60) < 0.02, `rr=${rr} editor=${editorAfterTp}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // SL handle: nominal (midX ≈ x0, y0 + RISK). Drag +40px down - the
    // target must stay PUT (rr absorbs): 140 / (60+40) = 1.4.
    await page.mouse.move(x0, y0 + RISK);
    await page.mouse.down();
    await page.mouse.move(x0, y0 + RISK + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.mouse.click(x0, y0 + RISK / 2, { button: 'right' });
    await page.waitForTimeout(350);
    const editorAfterSl = await page.locator('[data-testid="oryon-drawing-ctx-editor"]').isVisible().catch(() => false);
    rr = editorAfterSl ? await readRr(page) : NaN;
    check(`H2-${tag}`, "SL edge drag keeps the target → rr ≈ 1.4", Math.abs(rr - 1.4) < 0.02, `rr=${rr} editor=${editorAfterSl}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // Undo ×2 → baseline rr (1) restored.
    await page.mouse.click(x0, y0 + RISK / 2); // focus the chart for shortcuts
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    await page.mouse.click(x0, y0 + RISK / 2, { button: 'right' });
    await page.waitForTimeout(350);
    rr = (await page.locator('[data-testid="oryon-drawing-ctx-editor"]').isVisible().catch(() => false))
      ? await readRr(page) : NaN;
    check(`H3-${tag}`, "undo ×2 → rr back to 1", Math.abs(rr - 1) < 0.001, `rr=${rr}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // Clean slate for the next viewport (delete keeps the chart tidy).
    await page.keyboard.press("Delete").catch(() => {});
    await page.waitForTimeout(200);

    // ── Part 2: TradingView palette picker ─────────────────────────────────
    box = await boxOf();
    const rx = box.x + box.width * 0.68;
    const ry = box.y + box.height * 0.55;
    await page.mouse.click(rx, ry, { button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('[data-testid="oryon-ctx-settings"]').click();
    const dlg = page.locator('[data-testid="oryon-chart-settings-dialog"]');
    await dlg.waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-testid="oryon-settings-tab-symbol"]').click();

    const trigger = page.locator('[data-testid="oryon-settings-up-color"]');
    await trigger.click();
    const pop = page.locator('[data-testid="oryon-settings-up-color-popover"]');
    await pop.waitFor({ state: "visible", timeout: 5000 });

    const swatchCount = await page.locator('[data-testid^="oryon-settings-up-color-swatch-"]').count();
    check(`P1-${tag}`, "palette grid shows 70 swatches", swatchCount === 70, `count=${swatchCount}`);
    const hasAnchors =
      (await page.locator('[data-testid="oryon-settings-up-color-swatch-ffffff"]').count()) === 1 &&
      (await page.locator('[data-testid="oryon-settings-up-color-swatch-000000"]').count()) === 1 &&
      (await page.locator('[data-testid="oryon-settings-up-color-swatch-2962ff"]').count()) === 1;
    check(`P2-${tag}`, "gray ramp + vivid base anchors present", hasAnchors);

    // Pick the blue base → live apply + persisted (6-digit).
    await page.locator('[data-testid="oryon-settings-up-color-swatch-2962ff"]').click();
    await page.waitForTimeout(200);
    const bgBlue = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor);
    check(`P3-${tag}`, "picked blue renders on the trigger", bgBlue === "rgb(41, 98, 255)", bgBlue);

    // Opacity 40% → #2962ff66 persisted (300ms debounce).
    await setNativeValue(page, '[data-testid="oryon-settings-up-color-opacity"]', "40");
    await page.waitForTimeout(700);
    let prefs = await storedPrefs(page);
    const stored66 = prefs !== null && prefs.some((a) => a.upColor === "#2962ff66");
    check(`P4-${tag}`, "opacity 40% → #RRGGBBAA persisted", stored66, JSON.stringify(prefs?.map((a) => a.upColor)));

    // Custom color via the "+" native input.
    await setNativeValue(page, '[data-testid="oryon-settings-up-color-add"] input[type="color"]', "#123456");
    await page.waitForTimeout(300);
    const customRow = await page.locator('[data-testid="oryon-settings-up-color-custom-123456"]').count();
    const bgCustom = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor);
    check(`P5-${tag}`, "custom color added + applied", customRow === 1 && bgCustom === "rgb(18, 52, 86)", `${customRow} ${bgCustom}`);

    // Escape closes ONLY the popover layer (the dialog stays open) - the
    // Radix layering contract; the footer buttons are clickable again.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const popClosed = !(await pop.isVisible().catch(() => false));
    const dlgStill = await dlg.isVisible().catch(() => false);
    check(`P5b-${tag}`, "Escape closes the popover, keeps the dialog", popClosed && dlgStill, `${popClosed} ${dlgStill}`);
    await page.waitForTimeout(600);

    // Ok → reload → the custom color survives.
    await page.locator('[data-testid="oryon-settings-ok"]').click();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(6000);
    prefs = await storedPrefs(page);
    const persisted = prefs !== null && prefs.some((a) => a.upColor === "#123456");
    check(`P6-${tag}`, "custom color survives reload", persisted, JSON.stringify(prefs?.map((a) => a.upColor)));

    // Escape = cancel (1st Escape closes the popover, 2nd cancels the dialog):
    // a fresh pick is reverted on close.
    await page.mouse.click(rx, ry, { button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('[data-testid="oryon-ctx-settings"]').click();
    await dlg.waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-testid="oryon-settings-up-color"]').click();
    await pop.waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-testid="oryon-settings-up-color-swatch-f23645"]').click();
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape"); // popover only
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape"); // cancel the dialog
    await page.waitForTimeout(600);
    prefs = await storedPrefs(page);
    const reverted = prefs !== null && prefs.some((a) => a.upColor === "#123456") && !prefs.some((a) => a.upColor === "#f23645");
    check(`P7-${tag}`, "Escape reverts the live pick", reverted, JSON.stringify(prefs?.map((a) => a.upColor)));

    const realErrors = noiseFiltered(errors);
    check(`E-${tag}`, "zero unexpected page errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

    await ctx.close();
    tally();
  }

  await browser.close();
  console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
  process.exit(fail > 0 ? 1 : 0);
})();
