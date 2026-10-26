/**
 * Verify - Trade Review module (fusion with Goal).
 * Probes (in ONE SPA session - the mock store reseeds on full reload):
 *  1. Header + 4 tabs (Overview/Goals/Reviews/Lessons), ?tab= persistence
 *  2. Overview: 4 KPI tiles, grade bar segments, pending CTA, recent lessons
 *  3. Goals: colorful cards, computed progress (actual ≠ target, detail "vs"),
 *     create → edit → delete round-trip with toasts
 *  4. Reviews: pending queue matches header count, dialog workflow (grade +
 *     playbook match + checklist + lesson) moves a row to Reviewed, undo works
 *  5. Lessons: source/grade filters + search
 *  6. Fusion: sidebar has NO /goals entry, /goals redirects to journal goals tab
 *  7. Mobile 390 no overflow, light theme capture
 *  8. Zero console errors (documented market-service noise excluded)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  // ── 1. Header + tabs ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/journal`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  check("Header renders with module identity", await page.locator('[data-testid="review-header"]').isVisible());
  const tabs = ["overview", "goals", "reviews", "lessons"];
  for (const tab of tabs) {
    check(`Tab ${tab} present`, await page.locator(`[data-testid="tab-${tab}"]`).isVisible());
  }

  // ── 2. Overview content ────────────────────────────────────────────────────
  for (const kpi of ["kpi-review-rate", "kpi-streak", "kpi-lessons", "kpi-goals"]) {
    check(`KPI tile ${kpi}`, await page.locator(`[data-testid="${kpi}"]`).isVisible());
  }
  const gradeSegments = await page.locator('[data-testid="grade-bar"] span').count();
  check("Grade distribution bar has colored segments", gradeSegments >= 1, `${gradeSegments} segments`);
  const pendingOverview = Number(await page.locator('[data-testid="overview-pending-count"]').innerText());
  check("Pending count visible and > 0", pendingOverview > 0, String(pendingOverview));
  const previewRows = await page.locator('[data-testid="pending-preview-row"]').count();
  check("Pending queue preview rows", previewRows >= 1, `${previewRows} rows`);
  check("Recent lessons feed populated", (await page.locator('[data-testid="overview-lesson-row"]').count()) >= 1);
  await page.screenshot({ path: "scripts/shots/review-overview.png" });

  // ── 3. Goals tab ───────────────────────────────────────────────────────────
  await page.locator('[data-testid="tab-goals"]').click();
  await page.waitForTimeout(800);
  check("Goals tab URL persisted", page.url().includes("tab=goals"), page.url());
  const goalCards = page.locator('[data-testid="goal-card"]');
  await goalCards.first().waitFor({ state: "visible", timeout: 10000 });
  const goalCount = await goalCards.count();
  check("Goal cards rendered", goalCount >= 6, `${goalCount} cards`);
  const progressValue = await page.locator('[data-testid="goal-progress"]').first().getAttribute("data-progress");
  const progressNum = Number(progressValue);
  check("Progress bar 0-100", progressNum >= 0 && progressNum <= 100, progressValue);
  const detailText = await page.locator('[data-testid="goal-detail"]').first().innerText();
  check("Detail line compares actual vs target", detailText.includes("vs"), detailText);
  const statusBadges = await page.locator('[data-testid="goal-status"]').count();
  check("Status badges on cards", statusBadges === goalCount, `${statusBadges}/${goalCount}`);
  const gradientSpines = await page.locator('[data-testid="goal-card"] span.bg-gradient-to-r').count();
  check("Colorful gradient spines on cards", gradientSpines === goalCount, `${gradientSpines}/${goalCount}`);
  await page.screenshot({ path: "scripts/shots/review-goals.png" });

  // Create a goal
  const beforeCreate = await goalCards.count();
  await page.locator('[data-testid="goal-create"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="goal-title-input"]').fill("Verify goal - avg R above 0.2");
  // metric select (radix): click trigger then item
  await page.locator('[data-testid="goal-metric-select"]').click();
  await page.getByRole("option", { name: "Average R" }).click();
  await page.locator('[data-testid="goal-target-input"]').fill("0.2");
  await page.locator('[data-testid="goal-period-select"]').click();
  await page.getByRole("option", { name: "This week" }).click();
  // pick LIME color (last swatch)
  await page.locator('[data-testid="goal-color-picker"] button[aria-label="Color lime"]').click();
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1000);
  check("Goal created appears in grid", (await goalCards.count()) === beforeCreate + 1, `${beforeCreate}→${await goalCards.count()}`);

  // Edit it: change target 0.2 → 0.5
  const newCard = page.locator('[data-testid="goal-card"]', { hasText: "Verify goal" });
  await newCard.locator('button[aria-label="Edit goal"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  check("Edit dialog re-seeds metric", await page.locator('[data-testid="goal-metric-select"]').innerText().then((t) => t.includes("Average R")));
  await page.locator('[data-testid="goal-target-input"]').fill("0.5");
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1000);
  const editedTarget = await newCard.innerText();
  check("Edited target reflected (0.50R)", editedTarget.includes("0.50R"), editedTarget.slice(0, 80).replace(/\n/g, " "));

  // Delete it (confirm dialog)
  page.once("dialog", (dialog) => dialog.accept());
  await newCard.locator('button[aria-label="Delete goal"]').click();
  await page.waitForTimeout(1000);
  check("Deleted goal removed from grid", (await goalCards.count()) === beforeCreate, `${await goalCards.count()}`);

  // ── 4. Reviews workflow ────────────────────────────────────────────────────
  await page.locator('[data-testid="tab-reviews"]').click();
  await page.waitForTimeout(800);
  check("Reviews tab URL persisted", page.url().includes("tab=reviews"), page.url());
  const pendingCount = Number(await page.locator('[data-testid="pending-count"]').innerText());
  const reviewedCount = Number(await page.locator('[data-testid="reviewed-count"]').innerText());
  check("Overview pending count matches queue badge", pendingOverview === pendingCount, `${pendingOverview} vs ${pendingCount}`);
  check("Reviewed badge matches reviewed rows", reviewedCount === (await page.locator('[data-testid="review-row"][data-review-status="REVIEWED"]').count()), `${reviewedCount}`);

  const pendingRowsBefore = await page.locator('[data-testid="review-row"][data-review-status="PENDING"]').count();
  await page.locator('[data-testid="review-row"][data-review-status="PENDING"]').first().locator('[data-testid="review-open"]').click();
  await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible" });
  const verdictText = await page.locator('[data-testid="review-r"]').innerText();
  check("Verdict strip shows R", /R$/.test(verdictText.trim()), verdictText);
  // Grade A + matched + lesson
  await page.locator('[data-testid="execution-grade-picker"] button', { hasText: "A" }).click();
  await page.locator('[data-testid="playbook-match-picker"] button', { hasText: "Matched" }).click();
  const hasChecklist = (await page.locator('[data-testid="review-checklist"]').count()) > 0;
  if (hasChecklist) {
    // toggle the first checklist item (works with 0+ items, exercised here)
    await page.locator('[data-testid="review-checklist"] button').first().click();
  }
  await page.locator('[data-testid="review-lessons-input"]').fill("Verified entry discipline - the retest close was the trigger and I waited for it.");
  await page.locator('[data-testid="review-improvement-input"]').fill("Next time: re-read the checklist before every entry.");
  await page.screenshot({ path: "scripts/shots/review-dialog.png" });
  await page.locator('[data-testid="review-save"]').click();
  await page.waitForTimeout(1200);
  const reviewedAfter = Number(await page.locator('[data-testid="reviewed-count"]').innerText());
  check("Review saved moves row to Reviewed", reviewedAfter === reviewedCount + 1, `${reviewedCount}→${reviewedAfter}`);
  check("Pending row count decremented", (await page.locator('[data-testid="review-row"][data-review-status="PENDING"]').count()) === pendingRowsBefore - 1);

  // Undo it - trade returns to the queue
  const reviewedRows = page.locator('[data-testid="review-row"][data-review-status="REVIEWED"]');
  await reviewedRows.first().locator('button[aria-label="Undo review"]').click();
  await page.waitForTimeout(1000);
  check("Undo returns trade to pending", (await page.locator('[data-testid="review-row"][data-review-status="PENDING"]').count()) === pendingRowsBefore);

  // ── 5. Lessons library ─────────────────────────────────────────────────────
  await page.locator('[data-testid="tab-lessons"]').click();
  await page.waitForTimeout(800);
  check("Lessons tab URL persisted", page.url().includes("tab=lessons"), page.url());
  const lessonCards = page.locator('[data-testid="lesson-card"]');
  const lessonTotal = await lessonCards.count();
  check("Lessons library populated", lessonTotal >= 5, `${lessonTotal} lessons`);
  // Source filter
  await page.locator('[data-testid="lessons-source-review"]').click();
  await page.waitForTimeout(400);
  const reviewSources = await page.locator('[data-testid="lesson-card"][data-source="REVIEW"]').count();
  check("Source filter REVIEW isolates reviews", reviewSources === (await lessonCards.count()) && reviewSources > 0, `${reviewSources}`);
  await page.locator('[data-testid="lessons-source-all"]').click();
  // Search
  await page.locator('[data-testid="lessons-search"]').fill("stop");
  await page.waitForTimeout(500);
  const searched = await lessonCards.count();
  check("Search narrows the library", searched < lessonTotal && searched >= 1, `${searched}/${lessonTotal}`);
  await page.locator('[data-testid="lessons-search"]').fill("");
  await page.screenshot({ path: "scripts/shots/review-lessons.png" });

  // ── 6. Fusion checks ───────────────────────────────────────────────────────
  const sidebarGoalsLink = await page.locator('aside a[href="/goals"]').count();
  check("Sidebar has NO /goals entry (fusion)", sidebarGoalsLink === 0);
  const sidebarJournal = await page.locator('aside a[href="/journal"]').count();
  check("Sidebar keeps Trade Review (/journal)", sidebarJournal >= 1);

  // ── 7. Light theme + mobile 390 ────────────────────────────────────────────
  await page.goto(`${BASE}/journal?tab=goals`, { waitUntil: "networkidle", timeout: 60000 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(800);
  check("Light theme renders goals", await page.locator('[data-testid="goal-card"]').first().isVisible());
  await page.screenshot({ path: "scripts/shots/review-light.png" });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/journal`, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForTimeout(1200);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/review-mobile.png" });
  await mobile.close();

  // Redirect check LAST (full reload reseeds the store)
  await page.goto(`${BASE}/goals`, { waitUntil: "networkidle", timeout: 60000 });
  check("/goals redirects to journal goals tab", page.url().includes("/journal") && page.url().includes("tab=goals"), page.url());

  // ── 8. Console health (socket.io 404 + candles 400 = market-service noise) ─
  const noise = errors.filter(
    (e) => e.includes("socket.io") || (e.includes("404") && e.includes("candles")),
  );
  check("Zero console errors (known market-service noise excluded)", errors.length - noise.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n═══ TRADE REVIEW MODULE - RESULTS ═══");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
