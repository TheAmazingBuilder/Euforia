/**
 * Verify — Pattern simulator overhaul + indicator coverage + Session Live
 * Key Levels removal (this round's scope):
 *   Pattern drill : 40-pattern library serves randomized rounds; family/bias
 *                   taxonomy chips; ink picker (5 palettes) re-inks the SAME
 *                   candles; palette persists across rounds and SPA nav.
 *   Indicators    : 6 new lessons render inside the 2 indicator courses;
 *                   glossary gains the new tool terms (search hits).
 *   Session Live  : Key Levels widget REMOVED from the chart; chart intact.
 * SPA-only navigation for the Academy (MSW store lives in the tab);
 * the Session check runs on a fresh page (its own module).
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
  const inkOf = (frame) =>
    frame.evaluate(() => {
      const el = document.querySelector('[data-testid="academy-drill-chart"]');
      return el ? el.getAttribute("data-candle-ink") : null;
    });
  const firstStroke = (frame) =>
    frame.evaluate(() => {
      const rect = document.querySelector('[data-testid="academy-drill-chart"] svg rect');
      return rect ? getComputedStyle(rect).stroke : null;
    });

  // ══ Academy — pattern simulator ═══════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(1800);

  check("Practice zone renders", await page.locator('[data-testid="academy-practice"]').isVisible());
  const options = page.locator('[data-testid="academy-drill-options"]');
  check("Pattern drill renders", await options.first().isVisible());
  const optionCount = await page.locator('[data-testid^="academy-drill-option-"]').count();
  check("Four options per round", optionCount === 4, `${optionCount}`);

  // Taxonomy chips (family + bias)
  const tagTexts = await page.locator('[data-testid="academy-drill-tags"] >> span').allInnerTexts();
  check("Family + bias chips shown", tagTexts.length >= 2, tagTexts.join(" · "));

  // Ink picker — five palettes, classic default
  check("Ink picker renders", await page.locator('[data-testid="academy-ink-picker"]').isVisible());
  const paletteCount = await page.locator('button[data-testid^="academy-ink-"]').count();
  check("Five ink palettes offered", paletteCount === 5, `${paletteCount}`);
  const classicChecked = await page.locator('[data-testid="academy-ink-classic"]').getAttribute("aria-checked");
  check("Classic palette default", classicChecked === "true");
  const hint = await page.locator('[data-testid="academy-ink-hint"]').innerText();
  check("Color-independence teaching line", /not the palette/i.test(hint), hint.slice(0, 50));

  // Re-ink: switch to inverse → attribute + computed stroke change
  const strokeBefore = await firstStroke(page);
  await page.click('[data-testid="academy-ink-inverse"]');
  await page.waitForTimeout(400);
  const inkAfterInverse = await inkOf(page);
  const strokeAfterInverse = await firstStroke(page);
  check("Inverse palette applies to chart", inkAfterInverse === "inverse", String(inkAfterInverse));
  check("Candle ink actually changes", Boolean(strokeBefore) && Boolean(strokeAfterInverse) && strokeBefore !== strokeAfterInverse, `${strokeBefore} → ${strokeAfterInverse}`);

  // Mono palette (single-ink hollow/filled chart)
  await page.click('[data-testid="academy-ink-mono"]');
  await page.waitForTimeout(300);
  check("Mono palette applies", (await inkOf(page)) === "mono");

  // Grading + next round keep the chosen palette
  await page.click('[data-testid="academy-drill-option-0"]');
  await page.waitForTimeout(400);
  check("Answer feedback appears", await page.locator('[data-testid="academy-drill-feedback"]').isVisible());
  await page.click('[data-testid="academy-drill-next"]');
  await page.waitForTimeout(1400);
  check("Next drill serves a fresh round", await page.locator('[data-testid="academy-drill-option-0"]').isVisible());
  check("Palette survives round change", (await inkOf(page)) === "mono");

  // SPA away and back — localStorage persistence
  await page.click('[data-testid="academy-tab-overview"]');
  await page.waitForTimeout(1200);
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(1600);
  check("Palette persists across SPA navigation", (await inkOf(page)) === "mono", String(await inkOf(page)));

  // ══ Academy — indicator courses coverage ══════════════════════════════════
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1500);
  await page.click('[data-testid="academy-course-card-crs-indicators-trend-momentum"]');
  await page.waitForTimeout(1400);
  const courseDetail = page.locator('[data-testid="academy-course-detail"]');
  check("Trend & Momentum course opens", await courseDetail.isVisible());
  const trendLessons = await courseDetail.innerText();
  check(
    "Lesson: Parabolic SAR & SuperTrend",
    /Trend Followers: Parabolic SAR & SuperTrend/.test(trendLessons),
  );
  check("Lesson: Ichimoku Kinko Hyo", /Ichimoku Kinko Hyo/.test(trendLessons));
  check("Lesson: Wider Oscillator Family", /Wider Oscillator Family/.test(trendLessons));

  // Open the Ichimoku lesson from THIS course and verify block rendering
  const ichimokuItem = courseDetail.locator('[data-testid^="academy-lesson-item-"]', { hasText: "Ichimoku" });
  if (await ichimokuItem.first().isVisible().catch(() => false)) {
    await ichimokuItem.first().click();
    await page.waitForTimeout(1600);
    const lessonBody = await page.locator('[data-testid="academy-lesson-reader"]').innerText().catch(() => "");
    check(
      "Ichimoku lesson body renders (cloud + components)",
      /Senkou/.test(lessonBody) && /cloud/i.test(lessonBody),
      `${lessonBody.length} chars`,
    );
  } else {
    check("Ichimoku lesson reachable from course detail", false, "lesson item not found");
  }

  // Lesson reader breadcrumb → straight back to the course list
  await page.click('button:has-text("Trend & Momentum Indicators")');
  await page.waitForTimeout(1000);
  await page.click('[data-testid="academy-course-card-crs-indicators-volatility-volume"]');
  await page.waitForTimeout(1400);
  const volDetail = page.locator('[data-testid="academy-course-detail"]');
  check("Volatility & Volume course opens", await volDetail.isVisible());
  const volLessons = await volDetail.innerText();
  check("Lesson: Keltner/Donchian/Envelopes", /Channel Tools: Keltner, Donchian & Envelopes/.test(volLessons));
  check("Lesson: Money Flow (MFI/CMF/A-D)", /Money Flow: MFI, Chaikin & the A\/D Line/.test(volLessons));
  check("Lesson: MA Family Extended", /Moving-Average Family, Extended/.test(volLessons));

  // Glossary — new terms searchable
  await page.click('[data-testid="academy-tab-glossary"]');
  await page.waitForTimeout(1200);
  await page.fill('[data-testid="academy-glossary-search"]', "SuperTrend");
  await page.waitForTimeout(900);
  const superTrendHits = await page.locator('[data-testid^="academy-glossary-term-"]').count();
  check("Glossary: SuperTrend term searchable", superTrendHits >= 1, `${superTrendHits} hit(s)`);
  await page.fill('[data-testid="academy-glossary-search"]', "Donchian");
  await page.waitForTimeout(900);
  const donchianHits = await page.locator('[data-testid^="academy-glossary-term-"]').count();
  check("Glossary: Donchian term searchable", donchianHits >= 1, `${donchianHits} hit(s)`);

  await page.screenshot({ path: "scripts/shots/patterns-round-academy.png" });

  // ══ Session Live — Key Levels removed from the chart ══════════════════════
  const session = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const sessionErrors = [];
  session.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) sessionErrors.push(`${resp.status()} ${resp.url()}`);
  });
  session.on("pageerror", (err) => sessionErrors.push(String(err)));
  await session.goto(`${BASE}/session`, { waitUntil: "networkidle", timeout: 60_000 });
  await session.waitForTimeout(1500);
  check("Session chart renders", await session.locator('[data-testid="price-chart"]').isVisible());
  const minimapCount = await session.locator('[data-testid="session-minimap"]').count();
  check("Key Levels widget removed from chart", minimapCount === 0, `count=${minimapCount}`);
  check("No 'Key levels' label anywhere", (await session.locator("text=Key levels").count()) === 0);
  await session.screenshot({ path: "scripts/shots/patterns-round-session.png" });

  check("Zero unexpected console errors (academy)", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("Zero unexpected console errors (session)", sessionErrors.length === 0, sessionErrors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
