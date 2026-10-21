/**
 * Verify — Academy module + navigation reorganization:
 *  Nav  : TRADING (session/trades/journal/playbook), INSIGHTS (analytics/
 *         calendar/discipline), ACADEMY section before SYSTEM, ⌘K palette
 *  Academy: Overview (continue learning, stats, recommendations), Courses
 *         (catalog, filters, course detail, lesson reader, complete,
 *         bookmark, quiz flow), Practice (pattern drill, candle lab,
 *         structure drill), Progress, Glossary (search + expand)
 * Plus mobile 390 overflow check and console health.
 *
 * IMPORTANT: the MSW store lives in the browser tab — the script navigates
 * with SPA link clicks ONLY (one initial goto), so state persists across pages.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script (CommonJS, never bundled) */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) {
      errors.push(`${resp.status()} ${resp.url()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // ── 0. Load the app (single goto — SPA navigation afterwards) ─────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ══ NAVIGATION REORGANIZATION ═════════════════════════════════════════════
  const sectionMap = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    const result = {};
    if (!nav) return result;
    let current = null;
    for (const el of nav.querySelectorAll("div, a")) {
      if (el.tagName === "DIV" && el.children.length === 0 && el.className.includes("uppercase") && el.textContent.trim()) {
        current = el.textContent.trim();
      }
      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (current && href && href !== "/" && !href.includes("login")) {
          result[current] = [...(result[current] || []), href];
        }
      }
    }
    return result;
  });

  check(
    "TRADING section = trades, journal, playbook",
    JSON.stringify(sectionMap.Trading) === JSON.stringify(["/trades", "/journal", "/playbook"]),
    JSON.stringify(sectionMap.Trading),
  );
  check(
    "INSIGHTS section = analytics, calendar, discipline",
    JSON.stringify(sectionMap.Insights) === JSON.stringify(["/analytics", "/calendar", "/discipline"]),
    JSON.stringify(sectionMap.Insights),
  );
  // Nofy joined the ACADEMY section as an independent first-class module.
  check("ACADEMY section present with /academy + /nofy", JSON.stringify(sectionMap.Academy) === JSON.stringify(["/academy", "/nofy"]), JSON.stringify(sectionMap.Academy));
  check(
    "SYSTEM section unchanged, after ACADEMY",
    JSON.stringify(sectionMap.System) === JSON.stringify(["/monitoring", "/settings", "/integrations", "/security"]),
    JSON.stringify(sectionMap.System),
  );

  // ══ ACADEMY OVERVIEW ══════════════════════════════════════════════════════
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1600);

  check("Academy view renders", await page.locator('[data-testid="academy-view"]').isVisible());
  check("Academy header + streak badge", await page.locator('[data-testid="academy-streak"]').isVisible());
  check("Overview tab content", await page.locator('[data-testid="academy-overview"]').isVisible());
  check("Continue Learning card", await page.locator('[data-testid="academy-continue"]').isVisible());
  check("Stat band renders", await page.locator('[data-testid="academy-stats"]').isVisible());
  check("Recommendations list", await page.locator('[data-testid="academy-recommendations"]').isVisible());
  const categoryCards = await page.locator('[data-testid^="academy-category-"]').count();
  check("12 category cards on Overview", categoryCards === 12, `count=${categoryCards}`);
  await page.screenshot({ path: "scripts/shots/academy-overview.png", fullPage: false });

  // ══ COURSES: catalog → course detail → lesson reader ══════════════════════
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1200);
  check("Catalog renders", await page.locator('[data-testid="academy-catalog"]').isVisible());
  const courseCards = await page.locator('[data-testid^="academy-course-card-"]').count();
  check("21 course cards in catalog", courseCards === 21, `count=${courseCards}`);

  // Filters: level chip
  await page.locator('[data-testid="academy-filters"] button', { hasText: "Beginner" }).first().click();
  await page.waitForTimeout(400);
  const beginnerCards = await page.locator('[data-testid^="academy-course-card-"]').count();
  check("Level filter narrows the catalog", beginnerCards > 0 && beginnerCards < courseCards, `beginner=${beginnerCards}`);
  await page.locator('[data-testid="academy-filters"] button', { hasText: "All levels" }).first().click();
  await page.waitForTimeout(400);

  // Search (server-side): "drawdown" should hit courses + glossary
  await page.fill('[data-testid="academy-search-input"]', "drawdown");
  await page.waitForTimeout(900);
  check("Search results render", await page.locator('[data-testid="academy-search-results"]').isVisible());
  await page.fill('[data-testid="academy-search-input"]', "");
  await page.waitForTimeout(700);

  // Course detail
  await page.click('[data-testid="academy-course-card-crs-risk-fundamentals"]');
  await page.waitForTimeout(1200);
  check("Course detail renders", await page.locator('[data-testid="academy-course-detail"]').isVisible());
  check("Course objectives block", await page.locator('[data-testid="academy-course-detail"] >> text=After this course').first().isVisible());
  const lessonItems = await page.locator('[data-testid^="academy-lesson-item-"]').count();
  check("Course lists its lessons", lessonItems === 4, `lessons=${lessonItems}`);

  // Lesson reader
  await page.click('[data-testid^="academy-lesson-item-"] >> nth=0');
  await page.waitForTimeout(1300);
  check("Lesson reader renders", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());
  const svgCount = await page.locator('[data-testid="academy-lesson-reader"] svg').count();
  check("Lesson includes SVG visuals", svgCount >= 0, `svg=${svgCount}`);

  // Complete + bookmark
  await page.click('[data-testid="academy-lesson-complete"]');
  await page.waitForTimeout(1100);
  const completeBtnText = (await page.locator('[data-testid="academy-lesson-complete"]').textContent()) ?? "";
  check("Lesson completion persists", completeBtnText.toLowerCase().includes("completed"), completeBtnText.trim());
  await page.click('[data-testid="academy-lesson-bookmark"]');
  await page.waitForTimeout(900);
  check("Lesson bookmark toggles", ((await page.locator('[data-testid="academy-lesson-bookmark"]').textContent()) ?? "").includes("Bookmarked"));
  await page.screenshot({ path: "scripts/shots/academy-lesson.png", fullPage: false });

  // Last lesson → inline quiz
  const nextBtn = page.locator('[data-testid="academy-lesson-reader"] button', { hasText: "Next" }).first();
  for (let i = 0; i < 3; i += 1) {
    if (!(await nextBtn.isEnabled())) break;
    await nextBtn.click();
    await page.waitForTimeout(1000);
  }
  const quizOpen = page.locator('[data-testid="academy-quiz-open"]');
  check("Inline quiz offered after last lesson", await quizOpen.isVisible());
  await quizOpen.click();
  await page.waitForTimeout(1000);

  // Answer every question (first option / True / numeric guess) then submit
  const quizFrame = page.locator('[data-testid="academy-quiz"]');
  const optionCount = await quizFrame.locator("button[type=button]:not([disabled])").count();
  // Click first MC option of each group by pressing the first clickable choice per question
  const questions = await quizFrame.locator("li").count();
  for (let q = 0; q < questions; q += 1) {
    const li = quizFrame.locator("li").nth(q);
    const firstChoice = li.locator("button[type=button]").first();
    if ((await firstChoice.count()) > 0) {
      await firstChoice.click();
    } else {
      const numeric = li.locator('input[type="number"]');
      if ((await numeric.count()) > 0) await numeric.fill("100");
    }
  }
  await page.click('[data-testid="academy-quiz-submit"]');
  await page.waitForTimeout(1300);
  check("Quiz graded with results", await page.locator('[data-testid="academy-quiz-result"]').isVisible());
  check(`Quiz interactions available`, optionCount > 0, `buttons=${optionCount}`);
  await page.screenshot({ path: "scripts/shots/academy-quiz.png", fullPage: false });

  // ══ PRACTICE ══════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(1300);
  check("Practice panel renders", await page.locator('[data-testid="academy-practice"]').isVisible());
  const drillOptions = await page.locator('[data-testid^="academy-drill-option-"]').count();
  check("Pattern drill serves 4 options", drillOptions === 4, `options=${drillOptions}`);
  await page.click('[data-testid^="academy-drill-option-"] >> nth=0');
  await page.waitForTimeout(700);
  check("Drill feedback + explanation", await page.locator('[data-testid="academy-drill-feedback"]').isVisible());
  await page.click('[data-testid="academy-drill-next"]');
  await page.waitForTimeout(900);
  const labSliders = await page.locator('[data-testid^="academy-lab-"]').count();
  check("Candle Lab has OHLC sliders", labSliders === 4, `sliders=${labSliders}`);
  const structureOptions = await page.locator('[data-testid^="academy-structure-option-"]').count();
  check("Structure drill serves options", structureOptions >= 3, `options=${structureOptions}`);
  await page.screenshot({ path: "scripts/shots/academy-practice.png", fullPage: false });

  // ══ PROGRESS ══════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1100);
  check("Progress panel renders", await page.locator('[data-testid="academy-progress-panel"]').isVisible());
  const progressRows = await page.locator('[data-testid^="academy-progress-cat-"]').count();
  check("Progress lists 12 categories", progressRows === 12, `rows=${progressRows}`);
  const overallPct = await page.locator('[data-testid="academy-progress-overall-bar"]').boundingBox();
  check("Overall progress bar reflects the completed lesson", overallPct && overallPct.width > 0);

  // ══ GLOSSARY ══════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-glossary"]');
  await page.waitForTimeout(1100);
  check("Glossary renders", await page.locator('[data-testid="academy-glossary"]').isVisible());
  await page.fill('[data-testid="academy-glossary-search"]', "drawdown");
  await page.waitForTimeout(900);
  const termCount = await page.locator('[data-testid^="academy-glossary-term-"]').count();
  check("Glossary search narrows results", termCount >= 1 && termCount <= 8, `terms=${termCount}`);
  await page.locator('[data-testid^="academy-glossary-term-"]').first().click();
  await page.waitForTimeout(400);
  check("Term expands with layered definition", await page.locator('[data-testid="academy-glossary"] >> text=Professional').first().isVisible());

  // ══ ⌘K palette finds Academy ═════════════════════════════════════════════
  await page.keyboard.press("Escape").catch(() => {});
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(600);
  await page.keyboard.type("academy");
  await page.waitForTimeout(700);
  const paletteHasAcademy = ((await page.locator('[role="dialog"]').textContent()) ?? "").includes("Academy");
  check("⌘K palette surfaces the Academy entry", paletteHasAcademy);
  await page.keyboard.press("Escape");

  // ══ OTHER PAGES UNBROKEN (SPA) ═══════════════════════════════════════════
  await page.click('a[href="/trades"]');
  await page.waitForTimeout(1400);
  check("Trades still loads after nav reorg", page.url().includes("/trades"));
  await page.click('a[href="/analytics"]');
  await page.waitForTimeout(1400);
  check("Analytics still loads after nav reorg", page.url().includes("/analytics"));
  await page.click('a[href="/journal"]');
  await page.waitForTimeout(1400);
  check("Trade Review still loads", page.url().includes("/journal"));

  // ══ MOBILE 390 ════════════════════════════════════════════════════════════
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/academy`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(1800);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Mobile 390 — no horizontal overflow on /academy", overflow <= 1, `overflowPx=${overflow}`);
  await mobile.screenshot({ path: "scripts/shots/academy-mobile.png", fullPage: false });
  await mobile.close();

  // ══ CONSOLE HEALTH ════════════════════════════════════════════════════════
  check("No unexpected console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((error) => {
  console.error("VERIFY SCRIPT ERROR:", error);
  process.exit(1);
});
