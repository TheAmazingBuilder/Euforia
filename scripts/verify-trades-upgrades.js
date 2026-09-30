/**
 * Verify — Trades module upgrades (4 user-selected features).
 *  1. Saved views: named (filters + columns) presets, apply / active badge / delete
 *  2. CSV import: broker presets, auto column mapping, preview, idempotent submit
 *  3. Bulk actions: tag + grade + delete multiple trades in one round-trip
 *  4. Per-trade chart: entry/exit/SL/TP projected on the session price path
 * Plus: column visibility toggle, light theme, mobile 390, console health.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const slug = (name) => name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  const thCount = async () => page.locator('[data-testid="trades-table"] thead th').count();
  const paginationTotal = async () => {
    const text = await page.locator('[data-testid="trades-pagination"]').textContent();
    const match = text.match(/of\s+(\d+)/);
    return match ? Number(match[1]) : -1;
  };
  const lastToast = async () => {
    const toasts = page.locator("[data-sonner-toast]");
    const count = await toasts.count();
    return count === 0 ? "" : (await toasts.nth(count - 1).textContent()) ?? "";
  };
  /** Sonner stacks toasts — look for the one that carries the expected text. */
  const waitForToast = async (text, timeout = 5000) => {
    try {
      await page.waitForSelector(`[data-sonner-toast]:has-text("${text}")`, { timeout });
      return true;
    } catch {
      return false;
    }
  };

  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForSelector('[data-testid="trades-row"]', { timeout: 30_000 });
  await page.waitForTimeout(600);

  // ── 1. Column visibility ───────────────────────────────────────────────────
  check("Ledger renders all 12 columns (10 + checkbox + actions)", (await thCount()) === 12, `th=${await thCount()}`);

  await page.locator('[data-testid="trades-views-trigger"]').click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: "Columns" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitemcheckbox", { name: "Duration" }).click();
  await page.waitForTimeout(400);
  check("Unchecking Duration removes the column", (await thCount()) === 11, `th=${await thCount()}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 2. Saved views — save with Losses filter + Duration hidden ─────────────
  await page.locator('[data-testid="trades-filter-outcome"]').click();
  await page.waitForTimeout(300);
  await page.getByRole("option", { name: "Losses" }).click();
  await page.waitForTimeout(500);

  await page.locator('[data-testid="trades-views-trigger"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trades-view-save"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trades-view-name-input"]').fill("My losers view");
  await page.locator('[data-testid="trades-view-save-confirm"]').click();
  check("View saved with toast", await waitForToast("saved"));
  const triggerText = await page.locator('[data-testid="trades-views-trigger"]').textContent();
  check("Trigger shows the active view name", (triggerText ?? "").includes("My losers view"), triggerText ?? "");

  // ── 3. Reset then re-apply the view (filters + columns restore) ────────────
  // Re-enable Duration first so the view must turn it OFF again on apply.
  await page.locator('[data-testid="trades-views-trigger"]').click();
  await page.getByRole("menuitem", { name: "Columns" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitemcheckbox", { name: "Duration" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Duration re-enabled (12 columns)", (await thCount()) === 12, `th=${await thCount()}`);

  await page.locator('[data-testid="trades-filter-reset"]').click();
  await page.waitForTimeout(500);
  check("Reset clears the active view badge", (await page.locator('[data-testid="trades-views-trigger"]').textContent())?.trim().endsWith("Views") ?? false);

  await page.locator('[data-testid="trades-views-trigger"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trades-view-item-my-losers-view"]').click();
  await page.waitForTimeout(700);
  check("Apply view restores filters (Losses)", (await page.locator('[data-testid="trades-filter-outcome"]').textContent())?.includes("Losses") ?? false);
  check("Apply view restores columns (Duration hidden)", (await thCount()) === 11, `th=${await thCount()}`);
  check("Applied view is active again", (await page.locator('[data-testid="trades-views-trigger"]').textContent())?.includes("My losers view") ?? false);

  await page.screenshot({ path: "scripts/shots/trades-upgrades-view.png" });

  // ── 4. Delete the view ─────────────────────────────────────────────────────
  await page.locator('[data-testid="trades-views-trigger"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trades-view-delete-my-losers-view"]').click();
  await page.waitForTimeout(800);
  check("View deleted", (await lastToast()).includes("deleted"), await lastToast());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 5. Bulk actions — tag + grade + delete (one POST /trades/bulk each) ────
  await page.locator('[data-testid="trades-filter-reset"]').click();
  await page.waitForTimeout(600);
  const closedRows = page.locator('[data-testid="trades-row"]:not(:has(.stamp-accent))');
  const closedCount = await closedRows.count();
  check("Closed rows available for bulk grading", closedCount >= 2, `closed=${closedCount}`);
  await closedRows.nth(0).locator('[data-testid^="trades-row-checkbox"]').click();
  await closedRows.nth(1).locator('[data-testid^="trades-row-checkbox"]').click();
  await page.waitForTimeout(400);
  check("Bulk bar shows 2 selected", (await page.locator('[data-testid="trades-bulk-bar"]').textContent())?.includes("2 selected") ?? false);

  // Tag — Add tag → first tag in the catalog.
  const tagResponse = page.waitForResponse((resp) => resp.url().includes("/trades/bulk") && resp.request().method() === "POST");
  await page.locator('[data-testid="trades-bulk-tag"]').click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Add tag" }).click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid^="trades-bulk-tag-"]').first().click();
  const tagResp = await tagResponse;
  check("Bulk TAG round-trip ok", tagResp.ok(), `status=${tagResp.status()}`);
  check("Bulk TAG toast", await waitForToast("tagged"));

  // Grade — A on closed trades.
  const gradeResponse = page.waitForResponse((resp) => resp.url().includes("/trades/bulk") && resp.request().method() === "POST");
  await page.locator('[data-testid="trades-bulk-grade"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="trades-bulk-grade-A"]').click();
  const gradeResp = await gradeResponse;
  const gradeBody = await gradeResp.json();
  check("Bulk GRADE round-trip ok + affected=2", gradeResp.ok() && gradeBody.affected === 2, `affected=${gradeBody.affected} skipped=${gradeBody.skipped}`);
  check("Bulk GRADE toast", await waitForToast("Graded"));

  // The graded rows show the A pill now.
  const firstClosedGrade = await closedRows.nth(0).locator("td").nth(7).textContent();
  check("Grade pill rendered on the first graded row", (firstClosedGrade ?? "").trim() === "A", firstClosedGrade ?? "");

  await page.screenshot({ path: "scripts/shots/trades-upgrades-bulk.png" });

  // Bulk delete of the same two rows would eat seed data — use Clear instead.
  await page.locator('[data-testid="trades-bulk-clear"]').click();
  await page.waitForTimeout(300);
  check("Clear empties the selection", (await page.locator('[data-testid="trades-bulk-bar"]').count()) === 0);

  // ── 6. CSV import — sample, auto-mapping, idempotent submit ────────────────
  const beforeImport = await paginationTotal();
  await page.locator('[data-testid="trades-import-open"]').click();
  await page.waitForTimeout(500);
  check("Import dialog opens", await page.locator('[data-testid="trades-import-dialog"]').isVisible());
  await page.locator('[data-testid="trades-import-sample"]').click();
  await page.waitForTimeout(600);
  const symbolMap = await page.locator('[data-testid="trades-import-map-symbol"]').textContent();
  check("Auto-mapping found the MT5 Item column", (symbolMap ?? "").includes("Item"), symbolMap ?? "");
  const statusLine = await page.locator('[data-testid="trades-import-status"]').textContent();
  check("Parse status: 5 rows parsed · 5 ready", (statusLine ?? "").includes("5 rows parsed") && (statusLine ?? "").includes("5 ready"), statusLine ?? "");
  check("Preview shows 4 sample rows", (await page.locator('[data-testid="trades-import-preview-row"]').count()) === 4);

  const importResponse = page.waitForResponse((resp) => resp.url().includes("/trades/import") && resp.request().method() === "POST");
  await page.locator('[data-testid="trades-import-submit"]').click();
  const importResp = await importResponse;
  const importBody = await importResp.json();
  check("Import POST ok — 5 imported", importResp.ok() && importBody.imported === 5, `imported=${importBody.imported} dupes=${importBody.skippedDuplicates}`);
  check("Import success toast", await waitForToast("Imported 5"));
  const afterImport = await paginationTotal();
  check("Ledger grew by 5 trades", afterImport === beforeImport + 5, `${beforeImport} → ${afterImport}`);

  // Idempotence: same sample twice = zero new trades, zero new toasts.
  const importedToastCount = async () => page.locator('[data-sonner-toast]:has-text("Imported")').count();
  const toastsBeforeReimport = await importedToastCount();
  await page.locator('[data-testid="trades-import-open"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trades-import-sample"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="trades-import-submit"]').click();
  await page.waitForTimeout(1500);
  const afterReimport = await paginationTotal();
  check("Re-import is idempotent (no growth)", afterReimport === afterImport, `${afterImport} → ${afterReimport}`);
  check(
    "Duplicate-import shows no extra success toast",
    (await importedToastCount()) === toastsBeforeReimport,
    `toasts ${toastsBeforeReimport} → ${await importedToastCount()}`,
  );

  await page.screenshot({ path: "scripts/shots/trades-upgrades-import.png" });

  // ── 7. Per-trade session chart ─────────────────────────────────────────────
  await closedRows.nth(0).click();
  await page.waitForTimeout(900);
  const dialog = page.locator('[data-testid="trade-detail-dialog"]');
  check("Details dialog opens", await dialog.isVisible());
  const chart = dialog.locator('[data-testid="trade-session-chart"]');
  check("Session chart section rendered", await chart.isVisible());
  check("Chart canvas drawn (ECharts)", (await chart.locator("canvas").count()) >= 1);
  const chartHeader = await chart.textContent();
  check("Chart header shows symbol + window", (chartHeader ?? "").includes("Session price path"), (chartHeader ?? "").slice(0, 80));
  check("Level chips include Entry", (chartHeader ?? "").includes("Entry"));
  check("Level chips include SL/TP or open note", (chartHeader ?? "").includes("SL") || (chartHeader ?? "").includes("open position"));

  await chart.locator('[data-testid="trade-session-chart-toggle"]').click();
  await page.waitForTimeout(300);
  check("Chart collapses", !(await chart.locator("canvas").isVisible().catch(() => false)));
  await chart.locator('[data-testid="trade-session-chart-toggle"]').click();
  await page.waitForTimeout(500);
  check("Chart re-expands", (await chart.locator("canvas").count()) >= 1);

  await page.screenshot({ path: "scripts/shots/trades-upgrades-chart.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 8. Light theme ─────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(700);
  await closedRows.nth(0).click();
  await page.waitForTimeout(900);
  check("Light theme: chart still renders", (await page.locator('[data-testid="trade-session-chart"] canvas').count()) >= 1);
  await page.screenshot({ path: "scripts/shots/trades-upgrades-light.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  });

  // ── 9. Mobile 390 ──────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForSelector('[data-testid="trades-row"]', { timeout: 30_000 });
  await mobile.waitForTimeout(800);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  await mobile.locator('[data-testid="trades-row"]').first().click();
  await mobile.waitForTimeout(900);
  const mobileChart = mobile.locator('[data-testid="trade-detail-drawer"] [data-testid="trade-session-chart"]');
  check("Mobile: session chart renders inside the sheet", (await mobileChart.locator("canvas").count()) >= 1);
  await mobile.screenshot({ path: "scripts/shots/trades-upgrades-mobile.png" });
  await mobile.close();

  // ── 10. Console health ─────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n=== TRADES UPGRADES RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
