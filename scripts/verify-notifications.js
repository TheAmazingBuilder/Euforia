/**
 * Verify Feature 9 - Notification center.
 * Probes: bell opens panel, alerts listed, unread badge, click marks read,
 * mark-all-read empties badge, panel closes on outside click.
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

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  // 1. Bell visible with badge
  const bell = page.locator('[data-testid="notification-bell"]');
  check("Bell visible", await bell.isVisible());

  // 2. Open panel
  await bell.click();
  await page.waitForTimeout(500);
  const panel = page.locator('[data-testid="notification-panel"]');
  check("Panel opens", await panel.isVisible().catch(() => false));
  await page.screenshot({ path: "scripts/shots/notifications-open.png" });

  // 3. Items listed
  const items = page.locator('[data-testid="notification-item"]');
  const count = await items.count();
  check("Alerts listed", count > 0, `${count} items`);

  // 4. Unread dot count before (badge is the absolutely-positioned span)
  const badgeBefore = await bell.locator("span.absolute").textContent().catch(() => null);
  check("Unread badge shows count", badgeBefore !== null, `badge=${badgeBefore}`);

  // 5. Click first item → marks read (badge decrements, or stays at the
  //    « 9+ » cap when enough unread remain - the network call is the truth).
  const firstItem = items.first();
  const readResponse = page.waitForResponse(
    (resp) => resp.url().includes("/read") && resp.request().method() === "PATCH",
    { timeout: 10_000 },
  );
  await firstItem.click();
  const readResp = await readResponse;
  await page.waitForTimeout(800);
  const badgeAfter = await bell
    .locator("span.absolute")
    .textContent()
    .catch(() => null);
  const badgeOk =
    badgeBefore !== badgeAfter ||
    (badgeBefore ?? "").includes("+") ||
    (badgeAfter ?? "").includes("+");
  check(
    "Click marks item read (badge updates or capped)",
    readResp.ok() && badgeOk,
    `before=${badgeBefore} after=${badgeAfter} post=${readResp.status()}`,
  );
  await page.screenshot({ path: "scripts/shots/notifications-after-read.png" });

  // 6. Mark all read
  const markAll = page.locator('button:has-text("Mark all read")');
  if (await markAll.isVisible().catch(() => false)) {
    await markAll.click();
    await page.waitForTimeout(1000);
  }
  const badgeCleared = await bell.locator("span.absolute").count();
  check("Mark all read clears badge", badgeCleared === 0, `badges=${badgeCleared}`);

  // 7. Outside click closes
  await page.mouse.click(400, 400);
  await page.waitForTimeout(400);
  check("Outside click closes panel", !(await panel.isVisible().catch(() => false)));

  // 8. Empty state check (after marking all read, reopen)
  await bell.click();
  await page.waitForTimeout(400);
  const empty = await page.locator('text="All caught up"').isVisible().catch(() => false);
  const stillHasItems = (await items.count()) > 0;
  check("Panel still renders (read state visible)", empty || stillHasItems);
  await page.screenshot({ path: "scripts/shots/notifications-read-state.png" });

  console.log("\n=== FEATURE 9 RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(`\nConsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  process.exit(results.every((r) => r.startsWith("PASS")) && errors.length === 0 ? 0 : 1);
})();
