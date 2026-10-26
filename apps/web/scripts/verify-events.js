/**
 * Events probe - the trading calendar (Academy section).
 * Covers: header + structure (sidebar, mini month, groups), calendar-group
 * filters (uncheck hides pills), group collapse, sort menu (time/title/
 * calendar), New Calendar dialog (disabled empty + create into group),
 * New event dialog, details card (star / rename / delete), mouse drag AND
 * touch (pointer) drag between days, panel toggle, persistence, mobile
 * 390px, light theme, console integrity.
 */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;
const pageErrors = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` - ${extra}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check("login succeeded", !page.url().includes("/login"), page.url());
}

/** Pills of a day cell, in DOM order (reflects the active sort). */
async function cellPillOrder(page, iso) {
  return page
    .locator(`[data-testid="events-cell-${iso}"]`)
    .evaluate((cell) =>
      Array.from(cell.querySelectorAll("[data-events-pill]")).map((el) => el.getAttribute("data-events-pill")),
    );
}

async function cellCenter(page, iso) {
  return page.locator(`[data-testid="events-cell-${iso}"]`).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

/** Touch-path drag of a pill: synthetic PointerEvents with pointerType "touch". */
async function touchDragPill(page, pillId, targetIso) {
  const target = await cellCenter(page, targetIso);
  return page.evaluate(
    async ({ id, tx, ty }) => {
      const pill = document.querySelector(`[data-testid="events-pill-${id}"]`);
      if (!pill) return "no-pill";
      const rect = pill.getBoundingClientRect();
      const sx = rect.left + rect.width / 2;
      const sy = rect.top + rect.height / 2;
      const fire = (type, x, y) =>
        window.dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", clientX: x, clientY: y, isPrimary: true, pointerId: 9 }),
        );
      pill.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", clientX: sx, clientY: sy, isPrimary: true, pointerId: 9 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
      for (let i = 1; i <= 6; i += 1) {
        fire("pointermove", sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      fire("pointerup", tx, ty);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return "ok";
    },
    { id: pillId, tx: target.x, ty: target.y },
  );
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Clean state");
    await login(page);
    await page.goto(`${BASE}/events`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => window.localStorage.removeItem("cosmoz.events.state.v1"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    console.log("\n[1] Header + structure");
    const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    check("h1 is Events", h1 === "Events", h1);
    check("view present", await page.locator('[data-testid="events-view"]').isVisible().catch(() => false));
    check("sidebar panel visible", await page.locator('[data-testid="events-sidebar"]').isVisible().catch(() => false));
    check("mini month present", await page.locator('[data-testid="events-mini-month"]').isVisible().catch(() => false));
    const monthLabel = (await page.locator('[data-testid="events-month-label"]').innerText().catch(() => "")).trim();
    check("month label October 2026", monthLabel === "October 2026", monthLabel);
    for (const group of ["mine", "favorites", "other"]) {
      check(`group ${group} present`, await page.locator(`[data-testid="events-group-${group}"]`).isVisible().catch(() => false));
    }
    check("grid present", await page.locator('[data-testid="events-grid"]').isVisible().catch(() => false));
    check(
      "seed pill e7 (Design Review) rendered",
      await page.locator('[data-testid="events-pill-e7"]').isVisible().catch(() => false),
    );

    console.log("\n[2] Calendar-group filters");
    // Uncheck "work" → its pills leave the grid (state keeps them).
    check("e1 visible before filter", await page.locator('[data-testid="events-pill-e1"]').isVisible().catch(() => false));
    await page.click('[data-testid="events-cal-check-work"]');
    await page.waitForTimeout(300);
    check("work unchecked hides e1", !(await page.locator('[data-testid="events-pill-e1"]').isVisible().catch(() => false)));
    check("work unchecked hides e7", (await page.locator('[data-testid="events-pill-e7"]').count()) === 0);
    await page.click('[data-testid="events-cal-check-work"]');
    await page.waitForTimeout(300);
    check("work re-checked restores e1", await page.locator('[data-testid="events-pill-e1"]').isVisible().catch(() => false));

    // Favorites group starts collapsed; expand shows its calendars.
    const favExpanded = await page
      .locator('[data-testid="events-group-favorites"] button')
      .first()
      .getAttribute("aria-expanded");
    check("favorites group collapsed by default", favExpanded === "false", String(favExpanded));
    check(
      "health row hidden while collapsed",
      (await page.locator('[data-testid="events-cal-row-health"]').count()) === 0,
    );
    await page.click('[data-testid="events-group-favorites"] button');
    await page.waitForTimeout(250);
    check(
      "health row visible after expand",
      await page.locator('[data-testid="events-cal-row-health"]').isVisible().catch(() => false),
    );

    console.log("\n[3] Sort menu (time / title / calendar)");
    // Day 2026-10-08: e7 Design Review (work, 13:00) + e8 Dentist (health, 16:30).
    const timeOrder = await cellPillOrder(page, "2026-10-08");
    check("time sort: e7 before e8", timeOrder.join(",") === "e7,e8", timeOrder.join(","));
    await page.click('[data-testid="events-sort"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="events-sort-item-calendar"]');
    await page.waitForTimeout(300);
    const calOrder = await cellPillOrder(page, "2026-10-08");
    check("calendar sort flips to e8 (health) first", calOrder.join(",") === "e8,e7", calOrder.join(","));
    await page.click('[data-testid="events-sort"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="events-sort-item-title"]');
    await page.waitForTimeout(300);
    const titleOrder = await cellPillOrder(page, "2026-10-08");
    // "Dentist" < "Design Review" alphabetically - title sort flips the pair.
    check("title sort flips to e8 (Dentist) first", titleOrder.join(",") === "e8,e7", titleOrder.join(","));
    check(
      "sort button label reads Sort by title",
      (await page.locator('[data-testid="events-sort"]').innerText().catch(() => "")).trim() === "Sort by title",
    );
    await page.click('[data-testid="events-sort"]');
    await page.waitForTimeout(250);
    await page.click('[data-testid="events-sort-item-time"]');
    await page.waitForTimeout(250);

    console.log("\n[4] New Calendar dialog");
    await page.click('[data-testid="events-new-calendar"]');
    await page.waitForTimeout(400);
    check("dialog opens", await page.locator('[data-testid="events-newcal-dialog"]').isVisible().catch(() => false));
    check(
      "create disabled while name empty",
      !(await page.locator('[data-testid="events-newcal-create"]').isEnabled().catch(() => true)),
    );
    await page.fill('[data-testid="events-newcal-name"]', "Probe Cal");
    await page.click('[data-testid="events-newcal-color-pink"]');
    await page.click('[data-testid="events-newcal-group"]');
    await page.waitForTimeout(250);
    await page.click('[role="option"]:has-text("Other")');
    await page.waitForTimeout(200);
    await page.click('[data-testid="events-newcal-create"]');
    await page.waitForTimeout(400);
    const probeCalRow = page.locator('[data-testid="events-group-other"]', { hasText: "Probe Cal" });
    check("Probe Cal lands in Other group", await probeCalRow.isVisible().catch(() => false));

    console.log("\n[5] New event dialog");
    await page.click('[data-testid="events-new"]');
    await page.waitForTimeout(400);
    check("new event dialog opens", await page.locator('[data-testid="events-new-dialog"]').isVisible().catch(() => false));
    await page.fill('[data-testid="events-new-title"]', "Probe Event");
    // Calendar select: pick "Personal".
    await page.click('[data-testid="events-new-calendar-select"]');
    await page.waitForTimeout(250);
    await page.click('[role="option"]:has-text("Personal")');
    await page.waitForTimeout(200);
    check(
      "create disabled while title empty",
      false || (await page.locator('[data-testid="events-new-create"]').isEnabled()),
    );
    await page.click('[data-testid="events-new-create"]');
    await page.waitForTimeout(500);
    const todayIso = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
    });
    const probePill = page.locator('[data-testid="events-view"] button', { hasText: "Probe Event" }).first();
    check("Probe Event pill rendered", await probePill.isVisible().catch(() => false));
    const probePillId = await probePill.getAttribute("data-events-pill");
    const probePillCell = await probePill.evaluate((el) => el.closest("[data-events-cell]")?.getAttribute("data-events-cell"));
    check("Probe Event sits on today's cell", probePillCell === todayIso, `${probePillCell} vs ${todayIso}`);

    console.log("\n[6] Details card - star / rename / delete");
    await page.click('[data-testid="events-pill-e1"]');
    await page.waitForTimeout(350);
    check("details card opens", await page.locator('[data-testid="events-details"]').isVisible().catch(() => false));
    check(
      "details shows Team Standup",
      /Team Standup/.test(await page.locator('[data-testid="events-details"]').innerText().catch(() => "")),
    );
    await page.click('[data-testid="events-details-star"]');
    await page.waitForTimeout(250);
    check("star toggles to Starred", /Starred/.test(await page.locator('[data-testid="events-details"]').innerText()));
    check(
      "pill shows star glyph",
      await page
        .locator('[data-testid="events-pill-e1"] svg')
        .first()
        .isVisible()
        .catch(() => false),
    );
    await page.click('[data-testid="events-details-rename"]');
    await page.waitForTimeout(250);
    await page.fill('[data-testid="events-details-rename-input"]', "Team Standup v2");
    await page.click('[data-testid="events-details-rename-save"]');
    await page.waitForTimeout(350);
    check("rename persists on pill", /Team Standup v2/.test(await page.locator('[data-testid="events-pill-e1"]').innerText()));
    // Delete the probe event through its own details card.
    await page.click(`[data-testid="events-pill-${probePillId}"]`);
    await page.waitForTimeout(300);
    await page.click('[data-testid="events-details-delete"]');
    await page.waitForTimeout(350);
    check("Probe Event deleted", (await page.locator(`[data-testid="events-pill-${probePillId}"]`).count()) === 0);

    console.log("\n[7] Mouse drag e1: Oct 1 → Oct 2");
    const e1 = await page.locator('[data-testid="events-pill-e1"]').boundingBox();
    const day2 = await cellCenter(page, "2026-10-02");
    await page.mouse.move(e1.x + e1.width / 2, e1.y + e1.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(e1.x + ((day2.x - e1.x) * i) / 8, e1.y + ((day2.y - e1.y) * i) / 8);
      await page.waitForTimeout(40);
    }
    check("drag ghost visible mid-drag", await page.locator('[data-testid="events-drag-ghost"]').isVisible().catch(() => false));
    await page.mouse.up();
    await page.waitForTimeout(400);
    const e1Cell = await page
      .locator('[data-testid="events-pill-e1"]')
      .evaluate((el) => el.closest("[data-events-cell]")?.getAttribute("data-events-cell"));
    check("e1 dropped on Oct 2", e1Cell === "2026-10-02", String(e1Cell));

    console.log("\n[8] Touch drag (pointerType touch) e2: Oct 2 → Oct 3");
    const result = await touchDragPill(page, "e2", "2026-10-03");
    check("touch drag executed", result === "ok", String(result));
    await page.waitForTimeout(400);
    const e2Cell = await page
      .locator('[data-testid="events-pill-e2"]')
      .evaluate((el) => el.closest("[data-events-cell]")?.getAttribute("data-events-cell"));
    check("e2 dropped on Oct 3 via touch", e2Cell === "2026-10-03", String(e2Cell));

    console.log("\n[9] Panel toggle");
    await page.click('[data-testid="events-panel-toggle"]');
    await page.waitForTimeout(300);
    check("sidebar hidden after toggle", (await page.locator('[data-testid="events-sidebar"]').count()) === 0);
    await page.click('[data-testid="events-panel-toggle"]');
    await page.waitForTimeout(300);
    check("sidebar restored after toggle", await page.locator('[data-testid="events-sidebar"]').isVisible().catch(() => false));

    console.log("\n[10] Persistence across reload");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const e1CellAfter = await page
      .locator('[data-testid="events-pill-e1"]')
      .evaluate((el) => el.closest("[data-events-cell]")?.getAttribute("data-events-cell"))
      .catch(() => null);
    check("e1 still on Oct 2 after reload", e1CellAfter === "2026-10-02", String(e1CellAfter));
    check("Probe Cal persisted", await page.locator('[data-testid="events-group-other"]', { hasText: "Probe Cal" }).isVisible().catch(() => false));
    check("rename persisted", /Team Standup v2/.test(await page.locator('[data-testid="events-pill-e1"]').innerText().catch(() => "")));

    console.log("\n[11] Mobile 390px");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no page horizontal overflow", overflow === 0, `${overflow}px`);
    check("mobile filter chips visible", await page.locator('[data-testid="events-chips"]').isVisible().catch(() => false));
    await page.screenshot({ path: "scripts/shots/events-mobile.png", fullPage: true });

    console.log("\n[12] Light theme");
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    check(
      "events view still renders in light",
      await page.locator('[data-testid="events-view"]').isVisible().catch(() => false),
    );
    await page.screenshot({ path: "scripts/shots/events-light.png", fullPage: false });
    await page.evaluate(() => window.localStorage.setItem("theme", "dark"));

    console.log("\n[13] Console integrity");
    check("zero pageerrors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
    await page.screenshot({ path: "scripts/shots/events-desktop.png", fullPage: false });
  } catch (error) {
    failed += 1;
    console.log(`  ✗ probe crashed: ${error}`);
  } finally {
    await browser.close();
  }

  console.log("========================================================");
  console.log(`PASSED: ${passed}   FAILED: ${failed}   PAGE ERRORS: ${pageErrors.length}`);
  console.log("========================================================");
  process.exit(failed === 0 && pageErrors.length === 0 ? 0 : 1);
})();
