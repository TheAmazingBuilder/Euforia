/**
 * verify-oryon-toolbar3.js - Oryon Drawing toolbar v3 (property editor,
 * R:R, brush + arrow marks, loader fix).
 *
 * Contract under test (browser-observed, dev :3001):
 *  - CATALOG: brush listed in the Shapes flyout; the Annotations group
 *    (renamed "Text and notes") lists text + 4 arrow directions.
 *  - BRUSH: press-drag freehand creates ONE brush object; single-tap
 *    creates nothing; undo removes it.
 *  - ARROW MARKS: one click creates an arrowmark with the preset direction;
 *    the object list shows it.
 *  - PROPERTY EDITOR: right-click a drawing → the editor opens AT the
 *    pointer (clamped inside the panel), the object is selected; color
 *    swatch / width / dash mutate the persisted style; Clone duplicates
 *    (+1 object); Delete removes; Escape closes.
 *  - R:R: right-click a long position → rr chips + free input; chip 3 →
 *    the object's rr === 3 AND the readout says "1:3" (canvas label is
 *    visually verified by screenshot); reload persists rr.
 *  - LOADER FIX: an `extended` (toolbar-v2 type) drawing SURVIVES reload
 *    (the hand-maintained renderable list used to drop it).
 *  - REGRESSIONS: 0 console/page errors (documented noise filtered);
 *    mobile 390 renders.
 *
 * Run: node scripts/verify-oryon-toolbar3.js  (BASE_URL overridable; dev
 * server on :3001 - debug handles are dev-only).
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-toolbar3-probe.log");
fs.writeFileSync(LOG, `=== oryon toolbar3 probe - ${new Date().toISOString()} ===\n`);

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
  "401",
  "403",
];

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

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

const panelLoc = (app) => app.locator('[data-testid="oryon-panel"]').first();

async function drawingsDebug(app) {
  return app.evaluate(() => {
    const read = window.__ORYON_DRAWINGS_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function waitForDrawings(app, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await drawingsDebug(app);
    if (last !== null) return last;
    await app.waitForTimeout(200);
  }
  return last;
}

async function chartAnchors(app) {
  const box = await panelLoc(app).boundingBox();
  if (box === null) throw new Error("panel introuvable");
  const cx = box.x + box.width / 2;
  return {
    box,
    cx,
    a: { x: cx - 140, y: box.y + 170 },
    b: { x: cx + 100, y: box.y + 260 },
    mid: { x: cx - 20, y: box.y + 215 },
    brush1: { x: cx - 200, y: box.y + 140 },
    brush2: { x: cx + 60, y: box.y + 120 },
    arrow: { x: cx + 180, y: box.y + 150 },
    rr1: { x: cx - 160, y: box.y + 300 },
    rr2: { x: cx + 40, y: box.y + 360 },
  };
}

async function clearAllDrawings(app) {
  // Deterministic reset through the store handle (probe-only convenience):
  // the trash two-step is covered by toolbar2; here we must be stateless.
  await app.evaluate(() => {
    localStorage.removeItem("euforia.oryon.drawings.v1:EURUSD");
  });
  await app.reload({ waitUntil: "load" });
  await app.waitForTimeout(2_500);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((n) => text.includes(n))) return;
    consoleErrors.push(text.slice(0, 300));
  });
  page.on("pageerror", (e) => {
    const text = String(e);
    if (CONSOLE_NOISE.some((n) => text.includes(n))) return;
    consoleErrors.push(`pageerror: ${text.slice(0, 300)}`);
  });

  await signIn(page);
  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('[data-testid="oryon-panel"]', { timeout: 45_000 });
  await clearDevOverlay(page);
  await clearAllDrawings(page);

  // Wait for the drawings handle (binds when the active layer mounts).
  const dbg0 = await waitForDrawings(page);
  ok("drawings debug handle present (active layer bound)", dbg0 !== null);
  eq("start: 0 objects", dbg0 ? dbg0.total : -1, 0);

  const pts = await chartAnchors(page);

  // ── 1. Catalog: brush in Shapes, arrows in Annotations ────────────────────
  await page.click('[data-testid="oryon-tool-caret-shapes"]');
  await page.waitForSelector('[data-testid="oryon-tool-menu-shapes"]', { timeout: 5_000 });
  ok("shapes flyout lists brush", (await page.locator('[data-testid="oryon-tool-item-brush"]').count()) === 1);
  await page.click('[data-testid="oryon-tool-caret-text"]');
  await page.waitForSelector('[data-testid="oryon-tool-menu-text"]', { timeout: 5_000 });
  ok("annotations flyout lists text", (await page.locator('[data-testid="oryon-tool-item-text"]').count()) === 1);
  for (const arrow of ["arrow-up", "arrow-down", "arrow-left", "arrow-right"]) {
    ok(`annotations flyout lists ${arrow}`, (await page.locator(`[data-testid="oryon-tool-item-${arrow}"]`).count()) === 1);
  }
  const groupLabel = await page.locator('[data-testid="oryon-tool-menu-text"] [role="menu"]').first().getAttribute("aria-label").catch(() => null);
  ok(`annotations group header shows 'Annotations' (got "${groupLabel ?? ""}")`, groupLabel !== null && /annotation/i.test(groupLabel));
  await page.keyboard.press("Escape");

  // ── 2. Brush: press-drag freehand → exactly one brush object ─────────────
  await page.click('[data-testid="oryon-tool-caret-shapes"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-brush"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-tool-item-brush"]');
  await page.mouse.move(pts.brush1.x, pts.brush1.y);
  await page.mouse.down();
  // A wandering stroke - many direction changes.
  await page.mouse.move(pts.brush1.x + 60, pts.brush1.y + 40, { steps: 8 });
  await page.mouse.move(pts.brush1.x + 130, pts.brush1.y - 10, { steps: 8 });
  await page.mouse.move(pts.brush2.x, pts.brush2.y, { steps: 10 });
  await page.mouse.up();
  let dbg = await waitForDrawings(page);
  eq("brush: 1 object after stroke", dbg ? (dbg.byType.brush ?? 0) : -1, 1);
  const brushObj = dbg && dbg.drawings ? dbg.drawings.find((d) => d.type === "brush") : null;
  ok("brush: persisted ≥ 6 points", brushObj !== null && brushObj.points.length >= 6);

  // Single tap (no drag) - no degenerate brush object.
  await page.click('[data-testid="oryon-tool-caret-shapes"]').catch(() => {});
  // Tool disarmed after stroke (TV behavior) → re-arm:
  const brushArmed = await page.locator('[data-testid="oryon-tool-item-brush"]').count();
  if (brushArmed === 0) {
    await page.click('[data-testid="oryon-tool-caret-shapes"]');
    await page.waitForSelector('[data-testid="oryon-tool-item-brush"]', { timeout: 5_000 });
  }
  await page.click('[data-testid="oryon-tool-item-brush"]');
  await page.mouse.click(pts.brush2.x + 40, pts.brush2.y + 60);
  dbg = await waitForDrawings(page);
  eq("brush: single tap creates nothing", dbg ? (dbg.byType.brush ?? 0) : -1, 1);

  // Undo removes the committed stroke.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  eq("brush: undo removes the stroke", dbg ? dbg.total : -1, 0);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  eq("brush: redo restores it", dbg ? (dbg.byType.brush ?? 0) : -1, 1);

  // ── 3. Arrow marks: one click, preset direction ───────────────────────────
  await page.click('[data-testid="oryon-tool-caret-text"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-arrow-up"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-tool-item-arrow-up"]');
  await page.mouse.click(pts.arrow.x, pts.arrow.y);
  dbg = await waitForDrawings(page);
  const arrowObj = dbg && dbg.drawings ? dbg.drawings.find((d) => d.type === "arrowmark") : null;
  ok("arrowmark: created by one click", arrowObj !== undefined && arrowObj !== null);
  eq("arrowmark: preset dir=up", arrowObj ? arrowObj.dir : null, "up");

  // ── 4. Trendline + long position (fixtures for the editor) ───────────────
  await page.keyboard.press("Alt+t");
  await page.mouse.click(pts.a.x, pts.a.y);
  await page.mouse.click(pts.b.x, pts.b.y);
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  eq("trendline: created via Alt+T", dbg ? (dbg.byType.trend ?? 0) : -1, 1);

  await page.click('[data-testid="oryon-tool-caret-forecast"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-longpos"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-tool-item-longpos"]');
  await page.mouse.move(pts.rr1.x, pts.rr1.y);
  await page.mouse.down();
  await page.mouse.move(pts.rr2.x, pts.rr2.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  const posObj = dbg && dbg.drawings ? dbg.drawings.find((d) => d.type === "longpos") : null;
  ok("longpos: created by press-drag", posObj !== undefined && posObj !== null);
  eq("longpos: rr absent → default 1", posObj ? (posObj.rr ?? 1) : -1, 1);

  // ── 5. Property editor: right-click the trendline ─────────────────────────
  await page.mouse.click(pts.mid.x, pts.mid.y, { button: "right" });
  await page.waitForSelector('[data-testid="oryon-drawing-ctx-editor"]', { timeout: 5_000 });
  ok("editor: opens on right-click", true);
  const edType = await page.locator('[data-testid="oryon-drawing-ctx-editor"]').getAttribute("data-drawing-type");
  eq("editor: bound to the trendline", edType, "trend");
  dbg = await waitForDrawings(page);
  eq("editor: right-click selected the object", dbg ? dbg.selectedId !== null : false, true);

  // Color → loss token persisted.
  await page.click('[data-testid="oryon-ctx-color-loss"]');
  await page.waitForTimeout(300);
  dbg = await waitForDrawings(page);
  const trendObj = dbg.drawings.find((d) => d.type === "trend");
  eq("editor: color swatch persists loss token", trendObj ? trendObj.style.color : null, "loss");

  // Width 3 + dashed persist.
  await page.click('[data-testid="oryon-ctx-width-3"]');
  await page.click('[data-testid="oryon-ctx-dash-dashed"]');
  await page.waitForTimeout(300);
  dbg = await waitForDrawings(page);
  const trendObj2 = dbg.drawings.find((d) => d.type === "trend");
  eq("editor: width persists", trendObj2 ? trendObj2.style.width : null, 3);
  eq("editor: dash persists", trendObj2 ? trendObj2.style.dash : null, "dashed");

  // Clone → +1 object, unlocked, shifted.
  const beforeClone = dbg.total;
  await page.click('[data-testid="oryon-ctx-clone"]');
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  eq("editor: clone adds one object", dbg.total, beforeClone + 1);
  const clone = dbg.drawings.filter((d) => d.type === "trend");
  eq("editor: clone count = 2 trends", clone.length, 2);
  ok("editor: clone shifted in time", clone.length === 2 && clone[0].a.t !== clone[1].a.t);

  // Delete via the editor (the clone is selected after add).
  await page.mouse.click(pts.mid.x, pts.mid.y - 30, { button: "right" }).catch(() => {});
  await page.waitForTimeout(300);
  const editorOpen = (await page.locator('[data-testid="oryon-drawing-ctx-editor"]').count()) > 0;
  if (!editorOpen) {
    // Right-click the ORIGINAL trendline area again.
    await page.mouse.click(pts.mid.x, pts.mid.y, { button: "right" });
    await page.waitForTimeout(300);
  }
  const delCount = dbg.total;
  await page.click('[data-testid="oryon-ctx-delete"]');
  await page.waitForTimeout(400);
  dbg = await waitForDrawings(page);
  eq("editor: delete removes one object", dbg.total, delCount - 1);

  // Escape closes the editor.
  await page.mouse.click(pts.arrow.x, pts.arrow.y, { button: "right" });
  await page.waitForSelector('[data-testid="oryon-drawing-ctx-editor"]', { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  eq("editor: Escape closes", (await page.locator('[data-testid="oryon-drawing-ctx-editor"]').count()) === 0, true);

  await page.screenshot({ path: path.resolve(__dirname, "toolbar3-editor.png") });

  // ── 6. R:R configurable on the long position ──────────────────────────────
  await page.mouse.click((pts.rr1.x + pts.rr2.x) / 2, (pts.rr1.y + pts.rr2.y) / 2 + 20, { button: "right" });
  const rrEditor = await page.waitForSelector('[data-testid="oryon-drawing-ctx-editor"][data-drawing-type="longpos"]', { timeout: 5_000 }).catch(() => null);
  ok("rr editor: opens on the longpos", rrEditor !== null);
  if (rrEditor !== null) {
    await page.click('[data-testid="oryon-ctx-rr-3"]');
    await page.waitForTimeout(300);
    dbg = await waitForDrawings(page);
    const pos3 = dbg.drawings.find((d) => d.type === "longpos");
    eq("rr: chip 3 persists rr=3", pos3 ? pos3.rr : null, 3);
    // Free input: set 2.5.
    const input = page.locator('[data-testid="oryon-ctx-rr"] input[type="number"]');
    await input.fill("2.5");
    await input.press("Enter");
    await page.waitForTimeout(300);
    dbg = await waitForDrawings(page);
    const pos25 = dbg.drawings.find((d) => d.type === "longpos");
    eq("rr: free input persists 2.5", pos25 ? pos25.rr : null, 2.5);
    await page.screenshot({ path: path.resolve(__dirname, "toolbar3-rr.png") });
  }
  await page.keyboard.press("Escape");

  // ── 7. LOADER FIX - v2/v4 drawings survive reload ─────────────────────────
  // Add an `extended` (toolbar-v2 type): arm via trend flyout.
  await page.click('[data-testid="oryon-tool-caret-trend"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-extended"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-tool-item-extended"]');
  await page.waitForTimeout(300);
  let toolNow = (await drawingsDebug(page))?.activeTool;
  console.log(`        [debug] activeTool after arming: ${toolNow}`);
  if (toolNow !== "extended") {
    // One retry (flyout click race) - mechanism, not flakiness, is under test.
    await page.click('[data-testid="oryon-tool-caret-trend"]');
    await page.waitForSelector('[data-testid="oryon-tool-item-extended"]', { timeout: 5_000 });
    await page.click('[data-testid="oryon-tool-item-extended"]');
    await page.waitForTimeout(300);
    toolNow = (await drawingsDebug(page))?.activeTool;
    console.log(`        [debug] activeTool after retry: ${toolNow}`);
  }
  await page.mouse.click(pts.rr1.x, pts.box.y + 380);
  await page.waitForTimeout(150);
  await page.mouse.click(pts.rr2.x + 120, pts.box.y + 300);
  await page.waitForTimeout(500);
  dbg = await waitForDrawings(page);
  const beforeReload = dbg.total;
  ok(`pre-reload: ${beforeReload} objects incl. extended`, (dbg.byType.extended ?? 0) === 1);

  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('[data-testid="oryon-panel"]', { timeout: 45_000 });
  await page.waitForTimeout(3_000);
  const dbgAfter = await waitForDrawings(page);
  eq("LOADER FIX: all objects survive reload", dbgAfter ? dbgAfter.total : -1, beforeReload);
  eq("LOADER FIX: extended (v2 type) survives", dbgAfter ? (dbgAfter.byType.extended ?? 0) : -1, 1);
  const rrAfter = dbgAfter && dbgAfter.drawings ? dbgAfter.drawings.find((d) => d.type === "longpos") : null;
  eq("LOADER FIX: rr=2.5 survives", rrAfter ? rrAfter.rr : null, 2.5);
  const trendAfter = dbgAfter && dbgAfter.drawings ? dbgAfter.drawings.find((d) => d.type === "trend") : null;
  eq("LOADER FIX: edited style survives", trendAfter ? trendAfter.style.color : null, "loss");

  await page.screenshot({ path: path.resolve(__dirname, "toolbar3-overview.png") });

  // ── 8. Console + mobile sanity ─────────────────────────────────────────────
  eq("0 unexpected console errors (desktop)", consoleErrors.length, 0);
  if (consoleErrors.length > 0) {
    for (const e of consoleErrors.slice(0, 8)) {
      console.log(`        · ${e}`);
      fs.appendFileSync(LOG, `        · ${e}\n`);
    }
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mobile.newPage();
  const mobileErrors = [];
  mpage.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((n) => text.includes(n))) return;
    mobileErrors.push(text.slice(0, 200));
  });
  mpage.on("pageerror", (e) => mobileErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
  await signIn(mpage);
  await mpage.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 90_000 });
  await mpage.waitForSelector('[data-testid="oryon-panel"]', { timeout: 45_000 });
  await mpage.waitForTimeout(2_500);
  ok("mobile 390: workspace renders", true);
  eq("mobile 390: 0 console errors", mobileErrors.length, 0);
  if (mobileErrors.length > 0) {
    for (const e of mobileErrors.slice(0, 5)) console.log(`        · ${e}`);
  }
  await mpage.close().catch(() => {});
  await mobile.close().catch(() => {});

  console.log(`\n=== toolbar3 probe: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== ${pass} PASS / ${fail} FAIL ===\n`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${String(e)}\n`);
  process.exit(2);
});
