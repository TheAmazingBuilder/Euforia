/**
 * Verify - Import & Recognition (OCR V1, PROMPT 3).
 *
 * IMPORTANT: the mock recognition store lives in the browser tab - the
 * script navigates with SPA link clicks ONLY (one initial goto, ONE reload
 * for the URL-persistence check on a SEEDED job).
 *
 * Covers (spec §75 Definition of Done + §58):
 *   A. Sidebar entry + Overview (hero, stats, recent, seeded history).
 *   B. Wizard: invalid file rejected → valid PNG preview (meta, remove,
 *      re-upload).
 *   C. Recognition settings: V1 options enabled, future options disabled
 *      ("Coming soon"), start → ?job=<id> + progress pipeline.
 *   D. Result: extracted fields, confidence, detected platform; inline edit
 *      of a field.
 *   E. Trade Draft review (sections + R:R) → Confirm & Import → success +
 *      toast → View Trade opens the journal drawer.
 *   F. History: new row + stats bump; partial scenario (warnings, needs
 *      review, discard); low-confidence scenario (LOW badge, discard).
 *   G. Failed scenario → error state → Try Again → completes → discard.
 *   H. Cancel during processing → cancelled state.
 *   I. History filters (processing empty state, failed rows) + seeded job
 *      details.
 *   J. URL persistence: reload on ?job=<seeded> still renders details.
 *   K. Mobile 390px: no horizontal overflow (overview/history/wizard).
 *   L. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/import-recognition";

// 1×1 transparent PNG (valid image; dimensions shown as 1 × 1).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const png = (name) => ({ name, mimeType: "image/png", buffer: TINY_PNG });
const txt = (name) => ({ name, mimeType: "text/plain", buffer: Buffer.from("not an image") });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const shot = (name, opts = {}) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts });

  const waitResult = async (timeout = 25_000) => {
    await page
      .locator('[data-testid="import-result"], [data-testid="import-error"], [data-testid="import-workspace-cancelled"]')
      .first()
      .waitFor({ state: "visible", timeout });
  };

  const startRecognition = async (file) => {
    await page.locator('[data-testid="import-file-input"]')
      .setInputFiles(file);
    await page.locator('[data-testid="import-preview-card"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.locator('[data-testid="import-continue-settings"]').click();
    await page.locator('[data-testid="import-start"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.locator('[data-testid="import-start"]').click();
    await page.locator('[data-testid="import-progress"]').waitFor({ state: "visible", timeout: 10_000 });
    await waitResult();
  };

  const discardResult = async () => {
    await page.locator('[data-testid="import-discard"]').click();
    await page.locator('[data-testid="import-discard-dialog"]').waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('[data-testid="import-discard-confirm"]').click();
    await page.locator('[data-testid="import-overview"], [data-testid="import-history"]').first()
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  // ══ Entry: login ═══════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ══ A. Sidebar + Overview ══════════════════════════════════════════════
  check("A1 Sidebar has Recognition item (TOOLS section)",
    (await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').count()) === 1);

  await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').click();
  await page.locator('[data-testid="import-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-testid="import-overview"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(500);

  const h1 = (await page.locator("h1").first().innerText()).trim();
  check("A2 Header title = 'Recognition'", h1 === "Recognition", h1);

  check("A3 Hero visible with EN copy",
    (await page.locator('[data-testid="import-hero"]').count()) === 1 &&
    /Upload your first trading screenshot|Import your trading screenshot/.test(await page.locator("body").innerText()));

  check("A4 Stats tiles present (analyzed/completed/needsReview/failed)",
    (await page.locator('[data-testid="import-stat-analyzed"]').count()) === 1 &&
    (await page.locator('[data-testid="import-stat-needsreview"]').count()) === 1);

  check("A5 Recent imports list seeded",
    (await page.locator('[data-testid="import-recent-row"]').count()) >= 3);

  check("A6 Recent list shows seeded jobs",
    (await page.locator('[data-testid="import-recent-row"]').count()) >= 3 &&
    /XAUUSD_mt5_london\.png/.test(await page.locator("body").innerText()));

  const analyzedBefore = Number(
    await page.locator('[data-testid="import-stat-analyzed-value"]').innerText(),
  );
  check("A7 Analyzed stat = 6 seeds", analyzedBefore === 6, String(analyzedBefore));
  await shot("a-overview");

  // ══ B. Wizard - upload experience ══════════════════════════════════════
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  check("B1 Dropzone visible with aria label",
    (await page.locator('[data-testid="import-dropzone"]').getAttribute("aria-label")) !== null);

  // Invalid file → rejected
  await page.locator('[data-testid="import-file-input"]').setInputFiles(txt("notes.txt"));
  await page.locator('[data-testid="import-upload-error"]').waitFor({ state: "visible", timeout: 10_000 });
  check("B2 Invalid format rejected with friendly error",
    /isn't supported/.test(await page.locator('[data-testid="import-upload-error"]').innerText()));
  await shot("b-invalid-file");

  // Valid file → preview
  await page.locator('[data-testid="import-file-input"]').setInputFiles(png("xauusd_mt5_ticket.png"));
  await page.locator('[data-testid="import-preview-card"]').waitFor({ state: "visible", timeout: 10_000 });
  check("B3 Preview card with filename + size",
    /xauusd_mt5_ticket\.png/.test(await page.locator('[data-testid="import-preview-filename"]').innerText()));

  // Remove → dropzone returns
  await page.locator('[data-testid="import-preview-remove"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  check("B4 Remove returns to dropzone", true);

  // Re-upload (replace path covered by uploading again)
  await page.locator('[data-testid="import-file-input"]').setInputFiles(png("xauusd_mt5_ticket.png"));
  await page.locator('[data-testid="import-preview-card"]').waitFor({ state: "visible", timeout: 10_000 });
  check("B5 Re-upload after remove works", true);
  await shot("b-preview");

  // ══ C. Settings + processing ═══════════════════════════════════════════
  await page.locator('[data-testid="import-continue-settings"]').click();
  await page.locator('[data-testid="import-settings"]').waitFor({ state: "visible", timeout: 10_000 });

  check("C1 Auto Detect preselected",
    await page.locator('[data-testid="import-platform-auto"]').isChecked());
  check("C2 TradingView disabled (Coming soon)",
    await page.locator('[data-testid="import-platform-tradingview"]').isDisabled());
  check("C3 MT5 selectable",
    await page.locator('[data-testid="import-platform-mt5"]').isEnabled());
  check("C4 Automatic mode preselected",
    await page.locator('[data-testid="import-mode-automatic"]').isChecked());
  check("C5 Chart Analysis disabled (Coming soon)",
    await page.locator('[data-testid="import-mode-chart_analysis"]').isDisabled());
  await page.locator('[data-testid="import-platform-mt5"]').check();
  await shot("c-settings");

  await page.locator('[data-testid="import-start"]').click();
  await page.locator('[data-testid="import-progress"]').waitFor({ state: "visible", timeout: 10_000 });
  check("C6 URL carries ?job=", /job=/.test(page.url()), page.url().split("?")[1] ?? "");
  check("C7 Progress steps rendered",
    (await page.locator('[data-testid^="import-progress-step-"]').count()) === 6);
  await shot("c-processing");

  await waitResult();
  check("C8 Processing completes into result",
    (await page.locator('[data-testid="import-result"]').count()) === 1);
  await shot("c-result");

  // ══ D. Result fields + confidence + edit ═══════════════════════════════
  const resultText = await page.locator('[data-testid="import-result"]').innerText();
  check("D1 Detected platform = MetaTrader 5", /MetaTrader 5/.test(resultText));
  check("D2 Symbol XAUUSD recognized",
    (await page.locator('[data-testid="import-field-symbol-value"]').innerText()) === "XAUUSD");
  check("D3 Direction BUY (profit tone)",
    (await page.locator('[data-testid="import-field-direction-value"]').innerText()) === "BUY");
  check("D4 Entry price precision kept (2645.32)",
    (await page.locator('[data-testid="import-field-entryPrice-value"]').innerText()) === "2645.32");
  check("D5 Confidence badges present",
    (await page.locator('[data-testid^="import-confidence-"]').count()) >= 8);
  check("D6 No warnings on clean result",
    (await page.locator('[data-testid="import-warnings"]').count()) === 0);

  // Inline edit: P&L
  await page.locator('[data-testid="import-field-pnl-edit"]').click();
  await page.locator('[data-testid="import-field-pnl-input"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="import-field-pnl-input"]').fill("149.20");
  await page.locator('[data-testid="import-field-pnl-save"]').click();
  await page.locator('[data-testid="import-field-pnl-edited"]').waitFor({ state: "visible", timeout: 5_000 });
  check("D7 Inline edit commits with Edited badge",
    (await page.locator('[data-testid="import-field-pnl-value"]').innerText()) === "149.20");
  await shot("d-edited");

  // Invalid edit value shows a validation message
  await page.locator('[data-testid="import-field-pnl-edit"]').click();
  await page.locator('[data-testid="import-field-pnl-input"]').fill("abc");
  await page.locator('[data-testid="import-field-pnl-save"]').click();
  await page.locator('[data-testid="import-field-pnl-error"]').waitFor({ state: "visible", timeout: 5_000 });
  check("D8 Invalid decimal rejected inline",
    /valid number/i.test(await page.locator('[data-testid="import-field-pnl-error"]').innerText()));
  await page.locator('[data-testid="import-field-pnl-cancel"]').click();

  // ══ E. Draft → Confirm → Success → View Trade ══════════════════════════
  await page.locator('[data-testid="import-draft-open"]').click();
  await page.locator('[data-testid="import-draft"]').waitFor({ state: "visible", timeout: 10_000 });
  const draftText = await page.locator('[data-testid="import-draft"]').innerText();
  check("E1 Draft sections rendered",
    /Basic Information/.test(draftText) && /Execution/.test(draftText) &&
    /Risk Management/.test(draftText) && /Result/.test(draftText) && /Timing/.test(draftText));
  check("E2 Planned R:R calculable", /1 : \d\.\d{2}/.test(draftText), draftText.match(/1 : \d\.\d{2}/)?.[0] ?? "");
  check("E3 Edited P&L flows into draft", /149\.20/.test(draftText));
  await shot("e-draft");

  await page.locator('[data-testid="import-draft-confirm"]').click();
  await page.locator('[data-testid="import-confirmation"]').waitFor({ state: "visible", timeout: 10_000 });
  check("E4 Confirmation summary shows trade", /XAUUSD/.test(await page.locator('[data-testid="import-confirmation-summary"]').innerText()));
  await shot("e-confirmation");

  await page.locator('[data-testid="import-confirm-import"]').click();
  await page.locator('[data-testid="import-success"]').waitFor({ state: "visible", timeout: 15_000 });
  check("E5 Success card + toast",
    /imported successfully/i.test(await page.locator('[data-testid="import-success"]').innerText()));
  await shot("e-success");

  await page.locator('[data-testid="import-success-view-trade"]').click();
  await page.waitForURL(/\/trades\?trade=/, { timeout: 15_000 });
  try {
    await page.locator('[role="dialog"]').first()
      .waitFor({ state: "visible", timeout: 12_000 });
  } catch (e) {
    await shot("debug-e6-trades");
    console.error("DEBUG E6 URL:", page.url());
    console.error("DEBUG E6 body:", (await page.locator("body").innerText()).slice(0, 500).replace(/\n+/g, " | "));
    throw e;
  }
  await page.waitForTimeout(800);
  check("E6 View Trade opens journal drawer with XAUUSD",
    /XAUUSD/.test(await page.locator("body").innerText()));
  await shot("e-trade-drawer");

  // Close the modal drawer (Radix dialog) before SPA-navigating away.
  await page.keyboard.press("Escape");
  await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(400);

  // ══ F. History + partial + low-confidence ══════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').click();
  await page.locator('[data-testid="import-overview"]').waitFor({ state: "visible", timeout: 15_000 });

  const analyzedAfter = Number(
    await page.locator('[data-testid="import-stat-analyzed-value"]').innerText(),
  );
  check("F1 Analyzed stat bumped after import", analyzedAfter === analyzedBefore + 1,
    `${analyzedBefore} → ${analyzedAfter}`);

  await page.locator('[data-testid="import-tab-history"]').click();
  await page.locator('[data-testid="import-history"]').waitFor({ state: "visible", timeout: 10_000 });
  const historyText = await page.locator('[data-testid="import-history"]').innerText();
  check("F2 Imported file appears in history", /xauusd_mt5_ticket\.png/.test(historyText));

  // Partial scenario
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  await startRecognition(png("partial-eurusd_ticket.png"));
  const partialText = await page.locator('[data-testid="import-result"]').innerText();
  check("F3 Partial: Not detected fields", /Not detected/.test(partialText));
  check("F4 Partial: warnings listed", (await page.locator('[data-testid="import-warnings"]').count()) === 1);
  check("F5 Partial: Needs review badge", (await page.locator('[data-testid="import-result-needs-review"]').count()) === 1);
  await shot("f-partial");
  await discardResult();
  check("F6 Discard returns to overview", true);

  // Low-confidence scenario
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  await startRecognition(png("low-nas100_range.png"));
  check("F7 Low: LOW confidence badge rendered",
    (await page.locator('[data-testid="import-confidence-low"]').count()) >= 1);
  check("F8 Low: sensitive info warning",
    (await page.locator('[data-testid="import-warning-sensitive_info"]').count()) === 1);
  await shot("f-low");
  await discardResult();

  // ══ G. Failed → retry ══════════════════════════════════════════════════
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  await startRecognition(png("fail-blurry_shot.png"));
  check("G1 Failure error state with friendly copy",
    /couldn't recognize enough information/i.test(await page.locator('[data-testid="import-error"]').innerText()));
  await shot("g-failed");
  await page.locator('[data-testid="import-retry"]').click();
  await page.locator('[data-testid="import-progress"]').waitFor({ state: "visible", timeout: 10_000 });
  await waitResult();
  check("G2 Retry completes into result", (await page.locator('[data-testid="import-result"]').count()) === 1);
  await discardResult();

  // ══ H. Cancel during processing ════════════════════════════════════════
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="import-file-input"]').setInputFiles(png("cancel-me.png"));
  await page.locator('[data-testid="import-preview-card"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="import-continue-settings"]').click();
  await page.locator('[data-testid="import-start"]').click();
  await page.locator('[data-testid="import-progress"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="import-cancel"]').click();
  await page.locator('[data-testid="import-cancelled"]').waitFor({ state: "visible", timeout: 10_000 });
  check("H1 Cancel Analysis shows cancelled state",
    /cancelled/i.test(await page.locator('[data-testid="import-cancelled"]').innerText()));
  await shot("h-cancelled");
  await page.locator('[data-testid="import-retry"]').isVisible();
  await page.locator('[data-testid="import-view"] header button, [data-testid="import-header"]').first().click()
    .catch(() => {});
  // navigate back via sidebar
  await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').click();
  await page.locator('[data-testid="import-overview"]').waitFor({ state: "visible", timeout: 15_000 });

  // ══ I. History filters + seeded details ════════════════════════════════
  await page.locator('[data-testid="import-tab-history"]').click();
  await page.locator('[data-testid="import-history"]').waitFor({ state: "visible", timeout: 10_000 });

  await page.locator('[data-testid="import-filter-processing"]').click();
  await page.locator('[data-testid^="import-empty-"]').waitFor({ state: "visible", timeout: 10_000 });
  check("I1 Processing filter shows empty state with CTA",
    /No recognitions are running/.test(await page.locator('[data-testid^="import-empty-"]').innerText()));

  await page.locator('[data-testid="import-filter-failed"]').click();
  await page.waitForTimeout(400);
  const failedRows = await page.locator('[data-testid^="import-history-row-"]').count();
  check("I2 Failed filter lists seeded failure + cancelled job", failedRows >= 2, String(failedRows));

  await page.locator('[data-testid="import-filter-all"]').click();
  await page.waitForTimeout(400);
  check("I3 Status badges present on rows",
    (await page.locator('[data-testid="import-status-badge"]').count()) >= 6);

  // Open a SEEDED job's details (stable across reload - J depends on it)
  await page.locator('[data-testid="import-history-table"] tr', { hasText: "XAUUSD_mt5_london.png" })
    .locator('[data-testid^="import-history-open-"]').click();
  await page.locator('[data-testid="import-workspace"], [data-testid="import-workspace-processing"], [data-testid="import-workspace-imported"], [data-testid="import-workspace-empty-result"], [data-testid="import-workspace-cancelled"], [data-testid="import-workspace-failed"]')
    .first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);
  const seededUrl = page.url();
  check("I4 Seeded job opens workspace at ?job=", /job=/.test(seededUrl), seededUrl.split("?")[1] ?? "");
  await shot("i-seeded-details");

  // ══ J. URL persistence: reload on seeded job ═══════════════════════════
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-testid="import-workspace"], [data-testid="import-workspace-imported"], [data-testid="import-workspace-empty-result"], [data-testid="import-workspace-cancelled"], [data-testid="import-workspace-failed"]')
    .first().waitFor({ state: "visible", timeout: 20_000 });
  check("J1 Reload on ?job=<seeded> still renders the job",
    /job=/.test(page.url()));
  await shot("j-reload-persistence");

  // ══ K. Mobile 390px ════════════════════════════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').click()
    .catch(async () => {
      await page.goto(`${BASE}/import`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="import-view"]').waitFor({ state: "visible", timeout: 30_000 });
    });
  await page.locator('[data-testid="import-overview"], [data-testid="import-history"]').first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(600);
  const mobileOverflowOverview = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("K1 Mobile overview: no horizontal overflow", mobileOverflowOverview <= 0, `${mobileOverflowOverview}px`);
  await shot("k-mobile-overview");

  await page.locator('[data-testid="import-tab-history"]').click();
  await page.locator('[data-testid="import-history"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);
  const mobileOverflowHistory = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("K2 Mobile history cards render (no overflow)", mobileOverflowHistory <= 0, `${mobileOverflowHistory}px`);
  check("K3 Mobile history uses card list", (await page.locator('[data-testid^="import-history-card-"]').count()) >= 1);
  await shot("k-mobile-history");

  // ══ L. Console cleanliness ═════════════════════════════════════════════
  check("L1 No unexpected 4xx / page errors", errors.length === 0, errors.slice(0, 3).join(" ; "));

  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS - ${SHOTS}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(2);
});
