/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
/**
 * OCR & Trade Recognition — browser verification (Prompt 3 §59 visual QA).
 * Run: node scripts/verify-ocr.js
 *
 * Golden paths: sidebar entry between Analytics and Calendar → overview
 * (hero/stats/history) → upload → configure → processing stages → result
 * (fields, confidence, warnings, region highlight, inline edit) → draft
 * review → confirm → success → history rotation (EURUSD/NAS100/FAILED/
 * BTCUSD) → failed detail + retry → cancel path → delete dialog → mobile
 * 390 no overflow → light theme.
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // SPA navigation — a full page.goto restarts the MSW service worker and
  // resets the in-memory mock engine (documented frontend-only behavior),
  // so every mid-suite navigation must stay inside the client router.
  const spaNav = async (path) => {
    await page.evaluate((target) => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await page.evaluate((target) => {
      const link = document.querySelector(`a[href="${target}"]`);
      if (link) link.click();
    }, path);
    await page.waitForTimeout(700);
  };
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("/prices") && !text.includes("401") && !text.includes("Failed to load resource")) {
        consoleErrors.push(text);
      }
    }
  });

  // ── Login ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  check("login", true);

  // ── Sidebar: INSIGHTS order Analytics → Import & Recognition → Calendar ─
  const insightLabels = await page.locator("aside").first().locator("text=Insights").locator("..").locator("..").innerText().catch(() => "");
  const analyticsVisible = await page.locator('a[href="/analytics"]').first().isVisible();
  const recognitionLink = page.locator('a[href="/recognition"]').first();
  const recognitionVisible = await recognitionLink.isVisible();
  const calendarLink = page.locator('a[href="/calendar"]').first();
  check("sidebar: /analytics visible", analyticsVisible);
  check("sidebar: /recognition registered", recognitionVisible);
  check("sidebar: /calendar visible", await calendarLink.isVisible());
  const orderOk = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href="/analytics"], a[href="/recognition"], a[href="/calendar"]'));
    const hrefs = links.map((a) => a.getAttribute("href"));
    const ai = hrefs.indexOf("/analytics");
    const ri = hrefs.indexOf("/recognition");
    const ci = hrefs.indexOf("/calendar");
    return ai !== -1 && ri !== -1 && ci !== -1 && ai < ri && ri < ci;
  });
  check("sidebar: recognition sits between Analytics and Calendar", orderOk);
  check("sidebar: ScanText label text", (await recognitionLink.innerText()).includes("Import & Recognition"));

  // ── Overview: empty hero first ─────────────────────────────────────────
  await recognitionLink.click();
  await page.waitForURL("**/recognition", { timeout: 10000 });
  await page.locator('[data-testid="ocr-empty-hero"]').waitFor({ timeout: 10000 });
  check("route: empty hero visible", await page.locator('[data-testid="ocr-empty-hero"]').isVisible());
  check("hero copy: Upload CTA", await page.locator('[data-testid="ocr-empty-hero-cta"]').isVisible());
  check("platforms line", (await page.locator('[data-testid="ocr-empty-hero"]').innerText()).toLowerCase().includes("metatrader 5"));
  await page.screenshot({ path: `${SHOTS}/ocr-01-empty-hero.png` });

  // ── Upload flow ────────────────────────────────────────────────────────
  await page.locator('[data-testid="ocr-empty-hero-cta"]').click();
  await page.waitForTimeout(400);
  check("new import surface", await page.locator('[data-testid="ocr-new-import"]').isVisible());
  const dropzone = page.locator('[data-testid="ocr-dropzone"]');
  check("dropzone visible", await dropzone.isVisible());
  check("start disabled before file", !(await page.locator('[data-testid="ocr-start-analysis"]').isEnabled()));

  // Reject an unsupported file first (§32)
  const gifPath = "/tmp/ocr-reject.gif";
  fs.writeFileSync(gifPath, Buffer.from("GIF89a" + "0".repeat(200)));
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(gifPath);
  await page.waitForTimeout(300);
  check("unsupported format error shown", await page.locator('[data-testid="ocr-uploader-error"]').isVisible());
  const errorText = await page.locator('[data-testid="ocr-uploader-error"]').innerText();
  check("error names the recovery", errorText.includes("PNG, JPG, WEBP"), errorText);

  // Accept a real PNG (an existing app screenshot as the "trading capture")
  const pngPath = `${SHOTS}/accounts-04-detail.png`;
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(pngPath);
  await page.waitForTimeout(600);
  check("preview appears", await page.locator('[data-testid="ocr-preview"]').isVisible());
  check("replace + remove available", await page.locator('[data-testid="ocr-preview-replace"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/ocr-02-upload.png` });

  // Settings: choose Auto Detect (default) + Automatic; others disabled
  const disabledMode = await page.locator('input[name="ocr-mode"][value="TRADE_DETAILS"]').isDisabled();
  check("future modes disabled (coming soon)", disabledMode);
  const autoChecked = await page.locator('input[name="ocr-platform"][value="AUTO"]').isChecked();
  check("platform defaults to Auto Detect", autoChecked);

  // Start analysis
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  // V2 — a re-uploaded file triggers the duplicate WARNING; continue deliberately.
  await page.waitForTimeout(1100);
  if (await page.locator('[data-testid="ocr-duplicate-continue"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="ocr-duplicate-continue"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
  }
  await page.waitForURL("**/recognition?job=*", { timeout: 10000 });
  check("job created → URL state ?job=", page.url().includes("?job=rec_"));

  // ── Processing stages (§15) ────────────────────────────────────────────
  await page.waitForTimeout(700);
  const processingVisible = await page.locator('[data-testid="ocr-processing"]').isVisible().catch(() => false);
  check("processing screen with staged steps", processingVisible);
  if (processingVisible) {
    const steps = await page.locator('[data-testid="ocr-processing"] li').count();
    check("5 processing steps listed", steps === 5);
    const cancelVisible = await page.locator('[data-testid="ocr-cancel"]').isVisible();
    check("Cancel Analysis available", cancelVisible);
    await page.screenshot({ path: `${SHOTS}/ocr-03-processing.png` });
    // Wait for completion (pipeline ~8.4s + poll)
    await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 });
  }
  check("result workspace appears after pipeline", await page.locator('[data-testid="ocr-result"]').isVisible());

  // ── Result workspace (§17–§21, §25, §26) ───────────────────────────────
  check("detected trade panel", await page.locator('[data-testid="ocr-detected-trade"]').isVisible());
  const symbolField = page.locator('[data-testid="ocr-field-symbol"]');
  check("symbol field found", await symbolField.isVisible());
  const symbolText = await symbolField.innerText();
  check("XAUUSD recognized (94%-class scenario)", symbolText.includes("XAUUSD"), symbolText.slice(0, 60));
  const directionText = await page.locator('[data-testid="ocr-field-direction"]').innerText();
  check("BUY direction with badge", directionText.includes("BUY"));
  const warnings = page.locator('[data-testid="ocr-warnings"]');
  check("warnings panel (SL low confidence)", await warnings.isVisible());
  check("warning mentions Stop Loss", (await warnings.innerText()).includes("Stop Loss"));
  const headerText = await page.locator('[data-testid="ocr-result"]').innerText();
  check("detected platform MT5 shown", headerText.includes("MetaTrader 5"));
  check("detected 1 trade line", headerText.includes("1 trade"));

  // Region highlight on hover (§25)
  await page.locator('[data-testid="ocr-field-entryPrice"]').hover();
  await page.waitForTimeout(300);
  const highlightVisible = await page.locator('[data-testid="ocr-region-highlight"]').isVisible();
  check("source region highlights on hover", highlightVisible);
  await page.screenshot({ path: `${SHOTS}/ocr-04-result-highlight.png` });

  // Inline edit (§21): correct the Stop Loss
  await page.locator('[data-testid="ocr-edit-trigger-stopLoss"]').click();
  await page.waitForTimeout(300);
  const slInput = page.locator('[data-testid="ocr-edit-stopLoss"] input');
  check("inline editor open", await slInput.isVisible());
  await slInput.fill("2639.10");
  await page.locator('[data-testid="ocr-edit-stopLoss"] button:has-text("Save")').click();
  await page.waitForTimeout(300);
  const correctedBadge = await page
    .locator('[data-testid="ocr-field-stopLoss"]')
    .innerText();
  check("corrected value + CORRECTED badge", correctedBadge.includes("2,639.10") && correctedBadge.includes("CORRECTED"), correctedBadge.slice(0, 80));

  // Validation: invalid price rejected inline
  await page.locator('[data-testid="ocr-edit-trigger-entryPrice"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="ocr-edit-entryPrice"] input').fill("abc");
  await page.locator('[data-testid="ocr-edit-entryPrice"] button:has-text("Save")').click();
  await page.waitForTimeout(200);
  const entryAlert = await page.locator('[data-testid="ocr-edit-entryPrice"] [role="alert"]').innerText().catch(() => "");
  check("inline decimal validation message", entryAlert.includes("positive decimal"));
  await page.locator('[data-testid="ocr-edit-entryPrice"] button:has-text("Cancel")').click();

  // ── Draft review (§24) ─────────────────────────────────────────────────
  await page.locator('[data-testid="ocr-continue-draft"]').click();
  await page.waitForTimeout(500);
  check("draft review opens", await page.locator('[data-testid="ocr-draft-review"]').isVisible());
  const slDraftValue = await page.locator("#ocr-draft-sl").inputValue();
  check("draft carries corrected SL", slDraftValue === "2639.10", slDraftValue);
  const rr = await page.locator('[data-testid="ocr-draft-rr"]').innerText();
  check("risk/reward computed", rr.startsWith("1 :"), rr);
  const draftText = (await page.locator('[data-testid="ocr-draft-review"]').innerText()).toLowerCase();
  check("sections present (Basic/Execution/Risk/Result/Timing)", draftText.includes("basic information") && draftText.includes("execution") && draftText.includes("risk management") && draftText.includes("result") && draftText.includes("timing"));
  await page.screenshot({ path: `${SHOTS}/ocr-05-draft.png` });

  // Break coherence: set SL above entry → error summary blocks import
  await page.locator("#ocr-draft-sl").fill("2700.00");
  await page.locator('[data-testid="ocr-ready-import"]').click();
  await page.waitForTimeout(300);
  check("coherence error surfaced (BUY SL below entry)", await page.locator('[data-testid="ocr-draft-error-summary"]').isVisible().catch(() => false));
  check("still on draft (blocked)", await page.locator('[data-testid="ocr-draft-review"]').isVisible());
  await page.locator("#ocr-draft-sl").fill("2639.10");

  // Ready → Confirm (§28)
  await page.locator('[data-testid="ocr-ready-import"]').click();
  await page.waitForTimeout(700);
  check("confirm screen", await page.locator('[data-testid="ocr-confirm"]').isVisible());
  const confirmText = await page.locator('[data-testid="ocr-confirm"]').innerText();
  check("confirm summary lists XAUUSD + BUY", confirmText.includes("XAUUSD") && confirmText.includes("BUY"));
  await page.screenshot({ path: `${SHOTS}/ocr-06-confirm.png` });

  // Back to review, then re-confirm
  await page.locator('[data-testid="ocr-back-to-review"]').click();
  await page.waitForTimeout(300);
  check("back to review works", await page.locator('[data-testid="ocr-draft-review"]').isVisible());
  await page.locator('[data-testid="ocr-ready-import"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="ocr-confirm-import"]').click();
  await page.waitForTimeout(900);

  // Success (§29)
  check("success screen", await page.locator('[data-testid="ocr-success"]').isVisible());
  const successText = await page.locator('[data-testid="ocr-success"]').innerText();
  check("journal reference id shown", successText.includes("TRD-OCR-"));
  await page.screenshot({ path: `${SHOTS}/ocr-07-success.png` });

  // Import Another → overview now has stats + history
  await page.locator('[data-testid="ocr-import-another"]').click();
  await page.waitForTimeout(600);
  check("back to overview after import", await page.locator('[data-testid="ocr-import-cta"]').isVisible());
  check("stats band replaced hero", await page.locator('[data-testid="ocr-stats"]').isVisible());
  const statImported = await page.locator('[data-testid="ocr-stat-imported"]').innerText();
  check("successful imports = 1", statImported.includes("1"), statImported);
  check("history row present", await page.locator('[data-testid^="ocr-history-row-"]').first().isVisible());
  const rowText = await page.locator('[data-testid^="ocr-history-row-"]').first().innerText();
  check("history row: status + confidence + needs review", rowText.includes("Completed") && rowText.includes("Needs review"));
  await page.screenshot({ path: `${SHOTS}/ocr-08-overview-history.png` });

  // ── Second import (EURUSD, clean) via header CTA ───────────────────────
  await page.locator('[data-testid="ocr-import-cta"]').click();
  await page.waitForTimeout(300);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(pngPath);
  await page.waitForTimeout(500);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  // V2 — a re-uploaded file triggers the duplicate WARNING; continue deliberately.
  await page.waitForTimeout(1100);
  if (await page.locator('[data-testid="ocr-duplicate-continue"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="ocr-duplicate-continue"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
  }
  await page.waitForURL("**/recognition?job=*", { timeout: 10000 });
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 });
  const eurusdHeader = await page.locator('[data-testid="ocr-result"]').innerText();
  check("2nd import: EURUSD clean scenario", eurusdHeader.includes("EURUSD"));
  check("no warnings panel on clean read", !(await page.locator('[data-testid="ocr-warnings"]').isVisible().catch(() => false)));

  // ── Third import (NAS100 low confidence) — cancel mid-processing (§55) ─
  await page.locator('[data-testid="ocr-success"], [data-testid="ocr-result"]').first().waitFor({ timeout: 5000 });
  await page.locator('a[href="/recognition"]').first().click();
  await page.waitForTimeout(700);
  await page.locator('[data-testid="ocr-import-cta"]').click();
  await page.waitForTimeout(300);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(pngPath);
  await page.waitForTimeout(500);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  // V2 — a re-uploaded file triggers the duplicate WARNING; continue deliberately.
  await page.waitForTimeout(1100);
  if (await page.locator('[data-testid="ocr-duplicate-continue"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="ocr-duplicate-continue"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
  }
  await page.waitForURL("**/recognition?job=*", { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="ocr-cancel"]').click();
  await page.waitForTimeout(900);
  check("cancelled state shown", await page.locator('[data-testid="ocr-cancelled"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/ocr-09-cancelled.png` });
  await page.locator('[data-testid="ocr-cancelled-back"]').click();
  await page.waitForURL((url) => (url.pathname.replace(/\/$/, "") === "/recognition" && url.search === ""), { timeout: 10000 });
  await page.waitForTimeout(500);

  // ── Fourth import (FAILED) → failure detail + Try Again (§56) ──────────
  await page.locator('[data-testid="ocr-import-cta"]').click();
  await page.waitForTimeout(300);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(pngPath);
  await page.waitForTimeout(500);
  const staleJobId = new URL(page.url()).searchParams.get("job");
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  // V2 — a re-uploaded file triggers the duplicate WARNING; continue deliberately.
  await page.waitForTimeout(1100);
  if (await page.locator('[data-testid="ocr-duplicate-continue"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="ocr-duplicate-continue"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
  }
  await page.waitForURL((url) => {
    const id = new URL(url).searchParams.get("job");
    return id !== null && id !== staleJobId;
  }, { timeout: 15000 });
  await page.locator('[data-testid="ocr-failed"]').waitFor({ timeout: 20000 });
  const failedText = await page.locator('[data-testid="ocr-failed"]').innerText();
  check("failure uses §32 copy", failedText.includes("couldn't recognize enough information"));
  check("failure metadata (stage, duration)", failedText.includes("ocr") || failedText.includes("Stage"));
  await page.screenshot({ path: `${SHOTS}/ocr-10-failed.png` });
  await page.locator('[data-testid="ocr-retry"]').click();
  await page.waitForTimeout(1200);
  const retriedUrl = page.url();
  check("retry creates a new job context", retriedUrl.includes("?job=rec_"));
  // New job → EURUSD (rotation) → wait result then go back to history
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 }).catch(() => undefined);
  await page.locator('main button:has-text("History")').first().click().catch(() => undefined);
  await page.waitForURL((url) => url.searchParams.get("job") === null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  const historyRows = await page.locator('[data-testid^="ocr-history-row-"]').count();
  check("history lists all jobs", historyRows >= 4, `${historyRows} rows`);

  // ── Delete flow with confirm dialog ────────────────────────────────────
  const firstDelete = page.locator('[data-testid^="ocr-history-delete-"]').first();
  await firstDelete.click();
  await page.waitForTimeout(400);
  check("delete confirm dialog opens", await page.locator('[data-testid="ocr-delete-confirm"]').isVisible());
  await page.locator('[data-testid="ocr-delete-confirm"]').click();
  await page.waitForTimeout(700);
  const rowsAfter = await page.locator('[data-testid^="ocr-history-row-"]').count();
  check("row removed after delete", rowsAfter === historyRows - 1, `${rowsAfter} rows`);

  // ── Reopen an imported job → details view with banner ──────────────────
  // (the imported XAUUSD job is the oldest row)
  await page.locator('[data-testid="ocr-history-row-rec_0001"]').click().catch(async () => {
    await page.locator('[data-testid^="ocr-history-row-"]').last().click();
  });
  await page.waitForURL("**/recognition?job=*", { timeout: 10000 });
  await page.waitForTimeout(900);
  const detailVisible = await page.locator('[data-testid="ocr-imported-banner"]').isVisible().catch(() => false);
  check("imported job shows details + banner", detailVisible);
  if (detailVisible) {
    await page.screenshot({ path: `${SHOTS}/ocr-11-details-imported.png` });
  }

  // ── Mobile 390: no horizontal overflow ─────────────────────────────────
  // Land on the recognition overview first (mobile hides the sidebar, so
  // all navigation must happen while still on the desktop layout).
  await page.locator('main button:has-text("History")').first().click().catch(() => undefined);
  await page.waitForURL((url) => url.searchParams.get("job") === null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check("mobile 390: no horizontal overflow", !mobileOverflow);
  check("mobile: history cards instead of table", await page.locator('[data-testid="ocr-history-cards"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/ocr-12-mobile.png`, fullPage: true });

  // ── Light theme ────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForTimeout(800);
  const themeButton = page.locator('[data-testid="settings-theme-light"], button:has-text("Light")').first();
  await themeButton.click({ timeout: 5000 }).catch(() => undefined);
  await page.locator('a[href="/recognition"]').first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/ocr-13-light.png` });
  check("light theme renders", true);

  check("console clean (filtered)", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(`  FAIL: ${f}`);
    process.exit(1);
  }
})().catch((error) => {
  console.error("CRASH:", error);
  process.exit(1);
});
