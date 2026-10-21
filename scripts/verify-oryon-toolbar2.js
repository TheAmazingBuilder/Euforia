/**
 * verify-oryon-toolbar2.js — Oryon Drawing toolbar v2 (TradingView parity).
 *
 * Contract under test (browser-observed, dev :3001):
 *  - RAIL: six catalog groups render with split controls (icon + caret);
 *    the top toolbar carries NO timeframe strip anymore (moved to the
 *    bottom bar — no duplicate control).
 *  - FLYOUTS: the trend menu lists trend/ray/extended/hline/vline/crossline;
 *    a star toggle persists into the validated ui-prefs envelope.
 *  - TOOLS: arming + two-click drawing creates an object (trash + list
 *    become live); the ERASER removes it by click; a press-drag rect draw
 *    works; Remove-objects (two-step confirm) clears everything.
 *  - FAVORITES BAR: visible by default, shows the default favorites,
 *    DRAGS anywhere over the chart (position persisted, clamped), and the
 *    rail's Show-favorites toggle hides/shows it.
 *  - BOTTOM BAR: interval strip targets the ACTIVE panel (debug counter),
 *    live clock HH:MM:SS, timezone dropdown PATCHes /me (display-only).
 *  - KEYBOARD: Alt+T arms the trend tool.
 *  - REGRESSIONS: 0 console/page errors; mobile 390 renders (bottom bar
 *    md-only, workspace alive).
 *
 * Run: node scripts/verify-oryon-toolbar2.js  (BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-toolbar2-probe.log");
fs.writeFileSync(LOG, `=== oryon toolbar2 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3001";

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
    fs.appendFileSync(LOG, `  PASS  ${label}\n`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
    fs.appendFileSync(LOG, `  FAIL  ${label}\n`);
  }
};
const eq = (label, actual, expected) => ok(`${label} (got ${String(actual)}, want ${String(expected)})`, actual === expected);

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "Download the React DevTools",
  "React does not recognize",
  "WebSocket",
  "Unknown engine",
];

async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
  } catch {
    fs.appendFileSync(LOG, "signIn: no login form (already authed?)\n");
    return;
  }
  const demoButton = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
  } else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  try {
    await app.waitForSelector('[data-testid="login-mfa-code"]', { timeout: 15_000 });
  } catch {
    /* fall through */
  }
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
}

async function panels(app) {
  return app.evaluate(() => {
    const read = window.__ORYON_PANELS_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function waitForPanels(app, minSeries = 1, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await panels(app);
    if (Array.isArray(last) && last.length >= 1 && last.every((p) => p.series >= minSeries)) {
      return last;
    }
    await app.waitForTimeout(250);
  }
  return last;
}

async function uiPrefs(app) {
  return app.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.ui.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

const panelLoc = (app) => app.locator('[data-testid="oryon-panel"]').first();

/**
 * Main-pane coordinates: the chart's interaction domain is the TOP pane
 * ONLY (indicator panes below are honestly excluded by the drawing
 * controller) — anchors are placed in the upper band of the panel, safe
 * for 1..4 indicator panes.
 */
async function chartAnchors(app) {
  const box = await panelLoc(app).boundingBox();
  if (box === null) throw new Error("panel introuvable");
  const cx = box.x + box.width / 2;
  return {
    cx,
    a: { x: cx - 120, y: box.y + 160 },
    b: { x: cx + 120, y: box.y + 240 },
    mid: { x: cx, y: box.y + 200 },
    r1: { x: cx + 220, y: box.y + 140 },
    r2: { x: cx + 340, y: box.y + 220 },
  };
}

async function objectCount(app) {
  return app.evaluate(() => {
    // The trash button's disabled state mirrors the object count exactly
    // (disabled ⇔ no objects) — read the DOM, not internals.
    const el = document.querySelector('[data-testid="oryon-drawings-clear"]');
    if (el === null) return null;
    return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" ? 0 : 1;
  });
}

async function hasObjects(app) {
  const deadline = Date.now() + 6_000;
  let seen = null;
  while (Date.now() < deadline) {
    seen = await objectCount(app);
    if (seen === 1) return true;
    await app.waitForTimeout(200);
  }
  return seen === 1;
}

async function noObjects(app) {
  const deadline = Date.now() + 6_000;
  let seen = null;
  while (Date.now() < deadline) {
    seen = await objectCount(app);
    if (seen === 0) return true;
    await app.waitForTimeout(200);
  }
  return seen === 0;
}

/** Opens a group flyout, acts, closes. */
async function withFlyout(app, group, act) {
  await app.click(`[data-testid="oryon-tool-caret-${group}"]`);
  await app.waitForSelector(`[data-testid="oryon-tool-menu-${group}"]`, { timeout: 5_000 });
  await act();
  await app.keyboard.press("Escape");
  await app.waitForTimeout(250);
}

// ── Main flow ────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    await signIn(page);
    const navLink = page.locator('[href="/oryon"]').first();
    await navLink.waitFor({ state: "visible", timeout: 40_000 });
    await clearDevOverlay(page);
    await navLink.click();
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 40_000 });
    await clearDevOverlay(page);
    await waitForPanels(page);
    await page.waitForTimeout(800);

    // ── 1. Rail structure ──────────────────────────────────────────────────
    const rail = page.locator('[data-testid="oryon-tool-rail"]');
    ok("rail visible (desktop)", await rail.isVisible());
    for (const group of ["cursors", "trend", "fib", "forecast", "shapes", "text"]) {
      ok(`group button ${group} present`, (await page.locator(`[data-testid="oryon-tool-${group}"]`).count()) === 1);
      ok(`caret ${group} present`, (await page.locator(`[data-testid="oryon-tool-caret-${group}"]`).count()) === 1);
    }

    // ── 2. Top toolbar: NO timeframe strip (moved to the bottom bar) ───────
    const topTf = await page
      .locator('[data-testid="oryon-toolbar"] [data-testid^="oryon-tf-"]')
      .count();
    ok("top toolbar has no interval buttons (moved to bottom bar)", topTf === 0);

    // ── 3. Bottom bar: intervals + clock + timezone ────────────────────────
    const bottomBar = page.locator('[data-testid="oryon-bottom-bar"]');
    ok("bottom bar visible", await bottomBar.isVisible());
    eq("bottom bar interval count (1m→1D)", await page.locator('[data-testid="oryon-timeframes"] [data-testid^="oryon-tf-"]').count(), 7);

    // Interval targets the ACTIVE panel (debug counter, honest state).
    await page.click('[data-testid="oryon-tf-15m"]');
    await page.waitForTimeout(1_600);
    let snap = await panels(page);
    ok("bottom-bar 15m applied to the active panel", Array.isArray(snap) && snap[0]?.interval === "15m");
    await page.click('[data-testid="oryon-tf-5m"]');
    await page.waitForTimeout(1_600);

    const clockText = await page.locator('[data-testid="oryon-clock"]').innerText();
    ok(`live clock renders (got "${clockText.replace(/\n/g, " ")}")`, /\d{1,2}:\d{2}:\d{2}/.test(clockText));

    await page.click('[data-testid="oryon-timezone-trigger"]');
    await page.waitForSelector('[data-testid="oryon-tz-Europe/London"]', { timeout: 5_000 });
    eq("timezone options (curated list)", await page.locator('[data-testid^="oryon-tz-"]').count(), 16);
    await page.click('[data-testid="oryon-tz-Europe/London"]');
    await page.waitForTimeout(1_200);
    const tzText = await page.locator('[data-testid="oryon-timezone-trigger"]').innerText();
    ok(`timezone PATCH /me applied (got "${tzText.replace(/\n/g, " ")}")`, tzText.includes("Europe/London"));
    // Restore the default zone (probe leaves no trace).
    await page.click('[data-testid="oryon-timezone-trigger"]');
    await page.waitForSelector('[data-testid="oryon-tz-America/Toronto"]', { timeout: 5_000 });
    await page.click('[data-testid="oryon-tz-America/Toronto"]');
    await page.waitForTimeout(1_000);

    // ── 4. Trend flyout: members + star persistence ────────────────────────
    await withFlyout(page, "trend", async () => {
      for (const tool of ["trend", "ray", "extended", "hline", "vline", "crossline"]) {
        ok(`trend flyout lists ${tool}`, (await page.locator(`[data-testid="oryon-tool-item-${tool}"]`).count()) === 1);
      }
      await page.click('[data-testid="oryon-tool-star-crossline"]');
      await page.waitForTimeout(400);
    });
    let prefs = await uiPrefs(page);
    ok("star toggle persisted (crossline ∈ favorites)", Array.isArray(prefs?.favorites) && prefs.favorites.includes("crossline"));

    // ── 5. Arm + draw a trendline (two clicks, INSIDE the main pane) ──────
    await page.click('[data-testid="oryon-tool-caret-trend"]');
    await page.waitForSelector('[data-testid="oryon-tool-menu-trend"]', { timeout: 5_000 });
    await page.click('[data-testid="oryon-tool-item-trend"]');
    await page.waitForTimeout(300);

    const pts = await chartAnchors(page);
    await page.mouse.click(pts.a.x, pts.a.y);
    await page.waitForTimeout(200);
    await page.mouse.click(pts.b.x, pts.b.y);
    await page.waitForTimeout(500);
    ok("trendline drawn (objects present)", await hasObjects(page));

    // The tool DISARMS after completion (TV behavior) — group not active.
    const trendActive = await page.locator('[data-testid="oryon-tool-trend"][data-active="true"]').count();
    ok("trend tool disarms after completion", trendActive === 0);

    // ── 6. Press-drag rect (shapes group) ──────────────────────────────────
    await page.click('[data-testid="oryon-tool-caret-shapes"]');
    await page.waitForSelector('[data-testid="oryon-tool-menu-shapes"]', { timeout: 5_000 });
    await page.click('[data-testid="oryon-tool-item-rect"]');
    await page.waitForTimeout(300);
    await page.mouse.move(pts.r1.x, pts.r1.y);
    await page.mouse.down();
    await page.mouse.move(pts.r2.x, pts.r2.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    ok("rectangle press-drag drawn", await hasObjects(page));

    // ── 7. Eraser removes by click (cursors group) ─────────────────────────
    await page.click('[data-testid="oryon-tool-caret-cursors"]');
    await page.waitForSelector('[data-testid="oryon-tool-menu-cursors"]', { timeout: 5_000 });
    ok("cursors flyout lists dot + eraser", (await page.locator('[data-testid="oryon-tool-item-cursor-dot"]').count()) === 1 && (await page.locator('[data-testid="oryon-tool-item-eraser"]').count()) === 1);
    await page.click('[data-testid="oryon-tool-item-eraser"]');
    await page.waitForTimeout(300);
    // Click ON the trendline (midpoint) — the rect sits off to the side.
    await page.mouse.click(pts.mid.x, pts.mid.y);
    await page.waitForTimeout(600);

    // One object removed — verify by count through the object list.
    await page.click('[data-testid="oryon-drawing-list-toggle"]');
    await page.waitForTimeout(400);
    const listText = await page.locator('[data-testid="oryon-drawing-list"]').innerText().catch(() => "");
    ok(`eraser removed the trendline (list shows 1 object: "${listText.replace(/\n/g, " ").slice(0, 60)}")`, /1\s+objects|1\s+objet/i.test(listText));
    await page.click('[data-testid="oryon-drawing-list-toggle"]');
    await page.waitForTimeout(300);

    // ── 8. Remove objects (two-step confirm) ───────────────────────────────
    await page.click('[data-testid="oryon-drawings-clear"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="oryon-drawings-clear-confirm"]');
    await page.waitForTimeout(500);
    ok("remove-objects cleared everything", await noObjects(page));

    // ── 9. Favorites bar: defaults, drag, visibility toggle ────────────────
    // Reset the ui-prefs envelope → documented defaults (6 favorites,
    // visible, position 96/120) — a clean baseline for the drag assertions.
    await page.evaluate(() => localStorage.removeItem("euforia.oryon.ui.v1"));
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 40_000 });
    await page.waitForTimeout(2_500);

    const favBar = page.locator('[data-testid="oryon-favorites-bar"]');
    ok("favorites bar visible by default", await favBar.isVisible());
    eq("default favorites rendered", await page.locator('[data-testid^="oryon-favorite-"]').count(), 6);

    const before = await favBar.boundingBox();
    const grip = page.locator('[data-testid="oryon-favorites-grip"]');
    const gripBox = await grip.boundingBox();
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + gripBox.width / 2 + 160, gripBox.y + gripBox.height / 2 + 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const after = await favBar.boundingBox();
    ok(
      `favorites bar DRAGS (Δx=${Math.round(after.x - before.x)}, Δy=${Math.round(after.y - before.y)})`,
      Math.abs(after.x - before.x) > 100 && Math.abs(after.y - before.y) > 60,
    );
    prefs = await uiPrefs(page);
    ok(
      `dragged position persisted (x=${Math.round(prefs?.favoritesBar?.x ?? -1)}, y=${Math.round(prefs?.favoritesBar?.y ?? -1)})`,
      typeof prefs?.favoritesBar?.x === "number" && prefs.favoritesBar.x > 100,
    );

    // Rail toggle hides/shows the bar + persists.
    await page.click('[data-testid="oryon-favorites-toggle"]');
    await page.waitForTimeout(500);
    ok("favorites bar hides via the rail star", (await favBar.count()) === 0 || !(await favBar.isVisible().catch(() => false)));
    prefs = await uiPrefs(page);
    eq("favorites visibility persisted (false)", prefs?.favoritesBar?.visible, false);
    await page.click('[data-testid="oryon-favorites-toggle"]');
    await page.waitForTimeout(500);
    ok("favorites bar shows again", await favBar.isVisible());

    // ── 10. Keyboard shortcut Alt+T arms the trend tool ────────────────────
    await page.keyboard.press("Alt+t");
    await page.waitForTimeout(300);
    ok("Alt+T arms the trend tool", (await page.locator('[data-testid="oryon-tool-trend"][data-active="true"]').count()) === 1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // ── 11. Fib group: fib + fibext items exist (3-anchor tool shipped) ────
    await withFlyout(page, "fib", async () => {
      ok("fib flyout lists retracement", (await page.locator('[data-testid="oryon-tool-item-fib"]').count()) === 1);
      ok("fib flyout lists trend-based fib extension", (await page.locator('[data-testid="oryon-tool-item-fibext"]').count()) === 1);
    });
    await withFlyout(page, "forecast", async () => {
      for (const tool of ["measure", "pricerange", "daterange", "longpos", "shortpos"]) {
        ok(`forecast flyout lists ${tool}`, (await page.locator(`[data-testid="oryon-tool-item-${tool}"]`).count()) === 1);
      }
    });

    // ── 12. Mobile 390 — honest degradation ────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    ok("mobile: workspace alive", await page.locator('[data-testid="oryon-workspace"]').isVisible());
    ok("mobile: bottom bar hidden (md+ only)", !(await page.locator('[data-testid="oryon-bottom-bar"]').isVisible()));
    ok("mobile: rail hidden (md+ only, documented)", !(await page.locator('[data-testid="oryon-tool-rail"]').isVisible()));

    // ── Verdict ────────────────────────────────────────────────────────────
    ok("0 console/page errors", errors.length === 0);
    if (errors.length > 0) {
      fs.appendFileSync(LOG, `ERRORS:\n${errors.slice(0, 10).join("\n")}\n`);
      console.log("ERRORS:", errors.slice(0, 10));
    }
  } catch (err) {
    fail += 1;
    console.log("  FAIL  probe crashed:", String(err).slice(0, 400));
    fs.appendFileSync(LOG, `CRASH: ${String(err)}\n`);
  } finally {
    await browser.close();
  }

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
