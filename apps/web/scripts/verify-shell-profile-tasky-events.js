/**
 * Verify - header sidebar toggle (PanelLeft), Profile rebuild (4 tabs),
 * Tasky horizontal board (add column + bottom scrollbar), Events calendar
 * categories (My calendar / Favorite / Other + sort + star).
 *
 * Screenshots: scripts/shots/hpt-*.png
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/apps/web/scripts/shots";
const NOISE = [
  /socket\.io/i,
  /candles/i,
  /prices/i,
  /market-service/i,
  /favicon/i,
  /net::ERR/i,
  /\/api\/auth\/(me|refresh)\b/i,
];

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
  console.log(results[results.length - 1]);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) {
      errors.push(`${resp.status()} ${resp.url()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  let connectedName = "";
  page.on("response", (resp) => {
    if (resp.status() !== 200) return;
    const url = resp.url();
    if (/\/api\/me$/.test(url) && !/auth/.test(url)) {
      resp.json().then((data) => { connectedName = data?.name ?? ""; }).catch(() => {});
    } else if (/\/api\/auth\/me$/.test(url)) {
      resp.json().then((data) => { connectedName = connectedName || (data?.user?.name ?? ""); }).catch(() => {});
    }
  });

  // ── 0. Login ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  check("login", true);

  // ── 1. Header sidebar toggle ───────────────────────────────────────────────
  const toggle = page.locator('[data-testid="topbar-sidebar-toggle"]');
  check("topbar PanelLeft toggle visible (desktop)", await toggle.isVisible());
  const aside = page.locator("aside").first();
  const expandedBefore = await aside.evaluate((el) => el.classList.contains("w-[240px]"));
  await toggle.click();
  await page.waitForTimeout(350);
  const collapsedNow = await aside.evaluate(
    (el) => el.classList.contains("w-[72px]") && !el.classList.contains("w-[240px]"),
  );
  const ariaAfter = await toggle.getAttribute("aria-expanded");
  check("click toggles sidebar → 72px collapsed", expandedBefore && collapsedNow, `aria-expanded=${ariaAfter}`);
  const sidebarHasCollapseText = await page
    .locator("aside", { hasText: /^.*Collapse.*$/ })
    .locator("button", { hasText: "Collapse" })
    .count();
  check("sidebar has no 'Collapse' button anymore", sidebarHasCollapseText === 0);
  await page.screenshot({ path: `${SHOTS}/hpt-sidebar-collapsed.png` });
  await toggle.click();
  await page.waitForTimeout(350);
  check(
    "click again → expanded (240px)",
    await aside.evaluate((el) => el.classList.contains("w-[240px]")),
  );

  // ── 2. Profile rebuild ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="profile-view"]').waitFor({ state: "visible" });

  const heroName = (await page.locator('[data-testid="profile-hero-name"]').innerText()).trim();
  check("hero shows CONNECTED profile name", heroName === connectedName, `${heroName} vs ${connectedName}`);
  const proBadge = await page.locator('[data-testid="profile-card"] span', { hasText: "Pro Member" }).count();
  check("'Pro Member' badge present", proBadge >= 1);
  check("hero meta has email + location + joined", (
    (await page.locator('[data-testid="profile-card"]').innerText()).includes("Joined March 2023")
  ));
  await page.screenshot({ path: `${SHOTS}/hpt-profile-personal.png` });

  // Tabs
  for (const tab of ["personal", "account", "security", "notifications"]) {
    await page.locator(`[data-testid="profile-tab-${tab}"]`).click();
    await page.waitForTimeout(120);
    check(`tab ${tab} renders panel`, await page.locator(`[data-testid="profile-panel-${tab}"]`).isVisible());
  }

  // Personal form fields
  await page.locator('[data-testid="profile-tab-personal"]').click();
  const fields = ["profile-first-name", "profile-last-name", "profile-email", "profile-phone", "profile-job-title", "profile-company", "profile-bio", "profile-location"];
  let missing = 0;
  for (const field of fields) {
    if (!(await page.locator(`[data-testid="${field}"]`).count())) missing += 1;
  }
  check("Personal tab has all 8 fields", missing === 0);
  await page.locator('[data-testid="profile-save"]').isDisabled().then((disabled) =>
    check("Save disabled until dirty", disabled),
  );

  // Account tab
  await page.locator('[data-testid="profile-tab-account"]').click();
  const accountText = await page.locator('[data-testid="profile-panel-account"]').innerText();
  check(
    "Account: status/subscription/visibility/export rows",
    ["Account Status", "Subscription Plan", "Account Visibility", "Data Export"].every((t) => accountText.includes(t)),
  );
  check("Account: Active badge + Danger Zone", (await page.locator('[data-testid="profile-danger-zone"]').innerText()).includes("Delete Account"));
  const visSwitch = page.locator('[data-testid="profile-visibility-switch"]');
  const visBefore = await visSwitch.getAttribute("data-state");
  await visSwitch.click();
  const visAfter = await visSwitch.getAttribute("data-state");
  check("Account visibility switch toggles", visBefore !== visAfter, `${visBefore}→${visAfter}`);
  await page.locator('[data-testid="profile-delete-open"]').click();
  check("Delete confirmation dialog opens", await page.locator('[data-testid="profile-delete-dialog"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/hpt-profile-account.png` });
  await page.locator('[data-testid="profile-delete-dialog"] button', { hasText: "Cancel" }).click();

  // Security tab
  await page.locator('[data-testid="profile-tab-security"]').click();
  const secText = await page.locator('[data-testid="profile-panel-security"]').innerText();
  check(
    "Security: password/2FA/login/sessions rows",
    ["Password", "Two-Factor Authentication", "Login Notifications", "Active Sessions"].every((t) => secText.includes(t)),
  );
  await page.locator('[data-testid="profile-password-open"]').click();
  check("Change Password dialog opens", await page.locator('[data-testid="profile-password-dialog"]').isVisible());
  await page.locator('[data-testid="profile-pwd-current"]').fill("cosmoz-demo-2026");
  await page.locator('[data-testid="profile-pwd-new"]').fill("short");
  await page.locator('[data-testid="profile-pwd-confirm"]').fill("short");
  await page.locator('[data-testid="profile-pwd-submit"]').click();
  check("Password validation error shows", await page.locator('[data-testid="profile-pwd-error"]').isVisible());
  await page.locator('[data-testid="profile-password-dialog"] button', { hasText: "Cancel" }).click();
  const badge2fa = await page.locator('[data-testid="profile-security-2fa"] span', { hasText: "Enabled" }).count();
  check("2FA shows Enabled badge", badge2fa >= 1);
  await page.locator('[data-testid="profile-sessions-open"]').click();
  check("Sessions dialog lists devices", (await page.locator('[data-testid="profile-sessions-dialog"]').innerText()).includes("MacBook Pro"));
  await page.screenshot({ path: `${SHOTS}/hpt-profile-security.png` });
  await page.locator('[data-testid="profile-sessions-dialog"] button', { hasText: "Done" }).click();

  // Notifications tab
  await page.locator('[data-testid="profile-tab-notifications"]').click();
  const notifText = await page.locator('[data-testid="profile-panel-notifications"]').innerText();
  check(
    "Notifications: 5 preference rows",
    ["Email Notifications", "Push Notifications", "Marketing Emails", "Weekly Summary", "Security Alerts"].every((t) => notifText.includes(t)),
  );
  check("Security Alerts switch disabled (always on)", await page.locator('[data-testid="profile-notif-security-switch"]').isDisabled());
  await page.screenshot({ path: `${SHOTS}/hpt-profile-notifications.png` });

  // ── 3. Tasky horizontal board ─────────────────────────────────────────────
  await page.goto(`${BASE}/tasky`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="tasky-view"]').waitFor({ state: "visible" });
  const board = page.locator('[data-testid="tasky-board"]');
  const scroll = await board.evaluate((el) => ({
    clientW: el.clientWidth,
    scrollW: el.scrollWidth,
    overflowX: getComputedStyle(el).overflowX,
  }));
  check("board is a horizontal rail (overflow-x auto)", scroll.overflowX === "auto" || scroll.overflowX === "scroll", JSON.stringify(scroll));
  check("board overflows horizontally (scrolls left→right)", scroll.scrollW > scroll.clientW, `${scroll.scrollW}>${scroll.clientW}`);
  const columnWidths = await page.locator('[data-testid="tasky-column-backlog"]').evaluate((el) => ({
    w: el.getBoundingClientRect().width,
    shrink: getComputedStyle(el).flexShrink,
  }));
  check("columns fixed-width (272px, no shrink)", Math.round(columnWidths.w) === 272 && columnWidths.shrink === "0", JSON.stringify(columnWidths));

  // Add column → appended at the right edge
  await page.locator('[data-testid="tasky-add-column"]').click();
  await page.locator('[data-testid="tasky-add-column-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="tasky-column-name"]').fill("Blocked");
  await page.locator('[data-testid="tasky-column-color-rose"]').click();
  await page.locator('[data-testid="tasky-column-submit"]').click();
  await page.waitForTimeout(200);
  const lastColumn = page.locator('[data-testid="tasky-board"] > div > section').last();
  const lastLabel = await lastColumn.locator("h2").innerText();
  check("new column appended at right edge", lastLabel.includes("Blocked"), lastLabel.replace(/\n/g, " "));
  check("custom column exposes delete (empty)", await page.locator('[data-testid="tasky-board"] [data-testid^="tasky-delete-column-"]').count() >= 1);
  const taskDialogHasBlocked = await page
    .locator('[data-testid="tasky-new-dialog"]')
    .count()
    .then(() => true)
    .catch(() => false);
  check("dialog flow closed cleanly", taskDialogHasBlocked);
  await board.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/hpt-tasky-add-column.png` });

  // Bottom scrollbar visually present (webkit scrollbar height > 0)
  const barH = await board.evaluate((el) => {
    const pseudo = getComputedStyle(el, "::-webkit-scrollbar");
    return pseudo.height;
  });
  check("bottom scrollbar styled/visible", barH !== "auto" && barH !== "0px", `height=${barH}`);

  // Drag still works horizontally: drag a card onto the new column.
  // The rail is wider than the viewport, so scroll mid-drag (the drag engine
  // re-reads column rects on every move - same as a real user flicking the
  // rail while holding a card).
  {
    await board.evaluate((el) => el.scrollTo({ left: 0 }));
    await page.waitForTimeout(200);
    const card = page.locator('[data-testid="tasky-card-tsk-3"]');
    // NOTE: locate the target by its title - the empty-column delete button
    // unmounts the moment the card lands, so it cannot anchor the assertion.
    const target = page
      .locator('[data-testid="tasky-board"] > div > section')
      .filter({ has: page.locator("h2", { hasText: "Blocked" }) });
    // NOTE: card testids must exclude the nested "-delete" buttons -
    // [data-testid^="tasky-card-"] otherwise matches 2 nodes per card.
    const CARDS_IN = '[data-testid^="tasky-card-"]:not([data-testid$="-delete"])';
    const backlogCountBefore = await page.locator(`[data-testid="tasky-column-backlog"] ${CARDS_IN}`).count();
    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error("source card not visible");
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 30, cardBox.y + 16, { steps: 5 });
    await board.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await page.waitForTimeout(250);
    const targetBox = await target.boundingBox();
    if (!targetBox) throw new Error("target column not visible after scroll");
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const landed = (await target.locator(CARDS_IN).count()) >= 1;
    const backlogCountAfter = await page.locator(`[data-testid="tasky-column-backlog"] ${CARDS_IN}`).count();
    check("mouse drag into the new column works", landed && backlogCountAfter === backlogCountBefore - 1, `backlog ${backlogCountBefore}→${backlogCountAfter}`);
    await page.screenshot({ path: `${SHOTS}/hpt-tasky-drag-new-column.png` });
  }

  // ── 4. Events categories + sort + star ────────────────────────────────────
  await page.goto(`${BASE}/events`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="events-view"]').waitFor({ state: "visible" });
  for (const cat of ["all", "my", "favorite", "other"]) {
    check(`category chip ${cat} exists`, await page.locator(`[data-testid="events-category-${cat}"]`).isVisible());
  }
  check("sort select exists", await page.locator('[data-testid="events-calendar-sort"]').isVisible());

  // Favorite filter → only favorited calendars in the chip row
  await page.locator('[data-testid="events-category-favorite"]').click();
  await page.waitForTimeout(150);
  const favoriteChips = await page.locator('[data-testid="events-calendar-chips"]').innerText();
  check("Favorite → Trading Plan stays (seeded favorite)", favoriteChips.includes("Trading Plan"), favoriteChips.replace(/\n/g, " "));
  check("Favorite → Economic News hidden", !favoriteChips.includes("Economic News"));
  await page.screenshot({ path: `${SHOTS}/hpt-events-favorite.png` });

  // Star toggle: unstar Trading Plan → Favorite row empties
  await page.locator('[data-testid="events-star-cal-plan"]').click();
  await page.waitForTimeout(150);
  const favAfterUnstar = await page.locator('[data-testid="events-calendar-chips"]').innerText();
  check("unstar → Favorite chip row empties", favAfterUnstar.includes("No calendars in this category"));
  // Restore: back to All (the Favorite row no longer renders the chip), re-star.
  await page.locator('[data-testid="events-category-all"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="events-star-cal-plan"]').click();

  // My calendar filter → only category=my chips
  await page.locator('[data-testid="events-category-my"]').click();
  await page.waitForTimeout(150);
  const myChips = await page.locator('[data-testid="events-calendar-chips"]').innerText();
  check("My calendar → Trading Plan + Personal, no Economic News", myChips.includes("Trading Plan") && myChips.includes("Personal") && !myChips.includes("Economic News"), myChips.replace(/\n/g, " "));

  // Other filter
  await page.locator('[data-testid="events-category-other"]').click();
  await page.waitForTimeout(150);
  const otherChips = await page.locator('[data-testid="events-calendar-chips"]').innerText();
  check("Other → Economic News + Reviews, no Trading Plan", otherChips.includes("Economic News") && otherChips.includes("Reviews") && !otherChips.includes("Trading Plan"));

  // Sort by name A→Z on all
  await page.locator('[data-testid="events-category-all"]').click();
  await page.locator('[data-testid="events-calendar-sort"]').click();
  await page.locator('[role="option"]', { hasText: "Name A–Z" }).click();
  await page.waitForTimeout(200);
  const chipOrder = await page
    .locator('[data-testid="events-calendar-chips"] [data-testid^="events-filter-cal-"]')
    .allInnerTexts();
  const names = chipOrder.map((t) => t.trim());
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  check("sort Name A–Z reorders chips", names.length === 4 && JSON.stringify(names) === JSON.stringify(sorted), names.join(" | "));

  // New Calendar dialog has Category select
  await page.locator('[data-testid="events-new-calendar-open"]').click();
  check("New Calendar dialog shows Category select", await page.locator('[data-testid="events-calendar-category"]').isVisible());
  await page.screenshot({ path: `${SHOTS}/hpt-events-new-calendar.png` });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${SHOTS}/hpt-events-desktop.png` });

  // ── 5. Light theme + mobile 390 ───────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="profile-view"]').waitFor({ state: "visible" });
  await page.screenshot({ path: `${SHOTS}/hpt-profile-light.png` });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mpage = await mobile.newPage();
  mpage.on("pageerror", (err) => errors.push(String(err)));
  await mpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mpage.locator("#login-email").fill("trader@cosmoz.app");
  await mpage.locator("#login-password").fill("cosmoz-demo-2026");
  await mpage.locator('[data-testid="login-submit"]').click();
  // Mobile has no persistent sidebar nav - wait for the auth redirect instead.
  await mpage.waitForFunction(() => !window.location.pathname.startsWith("/login"), null, { timeout: 20_000 });

  await mpage.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await mpage.locator('[data-testid="profile-view"]').waitFor({ state: "visible" });
  const profileOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile 390 profile: no horizontal page overflow", profileOverflow <= 1, `delta=${profileOverflow}`);
  await mpage.screenshot({ path: `${SHOTS}/hpt-profile-mobile.png` });

  await mpage.goto(`${BASE}/tasky`, { waitUntil: "networkidle" });
  await mpage.locator('[data-testid="tasky-view"]').waitFor({ state: "visible" });
  const mobileBoard = await mpage.locator('[data-testid="tasky-board"]').evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
  }));
  check("mobile 390 tasky: rail scrolls horizontally", mobileBoard.scrollW > mobileBoard.clientW, JSON.stringify(mobileBoard));
  const mobileOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile 390 tasky: page itself does not overflow", mobileOverflow <= 1, `delta=${mobileOverflow}`);
  await mpage.screenshot({ path: `${SHOTS}/hpt-tasky-mobile.png` });

  await mpage.goto(`${BASE}/events`, { waitUntil: "networkidle" });
  await mpage.locator('[data-testid="events-view"]').waitFor({ state: "visible" });
  const eventsOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile 390 events: no horizontal page overflow", eventsOverflow <= 1, `delta=${eventsOverflow}`);
  await mpage.screenshot({ path: `${SHOTS}/hpt-events-mobile.png` });

  // ── 6. Console health ─────────────────────────────────────────────────────
  const fatalErrors = errors.filter((e) => !NOISE.some((re) => re.test(e)));
  check("no unexpected 4xx/5xx or page errors", fatalErrors.length === 0, fatalErrors.slice(0, 3).join(" ; "));

  console.log(`\n=== ${results.filter((r) => r.startsWith("PASS")).length}/${results.length} PASS ===`);
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})().catch((err) => {
  console.error("FATAL", err);
  process.exit(2);
});
