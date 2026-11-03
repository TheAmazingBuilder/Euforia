// Chart context-menu verification - the TradingView-inspired right-click menu.
// PROD-SAFE: no dev-only debug handles - assertions via DOM/testids only.
// (1) opens at cursor on empty space   (2) price under cursor in labels
// (3) add alert prefilled              (4) add horizontal level → hline row
// (5) reset / object tree / templates  (6) settings live-apply + persist + revert
// (7) drawing right-click keeps the property editor (no menu race)
// (8) legend OHLC colored by candle direction
const { chromium } = require('playwright');

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
  results.push({ id, label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}

function noiseFiltered(errors) {
  return errors.filter((e) => !/401|auth\/me|Failed to load resource.*401/i.test(e));
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
    const ctx = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
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

    /** Right-click at a FRACTION of the chart canvas - the box is re-measured
     *  every call (the objects dock shrinks the chart mid-run). */
    const rclick = async (fx, fy) => {
      const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      await page.mouse.click(x, y, { button: 'right' });
      await page.waitForTimeout(300);
      return { x, y, box };
    };

    // ── (1) Menu opens at the cursor ───────────────────────────────────────
    const first = await rclick(0.62, 0.45);
    const menu = page.locator('[data-testid="oryon-ctx-menu"]');
    const menuVisible = await menu.isVisible().catch(() => false);
    check(`M1-${tag}`, "context menu opens on right-click", menuVisible);
    if (menuVisible) {
      const mb = await menu.boundingBox();
      const inside =
        mb && mb.x >= 0 && mb.y >= 0 &&
        mb.x + mb.width <= viewport.width && mb.y + mb.height <= viewport.height;
      const nearCursor = mb && Math.abs(mb.x - first.x) < 40 && Math.abs(mb.y - first.y) < 40;
      check(`M1b-${tag}`, "menu anchored at cursor", nearCursor === true,
        mb ? `menu=(${Math.round(mb.x)},${Math.round(mb.y)}) click=(${Math.round(first.x)},${Math.round(first.y)})` : "");
      check(`M1c-${tag}`, "menu inside viewport (no clipping)", inside === true,
        mb ? `w=${Math.round(mb.width)} h=${Math.round(mb.height)}` : "");

      // ── (2) Copy price - label carries the cursor price, clipboard matches ──
      const copyItem = page.locator('[data-testid="oryon-ctx-copy-price"]');
      const copyLabel = (await copyItem.innerText()).trim();
      const priceMatch = copyLabel.match(/([\d,]+\.\d+)/);
      check(`M2-${tag}`, "Copy price shows a formatted price", priceMatch !== null, copyLabel);
      await copyItem.click();
      await page.waitForTimeout(400);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
      check(`M2b-${tag}`, "clipboard holds the displayed price",
        priceMatch !== null && clip === priceMatch[1], `clip=${clip}`);

      // ── (8) legend OHLC colored by candle direction ────────────────────────
      const ohlc = page.locator('[data-testid="oryon-legend-ohlc"]');
      if ((await ohlc.count()) === 1) {
        const classes = await ohlc.locator("span").nth(0).getAttribute("class");
        const colored = classes === "text-profit" || classes === "text-loss";
        check(`M8-${tag}`, "OHLC values take the candle direction color", colored === true,
          `class=${classes}`);
      } else {
        check(`M8-${tag}`, "OHLC legend present", false, "count=" + (await ohlc.count()));
      }
    } else {
      check(`M1b-${tag}`, "menu anchored at cursor", false, "menu never opened");
      tally();
      await ctx.close();
      continue;
    }

    // ── (3) Add alert prefilled with the cursor price ────────────────────────
    await rclick(0.62, 0.45);
    const alertLabel = (await page.locator('[data-testid="oryon-ctx-add-alert"]').innerText()).match(/([\d,]+\.\d+)/);
    await page.locator('[data-testid="oryon-ctx-add-alert"]').click();
    await page.waitForTimeout(600);
    const alertDialog = page.locator('[data-testid="oryon-alert-dialog"]');
    const alertOpen = await alertDialog.isVisible().catch(() => false);
    check(`M3-${tag}`, "Add alert opens the create dialog", alertOpen);
    if (alertOpen) {
      const target = await page.locator('[data-testid="oryon-alert-target"]').inputValue().catch(() => "");
      const norm = alertLabel ? alertLabel[1] : "";
      check(`M3b-${tag}`, "alert price prefilled with the clicked price", target === norm,
        `target=${target} menu=${norm}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // ── (4) Add horizontal level → hline row in the object tree ─────────────
    await rclick(0.62, 0.45);
    await page.locator('[data-testid="oryon-ctx-add-level"]').click();
    await page.waitForTimeout(500);
    // The level line now sits under the OLD point - use a clearly different one.
    await rclick(0.62, 0.2);
    await page.locator('[data-testid="oryon-ctx-objects"]').click();
    await page.waitForTimeout(800);
    const railVisible = await page.locator('[data-testid="oryon-utility-rail"]').isVisible().catch(() => false);
    const objectsPressed = await page.locator('[data-testid="oryon-utility-tab-objects"]').getAttribute("aria-pressed").catch(() => null);
    check(`M5-${tag}`, "Object tree opens the objects dock", railVisible && objectsPressed === "true",
      `rail=${railVisible} objectsPressed=${objectsPressed}`);
    const hlineRow = await page.locator('[data-testid="oryon-drawing-row-hline"]').count();
    check(`M4-${tag}`, "horizontal level created an hline (object tree row)", hlineRow >= 1,
      `rows=${hlineRow}`);

    // ── (5) Reset chart view (menu at a clear point) ─────────────────────────
    await rclick(0.62, 0.2);
    const resetVisible = await page.locator('[data-testid="oryon-ctx-reset"]').isVisible().catch(() => false);
    if (resetVisible) {
      await page.locator('[data-testid="oryon-ctx-reset"]').click();
      await page.waitForTimeout(300);
      check(`M5b-${tag}`, "Reset chart view runs without error", true);
    } else {
      check(`M5b-${tag}`, "Reset chart view runs without error", false, "menu did not reopen");
    }

    // ── (6) Settings - live apply + persistence + revert ────────────────────
    await rclick(0.62, 0.2);
    await page.locator('[data-testid="oryon-ctx-settings"]').click();
    await page.waitForTimeout(600);
    const dlg = page.locator('[data-testid="oryon-chart-settings-dialog"]');
    check(`M6-${tag}`, "Settings dialog opens", await dlg.isVisible().catch(() => false));

    // Status line: switch to the tab (Radix unmounts inactive content), hide
    // OHLC → legend span disappears (live).
    await page.locator('[data-testid="oryon-settings-tab-status-line"]').click();
    await page.waitForTimeout(200);
    const ohlcBefore = await page.locator('[data-testid="oryon-legend-ohlc"]').count();
    await page.locator('[data-testid="oryon-settings-status-ohlc"]').click();
    await page.waitForTimeout(400);
    const ohlcAfter = await page.locator('[data-testid="oryon-legend-ohlc"]').count();
    check(`M6b-${tag}`, "Status line toggle hides the OHLC legend live", ohlcBefore === 1 && ohlcAfter === 0,
      `before=${ohlcBefore} after=${ohlcAfter}`);
    await page.locator('[data-testid="oryon-settings-status-ohlc"]').click(); // back on
    await page.waitForTimeout(300);

    // Scales: hide the price scale; Canvas: magnet crosshair on.
    await page.locator('[data-testid="oryon-settings-tab-scales"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="oryon-settings-price-scale"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="oryon-settings-tab-canvas"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="oryon-settings-magnet"]').click();
    await page.waitForTimeout(300);
    // Persist with Ok → localStorage carries the panel record.
    await page.locator('[data-testid="oryon-settings-ok"]').click();
    await page.waitForTimeout(700);
    const persisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem("euforia.oryon.chart-prefs.v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Object.values(parsed.panels ?? {})[0] ?? null;
    });
    check(`M6c-${tag}`, "prefs persisted after Ok (price scale + magnet)",
      persisted !== null && persisted.appearance.priceScaleVisible === false && persisted.appearance.crosshairMagnet === true,
      JSON.stringify(persisted?.appearance ?? {}));

    // Escape = revert: open → reset-to-defaults → Escape → saved state intact.
    await rclick(0.62, 0.2);
    await page.locator('[data-testid="oryon-ctx-settings"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="oryon-settings-reset"]').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const afterCancel = await page.evaluate(() => {
      const raw = window.localStorage.getItem("euforia.oryon.chart-prefs.v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Object.values(parsed.panels ?? {})[0] ?? null;
    });
    const reverted = afterCancel !== null && afterCancel.appearance.priceScaleVisible === false;
    check(`M6d-${tag}`, "Escape reverts live edits (saved state intact)", reverted === true,
      `priceScaleVisible=${afterCancel?.appearance?.priceScaleVisible}`);

    // ── (7) Right-click on a DRAWING → property editor, NOT the ctx menu ────
    const trendBtn = page.locator('[data-testid="oryon-tool-trend"]').first();
    if ((await trendBtn.count()) === 1) {
      await trendBtn.click();
      await page.waitForTimeout(250);
      const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
      const ax = box.x + box.width * 0.2, ay = box.y + box.height * 0.25;
      const bx2 = box.x + box.width * 0.4, by2 = box.y + box.height * 0.55;
      await page.mouse.click(ax, ay);
      await page.waitForTimeout(200);
      await page.mouse.click(bx2, by2);
      await page.waitForTimeout(500);
      const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
      await page.mouse.click(mx, my, { button: 'right' });
      await page.waitForTimeout(500);
      const menuOpen = await page.locator('[data-testid="oryon-ctx-menu"]').isVisible().catch(() => false);
      const editorOpen = await page.locator('[data-testid="oryon-drawing-ctx-editor"]').isVisible().catch(() => false);
      check(`M7-${tag}`, "drawing right-click opens the property editor (no menu)", !menuOpen && editorOpen,
        `menu=${menuOpen} editor=${editorOpen}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      // Switch back to the cursor tool.
      const cursorTool = page.locator('[data-testid="oryon-tool-cursor"]').first();
      if ((await cursorTool.count()) >= 1) await cursorTool.click().catch(() => {});
    } else {
      check(`M7-${tag}`, "trend tool available for the race check", false, "oryon-tool-trend not found");
    }

    // ── Cleanup: clear every drawing created by this run ────────────────────
    const clearBtn = page.locator('[data-testid="oryon-drawing-clear"]');
    if ((await clearBtn.count()) === 1 && (await clearBtn.isVisible().catch(() => false))) {
      await clearBtn.click();
      await page.waitForTimeout(200);
      const confirm = page.locator('[data-testid="oryon-drawing-clear-confirm"]');
      if ((await confirm.count()) === 1 && (await confirm.isVisible().catch(() => false))) {
        await confirm.click().catch(() => {});
      }
      await page.waitForTimeout(300);
    }

    // ── Error budget ─────────────────────────────────────────────────────────
    const realErrors = noiseFiltered(errors);
    check(`E-${tag}`, "no page errors (AUTH-1 noise filtered)", realErrors.length === 0,
      realErrors.slice(0, 3).join(" | "));

    await page.screenshot({ path: `/home/z/my-project/scripts/ctx-menu-${tag}.png` });
    await ctx.close();
    tally();
  }

  await browser.close();
  console.log(`\n===== RESULT: ${pass} pass / ${fail} fail =====`);
  process.exit(fail > 0 ? 1 : 0);
})();
