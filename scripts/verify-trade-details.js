/**
 * Verify — Trade details full-width dialog + Coach tab removal.
 * Probes (user request): the trade details modal takes the full width on
 * desktop (plan/reality on one row, notes | evidence side by side), the
 * mobile sheet stays full-width, delete/close dialogs still work, and the
 * Coach entry is gone from the sidebar (no dead /coach links).
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

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

  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Open the first trade's details (click the first row of the ledger).
  const firstRow = page.locator("tbody tr").first();
  check("Trades ledger has rows", (await page.locator("tbody tr").count()) > 0);
  await firstRow.click();
  await page.waitForTimeout(700);

  const dialog = page.locator('[data-testid="trade-detail-dialog"]');
  check("Details open as dialog on desktop", await dialog.isVisible());

  // Full width: the dialog spans the viewport minus the 2rem gutter.
  const box = await dialog.boundingBox();
  const expected = 1440 - 32;
  check(
    "Dialog takes the full width (1440 − 2rem)",
    box !== null && Math.abs(box.width - expected) <= 2,
    box ? `width=${Math.round(box.width)} (attendu ≈ ${expected})` : "no box",
  );

  // Plan/reality readouts on ONE row (8 columns at ≥1280px: 1440 desktop).
  const readouts = dialog.locator("section").first();
  const cellLocators = await readouts.locator(":scope > div").all();
  const cells = [];
  for (const cell of cellLocators) cells.push(await cell.boundingBox());
  const oneRow =
    cells.length >= 8 && cells.slice(0, 8).every((c) => c && Math.abs(c.y - cells[0].y) < 4);
  check("Verdict readouts render on a single row", oneRow, `cells=${cells.length}`);

  // Notes and evidence side by side.
  const notesBox = await dialog
    .locator("section", { hasText: "Notes" })
    .first()
    .boundingBox();
  const shotsBox = await dialog
    .locator("section", { hasText: "Screenshots" })
    .first()
    .boundingBox();
  check(
    "Notes | screenshots side by side",
    notesBox !== null && shotsBox !== null && shotsBox.x > notesBox.x + notesBox.width - 4,
    notesBox && shotsBox ? `notes.x=${Math.round(notesBox.x)} shots.x=${Math.round(shotsBox.x)}` : "",
  );
  await page.screenshot({ path: "scripts/shots/trade-detail-dialog.png" });

  // Actions still wired: Edit opens the edit dialog, then cancel.
  await dialog.locator('[data-testid="trade-edit-open"]').click();
  await page.waitForTimeout(500);
  check("Edit action opens the edit dialog", (await page.locator('[role="dialog"]').count()) >= 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Close the details (Escape) — no dead overlay.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Details dialog closes", !(await dialog.isVisible().catch(() => false)));

  // ── Mobile 390: the sheet stays full width ───────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  await mobile.locator("tbody tr").first().click();
  await mobile.waitForTimeout(700);
  const sheet = mobile.locator('[data-testid="trade-detail-drawer"]');
  check("Mobile: details open as sheet", await sheet.isVisible());
  const sheetBox = await sheet.boundingBox();
  check(
    "Mobile sheet full width (390)",
    sheetBox !== null && Math.abs(sheetBox.width - 390) <= 2,
    sheetBox ? `width=${Math.round(sheetBox.width)}` : "no box",
  );
  await mobile.screenshot({ path: "scripts/shots/trade-detail-mobile.png" });
  await mobile.close();

  // ── Sidebar: no Coach entry anywhere ─────────────────────────────────────
  check(
    "Sidebar has no /coach link",
    (await page.locator('a[href="/coach"]').count()) === 0,
  );

  // ── Console errors ───────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

  console.log("\n=== TRADE DETAILS / COACH REMOVAL RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
