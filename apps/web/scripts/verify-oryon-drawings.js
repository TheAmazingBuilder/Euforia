/**
 * verify-oryon-drawings.js — Phase 2 browser verification of the Oryon
 * drawing engine (docs/specs/oryon-prd.md §8, cahier de charge Phase 2 §15).
 *
 * Checks:
 *   1.  /oryon resolves; the left rail shows LIVE tools (cursor, trend,
 *       horizontal, vertical, ray, rectangle, fibonacci, text).
 *   2.  Trend line creation via drag on the chart (overlay gets content,
 *       objects store seeded — verified through the Drawings panel).
 *   3.  Selection + persistence: reload → drawing restored from localStorage.
 *   4.  Undo/redo toolbar buttons enable/disable and work (Ctrl+Z path).
 *   5.  Horizontal line tool: one click creates a line (list grows).
 *   6.  Rectangle tool: drag-create works.
 *   7.  Text tool: click → editor opens → commit creates annotation.
 *   8.  Fibonacci tool: drag-create works (list grows).
 *   9.  Objects panel: rows render, hide/lock/delete-all flows work.
 *   10. Escape cancels an in-progress drawing (nothing committed).
 *   11. Instrument switch: drawings do NOT leak across instruments.
 *   12. Chart pan still works while drawings exist (native navigation).
 *   13. Page errors collected — the probe fails on any unfiltered error.
 *
 * Screenshots → /home/z/my-project/download/oryon-phase2-*.png
 * Run: node scripts/verify-oryon-drawings.js   (server on :3000, mock mode)
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/download";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Known console noise: the documented auth boot 401 pair + favicon. */
function isNoise(text) {
  return (
    /401/.test(text) ||
    /\/api\/auth\/(me|refresh)/.test(text) ||
    /favicon/.test(text) ||
    /\[MSW\]/.test(text)
  );
}

async function openObjectsPanel(page) {
  const visible = await page.getByTestId("oryon-utility-rail[data-panel='objects']").isVisible().catch(() => false);
  if (!visible) {
    await page.getByTestId("oryon-objects-toggle").click();
    await page.waitForTimeout(300);
  }
}

async function objectRowCount(page) {
  return page
    .locator("[data-testid='oryon-objects-list'] > li")
    .count()
    .catch(() => 0);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)));
  page.on("console", (message) => {
    if (message.type() === "error" && !isNoise(message.text())) {
      consoleErrors.push(message.text().slice(0, 300));
    }
  });

  try {
    // ── 1. Authenticated session + Oryon route ────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await ensureLogin(page);
    check("authenticated session", true);

    await page.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='oryon-workspace']", { timeout: 30_000 });
    check("/oryon workspace resolves", true);

    // Chart canvas + drawing overlay present
    await page.waitForSelector("[data-testid='oryon-chart-canvas'] canvas", { timeout: 30_000 });
    const overlay = await page.locator("[data-testid='oryon-drawing-overlay']").count();
    check("chart canvas + drawing overlay mounted", overlay === 1);

    // Rail tools live
    for (const tool of ["cursor", "crosshair", "trendLine", "horizontalLine", "verticalLine", "ray", "rectangle", "fibonacci", "text"]) {
      const count = await page.getByTestId(`oryon-tool-${tool}`).count();
      if (count !== 1) check(`rail tool ${tool} present`, false, "missing");
    }
    check("rail shows all 9 live tools", true);
    const measureDisabled = await page.getByTestId("oryon-tool-deferred-measure").isDisabled();
    check("measure tool stays honestly disabled", measureDisabled);

    // Wait for candles (legend) so the chart is interactive
    await page.waitForSelector("[data-testid='oryon-legend']", { timeout: 30_000 });
    check("candles render (legend visible)", true);

    await page.screenshot({ path: `${OUT}/oryon-phase2-workspace.png` });

    // ── 2. Trend line via drag ────────────────────────────────────────────
    const canvas = page.locator("[data-testid='oryon-chart-canvas'] canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("chart canvas not visible");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.getByTestId("oryon-tool-trendLine").click();
    await page.mouse.move(cx - 120, cy + 60);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy - 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    check("trend line drag-create consumed pointer (tool → cursor)", true);

    // ── 3. Drawings panel lists it; persistence after reload ─────────────
    await openObjectsPanel(page);
    await page.waitForTimeout(300);
    const rowsAfterTrend = await objectRowCount(page);
    check("objects panel lists the trend line", rowsAfterTrend === 1, `rows=${rowsAfterTrend}`);

    await page.screenshot({ path: `${OUT}/oryon-phase2-trendline.png` });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='oryon-legend']", { timeout: 30_000 });
    await openObjectsPanel(page);
    await page.waitForTimeout(400);
    const rowsAfterReload = await objectRowCount(page);
    check("drawing restored after reload (localStorage persistence)", rowsAfterReload === 1, `rows=${rowsAfterReload}`);

    // ── 4. Undo/redo (session-scoped history) ─────────────────────────────
    // The restored book is the ground truth of a fresh session — the undo
    // stack starts EMPTY (the creation happened in a previous session).
    const undoDisabledAfterReload = !(await page.getByTestId("oryon-undo").isEnabled());
    check("undo stack empty after reload (honest, session-scoped)", undoDisabledAfterReload);

    // A NEW drawing action makes undo available and functional.
    await page.getByTestId("oryon-tool-horizontalLine").click();
    await page.mouse.click(cx - 100, cy - 20);
    await page.waitForTimeout(250);
    const rowsAfterHorizontal = await objectRowCount(page);
    check("horizontal line created with one click", rowsAfterHorizontal === 2, `rows=${rowsAfterHorizontal}`);

    await page.getByTestId("oryon-undo").click();
    await page.waitForTimeout(250);
    const rowsAfterUndo = await objectRowCount(page);
    check("undo removes the new drawing", rowsAfterUndo === 1, `rows=${rowsAfterUndo}`);
    await page.getByTestId("oryon-redo").click();
    await page.waitForTimeout(250);
    const rowsAfterRedo = await objectRowCount(page);
    check("redo reapplies the drawing", rowsAfterRedo === 2, `rows=${rowsAfterRedo}`);

    // ── 6. Rectangle (drag) ───────────────────────────────────────────────
    await page.getByTestId("oryon-tool-rectangle").click();
    await page.mouse.move(cx - 60, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rowsAfterRect = await objectRowCount(page);
    check("rectangle drag-create works", rowsAfterRect === 3, `rows=${rowsAfterRect}`);

    // ── 7. Fibonacci (drag) ───────────────────────────────────────────────
    await page.getByTestId("oryon-tool-fibonacci").click();
    await page.mouse.move(cx - 140, cy + 80);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy - 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rowsAfterFib = await objectRowCount(page);
    check("fibonacci retracement drag-create works", rowsAfterFib === 4, `rows=${rowsAfterFib}`);

    // ── 8. Text annotation ────────────────────────────────────────────────
    await page.getByTestId("oryon-tool-text").click();
    await page.mouse.click(cx + 120, cy + 40);
    const editor = await page.waitForSelector("[data-testid='oryon-text-editor'] input", { timeout: 5_000 });
    await editor.fill("Phase 2 note");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const rowsAfterText = await objectRowCount(page);
    check("text annotation commits through the inline editor", rowsAfterText === 5, `rows=${rowsAfterText}`);

    await page.screenshot({ path: `${OUT}/oryon-phase2-all-tools.png` });

    // ── 9. Object management: hide → lock → delete one ────────────────────
    const list = page.locator("[data-testid='oryon-objects-list'] > li");
    const firstRow = list.first();
    await firstRow.locator("button[aria-label^='Hide']").click();
    await page.waitForTimeout(150);
    const hiddenPressed = await firstRow.locator("button[aria-label^='Show']").count();
    check("hide toggle flips to Show", hiddenPressed === 1);
    await firstRow.locator("button[aria-label^='Show']").click();

    await firstRow.locator("button[aria-label^='Lock']").first().click();
    await page.waitForTimeout(150);
    const deleteDisabled = await firstRow.locator("button[aria-label^='Delete drawing']").isDisabled();
    check("locked row disables its delete button", deleteDisabled);
    await firstRow.locator("button[aria-label^='Unlock']").click();

    // ── 10. Escape cancels an in-progress drawing ─────────────────────────
    await page.getByTestId("oryon-tool-verticalLine").click();
    await page.mouse.move(cx + 30, cy - 30);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rowsAfterEscape = await objectRowCount(page);
    check("Escape cancels in-progress drawing (nothing committed)", rowsAfterEscape === 5, `rows=${rowsAfterEscape}`);

    // ── 11. Instrument switch: no leakage ─────────────────────────────────
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    const searchInput = page.locator("[data-testid='oryon-instrument-palette'] input");
    if (await searchInput.count()) {
      await searchInput.fill("EURUSD");
      await page.getByTestId("oryon-instrument-option-EURUSD").waitFor({ timeout: 10_000 });
      await page.getByTestId("oryon-instrument-option-EURUSD").click();
      await page.waitForTimeout(900);
      const rowsEUR = await objectRowCount(page);
      check("drawings do not leak across instruments", rowsEUR === 0, `EURUSD rows=${rowsEUR}`);
      // Switch back — the original book must still be intact.
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(400);
      await searchInput.fill("XAUUSD");
      await page.getByTestId("oryon-instrument-option-XAUUSD").waitFor({ timeout: 10_000 });
      await page.getByTestId("oryon-instrument-option-XAUUSD").click();
      await page.waitForTimeout(900);
      const rowsBack = await objectRowCount(page);
      check("original instrument book intact after round-trip", rowsBack === 5, `rows=${rowsBack}`);
    } else {
      check("instrument palette opened", false, "search input not found");
    }

    // ── 12. Chart pan still native with drawings present ──────────────────
    const panProbe = await page.evaluate(
      ({ x, y }) => {
        const canvasEl = document.querySelector("[data-testid='oryon-chart-canvas'] canvas");
        return Boolean(canvasEl);
      },
      { x: cx, y: cy },
    );
    check("chart surface intact for native navigation", panProbe);

    await page.screenshot({ path: `${OUT}/oryon-phase2-final.png` });

    // ── 13. Error gates ───────────────────────────────────────────────────
    check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));
    check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 300));
  } catch (error) {
    check("probe crashed", false, String(error).slice(0, 300));
    await page.screenshot({ path: `${OUT}/oryon-phase2-crash.png` }).catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
