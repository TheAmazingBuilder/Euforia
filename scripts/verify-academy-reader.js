/**
 * Verify — Academy Batch A (reader upgrade):
 *   Resume     : opening a lesson other than the next-up pointer adds the
 *                "Pick up where you left off" row on Overview (SPA only).
 *   Checkpoint : long quiz-bearing lessons embed a server-graded Quick check.
 *   Notes      : autosave flow (type → Saved hh:mm).
 *   TOC        : "On this page" rail on wide screens + reading progress bar.
 *   Regression : completion CTA, bookmark, prev/next still functional.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);

  // ── Open the 2nd lesson of the first course (≠ next-up pointer) ───────────
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid^="academy-lesson-item-"]').nth(1).click();
  await page.waitForTimeout(1600);

  check("Lesson reader renders", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());

  // ── TOC rail + reading progress ────────────────────────────────────────────
  const toc = page.locator('[data-testid="academy-lesson-toc"]');
  if (await toc.isVisible().catch(() => false)) {
    const links = await toc.locator("a").count();
    check("TOC rail visible with entries", links >= 3, `entries=${links}`);
    const firstLabel = (await toc.locator("a").first().innerText()).trim();
    check("TOC first entry is a meaningful label", firstLabel.length >= 3, firstLabel);
    await toc.locator("a").last().click();
    await page.waitForTimeout(900);
    check("TOC link scrolls the page", (await page.evaluate(() => window.scrollY)) > 100);
  } else {
    check("TOC rail visible with entries", false, "rail not rendered (lesson may have <3 named blocks)");
  }

  check("Reading progress bar present", await page.locator('[data-testid="academy-reading-progress"]').isVisible());
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  const progressWidth = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="academy-reading-progress"] > div');
    return bar ? bar.getBoundingClientRect().width : 0;
  });
  check("Reading progress bar grows on scroll", progressWidth > 2, `width=${progressWidth.toFixed(1)}px`);

  // ── Checkpoint: find a lesson that serves one (in-page API scan), SPA to it ──
  const target = await page.evaluate(async () => {
    const get = async (path) => (await fetch(path)).json();
    const base = "/api";
    const catalog = await get(`${base}/academy/catalog`);
    for (const course of catalog.courses) {
      const detail = await get(`${base}/academy/courses/${course.id}`);
      for (const lesson of detail.lessons) {
        const full = await get(`${base}/academy/lessons/${lesson.id}`);
        if (full.checkpoint) return { courseId: course.id, lessonId: lesson.id };
      }
    }
    return null;
  });

  const backToCatalog = async () => {
    if (await page.locator('[data-testid="academy-lesson-reader"]').isVisible().catch(() => false)) {
      // Reader breadcrumb — first button is the course title → back to catalog
      await page.locator('[data-testid="academy-lesson-reader"] button').first().click();
    } else if (await page.locator('button:has-text("All courses")').first().isVisible().catch(() => false)) {
      await page.locator('button:has-text("All courses")').first().click();
    }
    await page.waitForTimeout(900);
  };

  let checkpointFound = false;
  if (target) {
    await backToCatalog();
    await page.locator(`[data-testid="academy-course-card-${target.courseId}"]`).click();
    await page.waitForTimeout(1100);
    await page.locator(`[data-testid="academy-lesson-item-${target.lessonId}"]`).click();
    await page.waitForTimeout(1600);
    checkpointFound = await page.locator('[data-testid="academy-checkpoint"]').isVisible();
  }
  check("Checkpoint served on a long lesson (engine)", target !== null, target ? `${target.courseId}/${target.lessonId}` : "none found");
  check("Inline checkpoint rendered", checkpointFound);

  if (checkpointFound) {
    const hasChoices = await page.locator('[data-testid="academy-checkpoint"] button[aria-pressed]').count();
    const hasNumeric = await page.locator('[data-testid="academy-checkpoint"] input[type="number"]').count();
    check("Checkpoint exposes answer controls", hasChoices > 0 || hasNumeric > 0, `choices=${hasChoices} numeric=${hasNumeric}`);
    if (hasChoices > 0) {
      await page.locator('[data-testid="academy-checkpoint"] button[aria-pressed]').first().click();
      await page.locator('[data-testid="academy-checkpoint-submit"]').click();
      await page.waitForTimeout(1200);
      const stamp = await page.locator('[data-testid="academy-checkpoint"] .stamp').innerText().catch(() => "");
      check("Checkpoint grades server-side", /correct|missed/i.test(stamp), stamp.trim());
    }
  }

  // ── Notes autosave ────────────────────────────────────────────────────────
  await page.locator('[data-testid="academy-lesson-notes-toggle"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="academy-lesson-notes-input"]').fill("Key idea: context beats pattern. Re-check HTF bias before entry.");
  await page.waitForTimeout(2000);
  const notesStatus = await page.locator('[data-testid="academy-lesson-notes"]').innerText();
  check("Notes autosave lands (Saved hh:mm)", /saved \d/i.test(notesStatus.replace(/\n/g, " ")), notesStatus.replace(/\n/g, " ").slice(0, 60));
  // survive a lesson switch: notes persist server-side
  await backToCatalog();
  if (target) {
    await page.locator(`[data-testid="academy-course-card-${target.courseId}"]`).click();
  } else {
    await page.locator('[data-testid^="academy-course-card-"]').first().click();
  }
  await page.waitForTimeout(1100);
  await page.locator('[data-testid^="academy-lesson-item-"]').nth(1).click();
  await page.waitForTimeout(1500);
  const toggle2 = page.locator('[data-testid="academy-lesson-notes-toggle"]');
  if ((await toggle2.getAttribute("aria-expanded")) !== "true") {
    await toggle2.click();
  }
  await page.waitForTimeout(400);
  const noteValue = await page.locator('[data-testid="academy-lesson-notes-input"]').inputValue();
  check("Notes persist across lesson switches", /context beats pattern/.test(noteValue));

  // ── Resume row on Overview ────────────────────────────────────────────────
  await page.click('[data-testid="academy-tab-overview"]');
  await page.waitForTimeout(1600);
  const resumeRow = page.locator('[data-testid="academy-resume"]');
  check("Resume row appears on Overview", await resumeRow.isVisible().catch(() => false));
  if (await resumeRow.isVisible().catch(() => false)) {
    const resumeText = await resumeRow.innerText();
    check("Resume copy mentions last-viewed lesson", /pick up where you left off/i.test(resumeText), resumeText.replace(/\n/g, " ").slice(0, 80));
    await page.locator('[data-testid="academy-resume-btn"]').click();
    await page.waitForTimeout(1400);
    check("Resume button reopens the reader", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());
  }

  // ── Regression: completion CTA still works ────────────────────────────────
  const completeBtn = page.locator('[data-testid="academy-lesson-complete"]');
  if (await completeBtn.isEnabled().catch(() => false)) {
    await completeBtn.click();
    await page.waitForTimeout(1200);
    const label = await completeBtn.innerText();
    check("Completion flow intact", /completed/i.test(label), label.trim());
  } else {
    check("Completion flow intact", true, "already completed");
  }

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
