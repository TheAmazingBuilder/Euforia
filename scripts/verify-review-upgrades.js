/**
 * Verify — Trade Review module upgrades (3 user-selected features).
 *  1. Review streak with an honest freeze: 1 grace day per calendar week,
 *     reported separately (never counted as reviewed)
 *  2. Recurring lesson template: "Reuse from your last review" chip fills
 *     the next-time note
 *  3. Monthly review journal: one-page printable report (Print → Save as PDF)
 * Plus light theme, mobile 390 and console health.
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

  // Capture the overview payload while the page loads.
  const overviewPromise = page.waitForResponse(
    (resp) => resp.url().includes("/reviews/overview") && resp.request().method() === "GET",
    { timeout: 30_000 },
  );
  await page.goto(`${BASE}/journal?tab=overview`, { waitUntil: "networkidle", timeout: 60_000 });
  const overview = await (await overviewPromise).json();
  await page.waitForSelector('[data-testid="review-overview"]', { timeout: 30_000 });
  await page.waitForTimeout(500);

  // ── 1. Freeze-aware streak ─────────────────────────────────────────────────
  const streak = overview.streak;
  check(
    "Overview exposes the streak breakdown",
    streak && typeof streak.currentDays === "number" && streak.gracePerWeek === 1,
    streak ? `current=${streak.currentDays} frozen=${streak.frozenDays}` : "missing",
  );
  check(
    "Streak arithmetic is honest (effective = current + frozen)",
    streak.effectiveDays === streak.currentDays + streak.frozenDays,
    `${streak.currentDays}+${streak.frozenDays}=${streak.effectiveDays}`,
  );
  check(
    "Badge shows the effective streak",
    (await page.locator('[data-testid="header-streak"]').textContent())?.includes(`${streak.effectiveDays}d`) ?? false,
  );
  check(
    "KPI sub reports the grace ledger",
    (await page.locator('[data-testid="kpi-streak"]').textContent())?.includes(
      streak.frozenDays > 0 ? "frozen grace day" : "Grace day available",
    ) ?? false,
  );
  if (streak.frozenDays > 0) {
    check(
      "Frozen-day note renders with the rule",
      (await page.locator('[data-testid="streak-freeze-note"]').textContent())?.includes("one grace day per week") ?? false,
    );
    check(
      "Header shows the snowflake count",
      (await page.locator('[data-testid="header-streak-frozen"]').count()) === 1,
    );
  } else {
    check("No freeze in seed — note hidden, header clean", (await page.locator('[data-testid="header-streak-frozen"]').count()) === 0);
  }
  check(
    "lastImprovementNote present for the template",
    typeof overview.lastImprovementNote === "string" && overview.lastImprovementNote.length > 0,
    (overview.lastImprovementNote ?? "").slice(0, 40),
  );

  await page.screenshot({ path: "scripts/shots/review-upgrades-streak.png" });

  // ── 2. Recurring lesson template ───────────────────────────────────────────
  await page.locator('[data-testid="tab-reviews"]').click();
  await page.waitForTimeout(700);
  // Open the first PENDING review (dashed row → review-open button).
  await page.locator('[data-testid="review-open"]').first().click();
  await page.waitForTimeout(600);
  check("Review dialog opens", await page.locator('[data-testid="review-dialog"]').isVisible());
  const reuseChip = page.locator('[data-testid="review-reuse-note"]');
  check("Reuse chip offered for an empty next-time field", await reuseChip.isVisible());
  const chipText = (await reuseChip.textContent()) ?? "";
  check(
    "Chip carries the last note text",
    chipText.includes(overview.lastImprovementNote.slice(0, 20)),
    chipText.slice(0, 60),
  );
  await reuseChip.click();
  await page.waitForTimeout(300);
  const inputValue = await page.locator('[data-testid="review-improvement-input"]').inputValue();
  check("Chip fills the next-time note", inputValue === overview.lastImprovementNote);
  // Editing flow: after filling, the chip disappears (no silent overwrite).
  check("Chip retracted once the field is filled", !(await reuseChip.isVisible().catch(() => false)));
  await page.screenshot({ path: "scripts/shots/review-upgrades-reuse.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 3. Monthly report (one-page printable) ─────────────────────────────────
  await page.locator('[data-testid="tab-overview"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="review-export-month"]').click();
  await page.waitForTimeout(600);
  const reportDialog = page.locator('[data-testid="review-report-dialog"]');
  check("Report dialog opens", await reportDialog.isVisible());
  const sheet = page.locator('[data-testid="review-report-sheet"]');
  check("Printable sheet rendered", await sheet.isVisible());
  const sheetText = (await sheet.textContent()) ?? "";
  check("Sheet header names the month", sheetText.includes("Monthly journal"), sheetText.slice(0, 80));
  check("Sheet shows KPI band", sheetText.includes("Total R") && sheetText.includes("Win rate"));
  const reviewCount = overview.stats.reviewedTrades;
  check(
    "Month with reviews fills lessons",
    reviewCount === 0 || (await page.locator('[data-testid="review-report-sheet"] li').count()) > 0,
    `reviews=${reviewCount}`,
  );

  // Print → window.print() called (scoped body class applied by the dialog).
  await page.evaluate(() => {
    window.__printCalled = false;
    window.__printHadClass = false;
    window.print = () => {
      window.__printCalled = true;
      window.__printHadClass = document.body.classList.contains("printing-review");
    };
  });
  await page.locator('[data-testid="review-report-print"]').click();
  await page.waitForTimeout(500);
  check("Print button triggers window.print()", await page.evaluate(() => window.__printCalled === true));
  // The class is scoped WHILE printing, then cleaned up afterwards.
  check(
    "Body carries the scoped print class during the print",
    await page.evaluate(() => window.__printHadClass === true),
  );
  check(
    "Print class cleaned up after the dialog flow",
    await page.evaluate(() => !document.body.classList.contains("printing-review")),
  );
  await page.screenshot({ path: "scripts/shots/review-upgrades-report.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 4. Light theme ─────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(700);
  check("Light theme: overview renders", await page.locator('[data-testid="review-overview"]').isVisible());
  await page.locator('[data-testid="review-export-month"]').click();
  await page.waitForTimeout(500);
  check("Light theme: report sheet renders", await page.locator('[data-testid="review-report-sheet"]').isVisible());
  await page.screenshot({ path: "scripts/shots/review-upgrades-light.png" });
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  });
  await page.waitForTimeout(300);

  // ── 5. Mobile 390 ──────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/journal?tab=overview`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForSelector('[data-testid="review-overview"]', { timeout: 30_000 });
  await mobile.waitForTimeout(700);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  await mobile.locator('[data-testid="review-export-month"]').click();
  await mobile.waitForTimeout(500);
  check("Mobile: report sheet renders", await mobile.locator('[data-testid="review-report-sheet"]').isVisible());
  await mobile.screenshot({ path: "scripts/shots/review-upgrades-mobile.png" });
  await mobile.close();

  // ── 6. Console health ──────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n=== TRADE REVIEW UPGRADES RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
