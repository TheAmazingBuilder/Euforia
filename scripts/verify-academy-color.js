/**
 * Verify — Academy colorful redesign (prism header, hue system, course
 * illustrations, ring gauges, bookmarks tab):
 *   Shell    : 12-hue prism keyline, 6 tabs incl. Bookmarks
 *   Overview : ring gauge, hue chips, illustrated category map (12)
 *   Courses  : every course card carries its SVG vignette, detail banner
 *   Progress : segmented 12-hue ring, hue-filled category bars
 *   Glossary : hue letter avatars
 *   Bookmarks: add from glossary → appears → remove → empty (SPA only)
 *   A11y/CSS : hue vars resolve (prism segment non-transparent), mobile 390
 *              overflow check, console health.
 *
 * IMPORTANT: the MSW store lives in the browser tab — the script navigates
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
  const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // ── 0. Load + SPA to Academy ───────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('a[href="/academy"]', { timeout: 15_000 });
  await page.waitForTimeout(1800);

  // ══ SHELL ══════════════════════════════════════════════════════════════════
  check("Academy view renders", await page.locator('[data-testid="academy-view"]').isVisible());
  const prismSegments = await page.locator('[data-testid="academy-header"] .flex.h-1\\.5 > span').count();
  check("Prism keyline has 12 hue segments", prismSegments === 12, `count=${prismSegments}`);

  const prismColor = await page.evaluate(() => {
    const seg = document.querySelector('[data-testid="academy-header"] .flex.h-1\\.5 > span');
    return seg ? getComputedStyle(seg).backgroundColor : "";
  });
  check("Prism hue resolves (token live)", prismColor !== "" && !prismColor.includes("transparent"), prismColor);

  for (const tab of ["overview", "courses", "practice", "progress", "glossary", "bookmarks"]) {
    check(`Tab ${tab} present`, await page.locator(`[data-testid="academy-tab-${tab}"]`).isVisible());
  }

  // ══ OVERVIEW ═══════════════════════════════════════════════════════════════
  check("Overall ring gauge", await page.locator('[data-testid="academy-ring-overall"]').isVisible());
  const catArtCount = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="academy-category-"]')];
    return cards.filter((card) => card.querySelector('svg[viewBox="0 0 320 150"]')).length;
  });
  check("Illustrated category map (12 arts)", catArtCount === 12, `cards with vignette=${catArtCount}`);
  const chips = await page.locator('[data-testid="academy-stats"] span[aria-hidden] span, [data-testid="academy-stats"] .size-7').count();
  check("Hue chips in stat band", chips >= 4, `count=${chips}`);
  await page.screenshot({ path: "scripts/shots/academy-color-overview.png" });

  // ══ COURSES ════════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1200);
  const courseCards = await page.locator('[data-testid^="academy-course-card-"]').count();
  check("21 course cards", courseCards === 21, `count=${courseCards}`);
  const cardsWithArt = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="academy-course-card-"]')];
    return cards.filter((card) => card.querySelector("svg")).length;
  });
  check("Every course card has its vignette", cardsWithArt === courseCards, `${cardsWithArt}/${courseCards}`);

  // The flagship user example: trend & momentum indicators art carries SMA/EMA/MACD labels
  const indicatorArtText = await page.locator('[data-testid="academy-course-card-crs-indicators-trend-momentum"] svg').textContent();
  check("Indicators art labels SMA/EMA/MACD", /SMA/.test(indicatorArtText) && /EMA/.test(indicatorArtText) && /MACD/.test(indicatorArtText));

  await page.screenshot({ path: "scripts/shots/academy-color-courses.png" });

  // Course detail banner
  await page.click('[data-testid="academy-course-card-crs-ta-charts"]');
  await page.waitForTimeout(1200);
  check("Course detail renders", await page.locator('[data-testid="academy-course-detail"]').isVisible());
  const headerArt = await page.locator('[data-testid="academy-course-header"] svg').count();
  check("Course detail banner illustration", headerArt >= 1, `svg count=${headerArt}`);
  await page.screenshot({ path: "scripts/shots/academy-color-course-detail.png" });
  await page.click('text=All courses');
  await page.waitForTimeout(900);

  // ══ PROGRESS ═══════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-progress"]');
  await page.waitForTimeout(1200);
  check("Progress panel renders", await page.locator('[data-testid="academy-progress-panel"]').isVisible());
  const ringValue = await page.locator('[data-testid="academy-progress-ring-value"]').textContent();
  check("Segmented ring shows overall %", /^\d+%$/.test((ringValue || "").trim()), ringValue || "");
  const ringArcs = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="academy-progress-panel"]');
    return [...panel.querySelectorAll("svg circle")].filter((c) => c.getAttribute("style")?.includes("stroke-dasharray")).length;
  });
  check("Ring has 12 hue arcs", ringArcs === 12, `arcs=${ringArcs}`);
  const hueBars = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('[data-testid^="academy-progress-cat-"]')];
    return bars.filter((bar) => {
      const bg = getComputedStyle(bar).backgroundImage + getComputedStyle(bar).backgroundColor;
      return bg.includes("color-mix") || bg.includes("rgb(");
    }).length;
  });
  check("Category bars carry hue fills", hueBars === 12, `${hueBars}/12`);
  await page.screenshot({ path: "scripts/shots/academy-color-progress.png" });

  // ══ GLOSSARY ═══════════════════════════════════════════════════════════════
  await page.click('[data-testid="academy-tab-glossary"]');
  await page.waitForTimeout(1200);
  const letterTiles = await page.locator('[data-testid^="academy-glossary-term-"] .size-6').count();
  check("Glossary letter avatars render", letterTiles >= 20, `count=${letterTiles}`);
  await page.screenshot({ path: "scripts/shots/academy-color-glossary.png" });

  // ══ BOOKMARKS: add from glossary → appears → remove ═══════════════════════
  const firstTerm = page.locator('[data-testid^="academy-glossary-term-"]').first();
  const termId = (await firstTerm.getAttribute("data-testid")).replace("academy-glossary-term-", "");
  await firstTerm.locator("xpath=following-sibling::button").first().click();
  await page.waitForTimeout(700);
  await page.click('[data-testid="academy-tab-bookmarks"]');
  await page.waitForTimeout(900);
  const bookmarkRows = await page.locator('[data-testid="academy-bookmark-row"]').count();
  check("Bookmarked term lands in Bookmarks tab", bookmarkRows === 1, `rows=${bookmarkRows}`);
  await page.screenshot({ path: "scripts/shots/academy-color-bookmarks.png" });

  await page.locator('[data-testid="academy-bookmark-remove"]').first().click();
  await page.waitForTimeout(900);
  const rowsAfterRemove = await page.locator('[data-testid="academy-bookmark-row"]').count();
  check("Removing bookmark empties the shelf (SPA invalidation)", rowsAfterRemove === 0, `rows=${rowsAfterRemove}`);

  // ══ MOBILE 390: no horizontal overflow ═════════════════════════════════════
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/academy`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(1800);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Mobile 390: no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/academy-color-mobile.png" });
  await mobile.close();

  // ══ LIGHT THEME: hues deepen, illustrations re-tint ════════════════════════
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.click('[data-testid="academy-tab-overview"]');
  await page.waitForTimeout(1200);
  const lightCatArt = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="academy-category-"]')];
    return cards.filter((card) => card.querySelector('svg[viewBox="0 0 320 150"]')).length;
  });
  check("Light theme: category arts still render", lightCatArt === 12, `cards with vignette=${lightCatArt}`);
  await page.screenshot({ path: "scripts/shots/academy-color-overview-light.png" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));

  // ══ CONSOLE / NETWORK HEALTH ═══════════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((entry) => entry.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
