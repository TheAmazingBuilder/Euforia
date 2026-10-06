/**
 * Import & Recognition probe — PROMPT 3 definition-of-done walkthrough
 * (spec §75): open → upload → configure → processing → result → edit →
 * draft → confirm → success → history, plus the FAILED and CANCEL paths,
 * responsive captures and a zero-pageerror guarantee.
 *
 * Run: node scripts/verify-recognition.js  (server on :3000, mock mode)
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

/** Draw a fake MT5 screenshot in the page and return PNG bytes. */
async function makeScreenshotPng(page, width = 1280, height = 720, withText = true) {
  const dataUrl = await page.evaluate(
    ([w, h, text]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0E1116";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#141920";
      ctx.fillRect(0, 0, w, 28);
      ctx.strokeStyle = "#262E3A";
      for (let x = 20; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 34);
        ctx.lineTo(x, h - 10);
        ctx.stroke();
      }
      if (text) {
        ctx.fillStyle = "#E9ECEF";
        ctx.font = "20px monospace";
        ctx.fillText("Trade  Symbol     Volume   Entry      S/L        T/P        Profit", 24, 64);
        ctx.fillText("#4213  XAUUSD     0.10     2645.32    2638.50    2660.00    +146.80", 24, 96);
      }
      return canvas.toDataURL("image/png");
    },
    [width, height, withText],
  );
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    // ── 1. Login ───────────────────────────────────────────────────────────
    console.log("\n[1] Login");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.fill('input[type="email"]', "trader@cosmoz.app");
    await page.fill('input[type="password"]', "cosmoz-demo-2026");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await check("login succeeded", !page.url().includes("/login"), page.url());

    // ── 2. Overview ────────────────────────────────────────────────────────
    console.log("\n[2] Overview (Insights placement)");
    await page.goto(`${BASE}/recognition`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);
    await check("overview renders", await page.locator('[data-testid="recognition-overview"]').isVisible().catch(() => false));
    await check("seeded stats visible", (await page.locator(".stat-cell").count()) === 4);
    await check("recent imports populated", (await page.locator('[data-testid="recognition-recent-item"]').count()) >= 3);
    await page.screenshot({ path: "scripts/shots/recognition-overview.png", fullPage: true });

    // ── 3. History (seeded) ────────────────────────────────────────────────
    console.log("\n[3] History");
    await page.click('[data-testid="recognition-tab-history"]');
    await page.waitForTimeout(1000);
    await check("history table rows", (await page.locator('[data-testid="recognition-history-row"]').count()) >= 5);
    await page.click('[data-testid="recognition-filter-failed"]');
    await page.waitForTimeout(400);
    const failedRows = await page.locator('[data-testid="recognition-history-row"][data-status="FAILED"]').count();
    const otherRows = await page.locator('[data-testid="recognition-history-row"]:not([data-status="FAILED"])').count();
    await check("failed filter isolates FAILED", failedRows >= 1 && otherRows === 0, `${failedRows} failed / ${otherRows} other`);
    await page.click('[data-testid="recognition-filter-all"]');
    await page.screenshot({ path: "scripts/shots/recognition-history.png", fullPage: true });

    // ── 4. Upload → configure ──────────────────────────────────────────────
    console.log("\n[4] Upload → configure");
    await page.click('[data-testid="recognition-tab-overview"]');
    await page.waitForTimeout(600);
    const png = await makeScreenshotPng(page);
    await page.setInputFiles('input[type="file"]', { name: "xauusd-mt5.png", mimeType: "image/png", buffer: png });
    await page.waitForTimeout(600);
    await check("configure step shows preview", await page.locator('[data-testid="recognition-preview-image"]').isVisible().catch(() => false));
    await check("settings visible", await page.locator('[data-testid="recognition-settings"]').isVisible().catch(() => false));
    await check("future modes disabled", (await page.locator('[data-testid="recognition-settings"] [aria-disabled="true"]').count()) === 2);
    await page.screenshot({ path: "scripts/shots/recognition-configure.png", fullPage: true });

    // ── 5. Processing → result ─────────────────────────────────────────────
    console.log("\n[5] Processing");
    await page.click('[data-testid="recognition-start"]');
    await page.waitForTimeout(700);
    const stageActive = await page.locator('[data-testid="recognition-progress"] [data-state="active"]').count();
    await check("staged progress active", stageActive === 1, `stage elements: ${stageActive}`);
    await page.screenshot({ path: "scripts/shots/recognition-processing.png", fullPage: true });
    await page.waitForSelector('[data-testid="recognition-result"]', { timeout: 15000 });
    await check("result reached", true);
    await check("fields rendered", (await page.locator('[data-testid="recognition-result"] [data-testid^="recognition-field-"]').count()) === 10);
    await check("confidence badges", (await page.locator('[data-testid="recognition-confidence"]').count()) >= 8);
    await page.screenshot({ path: "scripts/shots/recognition-result.png", fullPage: true });

    // ── 6. Inline field edit ───────────────────────────────────────────────
    console.log("\n[6] Field review & edit");
    await page.click('[data-testid="recognition-edit-symbol"]');
    await page.fill('[data-testid="recognition-input-symbol"]', "eurusd");
    await page.click('[data-testid="recognition-save-field"]');
    await page.waitForTimeout(400);
    const symbolText = await page.locator('[data-testid="recognition-field-symbol"]').innerText();
    await check("edited value applied (normalized)", /EURUSD/.test(symbolText), symbolText.split("\n")[1] ?? "");
    await page.click('[data-testid="recognition-edit-volume"]');
    await page.fill('[data-testid="recognition-input-volume"]', "-2");
    await page.click('[data-testid="recognition-save-field"]');
    await page.waitForTimeout(300);
    await check("invalid volume rejected", await page.locator('[data-testid="recognition-field-volume"] [role="alert"]').isVisible().catch(() => false));
    await page.fill('[data-testid="recognition-input-volume"]', "0.15");
    await page.click('[data-testid="recognition-save-field"]');
    await page.waitForTimeout(300);

    // ── 7. Draft review → confirm → success ────────────────────────────────
    console.log("\n[7] Trade draft → confirm");
    await page.click('[data-testid="recognition-review-draft"]');
    await page.waitForTimeout(500);
    await check("draft sections render", (await page.locator('[data-testid="recognition-draft"] [data-testid^="draft-"]').count()) >= 9);
    await check("risk/reward computed", /[0-9]/.test(await page.locator('[data-testid="draft-risk-reward"]').innerText()));
    await page.screenshot({ path: "scripts/shots/recognition-draft.png", fullPage: true });
    await page.click('[data-testid="recognition-confirm"]');
    await page.waitForSelector('[data-testid="recognition-success"]', { timeout: 10000 });
    await check("success state reached", true);
    await page.screenshot({ path: "scripts/shots/recognition-success.png", fullPage: true });

    // ── 8. History reflects the confirmation ───────────────────────────────
    console.log("\n[8] History after confirm");
    await page.click('[data-testid="recognition-tab-history"]');
    await page.waitForTimeout(800);
    await page.click('[data-testid="recognition-filter-confirmed"]');
    await page.waitForTimeout(400);
    await check("confirmed import in history", (await page.locator('[data-testid="recognition-history-row"][data-status="CONFIRMED"]').count()) >= 3);

    // ── 9. Failure path (tiny image) ───────────────────────────────────────
    console.log("\n[9] Failure path");
    await page.click('[data-testid="recognition-tab-overview"]');
    await page.waitForTimeout(600);
    const tiny = await makeScreenshotPng(page, 120, 80, false);
    await page.setInputFiles('input[type="file"]', { name: "tiny-crop.png", mimeType: "image/png", buffer: tiny });
    await page.waitForTimeout(500);
    await page.click('[data-testid="recognition-start"]');
    await page.waitForSelector('[data-testid="recognition-failed"]', { timeout: 10000 });
    await check("failed state with retry", await page.locator('[data-testid="recognition-retry"]').isVisible().catch(() => false));
    await page.screenshot({ path: "scripts/shots/recognition-failed.png" });
    await page.click('[data-testid="recognition-tab-history"]');
    await page.waitForTimeout(600);
    await page.click('[data-testid="recognition-filter-failed"]');
    await page.waitForTimeout(300);
    await check("failed job in history", (await page.locator('[data-testid="recognition-history-row"][data-status="FAILED"]').count()) >= 2);

    // ── 10. Cancel path ────────────────────────────────────────────────────
    console.log("\n[10] Cancel path");
    await page.click('[data-testid="recognition-tab-overview"]');
    await page.waitForTimeout(600);
    const second = await makeScreenshotPng(page);
    await page.setInputFiles('input[type="file"]', { name: "eurusd-mt5.png", mimeType: "image/png", buffer: second });
    await page.waitForTimeout(500);
    await page.click('[data-testid="recognition-start"]');
    await page.waitForSelector('[data-testid="recognition-progress"]', { timeout: 5000 });
    await page.click('[data-testid="recognition-cancel"]');
    await page.waitForTimeout(2600);
    await check("cancel returns to overview", await page.locator('[data-testid="recognition-overview"]').isVisible().catch(() => false));

    // ── 11. Responsive captures ────────────────────────────────────────────
    console.log("\n[11] Responsive captures");
    // Fresh pages carry NO session — log in on each before capturing (§59).
    async function captureViewport(width, height, prefix) {
      const vp = await browser.newPage({ viewport: { width, height } });
      await vp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await vp.waitForTimeout(1200);
      await vp.fill('input[type="email"]', "trader@cosmoz.app");
      await vp.fill('input[type="password"]', "cosmoz-demo-2026");
      await vp.click('button[type="submit"]');
      await vp.waitForTimeout(2500);
      await vp.goto(`${BASE}/recognition`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await vp.waitForTimeout(2200);
      await vp.screenshot({ path: `scripts/shots/${prefix}-overview.png`, fullPage: true });
      await vp.click('[data-testid="recognition-tab-history"]');
      await vp.waitForTimeout(1200);
      await vp.screenshot({ path: `scripts/shots/${prefix}-history.png`, fullPage: true });
      await vp.close();
      return prefix;
    }
    await captureViewport(820, 1180, "recognition-tablet");
    await captureViewport(390, 844, "recognition-mobile");
    ok("tablet + mobile captures saved (overview + history)");

    // ── 12. Page errors ────────────────────────────────────────────────────
    console.log("\n[12] Console integrity");
    await check("zero pageerrors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  } catch (error) {
    bad(`probe crashed: ${error.message}`);
    await page.screenshot({ path: "scripts/shots/recognition-crash.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\nRESULT: ${passed} passed, ${failedCount} failed, pageerrors=${pageErrors.length}`);
  process.exit(failedCount === 0 && pageErrors.length === 0 ? 0 : 1);
})();
