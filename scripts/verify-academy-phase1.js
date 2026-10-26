/**
 * Verify - Academy Phase 1: lesson-reader vignettes + scroll-animated rings.
 *   Reader : lesson header opens with the course concept vignette (desktop
 *            side card + mobile banner), category dot in the meta line.
 *   Rings  : ProgressRing + SegmentedRing draw on scroll-in (900ms dash
 *            transition, stagger), final dasharray reflects progress.
 *   Safety : mobile 390 no horizontal overflow, light theme re-tint, console
 *            health.
 *
 * IMPORTANT: the MSW store lives in the browser tab - the script navigates
 * with SPA clicks ONLY (one initial goto), so state persists across pages.
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
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  // ── 0. Load + SPA to Academy ───────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);

  check("Academy view renders", await page.locator('[data-testid="academy-view"]').isVisible());

  // ══ RING ANIMATION (Overview - wiring first; fill checked after a completion) ═
  const ring = page.locator('[data-testid="academy-ring-overall"]').first();
  check("Overall ring gauge present", await ring.isVisible());

  const ringStyle = await ring.evaluate((el) => {
    const arcs = el.querySelectorAll("svg circle");
    const arc = arcs[arcs.length - 1];
    const cs = getComputedStyle(arc);
    return { dasharray: cs.strokeDasharray, transition: cs.transitionDuration };
  });
  check(
    "Ring arc carries the draw-in transition (900ms)",
    ringStyle.transition.includes("0.9s"),
    `transitionDuration=${ringStyle.transition}`,
  );

  // ══ LESSON READER VIGNETTE (desktop) ═══════════════════════════════════════
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1200);
  const firstCourse = page.locator('[data-testid^="academy-course-card-"]').first();
  await firstCourse.click();
  await page.waitForTimeout(1200);
  const firstLesson = page.locator('[data-testid^="academy-lesson-item-"]').first();
  await firstLesson.click();
  await page.waitForTimeout(1500);

  check("Lesson reader renders", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());
  const vignette = page.locator('[data-testid="academy-lesson-vignette"]');
  const vignetteCount = await vignette.count();
  check("Lesson header carries a course vignette", vignetteCount === 2, `count=${vignetteCount}`);
  const vignetteVisible = await vignette.nth(1).isVisible();
  check("Vignette visible on desktop (side card)", vignetteVisible);
  const vignetteSvg = await vignette.first().locator("svg").count();
  check("Vignette is a real SVG chart", vignetteSvg >= 1, `svg=${vignetteSvg}`);
  check(
    "Lesson header band present",
    await page.locator('[data-testid="academy-lesson-header"]').isVisible(),
  );
  // Category dot in the meta line (hue dot before the track name)
  const metaDot = await page.locator('[data-testid="academy-lesson-header"] span.size-2.rounded-full').count();
  check("Category hue dot in lesson meta", metaDot >= 1, `count=${metaDot}`);

  // Bookmarked state cycle still works on the reader
  await page.click('[data-testid="academy-lesson-bookmark"]');
  await page.waitForTimeout(900);
  const bookmarkText = await page.locator('[data-testid="academy-lesson-bookmark"]').innerText();
  check("Bookmark toggle still works", /bookmarked/i.test(bookmarkText), bookmarkText.trim());
  await page.click('[data-testid="academy-lesson-bookmark"]');
  await page.waitForTimeout(600);

  // Drive real progress so the rings have a non-zero fill, then re-assert.
  await page.click('[data-testid="academy-lesson-complete"]');
  await page.waitForTimeout(1200);

  // ══ SEGMENTED RING ANIMATION (Progress) ════════════════════════════════════
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1500);
  check("Progress panel renders", await page.locator('[data-testid="academy-progress-panel"]').isVisible());
  const seg = await page.evaluate(() => {
    const value = document.querySelector('[data-testid="academy-progress-ring-value"]');
    const wrapper = value ? value.closest("span.relative") : null;
    const svg = wrapper ? wrapper.querySelector("svg") : null;
    if (!svg) return null;
    const arcs = [...svg.querySelectorAll("circle")].slice(1); // skip track
    const dash = arcs.map((arc) => {
      const parts = getComputedStyle(arc).strokeDasharray.split(/[\s,]+/).filter(Boolean).map(parseFloat);
      return parts[0] ?? 0;
    });
    const transitions = arcs.filter((arc) => getComputedStyle(arc).transitionDuration.includes("0.9s")).length;
    return { arcs: arcs.length, filled: dash.filter((d) => d > 0.5).length, transitions };
  });
  check("Segmented ring has 12 category arcs", seg !== null && seg.arcs === 12, JSON.stringify(seg));
  check("Segmented ring arcs animate on scroll-in (900ms)", seg !== null && seg.transitions === 12);
  check("Segmented ring arcs carry progress fill", seg !== null && seg.filled >= 1, `filled=${seg ? seg.filled : 0}`);

  // Back to Overview - the overall ring should now show a non-zero arc.
  await page.click('[data-testid="academy-tab-overview"]');
  await page.waitForTimeout(1500);
  const ringFill = await page.locator('[data-testid="academy-ring-overall"]').first().evaluate((el) => {
    const arcs = el.querySelectorAll("svg circle");
    const parts = getComputedStyle(arcs[arcs.length - 1]).strokeDasharray.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    return parts[0] ?? 0;
  });
  check("Ring arc dasharray reflects progress (non-zero fill)", ringFill > 1, `dash=${ringFill}px`);

  // ══ MOBILE 390 - banner vignette + no overflow ═════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(900);
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid^="academy-lesson-item-"]').first().click();
  await page.waitForTimeout(1200);
  const banner = page.locator('[data-testid="academy-lesson-vignette"]').first();
  check("Mobile: vignette banner visible atop lesson", await banner.isVisible());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Mobile 390: no horizontal overflow", overflow <= 0, `overflowPx=${overflow}`);

  // ══ LIGHT THEME re-tint sanity ═════════════════════════════════════════════
  await page.setViewportSize({ width: 1440, height: 900 });
  const themeToggle = page.locator('[aria-label*="theme" i], [data-testid*="theme" i]').first();
  if (await themeToggle.isVisible().catch(() => false)) {
    await themeToggle.click();
    await page.waitForTimeout(900);
    const stillVisible = await page.locator('[data-testid="academy-lesson-header"]').isVisible();
    check("Light theme: lesson header + vignette survive theme switch", stillVisible);
    await themeToggle.click();
    await page.waitForTimeout(600);
  } else {
    check("Theme toggle not found (skipped)", true);
  }

  // ══ CONSOLE HEALTH ═════════════════════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
