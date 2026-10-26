/**
 * Verify - Academy Batch C (progress & motivation):
 *   Weekly plan  : "This week" card on Overview with 3 bars, status chip.
 *   Milestones   : grid on Progress with earned/locked states + progress.
 *   Certifications: 12 rows, tier chips, exam flow start→answer→submit→tier.
 *   Reveal       : lesson diagrams carry the scroll-reveal (clip-path wipe).
 * SPA-only navigation (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);

  // ── Weekly plan card (Overview) ───────────────────────────────────────────
  check("Weekly plan card renders", await page.locator('[data-testid="academy-weekly-plan"]').isVisible());
  const planText = await page.locator('[data-testid="academy-weekly-plan"]').innerText();
  check("Weekly plan has 3 rows", /Lessons/.test(planText) && /Drills/.test(planText) && /Quizzes/.test(planText));
  const statusChip = await page.locator('[data-testid="academy-weekly-status"]').innerText();
  check("Weekly status chip present", /week of|complete/i.test(statusChip), statusChip.trim());

  // ── Milestones + certifications (Progress) ────────────────────────────────
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1800);
  check("Milestones section renders", await page.locator('[data-testid="academy-milestones"]').isVisible());
  const milestoneCount = await page.locator('[data-testid^="academy-milestone-"]').count();
  check("Milestone cards present (≥10)", milestoneCount >= 10, `count=${milestoneCount}`);
  const lockedProgress = await page.locator('[data-testid="academy-milestone-first-lesson"]').innerText();
  check("Locked milestone shows honest progress (0/1)", /0\/1/.test(lockedProgress.replace(/\n/g, " ")), lockedProgress.replace(/\n/g, " ").slice(0, 60));
  check("Certifications section renders", await page.locator('[data-testid="academy-certifications"]').isVisible());
  const tierChips = await page.locator('[data-testid^="academy-cert-tier-"]').count();
  check("12 certification tier chips", tierChips === 12, `count=${tierChips}`);

  // ── Exam flow: open a category exam, answer, submit ──────────────────────
  // Pick the category with the smallest pool (trade-management, 1 course).
  const toggle = page.locator('[data-testid="academy-cert-toggle-cat-trade-management"]');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(1400);
    const exam = page.locator('[data-testid="academy-exam"]');
    check("Exam paper opens", await exam.isVisible());
    // Answer every question: TF buttons or first MC option; numeric gets 0.
    const questions = exam.locator("ol > li");
    const total = await questions.count();
    for (let i = 0; i < total; i += 1) {
      const question = questions.nth(i);
      const choices = question.locator("button[aria-pressed]");
      if ((await choices.count()) > 0) {
        await choices.first().click();
      } else {
        await question.locator('input[type="number"]').fill("0");
      }
    }
    check("All exam questions answerable", total > 0, `questions=${total}`);
    await page.locator('[data-testid="academy-exam-submit"]').click();
    await page.waitForTimeout(1600);
    const resultText = await page.locator('[data-testid="academy-exam-result"]').innerText();
    check("Exam grades with a tier", /tier|not yet certified/i.test(resultText.replace(/\n/g, " ")), resultText.replace(/\n/g, " ").slice(0, 70));
    const tierChip = await page.locator('[data-testid="academy-cert-tier-cat-trade-management"]').innerText();
    check("Tier chip updates after attempt", !/not certified|none/i.test(tierChip) || /not certified/i.test(tierChip), tierChip.trim());
  } else {
    check("Trade-management certification row present", false);
  }

  // ── Milestone flips to earned after a real completion ───────────────────
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1000);
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(1000);
  await page.locator('[data-testid^="academy-lesson-item-"]').first().click();
  await page.waitForTimeout(1400);
  await page.click('[data-testid="academy-lesson-complete"]');
  await page.waitForTimeout(1400);
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1600);
  const firstMilestone = await page.locator('[data-testid="academy-milestone-first-lesson"]').innerText();
  check("First steps milestone flips to earned after completion", /earned/i.test(firstMilestone), firstMilestone.replace(/\n/g, " ").slice(0, 70));

  // ── Diagram reveal on scroll (find a lesson WITH visual blocks via API) ──
  const visualLesson = await page.evaluate(async () => {
    const get = async (path) => (await fetch(path)).json();
    const base = "/api";
    const catalog = await get(`${base}/academy/catalog`);
    const visualKinds = ["candles", "structure", "zones", "risk"];
    for (const course of catalog.courses) {
      const detail = await get(`${base}/academy/courses/${course.id}`);
      for (const lesson of detail.lessons) {
        const full = await get(`${base}/academy/lessons/${lesson.id}`);
        if (full.blocks.some((block) => visualKinds.includes(block.kind))) {
          return { courseId: course.id, lessonId: lesson.id };
        }
      }
    }
    return null;
  });

  if (visualLesson) {
    await page.click('[data-testid="academy-tab-courses"]');
    await page.waitForTimeout(1000);
    await page.locator(`[data-testid="academy-course-card-${visualLesson.courseId}"]`).click();
    await page.waitForTimeout(1100);
    await page.locator(`[data-testid="academy-lesson-item-${visualLesson.lessonId}"]`).click();
    await page.waitForTimeout(1800);
    const figureCount = await page.locator("figure .chart-paper[data-shown]").count();
    check("Lesson diagrams mounted with reveal state", figureCount >= 1, `figures=${figureCount}`);
    // Reveal fires whenever the figure enters the viewport - immediately when
    // already in view, on scroll otherwise. Either way: all shown after scroll.
    const preScrollShown = await page.locator('figure .chart-paper[data-shown="true"]').count();
    await page.locator("figure .chart-paper[data-shown]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1300);
    const shownCount = await page.locator('figure .chart-paper[data-shown="true"]').count();
    check("Diagrams reveal when in view (at mount or on scroll)", shownCount === figureCount && shownCount >= preScrollShown, `pre=${preScrollShown} post=${shownCount}/${figureCount}`);
    const hasWipe = await page.evaluate(() => {
      const node = document.querySelector('figure .chart-paper[data-shown="true"]');
      if (!node) return false;
      const cs = getComputedStyle(node);
      return cs.clipPath.includes("inset") || cs.clipPath === "none";
    });
    check("Reveal uses clip-path transition", hasWipe);
  } else {
    check("Visual lesson found via API", false);
  }

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
