/**
 * Verify — ACADEMY modules: Events (calendar) + Tasky (kanban board).
 *
 * IMPORTANT: navigation uses sidebar clicks ONLY (SPA). No reload is
 * performed — both modules are frontend-only with in-memory state, so the
 * whole flow runs on a single mount each.
 *
 * Covers:
 *   A. Sidebar gains Events + Tasky under the ACADEMY section (order kept);
 *      both reachable by SPA navigation; headers + breadcrumbs render.
 *   B. Events seed: 24 pills across the current month (October 2026), exact
 *      titles/times, today cell highlighted with aria-current.
 *   C. Month engine: 42 cells (leading/trailing days), next → November
 *      (empty), prev back, Today restores the current month from anywhere.
 *   D. Calendar-list filters: unchecking Work hides its 8 events; Deadlines
 *      hides 3; re-checking restores the full 24.
 *   E. Mini month: independent navigation, day click jumps the main grid.
 *   F. Event dialog: details (date/time/calendar) + Escape close.
 *   G. Rail sections collapse; Favorites empty hint.
 *   H. New Calendar OPENS AS A DIALOG (live preview, cancel path) and adds
 *      a list under Other (name + color).
 *   I. Tasky: sidebar entry, NO board title (removed), + New task button.
 *   J. Seed board: counts 4/3/3/2/3, card anatomy (badges, avatar, date).
 *   K. Drag & drop across columns (In Review → Done → back), count updates.
 *   L. Empty column state ("No tasks") when a column is drained, then restore.
 *   M. Reorder inside a column (drop below a card, then restore).
 *   Q. Task modal: create via toolbar (title/category/assignee/priority/due),
 *      card details dialog, edit modal prefilled, delete.
 *   R. Per-column quick add (+ button) lands the task in that column, then
 *      delete restores the seed counts.
 *   S. Keyboard drag & drop on the grip handle (grab → ArrowDown → drop).
 *   T. TOUCH drag & drop (CDP touch events, hasTouch context): a finger moves
 *      a card across columns exactly like the cursor.
 *   U. Events: cell click opens the day schedule with the add-event form;
 *      created event renders as a pill; detail dialog deletes it.
 *   N. Mobile 390px: no document-level horizontal overflow; Events rail
 *      hidden; board scrolls internally.
 *   O. Light theme render (attribute swap) without errors.
 *   P. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/events-tasky";
const { ensureLogin } = require(`${__dirname}/helpers/login.js`);

const pad2 = (n) => String(n).padStart(2, "0");
const keyOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    // 1920×1080: the 5-column board fits WITHOUT horizontal scroll — avoids
    // the programmatic-scroll vs mouse hit-testing race on HTML5 drags.
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) ||
        /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const shot = async (name) => {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };

  const nav = page.locator('nav[aria-label="Main navigation"]');
  const sidebarLink = (name) =>
    nav.getByRole("link", { name, exact: true });

  /* ---------------------------------------------------------------- */
  /* Login                                                             */
  /* ---------------------------------------------------------------- */
  await page.goto(`${BASE}/login`);
  await ensureLogin(page);
  await page.waitForTimeout(800);

  /* ---------------------------------------------------------------- */
  /* A — Sidebar + SPA navigation                                      */
  /* ---------------------------------------------------------------- */
  const navText = await nav.innerText();
  check(
    "A1 sidebar: Academy section orders … Events, Tasky before Tools",
    /academy[\s\S]*?events[\s\S]*?tasky[\s\S]*?tools/i.test(navText),
  );

  await sidebarLink("Events").click();
  await page.waitForURL("**/events");
  await page.waitForTimeout(700);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curMonthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(curYear, curMonth, 1));
  const todayKey = keyOf(curYear, curMonth, now.getDate());

  check(
    "A2 /events renders H1 + toolbar month title = current month",
    (await page.locator("h1").innerText()) === "Events" &&
      (await page.locator('[data-testid="events-month-title"]').innerText()) ===
        curMonthTitle,
    curMonthTitle,
  );
  const crumb = await page.locator('[data-slot="breadcrumb-page"], ol').first().innerText();
  check("A3 breadcrumb shows Events", /Events/.test(crumb));

  /* ---------------------------------------------------------------- */
  /* B — Seed events                                                   */
  /* ---------------------------------------------------------------- */
  const pillCount = await page.locator('[data-testid^="events-event-"]').count();
  check("B1 24 seeded events rendered", pillCount === 24, String(pillCount));

  for (const [id, title] of [
    ["ev-01", "Team Standup"],
    ["ev-02", "Gym Session"],
    ["ev-04", "Pay Rent"],
    ["ev-09", "Mom's Birthday"],
    ["ev-24", "Road Trip"],
  ]) {
    const text = await page.locator(`[data-testid="events-event-${id}"]`).innerText();
    check(`B2 seed ${id} shows "${title}"`, text.includes(title), text);
  }

  const todayCell = page.locator('[data-testid="events-today-cell"]');
  check(
    "B3 today cell exists and is aria-current",
    (await todayCell.count()) === 1 &&
      (await todayCell.locator("[aria-current='date']").count()) === 1,
    todayKey,
  );

  /* ---------------------------------------------------------------- */
  /* C — Month engine                                                  */
  /* ---------------------------------------------------------------- */
  const firstExpected = (() => {
    const first = new Date(curYear, curMonth, 1);
    const start = new Date(curYear, curMonth, 1 - first.getDay());
    return keyOf(start.getFullYear(), start.getMonth(), start.getDate());
  })();
  const lastExpected = (() => {
    const first = new Date(curYear, curMonth, 1);
    const start = new Date(curYear, curMonth, 1 - first.getDay());
    const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
    return keyOf(last.getFullYear(), last.getMonth(), last.getDate());
  })();
  const cellIds = await page.locator("[role='gridcell'][data-testid^='events-cell-']").evaluateAll(
    (cells) => cells.map((c) => c.getAttribute("data-testid").replace("events-cell-", "")),
  );
  check(
    "C1 grid has 42 cells with correct leading/trailing days",
    cellIds.length === 42 && cellIds[0] === firstExpected && cellIds[41] === lastExpected,
    `${cellIds[0]} … ${cellIds[41]}`,
  );

  await page.locator('[data-testid="events-next"]').click();
  await page.waitForTimeout(400);
  const nextTitle = await page
    .locator('[data-testid="events-month-title"]')
    .innerText();
  const nextPills = await page.locator('[data-testid^="events-event-"]').count();
  check(
    "C2 next → adjacent month, no seed events there",
    nextTitle ===
      new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
        new Date(curYear, curMonth + 1, 1),
      ) && nextPills === 0,
    nextTitle,
  );

  await page.locator('[data-testid="events-prev"]').click();
  await page.locator('[data-testid="events-prev"]').click();
  await page.waitForTimeout(400);
  const backTitle = await page
    .locator('[data-testid="events-month-title"]')
    .innerText();
  check(
    "C3 prev ×2 → previous month",
    backTitle ===
      new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
        new Date(curYear, curMonth - 1, 1),
      ),
    backTitle,
  );

  await page.locator('[data-testid="events-today"]').click();
  await page.waitForTimeout(400);
  check(
    "C4 Today restores the current month",
    (await page.locator('[data-testid="events-month-title"]').innerText()) ===
      curMonthTitle,
  );

  /* ---------------------------------------------------------------- */
  /* D — Calendar-list filters                                         */
  /* ---------------------------------------------------------------- */
  await page.locator('[data-testid="events-list-work"]').click();
  await page.waitForTimeout(300);
  const afterWorkOff = await page.locator('[data-testid^="events-event-"]').count();
  const standupGone =
    (await page.locator('[data-testid="events-event-ev-01"]').count()) === 0;
  const rentStill = (await page.locator('[data-testid="events-event-ev-04"]').count()) === 1;
  check(
    "D1 uncheck Work hides its 8 events, keeps others",
    afterWorkOff === 16 && standupGone && rentStill,
    String(afterWorkOff),
  );

  await page.locator('[data-testid="events-list-deadlines"]').click();
  await page.waitForTimeout(300);
  const afterDeadlinesOff = await page.locator('[data-testid^="events-event-"]').count();
  check(
    "D2 uncheck Deadlines hides 3 more",
    afterDeadlinesOff === 13,
    String(afterDeadlinesOff),
  );

  await page.locator('[data-testid="events-list-work"]').click();
  await page.locator('[data-testid="events-list-deadlines"]').click();
  await page.waitForTimeout(300);
  check(
    "D3 re-check both restores the 24 events",
    (await page.locator('[data-testid^="events-event-"]').count()) === 24,
  );

  /* ---------------------------------------------------------------- */
  /* E — Mini month                                                    */
  /* ---------------------------------------------------------------- */
  check(
    "E1 mini calendar title follows the main month",
    (await page.locator('[data-testid="events-minical-title"]').innerText()) ===
      curMonthTitle,
  );
  const miniDayCount = await page.locator("[data-testid^='events-minical-day-']").count();
  check("E2 mini grid has 42 day buttons", miniDayCount === 42, String(miniDayCount));

  await page.locator('[data-testid="events-minical-next"]').click();
  await page.waitForTimeout(300);
  const miniNextTitle = await page
    .locator('[data-testid="events-minical-title"]')
    .innerText();
  const mainAfterMini = await page
    .locator('[data-testid="events-month-title"]')
    .innerText();
  check(
    "E3 mini next is independent (main untouched)",
    miniNextTitle !== mainAfterMini && mainAfterMini === curMonthTitle,
    `mini=${miniNextTitle} main=${mainAfterMini}`,
  );

  const nextMonthKey = keyOf(curYear, curMonth + 1, 15);
  await page.locator(`[data-testid="events-minical-day-${nextMonthKey}"]`).click();
  await page.waitForTimeout(400);
  const mainAfterDay = await page
    .locator('[data-testid="events-month-title"]')
    .innerText();
  check(
    "E4 mini day click jumps the main grid",
    mainAfterDay === miniNextTitle,
    mainAfterDay,
  );

  await page.locator('[data-testid="events-minical-prev"]').click();
  await page.waitForTimeout(300);
  const curMonthDayKey = keyOf(curYear, curMonth, 20);
  await page.locator(`[data-testid="events-minical-day-${curMonthDayKey}"]`).click();
  await page.waitForTimeout(400);
  check(
    "E5 day click back to the current month works",
    (await page.locator('[data-testid="events-month-title"]').innerText()) ===
      curMonthTitle,
  );

  /* ---------------------------------------------------------------- */
  /* F — Event dialog                                                  */
  /* ---------------------------------------------------------------- */
  await page.locator('[data-testid="events-event-ev-03"]').click();
  await page.waitForTimeout(400);
  const dialog = page.locator('[data-testid="events-event-dialog"]');
  const dialogText = await dialog.innerText();
  check(
    "F1 event dialog shows title, full date, time and calendar",
    dialogText.includes("Sprint Planning") &&
      dialogText.includes("10:00") &&
      /Saturday, October \d+, 2026/.test(dialogText) &&
      dialogText.includes("Work"),
    dialogText.replace(/\n/g, " | ").slice(0, 120),
  );
  await shot("events-dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("F2 Escape closes the event dialog", !(await dialog.isVisible()));

  /* ---------------------------------------------------------------- */
  /* G — Rail sections                                                 */
  /* ---------------------------------------------------------------- */
  await page.locator('[data-testid="events-section-favorites-toggle"]').click();
  await page.waitForTimeout(200);
  const favOpen = await page
    .locator('[data-testid="events-section-favorites-toggle"]')
    .getAttribute("aria-expanded");
  check(
    "G1 Favorites expands with its empty hint",
    favOpen === "true" &&
      (await page.getByText("Starred events will land here.").count()) === 1,
  );
  await page.locator('[data-testid="events-section-favorites-toggle"]').click();

  await page.locator('[data-testid="events-section-other-toggle"]').click();
  await page.waitForTimeout(200);
  check(
    "G2 Other collapses (Travel row hidden)",
    (await page.locator('[data-testid="events-list-travel"]').count()) === 0,
  );
  await page.locator('[data-testid="events-section-other-toggle"]').click();
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  /* H — New calendar (dialog + preview + cancel)                       */
  /* ---------------------------------------------------------------- */
  await page.locator('[data-testid="events-new-calendar"]').click();
  await page.waitForTimeout(400);
  const calDialog = page.locator('[data-testid="events-new-calendar-dialog"]');
  check(
    "H0 New Calendar opens as a dialog with a live preview",
    (await calDialog.isVisible()) &&
      (await page.locator('[data-testid="events-new-calendar-preview"]').count()) === 1,
  );
  await page.locator('[data-testid="events-new-calendar-name"]').fill("Focus");
  await page.locator('[data-testid="events-new-calendar-color-teal"]').click();
  await shot("events-new-calendar-dialog");
  await page.locator('[data-testid="events-new-calendar-add"]').click();
  await page.waitForTimeout(300);
  const focusRow = page.locator("label", { has: page.getByText("Focus", { exact: true }) });
  check(
    "H1 new calendar appears under Other and dialog closes",
    (await focusRow.count()) === 1 && !(await calDialog.isVisible()),
  );

  // Cancel path — nothing is created.
  await page.locator('[data-testid="events-new-calendar"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="events-new-calendar-name"]').fill("Ghost");
  await page.locator('[data-testid="events-new-calendar-cancel"]').click();
  await page.waitForTimeout(300);
  check(
    "H2 cancel closes the dialog without creating the list",
    !(await calDialog.isVisible()) &&
      (await page.getByText("Ghost", { exact: true }).count()) === 0,
  );

  /* ---------------------------------------------------------------- */
  /* I–J — Tasky structure                                             */
  /* ---------------------------------------------------------------- */
  await sidebarLink("Tasky").click();
  await page.waitForURL("**/tasky");
  await page.waitForTimeout(700);

  check(
    "I1 /tasky renders H1 + New task button (board title removed)",
    (await page.locator("h1").innerText()) === "Tasky" &&
      (await page.locator('[data-testid="tasky-title"]').count()) === 0 &&
      (await page.locator('[data-testid="tasky-subtitle"]').count()) === 0 &&
      (await page.locator('[data-testid="tasky-new-task"]').count()) === 1,
  );

  const columns = ["backlog", "todo", "in-progress", "in-review", "done"];
  const counts = {};
  for (const col of columns) {
    counts[col] = await page
      .locator(`[data-testid="tasky-count-${col}"]`)
      .innerText();
  }
  check(
    "J1 seed counts 4/3/3/2/3",
    counts.backlog === "4" &&
      counts.todo === "3" &&
      counts["in-progress"] === "3" &&
      counts["in-review"] === "2" &&
      counts.done === "3",
    JSON.stringify(counts),
  );

  const oauthCard = page.locator('[data-testid="tasky-card-t-oauth"]');
  const oauthText = await oauthCard.innerText();
  check(
    "J2 card anatomy: title, category, priority, assignee, due",
    oauthText.includes("Implement OAuth 2.0 SSO integration") &&
      oauthText.includes("Feature") &&
      oauthText.includes("High") &&
      oauthText.includes("AK") &&
      oauthText.includes("Apr 20"),
    oauthText.replace(/\n/g, " | "),
  );

  await shot("tasky-board");
  await page.screenshot({ path: `${SHOTS}/events-final.png`, fullPage: true });

  /* ---------------------------------------------------------------- */
  /* K — Drag & drop across columns                                    */
  /* ---------------------------------------------------------------- */
  // HTML5 DnD via raw mouse input (dragTo is unreliable for HTML5 events):
  // hover source → down → threshold move → glide to target → settle → up.
  const dragCard = async (sourceSel, targetLoc, targetPos) => {
    const source =
      typeof sourceSel === "string" ? page.locator(sourceSel) : sourceSel;
    const sBox = await source.boundingBox();
    const tBox = await targetLoc.boundingBox();
    if (!sBox || !tBox) return;
    const sx = sBox.x + sBox.width / 2;
    const sy = sBox.y + sBox.height / 2;
    const tx = tBox.x + (targetPos ? targetPos.x : tBox.width / 2);
    const ty = tBox.y + (targetPos ? targetPos.y : tBox.height / 2);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 12, sy + 8, { steps: 4 });
    await page.mouse.move(tx, ty, { steps: 18 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  /** Idempotent drag attempts until the predicate holds (max 3). */
  const dragUntil = async (dragFn, predicate) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await dragFn();
      if (await predicate()) return attempt;
    }
    return -1;
  };
  const countOf = (col) =>
    page.locator(`[data-testid="tasky-count-${col}"]`).innerText();

  const inReviewZone = page.locator('[data-testid="tasky-dropzone-in-review"]');
  const doneZone = page.locator('[data-testid="tasky-dropzone-done"]');

  // K1 — In Review → Done
  const k1 = await dragUntil(
    () => dragCard('[data-testid="tasky-card-t-ratelimit"]', doneZone, { x: 120, y: 30 }),
    async () =>
      (await countOf("done")) === "4" &&
      (await countOf("in-review")) === "1" &&
      (await page
        .locator('[data-testid="tasky-dropzone-done"] [data-testid="tasky-card-t-ratelimit"]')
        .count()) === 1,
  );
  check(
    "K1 drag In Review → Done moves the card and updates counts",
    k1 !== -1,
    `attempts=${k1}`,
  );
  await shot("tasky-after-drag");

  // K2 — restore: Done → In Review
  const k2 = await dragUntil(
    () =>
      dragCard(
        '[data-testid="tasky-card-t-ratelimit"]',
        inReviewZone,
        { x: 120, y: 20 },
      ),
    async () =>
      (await countOf("in-review")) === "2" && (await countOf("done")) === "3",
  );
  check("K2 drag back restores In Review = 2 / Done = 3", k2 !== -1, `attempts=${k2}`);

  /* ---------------------------------------------------------------- */
  /* L — Empty column state                                            */
  /* ---------------------------------------------------------------- */
  const l1a = await dragUntil(
    () => dragCard('[data-testid="tasky-card-t-darkmode"]', doneZone, { x: 120, y: 30 }),
    async () => (await countOf("in-review")) === "1",
  );
  const l1b = await dragUntil(
    () => dragCard('[data-testid="tasky-card-t-ratelimit"]', doneZone, { x: 120, y: 30 }),
    async () => (await countOf("in-review")) === "0",
  );
  const emptyState = await inReviewZone.getByText("No tasks").count();
  check(
    "L1 drained In Review shows the empty state",
    l1a !== -1 && l1b !== -1 && emptyState === 1,
  );
  await shot("tasky-empty-column");

  // restore both cards
  const l2a = await dragUntil(
    () =>
      dragCard(
        '[data-testid="tasky-card-t-darkmode"]',
        inReviewZone,
        { x: 120, y: 20 },
      ),
    async () => (await countOf("in-review")) === "1",
  );
  const l2b = await dragUntil(
    () =>
      dragCard(
        '[data-testid="tasky-card-t-ratelimit"]',
        inReviewZone,
        { x: 120, y: 120 },
      ),
    async () =>
      (await countOf("in-review")) === "2" && (await countOf("done")) === "3",
  );
  check("L2 both cards restored to In Review (= 2)", l2a !== -1 && l2b !== -1);

  /* ---------------------------------------------------------------- */
  /* M — Reorder within a column                                       */
  /* ---------------------------------------------------------------- */
  const firstBacklogId = () =>
    page
      .locator('[data-testid="tasky-dropzone-backlog"] [data-task-id]')
      .first()
      .getAttribute("data-task-id");

  const m1 = await dragUntil(
    () =>
      dragCard(
        '[data-testid="tasky-card-t-oauth"]',
        page.locator('[data-testid="tasky-card-t-csv"]'),
        { x: 100, y: 120 },
      ),
    async () => (await firstBacklogId()) === "t-csv",
  );
  check(
    "M1 dropping below a card reorders the column",
    m1 !== -1,
    `attempts=${m1}`,
  );

  // restore original order (drop above csv's midpoint)
  const m2 = await dragUntil(
    () =>
      dragCard(
        '[data-testid="tasky-card-t-oauth"]',
        page.locator('[data-testid="tasky-card-t-csv"]'),
        { x: 100, y: 8 },
      ),
    async () => (await firstBacklogId()) === "t-oauth",
  );
  check("M2 original order restored", m2 !== -1, `attempts=${m2}`);

  /* ---------------------------------------------------------------- */
  /* Q — Task modal: create → details → edit → delete                   */
  /* ---------------------------------------------------------------- */
  const backlogCount = () =>
    page.locator('[data-testid="tasky-count-backlog"]').innerText();

  await page.locator('[data-testid="tasky-new-task"]').click();
  await page.waitForTimeout(400);
  const taskModal = page.locator('[data-testid="tasky-task-modal"]');
  check("Q1 toolbar button opens the New task modal", await taskModal.isVisible());
  await page.locator('[data-testid="tasky-task-title"]').fill("Write release notes");
  await page.locator('[data-testid="tasky-task-category"]').fill("Docs");
  await page.locator('[data-testid="tasky-task-assignee"]').fill("zz");
  await page.locator('[data-testid="tasky-priority-low"]').click();
  await page.locator('[data-testid="tasky-task-due"]').fill("2025-06-01");
  await page.locator('[data-testid="tasky-task-column"]').click();
  await page.waitForTimeout(300);
  await page.getByRole("option", { name: "Backlog" }).click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="tasky-task-submit"]').click();
  await page.waitForTimeout(400);
  const createdCard = page
    .locator('[data-testid="tasky-dropzone-backlog"] [data-task-id]')
    .filter({ hasText: "Write release notes" });
  const createdText = await createdCard.innerText();
  check(
    "Q2 create → Backlog 5, card anatomy (Docs/Low/ZZ/Jun 1)",
    (await backlogCount()) === "5" &&
      createdText.includes("Write release notes") &&
      createdText.includes("Docs") &&
      createdText.includes("Low") &&
      createdText.includes("ZZ") &&
      createdText.includes("Jun 1"),
    createdText.replace(/\n/g, " | "),
  );

  await createdCard.click();
  await page.waitForTimeout(400);
  const detailDialog = page.locator('[data-testid="tasky-detail-dialog"]');
  const detailText = await detailDialog.innerText();
  check(
    "Q3 card click opens the details dialog with the column",
    detailText.includes("Write release notes") && detailText.includes("Backlog"),
    detailText.replace(/\n/g, " | ").slice(0, 120),
  );

  await page.locator('[data-testid="tasky-edit"]').click();
  await page.waitForTimeout(400);
  const prefilled = await page.locator('[data-testid="tasky-task-title"]').inputValue();
  check("Q4 Edit opens the modal prefilled", prefilled === "Write release notes", prefilled);
  await page.locator('[data-testid="tasky-task-title"]').fill("Write release notes v2");
  await page.locator('[data-testid="tasky-task-submit"]').click();
  await page.waitForTimeout(400);
  const v2Card = page
    .locator('[data-testid="tasky-dropzone-backlog"] [data-task-id]')
    .filter({ hasText: "Write release notes v2" });
  check(
    "Q5 save updates the card in place",
    (await v2Card.count()) === 1 && (await backlogCount()) === "5",
  );

  await v2Card.click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tasky-delete"]').click();
  await page.waitForTimeout(400);
  check(
    "Q6 delete removes the card (Backlog back to 4)",
    (await backlogCount()) === "4" && (await v2Card.count()) === 0,
  );

  /* ---------------------------------------------------------------- */
  /* R — Per-column quick add                                           */
  /* ---------------------------------------------------------------- */
  await page.locator('[data-testid="tasky-column-add-todo"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tasky-task-title"]').fill("Quick add check");
  await page.locator('[data-testid="tasky-task-submit"]').click();
  await page.waitForTimeout(400);
  const quickCard = page
    .locator('[data-testid="tasky-dropzone-todo"] [data-task-id]')
    .filter({ hasText: "Quick add check" });
  check(
    "R1 quick add lands in Todo (count 4)",
    (await page.locator('[data-testid="tasky-count-todo"]').innerText()) === "4" &&
      (await quickCard.count()) === 1,
  );
  await quickCard.click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tasky-delete"]').click();
  await page.waitForTimeout(400);
  check(
    "R2 cleanup restores Todo = 3",
    (await page.locator('[data-testid="tasky-count-todo"]').innerText()) === "3",
  );

  /* ---------------------------------------------------------------- */
  /* S — Keyboard drag & drop on the grip handle                        */
  /* ---------------------------------------------------------------- */
  const oauthHandle = page.locator('[data-testid="tasky-handle-t-oauth"]');
  await oauthHandle.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  check(
    "S1 keyboard grab announces via aria-live",
    (await page.locator('[data-testid="tasky-live"]').innerText()).includes("grabbed"),
  );
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  check(
    "S2 ArrowDown reorders within the column",
    (await firstBacklogId()) === "t-csv",
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  check(
    "S3 Enter drops the card",
    (await page.locator('[data-testid="tasky-live"]').innerText()).includes("moved to"),
  );
  await oauthHandle.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  check("S4 original order restored", (await firstBacklogId()) === "t-oauth");

  /* ---------------------------------------------------------------- */
  /* T — TOUCH drag & drop (finger, via CDP touch input)                */
  /* ---------------------------------------------------------------- */
  const touchContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    hasTouch: true,
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${BASE}/login`);
  await ensureLogin(touchPage);
  await touchPage.goto(`${BASE}/tasky`);
  await touchPage.waitForTimeout(900);

  const touchCount = (col) =>
    touchPage.locator(`[data-testid="tasky-count-${col}"]`).innerText();
  const touchDrag = async (cardSel, targetLoc, targetPos) => {
    const sBox = await touchPage.locator(cardSel).boundingBox();
    const tBox = await targetLoc.boundingBox();
    if (!sBox || !tBox) return false;
    const sx = sBox.x + sBox.width / 2;
    const sy = sBox.y + sBox.height / 2;
    const tx = tBox.x + (targetPos ? targetPos.x : tBox.width / 2);
    const ty = tBox.y + (targetPos ? targetPos.y : tBox.height / 2);
    const cdp = await touchPage.context().newCDPSession(touchPage);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: sx, y: sy }],
    });
    await touchPage.waitForTimeout(60);
    const steps = 16;
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: sx + ((tx - sx) * i) / steps, y: sy + ((ty - sy) * i) / steps }],
      });
      await touchPage.waitForTimeout(24);
    }
    await touchPage.waitForTimeout(150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touchPage.waitForTimeout(450);
    await cdp.detach();
    return true;
  };

  const tDone = touchPage.locator('[data-testid="tasky-dropzone-done"]');
  const tInReview = touchPage.locator('[data-testid="tasky-dropzone-in-review"]');
  const t1 = await touchDrag(
    '[data-testid="tasky-card-t-darkmode"]',
    tDone,
    { x: 120, y: 30 },
  );
  check(
    "T1 finger drag In Review → Done (pointer events, no HTML5)",
    t1 &&
      (await touchCount("done")) === "4" &&
      (await touchCount("in-review")) === "1",
    `dragged=${t1} done=${await touchCount("done")} review=${await touchCount("in-review")}`,
  );
  await touchPage.screenshot({ path: `${SHOTS}/tasky-touch-drag.png` });

  const t2 = await touchDrag(
    '[data-testid="tasky-card-t-darkmode"]',
    tInReview,
    { x: 120, y: 20 },
  );
  check(
    "T2 finger drag back restores In Review = 2",
    t2 &&
      (await touchCount("in-review")) === "2" &&
      (await touchCount("done")) === "3",
  );
  await touchContext.close();

  /* ---------------------------------------------------------------- */
  /* U — Events: create an event from the day schedule                  */
  /* ---------------------------------------------------------------- */
  await sidebarLink("Events").click();
  await page.waitForURL("**/events");
  await page.waitForTimeout(700);

  const emptyDayKey = await page.evaluate(() => {
    const cells = document.querySelectorAll(
      '[role="gridcell"][data-testid^="events-cell-"]',
    );
    for (const cell of cells) {
      // data-in-month lives on the inner DayCell, not on the gridcell wrapper.
      const inner = cell.querySelector("[data-in-month]");
      const inMonth = inner?.getAttribute("data-in-month") === "1";
      const hasPills =
        cell.querySelectorAll('[data-testid^="events-event-"]').length > 0;
      if (inMonth && !hasPills) {
        return cell.getAttribute("data-testid").replace("events-cell-", "");
      }
    }
    return null;
  });
  check(
    "U1 an in-month day without events exists",
    typeof emptyDayKey === "string" && emptyDayKey.length === 10,
    String(emptyDayKey),
  );

  await page.locator(`[data-testid="events-cell-${emptyDayKey}"]`).click();
  await page.waitForTimeout(400);
  check(
    "U2 cell click opens the day schedule with the add-event form",
    (await page.locator('[data-testid="events-day-dialog"]').isVisible()) &&
      (await page.locator('[data-testid="events-add-event"]').count()) === 1,
  );
  await page.locator('[data-testid="events-add-event-title"]').fill("Verify Created Event");
  await page.locator('[data-testid="events-add-event-time"]').fill("08:15");
  await page.locator('[data-testid="events-add-event-submit"]').click();
  await page.waitForTimeout(400);
  const dayText = await page.locator('[data-testid="events-day-dialog"]').innerText();
  check(
    "U3 created event appears in the day schedule with its time",
    dayText.includes("Verify Created Event") && dayText.includes("08:15"),
    dayText.replace(/\n/g, " | ").slice(0, 140),
  );
  check(
    "U4 pill rendered in the grid (24 → 25)",
    (await page.locator('[data-testid^="events-event-"]').count()) === 25,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const createdPill = page
    .locator('[data-testid^="events-event-"]')
    .filter({ hasText: "Verify Created Event" });
  await createdPill.click();
  await page.waitForTimeout(400);
  const createdDetail = await page.locator("[data-testid='events-event-dialog']").innerText();
  check(
    "U5 detail dialog shows the created event + calendar",
    createdDetail.includes("Verify Created Event") && createdDetail.includes("Personal"),
    createdDetail.replace(/\n/g, " | ").slice(0, 140),
  );
  await page.locator('[data-testid="events-event-delete"]').click();
  await page.waitForTimeout(400);
  check(
    "U6 delete restores 24 pills",
    (await page.locator('[data-testid^="events-event-"]').count()) === 24,
  );

  /* ---------------------------------------------------------------- */
  /* N — Mobile 390px                                                  */
  /* ---------------------------------------------------------------- */
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto(`${BASE}/events`);
  await mobilePage.waitForTimeout(800);
  const mobileOverflow = await mobilePage.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  // The rail is rendered but CSS-hidden below `lg` (pixel-faithful desktop
  // rail) — so the correct assertion is visibility, not DOM absence.
  const railHidden =
    !(await mobilePage.locator('[data-testid="events-rail"]').isVisible());
  check(
    "N1 events mobile: no document overflow, rail hidden",
    mobileOverflow && railHidden,
  );

  await mobilePage.goto(`${BASE}/tasky`);
  await mobilePage.waitForTimeout(800);
  const mobileOverflowTasky = await mobilePage.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  const boardScrolls = await mobilePage.evaluate(() => {
    const el = document.querySelector('[data-testid="tasky-board-scroll"]');
    return el ? el.scrollWidth > el.clientWidth : false;
  });
  check(
    "N2 tasky mobile: no document overflow, board scrolls internally",
    mobileOverflowTasky && boardScrolls,
  );
  await mobilePage.screenshot({ path: `${SHOTS}/tasky-mobile.png` });
  await mobilePage.close();

  /* ---------------------------------------------------------------- */
  /* O — Light theme                                                   */
  /* ---------------------------------------------------------------- */
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "light"),
  );
  await page.waitForTimeout(400);
  await shot("tasky-light");
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark-blue"),
  );
  await page.waitForTimeout(200);
  check("O1 light theme renders without errors", errors.length === 0);

  /* ---------------------------------------------------------------- */
  /* P — Console/network cleanliness                                   */
  /* ---------------------------------------------------------------- */
  check("P1 no page errors / unexpected 4xx", errors.length === 0, errors.join(" ; "));

  console.log("\n=== SUMMARY ===");
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log(failed.join("\n"));
  }

  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
