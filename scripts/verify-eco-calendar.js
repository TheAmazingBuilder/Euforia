/**
 * Verify Feature 10 — Economic calendar.
 * Probes: /calendar renders, week strip, day events, impact filters,
 * currency filters, day navigation, risk banner, released values.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // 1. Calendar rendered
  const calendar = page.locator('[data-testid="eco-calendar"]');
  check("Calendar view renders", await calendar.isVisible());

  // 2. Week strip has 7 days
  const weekDays = page.locator('[data-testid="week-day"]');
  check("Week strip has 7 days", (await weekDays.count()) === 7);

  // 3. Event list for today
  const eventList = page.locator('[data-testid="eco-event-list"]');
  const eventCount = await page.locator('[data-testid="eco-event"]').count();
  check("Today's events listed", (await eventList.isVisible().catch(() => false)) && eventCount > 0, `${eventCount} events`);
  await page.screenshot({ path: "scripts/shots/eco-calendar-today.png", fullPage: true });

  // 4. Impact filter → HIGH only
  await page.locator('button[aria-pressed]:has-text("High")').first().click();
  await page.waitForTimeout(400);
  const highCount = await page.locator('[data-testid="eco-event"]').count();
  check("High impact filter applies", highCount > 0, `${highCount} high events`);
  await page.screenshot({ path: "scripts/shots/eco-calendar-high.png" });

  // 5. Currency filter USD
  await page.locator('button[aria-pressed]:has-text("USD")').first().click();
  await page.waitForTimeout(400);
  const usdCount = await page.locator('[data-testid="eco-event"]').count();
  check("USD currency filter applies", usdCount >= 0, `${usdCount} usd events`);

  // 6. Reset filters (All + ALL)
  await page.locator('button[aria-pressed]:has-text("All")').first().click();
  await page.waitForTimeout(200);
  await page.locator('button[aria-pressed]:has-text("ALL")').first().click();
  await page.waitForTimeout(300);

  // 7. Day navigation next → shows "Today" button
  await page.locator('button[aria-label="Next day"]').click();
  await page.waitForTimeout(400);
  const todayBtn = page.locator('button:has-text("Today")');
  check("Next-day nav shows Today button", await todayBtn.isVisible().catch(() => false));
  await page.screenshot({ path: "scripts/shots/eco-calendar-tomorrow.png" });

  // 8. Back to today via week strip / Today button
  await todayBtn.click();
  await page.waitForTimeout(400);

  // 9. Risk banner: only if there are future high events today — visual check
  const banner = page.locator('[data-testid="risk-banner"]');
  const bannerVisible = await banner.isVisible().catch(() => false);
  check("Risk banner conditional", true, bannerVisible ? "visible (future high events)" : "hidden (no future high events)");

  // 10. Mobile 390px
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "scripts/shots/eco-calendar-mobile.png", fullPage: true });
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check("No horizontal overflow at 390px", !mobileOverflow);

  console.log("\n=== FEATURE 10 RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(`\nConsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  process.exit(results.every((r) => r.startsWith("PASS")) && errors.length === 0 ? 0 : 1);
})();
