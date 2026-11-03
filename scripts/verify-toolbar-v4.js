// Toolbar v4 verification - the 6 TradingView-parity requirements.
// (1) floating toolbar full height  (2) bottom time-range selector
// (3) timeframe back on top         (4) rail nav arrows (no scrollbar)
// (5) objects panel on the right    (6) layout sanity at 2 viewports
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

(async () => {
  const browser = await chromium.launch();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1280, height: 460 }]) {
    console.log(`\n===== viewport ${viewport.width}x${viewport.height} =====`);
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureLogin(page);
    await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(9000);

    const tag = `${viewport.height}`;

    // ── (3) Timeframe selector on TOP ─────────────────────────────────────
    const tf = page.locator('[data-testid="oryon-timeframes"]');
    const tfCount = await tf.count();
    if (tfCount === 1) {
      const inHeader = await tf.locator('xpath=ancestor::header[1]').count();
      const tfBox = await tf.boundingBox();
      check(`T3-${tag}`, "Timeframe selector in top header", inHeader === 1 && tfBox && tfBox.y < 200,
        tfBox ? `y=${Math.round(tfBox.y)}` : "");
      const tfBtn = await page.locator('[data-testid="oryon-tf-15m"]').count();
      check(`T3b-${tag}`, "Timeframe buttons render (oryon-tf-15m)", tfBtn === 1);
    } else {
      check(`T3-${tag}`, "Timeframe selector present", false, `count=${tfCount}`);
    }

    // ── (2) Bottom historical range strip ─────────────────────────────────
    const range = page.locator('[data-testid="oryon-history-range"]');
    if ((await range.count()) === 1) {
      const box = await range.boundingBox();
      const footer = await page.locator('[data-testid="oryon-bottom-bar"]').boundingBox();
      const insideFooter = box && footer && box.y >= footer.y - 2 && box.y + box.height <= footer.y + footer.height + 2;
      check(`T2-${tag}`, "Range strip inside bottom bar", insideFooter === true,
        box ? `y=${Math.round(box.y)}` : "");
      const labels = await range.locator("button").allInnerTexts();
      const need = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"];
      const missing = need.filter((n) => !labels.includes(n));
      check(`T2b-${tag}`, "Range presets complete", missing.length === 0, missing.join(",") || labels.join(" "));
    } else {
      check(`T2-${tag}`, "Range strip present", false, `count=${await range.count()}`);
    }

    // ── (4) Rail nav arrows (no scrollbar) ────────────────────────────────
    const rail = page.locator('[data-testid="oryon-tool-rail"]');
    const scroller = rail.locator("div").filter({ hasNot: page.locator("[data-oryon-ui]") }).first();
    const railBox = await rail.boundingBox();
    const footerBox = await page.locator('[data-testid="oryon-bottom-bar"]').boundingBox();
    if (railBox && footerBox) {
      const railBottom = railBox.y + railBox.height;
      check(`T1-${tag}`, "Left rail spans past footer top (full stage height)",
        railBottom >= footerBox.y + footerBox.height - 2,
        `railBottom=${Math.round(railBottom)} footerBottom=${Math.round(footerBox.y + footerBox.height)}`);
    }
    // scrollbar hidden → no element with a visible webkit scrollbar: check computed style
    const scrollbarHidden = await rail.evaluate((el) => {
      const inner = el.querySelector("div");
      if (!inner) return false;
      return getComputedStyle(inner).scrollbarWidth === "none";
    });
    check(`T4a-${tag}`, "Rail scrollbar hidden (scrollbar-width:none)", scrollbarHidden);

    // hover to reveal arrows
    await rail.hover({ position: { x: 20, y: Math.floor(railBox.height / 2) } });
    await page.waitForTimeout(400);
    const downOpacity = await page.locator('[data-testid="oryon-rail-nav-down"]').evaluate((el) => getComputedStyle(el).opacity).catch(() => "0");
    const overflow = await rail.evaluate((el) => {
      const inner = el.querySelector("div");
      return inner ? inner.scrollHeight - inner.clientHeight : -1;
    });
    console.log(`      nav arrows - overflow=${overflow}px downOpacity(hover)=${downOpacity}`);
    if (overflow > 4 && downOpacity === "1") {
      await page.locator('[data-testid="oryon-rail-nav-down"]').click();
      await page.waitForTimeout(800);
      const after = await rail.evaluate((el) => el.querySelector("div").scrollTop);
      check(`T4b-${tag}`, "Down arrow scrolls the rail", after > 4, `scrollTop=${after}`);
    } else if (overflow <= 4) {
      check(`T4b-${tag}`, "Arrows hidden when everything fits (overflow<=4px)", downOpacity === "0", `overflow=${overflow}`);
    } else {
      check(`T4b-${tag}`, "Down arrow reveals on hover", false, `opacity=${downOpacity}`);
    }

    // ── (5) Objects dock on the right ─────────────────────────────────────
    // Draw a trend line first so the list has content, then open the dock.
    // Anchors INSIDE the price pane (like the proven phase probes - clicks
    // in the volume/RSI panes are legitimately ignored by the controller).
    await page.locator('[data-testid="oryon-tool-caret-trend"]').click();
    await page.waitForSelector('[data-testid="oryon-tool-menu-trend"]', { timeout: 5000 });
    await page.locator('[data-testid="oryon-tool-item-trend"]').click();
    await page.waitForTimeout(300);
    const panel = page.locator('[data-testid="oryon-panel"]').first();
    const pBox = await panel.boundingBox();
    if (pBox) {
      const cx = pBox.x + pBox.width / 2;
      // Height-adaptive anchors - stay inside the PRICE pane even on very
      // short viewports (the volume/RSI panes legitimately ignore draws).
      const ay = pBox.y + Math.min(160, pBox.height * 0.4);
      const by = pBox.y + Math.min(230, pBox.height * 0.5);
      await page.mouse.click(cx - 120, ay);
      await page.waitForTimeout(250);
      await page.mouse.click(cx + 120, by);
      await page.waitForTimeout(500);
    }
    const listToggle = page.locator('[data-testid="oryon-drawing-list-toggle"]');
    let listReady = false;
    for (let i = 0; i < 30 && !listReady; i += 1) {
      listReady = await listToggle.isEnabled().catch(() => false);
      if (!listReady) await page.waitForTimeout(200);
    }
    check(`T5pre-${tag}`, "Trend line drawn (list toggle enables)", listReady);
    if (listReady) {
      await listToggle.click();
      await page.waitForTimeout(700);
    }
    const objectsPanel = page.locator('[data-testid="oryon-panel-objects"]');
    const objCount = await objectsPanel.count();
    if (objCount === 1) {
      const objBox = await objectsPanel.boundingBox();
      const viewW = viewport.width;
      const onRight = objBox && objBox.x > viewW * 0.6;
      check(`T5-${tag}`, "Objects panel docked on the right", onRight === true,
        objBox ? `x=${Math.round(objBox.x)} w=${Math.round(objBox.width)}` : "");
      const listRows = await page.locator('[data-testid="oryon-drawing-list"] li').count();
      check(`T5b-${tag}`, "Objects list shows the drawn trend", listRows >= 1, `rows=${listRows}`);
    } else {
      check(`T5-${tag}`, "Objects panel present", false, `count=${objCount}`);
    }

    // ── (1) Favorites bar can travel into the footer strip ────────────────
    const fav = page.locator('[data-testid="oryon-favorites-bar"]');
    if ((await fav.count()) === 1) {
      const grip = page.locator('[data-testid="oryon-favorites-grip"]');
      const gripBox = await grip.boundingBox();
      const favBoxBefore = await fav.boundingBox();
      if (gripBox && favBoxBefore) {
        await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(gripBox.x + 10, viewport.height - 12, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        const favBoxAfter = await fav.boundingBox();
        const footerTop = footerBox ? footerBox.y : viewport.height;
        const reachedFooter = favBoxAfter && favBoxAfter.y + favBoxAfter.height > footerTop + 4;
        check(`T1b-${tag}`, "Favorites bar extends into footer strip", reachedFooter === true,
          favBoxAfter ? `y=${Math.round(favBoxAfter.y)} h=${Math.round(favBoxAfter.height)} footerTop=${Math.round(footerTop)}` : "");
        // restore to top-left so the screenshot stays readable
        const g2 = await grip.boundingBox();
        if (g2) {
          await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
          await page.mouse.down();
          await page.mouse.move(pBox ? pBox.x + 120 : 200, (pBox ? pBox.y : 100) + 60, { steps: 8 });
          await page.mouse.up();
        }
      }
    } else {
      check(`T1b-${tag}`, "Favorites bar present", false, "not rendered");
    }

    // ── (2c) Range click actually moves the viewport ──────────────────────
    const rangeBefore = await page.evaluate(() => {
      const d = window.__ORYON_PANELS_DEBUG__?.();
      return d && d[0] ? d[0].visibleRange : null;
    });
    await page.locator('[data-testid="oryon-range-1D"]').click();
    await page.waitForTimeout(900);
    const pressed = await page.locator('[data-testid="oryon-range-1D"]').getAttribute("aria-pressed");
    const rangeAfter = await page.evaluate(() => {
      const d = window.__ORYON_PANELS_DEBUG__?.();
      return d && d[0] ? d[0].visibleRange : null;
    });
    if (rangeBefore && rangeAfter) {
      const spanBefore = rangeBefore.to - rangeBefore.from;
      const spanAfter = rangeAfter.to - rangeAfter.from;
      check(`T2c-${tag}`, "1D preset narrows the visible range", spanAfter < spanBefore,
        `before=${Math.round(spanBefore / 60)}min after=${Math.round(spanAfter / 60)}min`);
    } else {
      check(`T2c-${tag}`, "1D preset applied (aria state - dev-range check runs on :3001)", pressed === "true");
    }

    // ── (2d) Calendar popover opens ───────────────────────────────────────
    await page.locator('[data-testid="oryon-range-calendar"]').click();
    await page.waitForTimeout(500);
    const calOpen = await page.locator('[data-testid="oryon-range-calendar-popover"]').isVisible().catch(() => false);
    check(`T2d-${tag}`, "Calendar popover opens", calOpen);
    if (calOpen) {
      const dayBtns = await page.locator('[data-testid^="oryon-range-day-"]').count();
      check(`T2e-${tag}`, "Month grid renders day cells", dayBtns >= 28, `days=${dayBtns}`);
      await page.keyboard.press("Escape");
    }

    // screenshot
    await page.screenshot({ path: `/home/z/my-project/scripts/toolbar-v4-${viewport.height}.png` });

    const realErrors = errors.filter((e) => !e.includes("401") && !e.includes("auth") && !e.includes("WebSocket"));
    check(`ERR-${tag}`, "No page errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
  process.exit(0);
})();
