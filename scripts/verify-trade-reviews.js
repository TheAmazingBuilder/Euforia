/**
 * Verification - Trade Reviews tab (/trades/reviews).
 * Checks: module tabs, summary band (server aggregate), buckets, grade flow
 * (Gate → Reveal), Reflect direct entry, nav highlighting, mobile, light
 * theme, console cleanliness.
 *
 * NOTE ENV: the MSW store RESEEDS on every full page load - navigate
 * client-side after the initial goto (established pattern).
 * Usage: node scripts/verify-trade-reviews.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(ms);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const text = m.text();
    if (
      m.type() === "error" &&
      !text.includes("socket.io") &&
      !text.includes("Failed to load resource")
    ) {
      errors.push(text);
    }
  });

  // ── Ledger + tabs ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await settle(page);
  check("Ledger renders with module tabs", await page.locator('[data-testid="trades-module-tabs"]').isVisible());
  check(
    "Ledger tab marked active",
    (await page.locator('[data-testid="trades-tab-ledger"]').getAttribute("aria-selected")) === "true",
  );

  // ── Navigate to Reviews via the tab ──────────────────────────────────────
  await page.click('[data-testid="trades-tab-reviews"]');
  await page.waitForSelector('[data-testid="reviews-summary"]', { timeout: 15_000 });
  await settle(page);
  check("URL is /trades/reviews", page.url().includes("/trades/reviews"));
  check("H1 renders", await page.locator("h1:has-text('Trade Reviews')").isVisible());
  check(
    "Breadcrumb shows Trade Reviews",
    await page.locator('[data-testid="breadcrumb"] :text("Trade Reviews")').first().isVisible(),
  );
  check(
    "Sidebar Trades entry still active",
    (await page.locator('nav[aria-label="Main navigation"] a[href="/trades"]').getAttribute("aria-current")) === "page",
  );

  // ── Summary band (server aggregate) ──────────────────────────────────────
  const closedText = await page.locator('[data-testid="reviews-summary-closed"]').textContent();
  const gradedText = await page.locator('[data-testid="reviews-summary-graded"]').textContent();
  const awaitingText = await page.locator('[data-testid="reviews-summary-awaiting"]').textContent();
  const completeText = await page.locator('[data-testid="reviews-summary-completeness"]').textContent();
  check(
    "4 summary tiles render with numbers",
    /\d/.test(closedText ?? "") &&
      /\d/.test(gradedText ?? "") &&
      /\d/.test(awaitingText ?? "") &&
      /\d/.test(completeText ?? ""),
  );
  const awaitingBefore = parseInt((awaitingText ?? "0").match(/\d+/)?.[0] ?? "0", 10);
  console.log(`  INFO  awaiting grade (server) = ${awaitingBefore}`);

  // ── Buckets ──────────────────────────────────────────────────────────────
  check("4 buckets render", (await page.locator('[data-testid="reviews-buckets"] button').count()) === 4);
  await page.click('[data-testid="reviews-bucket-to-grade"]');
  await settle(page, 600);
  check("URL carries ?bucket=to-grade", page.url().includes("bucket=to-grade"));
  const toGradeCards = page.locator('[data-testid="reviews-list"] > li');
  const toGradeCount = await toGradeCards.count();
  check("To-grade bucket lists cards", toGradeCount > 0);
  if (toGradeCount > 0) {
    check(
      "All to-grade cards are ungraded",
      (await page.locator('[data-testid="reviews-list"] li[data-bucket="to-grade"]').count()) === toGradeCount,
    );
  }

  // ── Grade flow from a review card (Gate → Reveal → close) ────────────────
  if (toGradeCount > 0) {
    await page.locator('[data-testid^="review-action-"]').first().click();
    await page.waitForSelector('[data-testid="judgment-gate"]', { timeout: 10_000 });
    check("Card action opens the Judgment Gate", true);
    await page.click('button[aria-label^="Grade A"]');
    await page.getByRole("radio", { name: /Yes, followed/ }).click();
    await page.getByRole("button", { name: /Lock grade & reveal outcome/i }).click();
    await page.waitForSelector('[data-testid="reveal"]', { timeout: 10_000 });
    check("Grade locks and the Reveal unlocks", true);
    await page.getByRole("button", { name: "Finish" }).click();
    // Reflect stage appears - leave it (Esc) so the flow closes.
    await page.waitForSelector('[data-testid="reflect"]', { timeout: 10_000 });
    await page.keyboard.press("Escape");
    await settle(page, 1500);
    const awaitingAfter = parseInt(
      (await page.locator('[data-testid="reviews-summary-awaiting"]').textContent() ?? "0").match(/\d+/)?.[0] ?? "0",
      10,
    );
    check(
      `Summary refetches after grading (${awaitingBefore} → ${awaitingAfter})`,
      awaitingAfter === awaitingBefore - 1,
    );
  }

  // ── Reflect direct entry on an incomplete graded trade ───────────────────
  await page.click('[data-testid="reviews-bucket-incomplete"]');
  await settle(page, 600);
  const incompleteCards = page.locator('[data-testid="reviews-list"] > li');
  if ((await incompleteCards.count()) > 0) {
    await incompleteCards.first().locator('[data-testid^="review-action-"]').click();
    await page.waitForSelector('[data-testid="reflect"]', { timeout: 10_000 });
    check("'Complete review' opens Reflect directly", true);
    await page.keyboard.press("Escape");
    await settle(page, 400);
  } else {
    console.log("  INFO  no incomplete bucket cards - reflect entry not exercised");
  }

  // ── Reviewed bucket + empty state safety ─────────────────────────────────
  await page.click('[data-testid="reviews-bucket-reviewed"]');
  await settle(page, 600);
  const reviewedCount = await page.locator('[data-testid="reviews-list"] > li').count();
  console.log(`  INFO  reviewed cards = ${reviewedCount}`);
  check("Reviewed bucket renders (cards or empty state)",
    reviewedCount > 0 || (await page.locator('[data-testid="reviews-empty"]').isVisible()));

  // ── Mobile 390 ───────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/trades/reviews`, { waitUntil: "networkidle" });
  await settle(mobile);
  check("Mobile: summary renders", await mobile.locator('[data-testid="reviews-summary"]').isVisible());
  check("Mobile: list/empty renders",
    (await mobile.locator('[data-testid="reviews-list"]').count()) > 0 ||
      (await mobile.locator('[data-testid="reviews-empty"]').isVisible()));
  await mobile.close();

  // ── Light theme ──────────────────────────────────────────────────────────
  const light = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await light.emulateMedia({ colorScheme: "light" });
  await light.addInitScript(() => {
    try { localStorage.setItem("theme", "light"); } catch {}
  });
  await light.goto(`${BASE}/trades/reviews`, { waitUntil: "networkidle" });
  await settle(light);
  const theme = await light.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check("Light theme applies", theme === "light" || theme === null); // null = default handled by next-themes
  check("Light: summary renders", await light.locator('[data-testid="reviews-summary"]').isVisible());
  await light.close();

  // ── Console cleanliness ──────────────────────────────────────────────────
  check("0 console/page errors (hors socket.io)", errors.length === 0);
  if (errors.length > 0) console.log("  ERRORS:", errors.slice(0, 5));

  await browser.close();
  console.log(`\n${passed}/${passed + failed} PASS`);
  process.exit(failed > 0 ? 1 : 0);
})();
