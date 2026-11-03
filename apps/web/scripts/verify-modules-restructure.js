/**
 * Verify - Sidebar restructure (4 independent ACADEMY modules) + Tasky board
 * (touch drag) + Events calendar (New Calendar modal, connected identity).
 *
 * Covers:
 *   1. Sidebar: Academy / Nofy / Events / Tasky entries with distinct routes.
 *   2. Legacy redirects: /academy?tab=events|tasky, ?section=… → 307 + params.
 *   3. Tasky: "Tasky Board" header, 4 columns, mouse drag, TOUCH drag (CDP),
 *      New Tasky dialog create, search + priority filter, clear-done.
 *   4. Events: month grid, connected identity chip (GET /me, never hardcoded),
 *      New Calendar dialog (functional), New Event dialog, month navigation.
 *   5. Screenshots (desktop + mobile 390) + console health.
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

  // Capture the CONNECTED identity - the Events chip renders GET /api/me
  // (Profile: name + email) with the auth user as fallback.
  let connectedEmail = "";
  let connectedName = "";
  page.on("response", (resp) => {
    if (resp.status() !== 200) return;
    const url = resp.url();
    if (/\/api\/me$/.test(url) && !/auth/.test(url)) {
      resp
        .json()
        .then((data) => {
          connectedEmail = data?.email ?? "";
          connectedName = data?.name ?? "";
        })
        .catch(() => {});
    } else if (/\/api\/auth\/me$/.test(url)) {
      resp
        .json()
        .then((data) => {
          if (connectedEmail === "") {
            connectedEmail = data?.user?.email ?? "";
            connectedName = connectedName || (data?.user?.name ?? "");
          }
        })
        .catch(() => {});
    }
  });

  // ── 0. Login ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  check("login", true);

  // ── 1. Sidebar - 4 independent Academy modules ─────────────────────────────
  const nav = page.locator('nav[aria-label="Main navigation"]');
  for (const [href, label] of [
    ["/academy", "Academy"],
    ["/nofy", "Nofy"],
    ["/events", "Events"],
    ["/tasky", "Tasky"],
  ]) {
    const link = nav.locator(`a[href="${href}"]`).first();
    const visible = await link.isVisible().catch(() => false);
    const text = visible ? (await link.innerText()).trim() : "";
    check(`sidebar entry ${href}`, visible && text.includes(label), text.replace(/\n/g, " "));
  }
  await page.screenshot({ path: `${SHOTS}/restructure-sidebar.png` });

  // ── 2. Legacy redirects (307 + params preserved) ───────────────────────────
  await page.goto(`${BASE}/academy?tab=events`, { waitUntil: "networkidle" });
  check("redirect ?tab=events → /events", new URL(page.url()).pathname === "/events", page.url);
  await page.goto(`${BASE}/academy?section=tasky&course=abc`, { waitUntil: "networkidle" });
  check(
    "redirect ?section=tasky keeps params",
    new URL(page.url()).pathname === "/tasky" && new URL(page.url()).searchParams.get("course") === "abc",
    page.url,
  );
  await page.goto(`${BASE}/academy?tab=courses`, { waitUntil: "networkidle" });
  check(
    "non-legacy ?tab=courses stays on academy",
    new URL(page.url()).pathname === "/academy",
    page.url,
  );

  // ── 3. Tasky ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/tasky`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="tasky-view"]').waitFor({ state: "visible" });

  const headerTitle = await page.locator('[data-testid="tasky-header"] h1').innerText();
  check('Tasky title is "Tasky Board"', headerTitle.trim() === "Tasky Board", headerTitle);
  const subtitle = await page.locator('[data-testid="tasky-header"] p').innerText();
  check("Tasky subtitle present (≤ 90 chars)", subtitle.length > 10 && subtitle.length <= 90, subtitle);

  for (const column of ["backlog", "progress", "review", "done"]) {
    check(
      `column ${column} renders`,
      await page.locator(`[data-testid="tasky-column-${column}"]`).isVisible(),
    );
  }

  // Mouse drag: first backlog card → Review column.
  const backlogCards = page.locator('[data-testid="tasky-column-backlog"] [data-testid^="tasky-card-"]');
  const dragCard = backlogCards.first();
  const dragCardId = await dragCard.getAttribute("data-testid");
  const reviewBox = await page.locator('[data-testid="tasky-column-review"]').boundingBox();
  const cardBox = await dragCard.boundingBox();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 10);
  await page.mouse.down();
  // Steps so the threshold + ghost tracking kick in.
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      cardBox.x + cardBox.width / 2 + ((reviewBox.x + reviewBox.width / 2) - (cardBox.x + cardBox.width / 2)) * (step / 12),
      cardBox.y + 10 + ((reviewBox.y + 120) - (cardBox.y + 10)) * (step / 12),
    );
    await page.waitForTimeout(16);
  }
  await page.screenshot({ path: `${SHOTS}/restructure-tasky-mouse-drag.png` });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterMouseDrag = await page
    .locator(`[data-testid="${dragCardId}"]`)
    .getAttribute("data-column");
  check("mouse drag moves card to Review", afterMouseDrag === "review", `${dragCardId} → ${afterMouseDrag}`);

  // TOUCH drag via CDP (real input pipeline, pointerType=touch, long-press).
  const cdp = await context.newCDPSession(page);
  const backlogCards2 = page.locator('[data-testid="tasky-column-backlog"] [data-testid^="tasky-card-"]');
  const touchCard = backlogCards2.first();
  const touchCardId = await touchCard.getAttribute("data-testid");
  const touchBox = await touchCard.boundingBox();
  const progressBox = await page.locator('[data-testid="tasky-column-progress"]').boundingBox();
  const startX = touchBox.x + touchBox.width / 2;
  const startY = touchBox.y + 10;
  const endX = progressBox.x + progressBox.width / 2;
  const endY = progressBox.y + 140;

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
  });
  await page.waitForTimeout(300); // hold past the 180 ms lift threshold
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: startX + (endX - startX) * (step / 10),
          y: startY + (endY - startY) * (step / 10),
        },
      ],
    });
    await page.waitForTimeout(20);
  }
  await page.screenshot({ path: `${SHOTS}/restructure-tasky-touch-drag.png` });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  const afterTouchDrag = await page
    .locator(`[data-testid="${touchCardId}"]`)
    .getAttribute("data-column");
  check("TOUCH drag moves card to In Progress", afterTouchDrag === "progress", `${touchCardId} → ${afterTouchDrag}`);

  // New Tasky dialog - create a card in Review.
  await page.locator('[data-testid="tasky-new-open"]').click();
  await page.locator('[data-testid="tasky-new-dialog"]').waitFor({ state: "visible" });
  await page.screenshot({ path: `${SHOTS}/restructure-tasky-new-dialog.png` });
  await page.locator('[data-testid="tasky-form-title"]').fill("QA verification card");
  await page.locator('[data-testid="tasky-form-column"]').click();
  await page.getByRole("option", { name: "Review" }).click();
  await page.locator('[data-testid="tasky-form-submit"]').click();
  await page.waitForTimeout(300);
  const createdInReview = await page
    .locator('[data-testid="tasky-column-review"] [data-testid^="tasky-card-"]:not([data-testid$="-delete"])')
    .filter({ hasText: "QA verification card" })
    .count();
  check("New Tasky dialog creates card in chosen column", createdInReview === 1);

  // Search + priority filter (card testids exclude the nested delete buttons).
  const boardCards = page.locator('[data-testid^="tasky-card-"]:not([data-testid$="-delete"])');
  await page.locator('[data-testid="tasky-search"]').fill("QA verification");
  await page.waitForTimeout(200);
  const visibleAfterSearch = await boardCards.count();
  check("search narrows the board", visibleAfterSearch === 1, `${visibleAfterSearch} card(s)`);
  await page.locator('[data-testid="tasky-search"]').fill("");
  await page.locator('[data-testid="tasky-priority-high"]').click();
  await page.waitForTimeout(200);
  const highCount = await boardCards.count();
  const highOnly = await page
    .locator('[data-testid^="tasky-card-"][data-priority="HIGH"]:not([data-testid$="-delete"])')
    .count();
  check("priority filter shows only HIGH", highCount === highOnly && highOnly > 0, `${highOnly}/${highCount}`);
  await page.locator('[data-testid="tasky-priority-all"]').click();

  // Mobile 390 screenshot.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflowTasky = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Tasky mobile 390 no horizontal overflow", overflowTasky <= 0, `${overflowTasky}px`);
  await page.screenshot({ path: `${SHOTS}/restructure-tasky-mobile-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── 4. Events ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/events`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="events-view"]').waitFor({ state: "visible" });

  const eventsTitle = await page.locator('[data-testid="events-header"] h1').innerText();
  check('Events title is "Events"', eventsTitle.trim() === "Events", eventsTitle);

  // Connected identity - chip must mirror the boot-time /auth/me user.
  const chip = await page.locator('[data-testid="events-user-chip"]').innerText();
  check(
    "identity chip shows the CONNECTED profile",
    connectedEmail !== "" && chip.includes(connectedEmail) && chip.includes(connectedName),
    `${chip.replace(/\n/g, " · ")} vs ${connectedName} <${connectedEmail}>>`,
  );
  check("identity chip is NOT the hardcoded Maya", !chip.includes("Maya"), "");

  const todayISO = new Date().toISOString().slice(0, 10);
  check("month grid renders", (await page.locator('[data-testid="events-grid"] > *').count()) === 42);
  check(
    "today is highlighted",
    (await page.locator(`[data-testid="events-day-${todayISO}"] span`).first().getAttribute("class")).includes("bg-accent"),
  );

  // New Calendar dialog - functional create.
  await page.locator('[data-testid="events-new-calendar-open"]').click();
  await page.locator('[data-testid="events-new-calendar-dialog"]').waitFor({ state: "visible" });
  await page.screenshot({ path: `${SHOTS}/restructure-events-new-calendar.png` });
  await page.locator('[data-testid="events-calendar-name"]').fill("QA Calendar");
  await page.locator('[data-testid="events-calendar-color-green"]').click();
  await page.locator('[data-testid="events-calendar-submit"]').click();
  await page.waitForTimeout(300);
  const qaChip = await page
    .locator('[data-testid^="events-filter-"]')
    .filter({ hasText: "QA Calendar" })
    .count();
  check("New Calendar creates a filter chip", qaChip === 1);

  // New Event dialog - lands on the pre-filled date (today).
  await page.locator('[data-testid="events-filter-all"]').click();
  await page.locator('[data-testid="events-new-event-open"]').click();
  await page.locator('[data-testid="events-new-event-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="events-event-title"]').fill("QA verification event");
  await page.locator('[data-testid="events-event-submit"]').click();
  await page.waitForTimeout(300);
  const todayCellHasChip = await page
    .locator(`[data-testid="events-day-${todayISO}"]`)
    .locator("text=QA verification event")
    .count();
  check("New Event appears on the chosen day", todayCellHasChip >= 1);

  // Month navigation.
  const labelBefore = await page.locator('[data-testid="events-month-label"]').innerText();
  await page.locator('[data-testid="events-next-month"]').click();
  const labelAfter = await page.locator('[data-testid="events-month-label"]').innerText();
  check("month navigation advances", labelBefore !== labelAfter, `${labelBefore} → ${labelAfter}`);
  await page.locator('[data-testid="events-today"]').click();

  await page.screenshot({ path: `${SHOTS}/restructure-events-desktop.png` });

  // Mobile 390.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflowEvents = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Events mobile 390 no horizontal overflow", overflowEvents <= 0, `${overflowEvents}px`);
  await page.screenshot({ path: `${SHOTS}/restructure-events-mobile-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Academy unchanged (no events/tasky tabs).
  await page.goto(`${BASE}/academy`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="academy-view"]').waitFor({ state: "visible" });
  const academyTabs = await page.locator('[data-testid^="academy-tab-"]').count();
  const academyHasEvents = await page.locator('[data-testid="academy-tab-events"]').count();
  check("Academy keeps 6 tabs, no events/tasky", academyTabs === 6 && academyHasEvents === 0, `${academyTabs} tabs`);

  // ── 5. Console health ──────────────────────────────────────────────────────
  check("no page errors / 4xx / 5xx", errors.length === 0, errors.slice(0, 3).join(" | "));

  const failed = results.filter((line) => line.startsWith("FAIL"));
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  if (failed.length > 0) process.exitCode = 1;

  await browser.close();
})();
