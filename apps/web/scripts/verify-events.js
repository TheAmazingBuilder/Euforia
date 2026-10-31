/**
 * Events regression probe: authenticated calendar API, empty first-use state,
 * calendar/event CRUD, persistence after reload, responsive layout.
 */
const { chromium } = require("playwright");
const { ensureLogin } = require(`${__dirname}/helpers/login.js`);

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;
const errors = [];

function check(label, condition, detail = "") {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`);
}

const isEventsRequest = (response, method) =>
  response.url().includes("/api/v1/events") && response.request().method() === method;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(String(error)));

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await ensureLogin(page);
    const read = page.waitForResponse((response) => isEventsRequest(response, "GET"));
    await page.goto(`${BASE}/events`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const readResponse = await read;
    await page.locator('[data-testid="events-view"]').waitFor({ state: "visible" });
    check("Events hydrates from the authenticated API", readResponse.status() === 200);
    check("calendar grid renders", await page.locator('[data-testid="events-grid"]').isVisible());

    const fixtureCount = await page.locator(
      '[data-testid="events-pill-e1"], [data-testid="events-pill-e2"], [data-testid="events-pill-e7"], [data-testid="events-pill-e24"]',
    ).count();
    check("legacy sample event IDs are not rendered", fixtureCount === 0);

    let rows = page.locator('[data-testid^="events-cal-row-"]');
    if (await rows.count() === 0) {
      check("new accounts show the empty state", await page.locator('[data-testid="events-empty-state"]').isVisible());
      const saveCalendar = page.waitForResponse((response) => isEventsRequest(response, "PUT"));
      await page.click('[data-testid="events-new-calendar"]');
      await page.locator('[data-testid="events-newcal-dialog"]').waitFor({ state: "visible" });
      await page.fill('[data-testid="events-newcal-name"]', "Personal calendar");
      await page.click('[data-testid="events-newcal-create"]');
      check("calendar creation reaches PostgreSQL", (await saveCalendar).status() === 200);
      rows = page.locator('[data-testid^="events-cal-row-"]');
    }

    const firstRow = rows.first();
    await firstRow.waitFor({ state: "visible" });
    const calendarId = (await firstRow.getAttribute("data-testid")).replace("events-cal-row-", "");
    const day = await page.evaluate(() => {
      const date = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    const title = `Events probe ${Date.now()}`;

    const saveEvent = page.waitForResponse((response) => isEventsRequest(response, "PUT"));
    await page.click('[data-testid="events-new"]');
    await page.locator('[data-testid="events-new-dialog"]').waitFor({ state: "visible" });
    await page.fill('[data-testid="events-new-title"]', title);
    await page.click('[data-testid="events-new-calendar-select"]');
    await page.locator(`[data-testid="events-new-cal-${calendarId}"]`).click();
    await page.fill('[data-testid="events-new-date"]', day);
    await page.click('[data-testid="events-new-create"]');
    check("event creation reaches PostgreSQL", (await saveEvent).status() === 200);

    const pill = page.locator('[data-testid^="events-pill-"]').filter({ hasText: title }).first();
    await pill.waitFor({ state: "visible" });
    const eventId = await pill.getAttribute("data-events-pill");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="events-view"]').waitFor({ state: "visible" });
    check("created event survives reload", await page.locator(`[data-testid="events-pill-${eventId}"]`).isVisible());

    await page.locator(`[data-testid="events-pill-${eventId}"]`).click();
    await page.locator('[data-testid="events-details"]').waitFor({ state: "visible" });
    const saveRename = page.waitForResponse((response) => isEventsRequest(response, "PUT"));
    await page.click('[data-testid="events-details-rename"]');
    await page.fill('[data-testid="events-details-rename-input"]', title + " updated");
    await page.click('[data-testid="events-details-rename-save"]');
    check("event rename is persisted", (await saveRename).status() === 200);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="events-view"]').waitFor({ state: "visible" });
    check("renamed event survives reload", await page.locator('[data-testid^="events-pill-"]').filter({ hasText: title + " updated" }).count() === 1);

    const renamedPill = page.locator('[data-testid^="events-pill-"]').filter({ hasText: title + " updated" }).first();
    const renamedId = await renamedPill.getAttribute("data-events-pill");
    const saveDelete = page.waitForResponse((response) => isEventsRequest(response, "PUT"));
    await renamedPill.click();
    await page.locator('[data-testid="events-details"]').waitFor({ state: "visible" });
    await page.click('[data-testid="events-details-delete"]');
    check("event deletion is persisted", (await saveDelete).status() === 200);
    check("deleted event disappears", await page.locator(`[data-testid="events-pill-${renamedId}"]`).count() === 0);

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("mobile layout has no horizontal overflow", overflow === 0, `${overflow}px`);
    check("mobile calendar filters render", await page.locator('[data-testid="events-chips"]').isVisible());
    check("no uncaught page errors", errors.length === 0, errors.join(" | ").slice(0, 200));
  } catch (error) {
    failed += 1;
    console.error("  FAIL - Events probe crashed", error);
  } finally {
    await browser.close();
  }

  console.log(`Events probe: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
})();
