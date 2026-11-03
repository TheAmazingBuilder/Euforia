/**
 * Verify - Academy Batch E (journal → academy bridge):
 *   Overview "From your journal" section renders evidence-based suggestions
 *   with reasons; clicking deep-links into the suggested lesson; console
 *   health + regression of the continue card.
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
  await page.waitForTimeout(2000);

  // ── Suggestions section ───────────────────────────────────────────────────
  const section = page.locator('[data-testid="academy-journal-suggestions"]');
  check("'From your journal' section renders", await section.isVisible());
  const suggestionRows = await page.locator('[data-testid^="academy-suggestion-"]').count();
  check("1–3 suggestions rendered", suggestionRows >= 1 && suggestionRows <= 3, `count=${suggestionRows}`);
  const sectionText = await section.innerText();
  check("Suggestions carry evidence reasons", /\d+ (trades|closed)/i.test(sectionText.replace(/\n/g, " ")), sectionText.replace(/\n/g, " ").slice(0, 90));

  // ── Deep link into the suggested lesson ───────────────────────────────────
  await page.locator('[data-testid^="academy-suggestion-"]').first().click();
  await page.waitForTimeout(1600);
  check("Suggestion opens the lesson reader", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());

  // ── Regression: continue card + resume row unaffected ────────────────────
  await page.click('[data-testid="academy-tab-overview"]');
  await page.waitForTimeout(1600);
  check("Continue-learning card intact", await page.locator('[data-testid="academy-continue"]').isVisible());

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
