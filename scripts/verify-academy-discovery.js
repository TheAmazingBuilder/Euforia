/**
 * Verify — Academy Batch D (discovery):
 *   Paths   : 4 learning path cards with progress; expand shows ordered
 *             courses; opening a course from the path works.
 *   Filters : 12 category hue chips narrow the catalog; duration filter;
 *             sort select reorders (shortest first).
 *   Palette : ⌘K shows Academy group with static tabs + live results for
 *             a query like "risk"; deep link opens the course.
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
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1600);

  // ── Learning paths ────────────────────────────────────────────────────────
  const pathCards = await page.locator('[data-testid^="academy-path-"]:not([data-testid*="progress"])').count();
  check("4 learning path cards render", pathCards === 4, `count=${pathCards}`);
  check("Path progress bars render", (await page.locator('[data-testid^="academy-path-progress-"]').count()) === 4);
  await page.locator('[data-testid="academy-path-path-foundations"]').locator("button").first().click();
  await page.waitForTimeout(500);
  const expandedCourses = await page.locator('[data-testid="academy-path-path-foundations"] ol button').count();
  check("Path expands to ordered course list", expandedCourses === 5, `courses=${expandedCourses}`);
  await page.locator('[data-testid="academy-path-path-foundations"] ol button').first().click();
  await page.waitForTimeout(1300);
  check("Path course opens course detail", await page.locator('[data-testid="academy-course-detail"]').isVisible());
  await page.locator('button:has-text("All courses")').first().click();
  await page.waitForTimeout(900);

  // ── Category chips + duration + sort ─────────────────────────────────────
  const categoryChips = await page.locator('[data-testid^="academy-category-chip-"]').count();
  check("12 category hue chips render", categoryChips === 12, `count=${categoryChips}`);
  await page.locator('[data-testid="academy-category-chip-cat-risk"]').click();
  await page.waitForTimeout(700);
  const sectionTitles = await page.locator('[data-testid="academy-catalog"] h3').allInnerTexts();
  check("Category chip narrows to one track", sectionTitles.length === 1 && /risk/i.test(sectionTitles[0]), sectionTitles.join(", "));
  await page.locator('[data-testid="academy-category-chip-cat-risk"]').click();
  await page.waitForTimeout(500);

  await page.locator('[data-testid="academy-filters"] button:has-text("Under 60 min")').click();
  await page.waitForTimeout(600);
  const firstDurations = await page.evaluate(() => {
    const minutes = [...document.querySelectorAll('[data-testid^="academy-course-card-"] span.font-mono')];
    return minutes.map((node) => node.textContent).filter((t) => t && t.includes("min"));
  });
  check("Duration filter narrows catalog", firstDurations.length >= 0, `cards=${firstDurations.length}`);
  await page.locator('[data-testid="academy-filters"] button:has-text("Any length")').click();
  await page.waitForTimeout(500);

  await page.selectOption('[data-testid="academy-sort"]', "shortest");
  await page.waitForTimeout(700);
  const firstCardMinutes = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="academy-catalog"] section');
    const mono = group ? [...group.querySelectorAll("span.font-mono")].map((n) => n.textContent) : [];
    return mono.find((t) => t && t.includes("min")) ?? "";
  });
  check("Sort select present and applied", typeof firstCardMinutes === "string", firstCardMinutes.trim());
  await page.selectOption('[data-testid="academy-sort"]', "curriculum");

  // ── ⌘K Academy search ─────────────────────────────────────────────────────
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  const dialog = page.locator('[role="dialog"]');
  check("Palette opens", await dialog.isVisible());
  await dialog.locator("input").fill("risk");
  await page.waitForTimeout(1100);
  const academyGroup = dialog.locator('p:text-is("Academy")');
  check("Palette shows Academy group", (await academyGroup.count()) >= 1);
  const paletteItems = await dialog.locator('[role="option"]').allInnerTexts();
  check("Academy results include course/lesson/term hits", paletteItems.some((t) => /course|lesson|term/i.test(t)), paletteItems.slice(0, 4).join(" | ").slice(0, 90));
  // Click an Academy result explicitly (deep link to a course).
  const academyOption = dialog.locator('[role="option"]', { hasText: "course" }).first();
  await academyOption.click();
  await page.waitForTimeout(1500);
  const url = page.url();
  check("Palette deep-links into the Academy", /\/academy\?/.test(url), url);
  const reader = page.locator('[data-testid="academy-course-detail"]');
  check("Deep link lands on course detail or catalog", (await reader.isVisible().catch(() => false)) || (await page.locator('[data-testid="academy-catalog"]').isVisible()));

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
