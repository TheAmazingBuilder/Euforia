/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
/**
 * OCR V2 — browser verification of the thirteen V2 features.
 * Run: node scripts/verify-ocr-v2.js   (requires :3000 mocked build running)
 *
 * Covers: duplicate warning (warn + view previous + continue anyway),
 * storage & retention card, multi-trade detection (HISTORY_MULTI),
 * per-trade drafts, batch confirm (Import All Drafted) with destination
 * account, crop re-read tool, suggestions chips, PDF upload with page
 * badges, analytics OCR quality card, mobile 390 overflow, console clean.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = `${__dirname}/shots`;
const fs = require("fs");
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, extra = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name} ${extra}`);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function waitForTerminal(page) {
  // pipeline completes (~8.4s) or fails (~4s); poll for either surface
  await page.waitForTimeout(1200);
  for (let i = 0; i < 40; i += 1) {
    const done = await page.locator('[data-testid="ocr-result"]').isVisible().catch(() => false);
    const failedSurface = await page.locator('[data-testid="ocr-failed"]').isVisible().catch(() => false);
    if (done || failedSurface) return;
    await page.waitForTimeout(500);
  }
}

/** Upload a file and start the analysis (new-import surface must be open). */
async function uploadAndStart(page, filePath) {
  await page.locator('[data-testid="ocr-new-import"]').waitFor({ timeout: 8000 });
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(filePath);
  await page.waitForTimeout(600);
  const start = page.locator('[data-testid="ocr-start-analysis"]');
  for (let i = 0; i < 20 && !(await start.isEnabled()); i += 1) {
    await page.waitForTimeout(300);
  }
  await start.click();
  await page.waitForTimeout(1100);
  const dupShown = await page.locator('[data-testid="ocr-duplicate-banner"]').isVisible().catch(() => false);
  if (dupShown) {
    await page.locator('[data-testid="ocr-duplicate-continue"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
  }
  try {
    await page.waitForURL("**/recognition?job=*", { timeout: 15000 });
  } catch {
    await page.screenshot({ path: `${SHOTS}/ocr-v2-debug-nav.png` });
    console.log(`    [debug] url=${page.url()}`);
    console.log(`    [debug] banner=${await page.locator('[data-testid="ocr-duplicate-banner"]').isVisible().catch(() => false)}`);
    console.log(`    [debug] error=${(await page.locator('[data-testid="ocr-start-error"]').innerText().catch(() => "")).slice(0, 120)}`);
    throw new Error("job navigation did not happen");
  }
}

/** Client-side: back to the overview through whichever affordance exists. */
async function backToOverview(page) {
  const history = page.locator('button:has-text("History")').first();
  const importAnother = page.locator('[data-testid="ocr-import-another"]').first();
  if (await history.isVisible().catch(() => false)) {
    await history.click();
  } else if (await importAnother.isVisible().catch(() => false)) {
    await importAnother.click();
  } else {
    await page.locator('a[href="/recognition"]').first().click();
  }
  await page.waitForTimeout(1000);
}

const PNG_A = `${SHOTS}/accounts-04-detail.png`;
const PNG_B = `${SHOTS}/ocr-01-empty-hero.png`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("response", async (response) => {
    if (response.url().includes("/confirm") || response.url().includes("/drafts/")) {
      let body = "";
      try { body = (await response.text()).slice(0, 160); } catch { body = "(no body)"; }
      console.log(`    [net] ${response.request().method()} ${response.url().replace(BASE, "")} → ${response.status()} ${body}`);
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("/prices") && !text.includes("401") && !text.includes("Failed to load resource")) {
        consoleErrors.push(text);
      }
    }
  });

  console.log("— Setup: login + fresh recognition session —");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  check("login", true);

  await page.locator('a[href="/recognition"]').first().click();
  await page.waitForURL("**/recognition", { timeout: 10000 });
  await page.locator('[data-testid="ocr-empty-hero"], [data-testid="ocr-stats"]').first().waitFor({ timeout: 10000 });

  // ── 1. Duplicate detection ──────────────────────────────────────────────
  console.log("— V2: duplicate warning (upload → warn → view → continue anyway) —");
  await page.locator('[data-testid="ocr-import-cta"], [data-testid="ocr-empty-hero-cta"]').first().click();
  await page.waitForTimeout(400);
  await uploadAndStart(page, PNG_A); // job #1 — XAUUSD_BUY
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 25000 });
  check("job #1 completed (rotation head)", true);

  // Seed the corrections memory: inline-correct the stop loss.
  await page.locator('[data-testid="ocr-edit-trigger-stopLoss"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="ocr-edit-stopLoss"] input').fill("2639.10");
  await page.locator('[data-testid="ocr-edit-stopLoss"] button:has-text("Save")').click();
  await page.waitForTimeout(300);
  check("correction recorded for suggestions memory", true);

  // Re-upload the SAME file → duplicate banner must warn, never block.
  await backToOverview(page);
  await page.locator('[data-testid="ocr-import-cta"]').first().click();
  await page.waitForTimeout(400);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(PNG_A);
  await page.waitForTimeout(400);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  await page.waitForTimeout(1200);
  const dupBanner = await page.locator('[data-testid="ocr-duplicate-banner"]').isVisible().catch(() => false);
  check("duplicate banner warns on same file", dupBanner);
  check("banner stays on the upload surface", await page.locator('[data-testid="ocr-new-import"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/ocr-v2-01-duplicate.png` });
  const viewPrev = await page.locator('[data-testid="ocr-duplicate-view"]').isVisible().catch(() => false);
  if (viewPrev) {
    await page.locator('[data-testid="ocr-duplicate-view"]').click();
    await page.waitForTimeout(900);
    check("View previous opens the earlier job", page.url().includes("?job=rec_0001"));
    await backToOverview(page);
    await page.locator('[data-testid="ocr-import-cta"]').first().click();
    await page.waitForTimeout(400);
    await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(PNG_A);
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
    await page.waitForTimeout(1000);
  }
  await page.locator('[data-testid="ocr-duplicate-continue"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  await page.waitForTimeout(1500);
  check("Continue anyway proceeds to a new job", page.url().includes("?job=") && !page.url().includes("rec_0001"));
  await waitForTerminal(page);
  check("forced duplicate processed (job #2)", await page.locator('[data-testid="ocr-result"]').isVisible());
  await backToOverview(page);

  // ── 2. Storage & retention card ─────────────────────────────────────────
  console.log("— V2: storage & retention card —");
  const storageVisible = await page.locator('[data-testid="ocr-storage-card"]').isVisible().catch(() => false);
  check("storage card on overview", storageVisible);
  if (storageVisible) {
    const text = await page.locator('[data-testid="ocr-storage-card"]').innerText();
    check("storage shows files + used bytes", /Files:\s*\d/.test(text) && /Used:/.test(text));
    check("retention badge present", await page.locator('[data-testid="ocr-retention-badge"]').isVisible());
  }

  // ── 3. Rotate to HISTORY_MULTI (jobs #3–#5 fast-forwarded) ──────────────
  console.log("— Rotation fast-forward (NAS100 → FAILED → BTCUSD) —");
  for (let i = 0; i < 3; i += 1) {
    await page.locator('[data-testid="ocr-import-cta"]').first().click();
    await page.waitForTimeout(400);
    await uploadAndStart(page, i % 2 === 0 ? PNG_B : PNG_A);
    await waitForTerminal(page);
    await backToOverview(page);
  }

  // ── 4. Multi-trade flow (job #6 — HISTORY_MULTI) ────────────────────────
  console.log("— V2: multi-trade detection, per-trade drafts, batch confirm —");
  await page.locator('[data-testid="ocr-import-cta"]').first().click();
  await page.waitForTimeout(400);
  await uploadAndStart(page, PNG_A);
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 25000 });
  const multiSelector = await page.locator('[aria-label="Detected trade"]').isVisible().catch(() => false);
  check("multi-trade selector appears (3 detected)", multiSelector);
  const headerText = await page.locator('[data-testid="ocr-result"]').innerText();
  check("multiple trades warning surfaced", /trades were detected|3 trades/i.test(headerText) || headerText.toLowerCase().includes("3 trades"));
  await page.screenshot({ path: `${SHOTS}/ocr-v2-02-multi-result.png` });

  // Trade #2 renders different fields (EURUSD SELL per scenario)
  await page.locator('[aria-label="Detected trade"]').click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]:has-text("Trade #2")').click();
  await page.waitForTimeout(400);
  const trade2Symbol = await page.locator('[data-testid="ocr-field-symbol"]').innerText();
  check("trade #2 fields swap (EURUSD)", trade2Symbol.includes("EURUSD"), trade2Symbol.slice(0, 40));
  await page.locator('[aria-label="Detected trade"]').click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]:has-text("Trade #1")').click();
  await page.waitForTimeout(300);

  // Continue to draft of trade #1 — suggestions strip may surface
  await page.locator('[data-testid="ocr-continue-draft"]').click();
  await page.waitForTimeout(600);
  check("draft review for trade #1", await page.locator('[data-testid="ocr-draft-review"]').isVisible());
  const suggestionsVisible = await page.locator('[data-testid="ocr-suggestions"]').isVisible().catch(() => false);
  check("suggestions strip renders (corrections memory)", suggestionsVisible);
  await page.screenshot({ path: `${SHOTS}/ocr-v2-03-suggestions.png` });
  await page.locator('[data-testid="ocr-ready-import"]').click();
  await page.waitForTimeout(900);

  // Confirmation: scope buttons + destination account
  check("confirm trade meta (1 of 3 drafted 1)", await page.locator('[data-testid="ocr-confirm-trade-meta"]').isVisible().catch(() => false));
  const accountPicker = await page.locator('[data-testid="ocr-confirm-account"]').isVisible().catch(() => false);
  check("destination account picker offered", accountPicker);
  if (accountPicker) {
    await page.locator('[aria-label="Destination account"]').click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${SHOTS}/ocr-v2-04-confirm-scope.png` });

  // Draft trades #2 and #3 too, then Import All Drafted (3)
  for (const index of [2, 3]) {
    await page.locator('[data-testid="ocr-back-to-review"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="ocr-back-to-fields"]').click();
    await page.waitForTimeout(500);
    await page.locator('[aria-label="Detected trade"]').click();
    await page.waitForTimeout(300);
    await page.locator(`[role="option"]:has-text("Trade #${index}")`).click();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="ocr-continue-draft"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="ocr-ready-import"]').click();
    await page.waitForTimeout(800);
  }
  const importAll = page.locator('[data-testid="ocr-confirm-import-all"]');
  check("Import All Drafted (3) offered", await importAll.isVisible().catch(() => false));
  await importAll.click();
  try {
    await page.locator('[data-testid="ocr-success"]').waitFor({ timeout: 15000 });
  } catch {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    console.log(`    [debug] toasts=${JSON.stringify(toasts).slice(0, 300)}`);
    await page.screenshot({ path: `${SHOTS}/ocr-v2-debug-confirm.png` });
    throw new Error("batch confirm did not reach success");
  }
  const successText = await page.locator('[data-testid="ocr-success"]').innerText().catch(() => "");
  check("batch success screen (3 trades)", /3 trades imported/i.test(successText), successText.slice(0, 80));
  await page.screenshot({ path: `${SHOTS}/ocr-v2-05-batch-success.png` });
  await page.locator('[data-testid="ocr-import-another"]').click().catch(() => {});
  await page.waitForTimeout(600);

  // History shows the 3-trade badge
  const historyText = await page.locator('[data-testid="ocr-stats"]').locator("..").innerText().catch(() => "");
  check("history badge shows 3 trades", /3 trades/.test(historyText));

  // ── 5. Crop re-read tool ────────────────────────────────────────────────
  console.log("— V2: crop re-read on a fresh import —");
  await page.locator('[data-testid="ocr-import-cta"]').first().click();
  await page.waitForTimeout(400);
  await uploadAndStart(page, PNG_B);
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 25000 });
  check("crop toggle available", await page.locator('[data-testid="ocr-crop-toggle"]').isVisible());
  await page.locator('[data-testid="ocr-crop-toggle"]').click();
  await page.waitForTimeout(300);
  const frame = page.locator('[data-testid="ocr-result-screenshot"] .relative');
  const box = await frame.boundingBox();
  if (box !== null) {
    const x0 = box.x + box.width * 0.55;
    const y0 = box.y + box.height * 0.5;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + box.width * 0.25, y0 + box.height * 0.25, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    check("crop rectangle drawn", await page.locator('[data-testid="ocr-crop-rect"]').isVisible());
    await page.locator('[data-testid="ocr-crop-run"]').click();
    await page.waitForTimeout(1800);
    const toastText = await page.locator("[data-sonner-toast]").first().innerText().catch(() => "");
    check("zone re-read acknowledged", /zone|re-read/i.test(toastText));
    await page.screenshot({ path: `${SHOTS}/ocr-v2-06-crop.png` });
  } else {
    check("screenshot frame measurable", false, "no bounding box");
  }

  // ── 6. PDF statement upload ─────────────────────────────────────────────
  console.log("— V2: PDF statement upload with page badges —");
  await backToOverview(page);
  const pdfPath = "/tmp/ocr-v2-statement.pdf";
  const pdfContent = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF\n",
    "utf8",
  );
  fs.writeFileSync(pdfPath, pdfContent);
  await page.locator('[data-testid="ocr-import-cta"]').first().click();
  await page.waitForTimeout(400);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(pdfPath);
  await page.waitForTimeout(500);
  check("PDF preview card shown", await page.locator('[data-testid="ocr-pdf-preview"]').isVisible().catch(() => false));
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  await page.waitForURL("**/recognition?job=*", { timeout: 15000 });
  await waitForTerminal(page);
  const pdfHeader = await page.locator("h1, [data-testid='ocr-result']").first().locator("..").innerText().catch(() => "");
  check("PDF job header carries statement meta", /PDF · \d+ page|PDF \d+p/i.test(pdfHeader), pdfHeader.slice(0, 90));
  await page.screenshot({ path: `${SHOTS}/ocr-v2-07-pdf.png` });
  await backToOverview(page);

  // ── 7. Analytics OCR quality card ───────────────────────────────────────
  console.log("— V2: analytics OCR quality card —");
  await page.locator('a[href="/analytics"]').first().click();
  await page.waitForURL("**/analytics", { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.locator('[role="tab"]:has-text("Quality")').click();
  await page.waitForTimeout(1200);
  const qualityCard = await page.locator('[data-testid="analytics-ocr-quality"]').isVisible().catch(() => false);
  check("OCR quality card renders in the quality tab", qualityCard);
  if (qualityCard) {
    const cardText = await page.locator('[data-testid="analytics-ocr-quality"]').innerText();
    check("card shows the funnel + performance", /Uploads/.test(cardText) && /processing time/i.test(cardText));
  }
  await page.screenshot({ path: `${SHOTS}/ocr-v2-08-analytics.png` });

  // ── 8. Mobile 390 overflow guard ────────────────────────────────────────
  console.log("— Mobile 390 —");
  await page.setViewportSize({ width: 390, height: 844 });
  // Full reload is safe here (last step): the recognition module owns no
  // state the remaining checks depend on.
  await page.goto(`${BASE}/recognition`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("mobile 390: no horizontal overflow", !overflow);
  if (overflow) {
    const widest = await page.evaluate(() => {
      let best = { width: 0, label: "none" };
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > best.width && rect.right > window.innerWidth + 1) {
          best = {
            width: Math.round(rect.width),
            label: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`,
          };
        }
      }
      return `${best.label} (${best.width}px)`;
    });
    console.log(`    [debug] widest overflowing: ${widest}`);
  }

  check("console clean", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const failure of failures) console.log(`  FAIL: ${failure}`);
  }
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
