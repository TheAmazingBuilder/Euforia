/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
/**
 * OCR V3 - browser verification of the multi-screenshot fusion, collections,
 * history filters, quality score, reprocess and strategy matches.
 * Run: node scripts/verify-ocr-v3.js   (requires :3000 mocked build running)
 *
 * Covers: Groups & collections overview section, group creation dialog,
 * group workspace (evidence / conflicts / timeline / fused draft), fused
 * draft edit through the SAME review surface, group confirm → ONE trade,
 * confirmed group list, collections (create → add → remove → delete),
 * history filter bar (status / duplicates / clear), reprocess (Re-run),
 * quality strip with five components, strategy match chips, mobile 390,
 * console clean.
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
  await page.waitForTimeout(1200);
  for (let i = 0; i < 40; i += 1) {
    const done = await page.locator('[data-testid="ocr-result"]').isVisible().catch(() => false);
    const failedSurface = await page.locator('[data-testid="ocr-failed"]').isVisible().catch(() => false);
    if (done || failedSurface) return;
    await page.waitForTimeout(500);
  }
}

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
  await page.waitForURL("**/recognition?job=*", { timeout: 15000 });
}

async function backToOverview(page) {
  const history = page.locator('button:has-text("History")').first();
  if (await history.isVisible().catch(() => false)) {
    await history.click();
  } else {
    await page.locator('[data-testid="ocr-import-another"]').first().click();
  }
  await page.waitForTimeout(1000);
}

const PNG_A = `${SHOTS}/accounts-04-detail.png`;
const PNG_B = `${SHOTS}/ocr-01-empty-hero.png`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("/prices") && !text.includes("401") && !text.includes("Failed to load resource")) {
        consoleErrors.push(text);
      }
    }
  });

  console.log("- Setup: login + two completed recognitions -");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.locator('a[href="/recognition"]').first().click();
  await page.waitForURL("**/recognition", { timeout: 10000 });
  await page.locator('[data-testid="ocr-empty-hero"], [data-testid="ocr-stats"]').first().waitFor({ timeout: 10000 });

  await page.locator('[data-testid="ocr-import-cta"], [data-testid="ocr-empty-hero-cta"]').first().click();
  await page.waitForTimeout(400);
  await uploadAndStart(page, PNG_A); // job #1 - XAUUSD_BUY
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 25000 });
  check("job #1 completed (XAUUSD_BUY)", true);
  await backToOverview(page);

  await page.locator('[data-testid="ocr-import-cta"]').first().click();
  await page.waitForTimeout(400);
  await uploadAndStart(page, PNG_B); // job #2 - EURUSD_BUY
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 25000 });
  check("job #2 completed (EURUSD_BUY)", true);
  await backToOverview(page);

  // ── Groups & collections section ─────────────────────────────────────────
  console.log("- V3: groups & collections section -");
  check("groups & collections section renders", await page.locator('[data-testid="ocr-groups-section"]').isVisible());
  check("history filter bar renders", await page.locator('[data-testid="ocr-history-filters"]').isVisible());
  const groupBtn = page.locator('[data-testid="ocr-group-open-dialog"]');
  let groupBtnEnabled = false;
  for (let i = 0; i < 20 && !groupBtnEnabled; i += 1) {
    groupBtnEnabled = await groupBtn.isEnabled().catch(() => false);
    if (!groupBtnEnabled) await page.waitForTimeout(300);
  }
  check("Group Screenshots enabled with 2 completed jobs", groupBtnEnabled);
  await page.screenshot({ path: `${SHOTS}/ocr-v3-01-overview.png` });

  // ── Group creation dialog ────────────────────────────────────────────────
  console.log("- V3: fusion group creation -");
  await page.locator('[data-testid="ocr-group-open-dialog"]').click();
  await page.locator('[data-testid="ocr-group-dialog"]').waitFor({ timeout: 5000 });
  const optionsCount = await page.locator('[data-testid="ocr-group-options"] label').count();
  check("dialog lists completed recognitions", optionsCount >= 2, String(optionsCount));
  await page.locator('[data-testid="ocr-group-options"] label').first().locator('button[role="checkbox"]').click();
  await page.locator('[data-testid="ocr-group-options"] label').nth(1).locator('button[role="checkbox"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="ocr-group-create"]').click();
  await page.waitForURL("**/recognition?group=*", { timeout: 10000 });
  check("navigates to the group workspace", true);

  // ── Group workspace: PROPOSED + evidence + conflicts + timeline ──────────
  await page.locator('[data-testid="ocr-group-workspace"]').waitFor({ timeout: 8000 });
  const groupStatus = await page.locator('[data-testid="ocr-group-status"]').innerText();
  check("group starts PROPOSED on symbol mismatch", groupStatus.includes("Possible"), groupStatus);
  const evidenceText = await page.locator('[data-testid="ocr-group-evidence"]').innerText();
  check("correlation evidence visible", evidenceText.includes("Symbol") || evidenceText.includes("Direction"));
  const conflictsText = await page.locator('[data-testid="ocr-group-conflicts"]').innerText();
  check("conflicting symbol preserved with both values", conflictsText.includes("XAUUSD") && conflictsText.includes("EURUSD"));
  check("conflict marks the fused selection", conflictsText.includes("fused"));
  const timelineText = await page.locator('[data-testid="ocr-group-timeline"]').innerText();
  check("timeline lists every member", timelineText.includes(".png") || timelineText.includes("no time read"));
  const fusedText = await page.locator('[data-testid="ocr-group-fused"]').innerText();
  check("fused draft card present", fusedText.includes("Symbol"));
  await page.screenshot({ path: `${SHOTS}/ocr-v3-02-group-proposed.png` });

  // ── Fused draft edit (SAME review surface) ───────────────────────────────
  console.log("- V3: fused draft edit + group confirm -");
  await page.locator('[data-testid="ocr-group-edit-draft"]').click();
  await page.locator('[data-testid="ocr-draft-review"]').waitFor({ timeout: 5000 });
  check("fused draft opens the standard review surface", true);
  await page.locator("#ocr-draft-symbol").fill("XAUUSD");
  await page.locator("#ocr-draft-entry").fill("2345.60");
  await page.locator("#ocr-draft-sl").fill("2335.60");
  await page.locator("#ocr-draft-tp").fill("2365.60");
  await page.locator('[data-testid="ocr-ready-import"]').click();
  await page.waitForTimeout(800);
  check("confirm step reached", await page.locator('[data-testid="ocr-confirm"]').isVisible());
  await page.locator('[data-testid="ocr-confirm-import"]').click();
  await page.waitForTimeout(1000);
  check("group success screen", await page.locator('[data-testid="ocr-group-success"]').isVisible());
  const successText = await page.locator('[data-testid="ocr-group-success"]').innerText();
  check("success shows the canonical trade reference", successText.includes("TRD-OCR-"));
  await page.screenshot({ path: `${SHOTS}/ocr-v3-03-group-success.png` });
  await page.locator('button:has-text("Back to Overview")').click();
  await page.waitForTimeout(900);

  const groupRow = await page.locator('[data-testid="ocr-group-list"]').innerText().catch(() => "");
  check("group list shows CONFIRMED state", groupRow.includes("CONFIRMED"));

  // ── Collections ──────────────────────────────────────────────────────────
  console.log("- V3: screenshot collections -");
  await page.locator('[data-testid="ocr-collection-open-dialog"]').click();
  await page.locator('[data-testid="ocr-collection-dialog"]').waitFor({ timeout: 5000 });
  await page.locator('[data-testid="ocr-collection-name"]').fill("May statements");
  await page.locator('[data-testid="ocr-collection-create"]').click();
  await page.waitForURL("**/recognition?collection=*", { timeout: 10000 });
  await page.locator('[data-testid="ocr-collection-detail"]').waitFor({ timeout: 8000 });
  check("collection detail opens", true);
  check("new collection is empty", (await page.locator('[data-testid="ocr-collection-assets"]').count()) === 0);

  await page.locator('[data-testid="ocr-collection-add"]').click();
  await page.locator('[data-testid="ocr-collection-add-dialog"]').waitFor({ timeout: 5000 });
  const pickable = await page.locator('[data-testid="ocr-collection-add-dialog"] label').count();
  check("picker lists history uploads", pickable >= 2, String(pickable));
  await page.locator('[data-testid="ocr-collection-add-dialog"] label').first().locator('button[role="checkbox"]').click();
  await page.locator('[data-testid="ocr-collection-add-dialog"] label').nth(1).locator('button[role="checkbox"]').click();
  await page.locator('[data-testid="ocr-collection-add-confirm"]').click();
  await page.waitForTimeout(900);
  const assetRows = await page.locator('[data-testid="ocr-collection-assets"] li').count();
  check("both screenshots referenced", assetRows === 2, String(assetRows));
  await page.screenshot({ path: `${SHOTS}/ocr-v3-04-collection.png` });

  await page.locator('[data-testid="ocr-collection-assets"] li').first().locator('button[aria-label*="Remove"]').click();
  await page.waitForTimeout(700);
  check("asset removable", (await page.locator('[data-testid="ocr-collection-assets"] li').count()) === 1);

  await page.locator('[data-testid="ocr-collection-delete"]').click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Delete Collection")').click();
  await page.waitForTimeout(1500);
  check("collection deleted → back on overview", await page.locator('[data-testid="ocr-stats"]').isVisible());
  let collectionListGone = false;
  for (let i = 0; i < 15 && !collectionListGone; i += 1) {
    collectionListGone = (await page.locator('[data-testid="ocr-collection-list"]').count()) === 0;
    if (!collectionListGone) await page.waitForTimeout(400);
  }
  check("collection list no longer shows the deleted set", collectionListGone);

  // ── History filters ──────────────────────────────────────────────────────
  console.log("- V3: history filters -");
  const rowSel = '[data-testid^="ocr-history-row-"]';
  const rowsBefore = await page.locator(rowSel).count();
  await page.locator('[data-testid="ocr-filter-duplicates"]').click();
  await page.waitForTimeout(700);
  const rowsDup = await page.locator(rowSel).count();
  check("duplicates filter narrows the list", rowsDup < rowsBefore, `${rowsBefore} → ${rowsDup}`);
  await page.locator('[data-testid="ocr-filter-duplicates"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="ocr-filter-corrected"]').click();
  await page.waitForTimeout(700);
  const rowsCorr = await page.locator(rowSel).count();
  check("corrected filter narrows the list", rowsCorr < rowsBefore, `${rowsBefore} → ${rowsCorr}`);
  await page.locator('[data-testid="ocr-history-filters"] button:has-text("Clear")').click();
  await page.waitForTimeout(700);
  const rowsAfter = await page.locator(rowSel).count();
  check("clear restores the full list", rowsAfter === rowsBefore, `${rowsAfter} vs ${rowsBefore}`);

  // ── Reprocess + quality strip ────────────────────────────────────────────
  console.log("- V3: reprocess + quality score -");
  await page.locator(rowSel).first().click();
  await page.waitForTimeout(900);
  const onJobWorkspace = await page.locator('[data-testid="ocr-result"]').isVisible().catch(() => false);
  check("job workspace opens from history", onJobWorkspace);
  check("quality strip renders", await page.locator('[data-testid="ocr-quality"]').isVisible());
  const qualityText = await page.locator('[data-testid="ocr-quality"]').innerText();
  check(
    "quality components present",
    qualityText.includes("Text read") && qualityText.includes("Fields found") && qualityText.includes("Coherence"),
  );
  check("consistency honest (single image)", qualityText.includes("Multi-shot agreement"));

  const reprocessVisible = await page.locator('[data-testid="ocr-reprocess"]').isVisible().catch(() => false);
  if (reprocessVisible) {
    await page.locator('[data-testid="ocr-reprocess"]').click();
    await page.waitForTimeout(1500);
    const url = page.url();
    check("reprocess navigates to a NEW job", /recognition\?job=/.test(url), url);
    // Wait for the re-run to finish, then back to overview.
    await waitForTerminal(page);
    await backToOverview(page);
    const rowsAfterReprocess = await page.locator(rowSel).count();
    check("reprocessed job appears in history", rowsAfterReprocess > rowsBefore, String(rowsAfterReprocess));
  } else {
    check("reprocess button visible on terminal job", false, "missing");
  }

  // ── Strategy match chips (draft suggestions) ─────────────────────────────
  console.log("- V3: strategy match chips -");
  // Open the newest completed job and continue to its draft - the
  // suggestions strip carries the deterministic strategy matches.
  await page.locator(rowSel).first().click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="ocr-continue-draft"]').click();
  await page.waitForTimeout(900);
  const strategyChips = await page.locator('[data-testid="ocr-strategy-chip"]').count();
  if (strategyChips > 0) {
    check("strategy chips render for recognized symbols", true);
    await page.locator('[data-testid="ocr-strategy-chip"]').first().click();
    await page.waitForTimeout(500);
    const toastText = await page.locator('[data-sonner-toast]').innerText().catch(() => "");
    check("strategy chip click notes the match (never auto-assigns)", toastText.includes("Strategy match"), toastText.slice(0, 60));
  } else {
    check("strategy chips render for recognized symbols", false, "none visible");
  }

  // ── Mobile 390 + console ─────────────────────────────────────────────────
  console.log("- Mobile 390 -");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check("mobile 390: no horizontal overflow", !overflow);
  await page.screenshot({ path: `${SHOTS}/ocr-v3-05-mobile.png` });

  check("console clean (filtered)", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const failure of failures) console.log(`  FAIL: ${failure}`);
    process.exit(1);
  }
})().catch((error) => {
  console.error("suite crashed:", error);
  process.exit(1);
});
