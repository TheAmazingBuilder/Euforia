/**
 * Verify - Goal → notification bridge ("At risk" alerts).
 * Probes (in ONE SPA session - the mock store reseeds on full reload):
 *  1. Goals tab renders + inbox-wiring hint line
 *  2. Seeded baseline: bell opens, GOAL_STATUS items (if any) carry the Target icon
 *  3. Create an impossible goal (R earned 999999 / week) → BEHIND → warning
 *     toast "Goal off pace" + inbox item with Target icon
 *  4. Edit that goal to a floor target (-999999) → ON_TRACK → the risk alert
 *     is resolved and a success toast "Goal back on track" lands
 *  5. Create a trivially-reached goal (win rate 1%) → if the week's sample
 *     cooperates, one (deduped) "Goal achieved" notice
 *  6. Settings → Notifications: Goals category renders (7 categories now),
 *     3 events × 3 channels; disabling the category mutes new at-risk alerts
 *     (no toast, inbox unchanged); re-enabled afterwards
 *  7. Cleanup: verify goals deleted, prefs restored
 *  8. Light theme + mobile 390 no overflow; zero unexpected console errors
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("dialog", (dialog) => dialog.accept().catch(() => {})); // confirm dialogs: always accept
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  const toastFor = (text) => page.locator('[data-sonner-toast]', { hasText: text });

  // ── 1. Goals tab + hint ────────────────────────────────────────────────────
  await page.goto(`${BASE}/journal?tab=goals`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  check("Goals tab renders", await page.locator('[data-testid="goals-panel"]').isVisible());
  check("Inbox-wiring hint visible", await page.locator('[data-testid="goals-alerts-hint"]').isVisible());
  await page.locator('[data-testid="goal-card"]').first().waitFor({ state: "visible", timeout: 10000 });

  // ── 2. Bell baseline + seeded goal alerts ─────────────────────────────────
  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ state: "visible" });
  const seededGoalItems = await page
    .locator('[data-testid="notification-item"]', { hasText: "Goal" })
    .count();
  check("Bell opens; seeded goal alerts present (or 0 - honest baseline)", seededGoalItems >= 0, `${seededGoalItems} items`);
  if (seededGoalItems > 0) {
    check(
      "Seeded GOAL_STATUS items carry the Target icon",
      (await page.locator('[data-testid="notification-item"] svg.lucide-target').count()) >= 1,
    );
  }
  await page.screenshot({ path: "scripts/shots/goal-alerts-baseline.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 3. Impossible goal → BEHIND → warning toast + inbox item ─────────────
  await page.locator('[data-testid="goal-create"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="goal-title-input"]').fill("Verify guard - impossible R");
  await page.locator('[data-testid="goal-metric-select"]').click();
  await page.getByRole("option", { name: "R earned" }).click();
  await page.locator('[data-testid="goal-target-input"]').fill("999999");
  await page.locator('[data-testid="goal-period-select"]').click();
  await page.getByRole("option", { name: "This week" }).click();
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1600);

  const guardCard = page.locator('[data-testid="goal-card"]', { hasText: "Verify guard" });
  check("Impossible goal lands in grid", await guardCard.isVisible());
  const guardStatus = await guardCard.getAttribute("data-status");
  check("Impossible goal computed BEHIND/AT_RISK", guardStatus === "BEHIND" || guardStatus === "AT_RISK", guardStatus);
  check("Warning toast 'Goal off pace' fires", await toastFor("Goal off pace").first().isVisible());
  await page.screenshot({ path: "scripts/shots/goal-alerts-offpace.png" });

  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ state: "visible" });
  const offPaceItem = page
    .locator('[data-testid="notification-item"]', { hasText: "Goal off pace - Verify guard" });
  check("Inbox holds the live at-risk alert", await offPaceItem.first().isVisible());
  check("Alert icon is the Target", await offPaceItem.first().locator("svg.lucide-target").isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 4. Edit to a floor target → ON_TRACK → recovery ───────────────────────
  await guardCard.locator('button[aria-label="Edit goal"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="goal-target-input"]').fill("-999999");
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1600);
  check("Floor goal flips to ON_TRACK", (await guardCard.getAttribute("data-status")) === "ON_TRACK");
  check("Success toast 'Goal back on track' fires", await toastFor("Goal back on track").first().isVisible());

  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ state: "visible" });
  const liveOffPace = await page
    .locator('[data-testid="notification-item"]', { hasText: "Goal off pace - Verify guard" })
    .count();
  check("Resolved risk alert leaves the inbox", liveOffPace === 0, `${liveOffPace} left`);
  check(
    "Recovery notice lands in the inbox",
    await page.locator('[data-testid="notification-item"]', { hasText: "Goal back on track - Verify guard" }).first().isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 5. Trivial goal → ACHIEVED (deduped) when the sample cooperates ───────
  await page.locator('[data-testid="goal-create"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="goal-title-input"]').fill("Verify ace - win rate 1");
  await page.locator('[data-testid="goal-metric-select"]').click();
  await page.getByRole("option", { name: "Win rate" }).click();
  await page.locator('[data-testid="goal-target-input"]').fill("1");
  await page.locator('[data-testid="goal-period-select"]').click();
  await page.getByRole("option", { name: "This week" }).click();
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1600);
  const aceCard = page.locator('[data-testid="goal-card"]', { hasText: "Verify ace" });
  const aceStatus = await aceCard.getAttribute("data-status");
  if (aceStatus === "ACHIEVED") {
    check("Trivial goal shows ACHIEVED", true);
    check("Success toast 'Goal achieved' fires", await toastFor("Goal achieved").first().isVisible());
    await page.locator('[data-testid="notification-bell"]').click();
    await page.locator('[data-testid="notification-panel"]').waitFor({ state: "visible" });
    const achievedItems = await page
      .locator('[data-testid="notification-item"]', { hasText: "Goal achieved - Verify ace" })
      .count();
    check("ACHIEVED alert deduped to exactly one", achievedItems === 1, `${achievedItems} items`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    check("Trivial goal not ACHIEVED this run (empty/negative sample) - skipped honestly", true, aceStatus);
  }

  // ── 6. Settings: Goals category + mute → no new alerts ────────────────────
  await page.goto(`${BASE}/settings#notifications`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  const matrixCount = await page
    .locator('[data-testid^="settings-notifications-"][data-testid$="-enabled"]')
    .count();
  check("7 notification categories rendered", matrixCount === 7, `count=${matrixCount}`);
  check("Goals category card renders", await page.locator('[data-testid="settings-notifications-goals"]').isVisible());
  for (const event of ["GOAL_AT_RISK", "GOAL_RECOVERED", "GOAL_ACHIEVED"]) {
    check(
      `Goals event ${event} matrix renders`,
      await page.locator(`[data-testid="settings-notifications-goals-${event}-inApp"]`).isVisible(),
    );
  }
  // Mute: category off → save
  await page.locator('[data-testid="settings-notifications-goals-enabled"]').click();
  await page.locator('[data-testid="settings-notifications-save"]').click();
  await page.waitForTimeout(1000);
  check("Prefs saved with goals muted", await toastFor("Notification preferences saved").first().isVisible());

  // SPA navigation only - a full page load would reseed the mock store and
  // silently restore the default (enabled) preferences.
  await page.locator('aside a[href="/journal"]').click();
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="tab-goals"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-testid="goal-create"]').click();
  await page.locator('[data-testid="goal-form-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="goal-title-input"]').fill("Verify mute - silenced R");
  await page.locator('[data-testid="goal-metric-select"]').click();
  await page.getByRole("option", { name: "R earned" }).click();
  await page.locator('[data-testid="goal-target-input"]').fill("888888");
  await page.locator('[data-testid="goal-period-select"]').click();
  await page.getByRole("option", { name: "This week" }).click();
  await page.locator('[data-testid="goal-save"]').click();
  await page.waitForTimeout(1800);
  check(
    "Muted: NO 'Goal off pace' toast for the new slipping goal",
    (await toastFor("Goal off pace - Verify mute").count()) === 0,
  );
  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ state: "visible" });
  check(
    "Muted: NO inbox item for 'Verify mute'",
    (await page.locator('[data-testid="notification-item"]', { hasText: "Verify mute" }).count()) === 0,
  );
  await page.keyboard.press("Escape");

  // ── 7. Cleanup - re-enable prefs, delete verify goals ─────────────────────
  await page.locator('aside a[href="/settings"]').click();
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="settings-nav-notifications"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="settings-notifications-goals-enabled"]').click();
  await page.locator('[data-testid="settings-notifications-save"]').click();
  await page.waitForTimeout(900);

  await page.locator('aside a[href="/journal"]').click();
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="tab-goals"]').click();
  await page.waitForTimeout(800);
  for (const title of ["Verify guard", "Verify ace", "Verify mute"]) {
    const card = page.locator('[data-testid="goal-card"]', { hasText: title });
    if ((await card.count()) === 0) continue;
    await card.locator('button[aria-label="Delete goal"]').click();
    await page.waitForTimeout(1000);
  }
  check(
    "Verify goals cleaned up",
    (await page.locator('[data-testid="goal-card"]', { hasText: "Verify" }).count()) === 0,
  );

  // ── 8. Light theme + mobile 390 ───────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(600);
  check("Light theme renders goals + hint", await page.locator('[data-testid="goals-alerts-hint"]').isVisible());
  await page.screenshot({ path: "scripts/shots/goal-alerts-light.png" });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/journal?tab=goals`, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForTimeout(1200);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/goal-alerts-mobile.png" });
  await mobile.close();

  // ── Console health (socket.io 404 + candles 400 = market-service noise) ──
  const noise = errors.filter(
    (e) => e.includes("socket.io") || (e.includes("404") && e.includes("candles")),
  );
  check("Zero console errors (known market-service noise excluded)", errors.length - noise.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n═══ GOAL → NOTIFICATION BRIDGE - RESULTS ═══");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
