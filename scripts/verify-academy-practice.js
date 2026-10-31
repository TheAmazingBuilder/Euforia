/**
 * Verify - Academy Batch B (practice zone):
 *   Ledger      : practice stats band renders.
 *   Flashcards  : card → flip → grade → advance (session loop works).
 *   New drills  : S/R options answerable with reveal; zone bands drawn +
 *                 demand identified; position sizing grades with tolerance.
 *   Scenario    : open scenario → choose → feedback → next → result screen.
 *   Regression  : pattern drill + candle lab + structure drill intact.
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
  await page.click('[data-testid="academy-tab-practice"]');
  await page.waitForTimeout(1800);

  check("Practice zone renders", await page.locator('[data-testid="academy-practice"]').isVisible());

  // ── Ledger ────────────────────────────────────────────────────────────────
  check("Practice ledger band present", await page.locator('[data-testid="academy-practice-stats"]').isVisible());

  // ── Flashcards: flip → grade → advance ───────────────────────────────────
  const card = page.locator('[data-testid="academy-flashcard"]');
  if (await card.isVisible().catch(() => false)) {
    const front = await page.locator('[data-testid="academy-flashcard-front"]').innerText();
    check("Flashcard shows a prompt", front.trim().length > 0, front.slice(0, 40));
    const gradeBtn = page.locator('[data-testid="academy-flashcard-good"]');
    check("Grade buttons locked before flip", await gradeBtn.isDisabled());
    await card.click();
    await page.waitForTimeout(400);
    const back = await page.locator('[data-testid="academy-flashcard-back"]').innerText();
    check("Flip reveals the answer", back.trim().length > 0, back.slice(0, 40));
    await page.locator('[data-testid="academy-flashcard-good"]').click();
    await page.waitForTimeout(900);
    const counter = await page.locator('[data-testid="academy-flashcards-counter"]').innerText();
    check("Session advances to next card", /2\//.test(counter) || /complete/.test(counter), counter.trim());
  } else {
    check("Flashcard available (fresh store has due cards)", false, "no card rendered");
  }

  // ── S/R drill ─────────────────────────────────────────────────────────────
  const srOptions = page.locator('[data-testid="academy-sr-options"] button');
  check("S/R drill renders options", (await srOptions.count()) === 2);
  await srOptions.first().click();
  await page.waitForTimeout(600);
  check("S/R drill reveals feedback", await page.locator('[data-testid="academy-drill-feedback"]').first().isVisible());
  await page.locator('[data-testid="academy-drill-next"]').first().click();
  await page.waitForTimeout(900);

  // ── Zone drill ────────────────────────────────────────────────────────────
  const zoneSvg = page.locator('[data-testid="academy-zone-drill"] svg');
  check("Zone drill draws a chart", (await zoneSvg.count()) >= 1);
  const bandText = await zoneSvg.locator("text").allTextContents();
  check("Zone bands tagged A and B", bandText.some((t) => /BAND A/.test(t)) && bandText.some((t) => /BAND B/.test(t)), bandText.filter((t) => /BAND/.test(t)).join(" "));
  const zoneOptions = page.locator('[data-testid="academy-zone-options"] button');
  await zoneOptions.first().click();
  await page.waitForTimeout(600);
  check("Zone drill grades the pick", await page.locator('[data-testid="academy-zone-drill"] [data-testid="academy-drill-feedback"]').isVisible());

  // ── Position sizing ───────────────────────────────────────────────────────
  const promptText = await page.locator('[data-testid="academy-position-drill"] p.font-mono').first().innerText();
  const budgetMatch = promptText.match(/risk rule [\d.]+% \(\$([\d,]+)\)/);
  const entryMatch = promptText.match(/Long entry ([\d.]+),/);
  const stopMatch = promptText.match(/stop ([\d.]+)\. Each/);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : NaN;
  const entry = entryMatch ? Number(entryMatch[1]) : NaN;
  const stop = stopMatch ? Number(stopMatch[1]) : NaN;
  const answer = Math.round((budget / (entry - stop)) * 10) / 10;
  if (!Number.isFinite(answer)) {
    console.log("DEBUG prompt:", JSON.stringify(promptText));
    console.log("DEBUG parsed:", { budget, entry, stop });
  }
  if (Number.isFinite(answer)) {
    await page.locator('[data-testid="academy-position-input"]').fill(String(answer));
    await page.locator('[data-testid="academy-position-submit"]').click();
    await page.waitForTimeout(700);
    const verdict = await page.locator('[data-testid="academy-position-verdict"]').innerText();
    check("Position sizing grades correct answer within budget", /within budget/i.test(verdict), `expected≈${answer} → ${verdict.trim()}`);
  } else {
    check("Position sizing prompt parseable", false, promptText.slice(0, 60));
  }

  // ── Scenario player ───────────────────────────────────────────────────────
  const scenarioBtn = page.locator('[data-testid^="academy-scenario-"]').first();
  await scenarioBtn.click();
  await page.waitForTimeout(700);
  check("Scenario opens at step 1", await page.locator('[data-testid="academy-scenario-narrative"]').isVisible());
  await page.locator('[data-testid^="academy-scenario-option-"]').first().click();
  await page.waitForTimeout(500);
  check("Scenario step gives feedback", await page.locator('[data-testid="academy-scenario-feedback"]').isVisible());
  // Step through to the result screen
  for (let i = 0; i < 6; i += 1) {
    const nextBtn = page.locator('[data-testid="academy-scenario-next"]');
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await nextBtn.click();
    await page.waitForTimeout(450);
    const option = page.locator('[data-testid^="academy-scenario-option-"]').first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(450);
    }
  }
  const resultText = await page.locator('[data-testid="academy-scenarios"]').innerText();
  check("Scenario reaches the result screen", /aligned with the professional read/.test(resultText.replace(/\n/g, " ")));

  // ── Regression: pattern drill + structure drill still present ────────────
  check("Pattern drill still renders", await page.locator('[data-testid="academy-drill-options"]').first().isVisible());
  check("Structure drill still renders", await page.locator('[data-testid="academy-structure-option-0"]').isVisible());
  check("Candle lab still renders", await page.locator('[data-testid="academy-lab-o"]').first().isVisible());

  // ── Ledger now shows data ─────────────────────────────────────────────────
  const ledgerText = await page.locator('[data-testid="academy-practice-stats"]').innerText();
  check("Ledger accumulates drill chips", /[SR LEVEL|SUPPLY\/DEMAND|POSITION SIZING|SCENARIOS|FLASHCARDS]/i.test(ledgerText.replace(/\n/g, " ")), ledgerText.replace(/\n/g, " ").slice(0, 90));

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
