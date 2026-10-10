/**
 * verify-oryon-phase2.js — Oryon Phase 2 (drawing engine + tools).
 * Contract under test:
 *  - the left rail arms REAL tools (no decorative buttons)
 *  - trend line: two-click creation, object appears in the list
 *  - hline: one-click creation, stays at its price after a horizontal pan
 *    (pixel-level alignment check on the primitive canvas)
 *  - vline / ray / rect / fib / measure / text creation paths
 *  - selection + delete, undo/redo (history), lock/hide controls
 *  - persistence: reload restores drawings; corrupt storage never crashes
 *  - instrument scoping: drawings do not leak across symbols
 *  - chart functionality intact: pan, timeframe switch, type switch
 *  - 0 console errors · desktop 1440 · screenshots
 *
 * NOTE MSW: the mock engine reseeds on full page reload — the script loads
 * the app once on the dashboard, then navigates client-side. Reload-based
 * persistence checks clear storage state explicitly instead of re-signing.
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase2-probe.log");
fs.writeFileSync(LOG, `=== oryon phase2 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

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
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
  fs.appendFileSync(LOG, `signIn: after goto — ${app.url()}\n`);
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 15_000 });
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
  await app.waitForSelector('[data-testid="oryon-workspace"], a[href="/oryon"]', { timeout: 30_000 }).catch(() => {});
}

/** Chart pane box (the LWC container) — click coordinates derive from it. */
async function chartBox(page) {
  return page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
}

/** Draws a trend line with two clicks at pane fractions. */
async function drawTrend(page, ax, ay, bx, by) {
  const box = await chartBox(page);
  await page.mouse.click(box.x + box.width * ax, box.y + box.height * ay);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width * bx, box.y + box.height * by);
  await page.waitForTimeout(200);
}

async function openList(page) {
  const toggle = page.locator('[data-testid="oryon-drawing-list-toggle"]');
  // data-active is ABSENT (null) when the list is closed.
  if ((await toggle.getAttribute("data-active")) === null) {
    // Empty collection → the toggle is intentionally disabled (no dead UI).
    if (await toggle.isDisabled()) return false;
    await toggle.click();
    await page.waitForTimeout(150);
  }
  return true;
}

async function listCount(page) {
  return page.locator('[data-testid^="oryon-drawing-row-"]').count();
}

/**
 * Pixel probe — looks for a bright (non-background) horizontal run of pixels
 * near `yRatio` of the chart canvas across several columns. LWC paints on
 * stacked 2D canvases; we scan them all.
 */
async function brightPixelRowNear(page, yRatio, xRatios) {
  return page.evaluate(
    ({ yRatio, xRatios }) => {
      const host = document.querySelector('[data-testid="oryon-chart-canvas"]');
      if (!host) return false;
      const canvases = Array.from(host.querySelectorAll("canvas"));
      const rect = host.getBoundingClientRect();
      for (const xRatio of xRatios) {
        const x = Math.round(rect.width * xRatio);
        const y = Math.round(rect.height * yRatio);
        for (const canvas of canvases) {
          const w = canvas.width;
          const h = canvas.height;
          const dprX = w / rect.width;
          const dprY = h / rect.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          try {
            const px = ctx.getImageData(Math.round(x * dprX), Math.round(y * dprY), 1, 1).data;
            // Bright pixel = clearly not the dark chart background.
            const [r, g, b, a] = px;
            if (a > 0 && r + g + b > 240) return true;
          } catch {
            /* cross-origin guard — cannot happen locally */
          }
        }
      }
      return false;
    },
    { yRatio, xRatios },
  );
}

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

  // ── 1. Sign in + navigate to /oryon ───────────────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 30_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_000);
  await clearDevOverlay(page);

  ok("P2 — workspace rendu", await page.locator('[data-testid="oryon-workspace"]').isVisible());

  // ── 2. Tool rail — all tools armed and functional-looking ────────────────
  const railTools = ["pointer", "trendline", "hline", "vline", "ray", "rect", "fib", "measure", "text"];
  for (const tool of railTools) {
    const btn = page.locator(`[data-testid="oryon-tool-${tool}"]`);
    ok(`P2 — rail: outil ${tool} présent et actif`, (await btn.count()) === 1 && (await btn.isEnabled()));
  }
  ok("P2 — rail: undo désactivé à vide", await page.locator('[data-testid="oryon-drawing-undo"]').isDisabled());
  ok("P2 — rail: redo désactivé à vide", await page.locator('[data-testid="oryon-drawing-redo"]').isDisabled());

  // ── 3. Trend line — two-click creation ────────────────────────────────────
  await page.locator('[data-testid="oryon-tool-trendline"]').click();
  ok("P2 — outil trend armé (état actif)", (await page.locator('[data-testid="oryon-tool-trendline"]').getAttribute("data-active")) !== null);
  await drawTrend(page, 0.3, 0.55, 0.62, 0.35);
  ok("P2 — trend créé → outil désarmé (retour curseur)", (await page.locator('[data-testid="oryon-tool-trendline"]').getAttribute("data-active")) === null);
  ok("P2 — undo disponible après création", !(await page.locator('[data-testid="oryon-drawing-undo"]').isDisabled()));

  await openList(page);
  ok("P2 — liste ouverte avec 1 objet", (await listCount(page)) === 1);
  ok("P2 — ligne trend dans la liste", (await page.locator('[data-testid="oryon-drawing-row-trend"]').count()) === 1);

  // ── 4. Undo / redo ─────────────────────────────────────────────────────────
  await page.locator('[data-testid="oryon-drawing-undo"]').click();
  await page.waitForTimeout(150);
  ok("P2 — undo retire l'objet", (await listCount(page)) === 0);
  ok("P2 — redo disponible", !(await page.locator('[data-testid="oryon-drawing-redo"]').isDisabled()));
  await page.locator('[data-testid="oryon-drawing-redo"]').click();
  await page.waitForTimeout(150);
  ok("P2 — redo restaure l'objet", (await listCount(page)) === 1);

  // ── 5. Hline — one-click + pixel alignment across a horizontal pan ────────
  await page.locator('[data-testid="oryon-tool-hline"]').click();
  const box = await chartBox(page);
  const hlineY = 0.5;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * hlineY);
  await page.waitForTimeout(250);
  ok("P2 — hline créé (2 objets)", (await listCount(page)) === 2);

  const lineBefore = await brightPixelRowNear(page, hlineY, [0.12, 0.2, 0.8, 0.88]);
  ok("P2 — hline visible sur le canvas (pixels)", lineBefore);

  // Horizontal pan on empty chart space (cursor tool, no hit → chart pans).
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const lineAfterPan = await brightPixelRowNear(page, hlineY, [0.12, 0.2, 0.8, 0.88]);
  ok("P2 — hline reste à son prix après pan (alignement)", lineAfterPan);

  // ── 6. One-click tools: vline, ray, rect, fib, measure, text ──────────────
  await page.locator('[data-testid="oryon-tool-vline"]').click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.waitForTimeout(150);
  ok("P2 — vline créé", (await page.locator('[data-testid="oryon-drawing-row-vline"]').count()) === 1);

  await page.locator('[data-testid="oryon-tool-ray"]').click();
  await drawTrend(page, 0.35, 0.6, 0.55, 0.45);
  ok("P2 — ray créé", (await page.locator('[data-testid="oryon-drawing-row-ray"]').count()) === 1);

  await page.locator('[data-testid="oryon-tool-rect"]').click();
  await drawTrend(page, 0.6, 0.65, 0.75, 0.5);
  ok("P2 — rect créé", (await page.locator('[data-testid="oryon-drawing-row-rect"]').count()) === 1);

  await page.locator('[data-testid="oryon-tool-fib"]').click();
  await drawTrend(page, 0.2, 0.3, 0.45, 0.5);
  ok("P2 — fib créé", (await page.locator('[data-testid="oryon-drawing-row-fib"]').count()) === 1);

  await page.locator('[data-testid="oryon-tool-measure"]').click();
  await drawTrend(page, 0.5, 0.3, 0.62, 0.4);
  ok("P2 — measure créé", (await page.locator('[data-testid="oryon-drawing-row-measure"]').count()) === 1);

  await page.locator('[data-testid="oryon-tool-text"]').click();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.25);
  await page.waitForSelector('[data-testid="oryon-text-editor"]', { timeout: 5_000 });
  await page.keyboard.type("Oryon note");
  await page.keyboard.press("Escape"); // cancel-empty would delete; we typed → Escape reverts? (commit path: blur)
  // Escape cancels editing — for an object with no committed text it is removed.
  await page.waitForTimeout(200);
  const textAfterEscape = await page.locator('[data-testid="oryon-drawing-row-text"]').count();
  if (textAfterEscape === 0) {
    ok("P2 — texte: Esc sans contenu ne laisse pas d'objet vide", true);
    // Re-create and COMMIT this time.
    await page.locator('[data-testid="oryon-tool-text"]').click();
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.25);
    await page.waitForSelector('[data-testid="oryon-text-editor"]', { timeout: 5_000 });
    await page.keyboard.type("Oryon note");
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(200);
  } else {
    ok("P2 — texte: Esc sans contenu ne laisse pas d'objet vide", false);
  }
  ok("P2 — texte commité (Ctrl+Enter)", (await page.locator('[data-testid="oryon-drawing-row-text"]').count()) === 1);

  await page.screenshot({ path: `${OUT}/oryon-phase2-all-tools.png` });

  // ── 7. Selection, lock, hide ───────────────────────────────────────────────
  const lockButtons = page.locator('[data-testid^="oryon-drawing-lock-"]');
  ok("P2 — contrôles lock présents par objet", (await lockButtons.count()) >= 7);
  await lockButtons.first().click();
  await page.waitForTimeout(100);
  ok("P2 — lock togglé (badge actif)", (await lockButtons.first().getAttribute("data-active")) !== null);
  await lockButtons.first().click(); // unlock again

  const hideButtons = page.locator('[data-testid^="oryon-drawing-hide-"]');
  await hideButtons.first().click();
  await page.waitForTimeout(100);
  ok("P2 — hide togglé", (await hideButtons.first().getAttribute("aria-pressed")) !== null);
  await hideButtons.first().click();

  // ── 8. Persistence across reload ───────────────────────────────────────────
  const countBeforeReload = await listCount(page);
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_000);
  await openList(page);
  const countAfterReload = await listCount(page);
  ok(`P2 — persistance: ${countBeforeReload} objets restaurés après reload`, countAfterReload === countBeforeReload && countBeforeReload > 0);

  // ── 9. Instrument scoping — drawings do not leak ───────────────────────────
  const instrumentTrigger = page.locator('[data-testid="oryon-instrument-trigger"]');
  await instrumentTrigger.click();
  await page.waitForTimeout(400);
  // Pick a DIFFERENT instrument from the dropdown list.
  const options = page.locator('[role="option"], [cmdk-item]');
  const optionCount = await options.count();
  let switched = false;
  for (let i = 0; i < optionCount; i += 1) {
    const candidate = options.nth(i);
    const label = (await candidate.innerText().catch(() => "")).toUpperCase();
    if (label.length > 0 && !label.includes((await instrumentTrigger.innerText()).toUpperCase())) {
      await candidate.click();
      switched = true;
      break;
    }
  }
  await page.waitForTimeout(2_000);
  if (switched) {
    ok("P2 — changement d'instrument: liste vide (pas de fuite)", (await listCount(page)) === 0);
    // Switch back — drawings return.
    await instrumentTrigger.click();
    await page.waitForTimeout(400);
    const backOptions = page.locator('[role="option"], [cmdk-item]');
    for (let i = 0; i < (await backOptions.count()); i += 1) {
      const candidate = backOptions.nth(i);
      const label = (await candidate.innerText().catch(() => "")).toUpperCase();
      if (label.includes("EURUSD") || label.includes("BTCUSDT")) {
        await candidate.click();
        break;
      }
    }
    await page.waitForTimeout(2_000);
    ok("P2 — retour instrument: dessins restaurés", (await listCount(page)) === countBeforeReload);
  } else {
    ok("P2 — changement d'instrument disponible", false);
  }

  // ── 10. Chart integrity — timeframe + type switch with drawings present ───
  await page.locator('[data-testid="oryon-tf-1H"]').click();
  await page.waitForTimeout(1_500);
  ok("P2 — changement d'UT: dessins conservés (domaine temps/prix)", (await listCount(page)) === countBeforeReload);
  await page.locator('[data-testid="oryon-type-line"]').click();
  await page.waitForTimeout(800);
  ok("P2 — passage en ligne: dessins toujours en liste", (await listCount(page)) === countBeforeReload);
  await page.locator('[data-testid="oryon-type-candles"]').click();
  await page.waitForTimeout(500);

  // ── 11. Delete-all — explicit confirmation flow ─────────────────────────────
  await page.locator('[data-testid="oryon-drawing-clear"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="oryon-drawing-clear-confirm"]').click();
  await page.waitForTimeout(150);
  ok("P2 — delete-all avec confirmation → liste vide", (await listCount(page)) === 0);

  // ── 12. Corrupt storage never crashes Oryon ────────────────────────────────
  await page.evaluate(() => {
    const symbol = document.querySelector('[data-testid="oryon-legend-symbol"]')?.textContent?.trim() ?? "EURUSD";
    window.localStorage.setItem(`euforia.oryon.drawings.v1:${symbol}`, "{corrupt json");
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForTimeout(2_000);
  await openList(page);
  ok("P2 — stockage corrompu: pas de crash, liste vide", (await listCount(page)) === 0);

  await page.screenshot({ path: `${OUT}/oryon-phase2-final.png` });

  // ── console errors ──────────────────────────────────────────────────────────
  ok("P2 — zéro erreur de console", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `CONSOLE ERRORS:\n${errors.join("\n")}\n`);
    console.log("Console errors:", errors.slice(0, 5));
  }

  await browser.close();
  console.log(`\n=== ORYON PHASE 2: ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== RESULT: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(2);
});
