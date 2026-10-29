/**
 * Tasky probe - the trading kanban (Academy section).
 * Covers: Tasky Board header, 5 seeded columns left→right in a horizontally
 * scrollable board, faithful card anatomy (tag + priority + assignee + due),
 * add/delete card, mouse drag AND touch (pointer) drag between columns,
 * add-list appended to the right, local persistence, mobile 390px, themes.
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

async function columnCenter(page, columnId) {
  return page.locator(`[data-testid="tasky-column-${columnId}"]`).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(120, rect.height / 2) };
  });
}

/** Touch-path drag: synthetic PointerEvents with pointerType "touch". */
async function touchDrag(page, gripTestid, targetColumnId) {
  const target = await columnCenter(page, targetColumnId);
  return page.evaluate(
    async ({ testid, tx, ty }) => {
      const grip = document.querySelector(`[data-testid="${testid}"]`);
      if (!grip) return "no-grip";
      const rect = grip.getBoundingClientRect();
      const sx = rect.left + rect.width / 2;
      const sy = rect.top + rect.height / 2;
      const fire = (type, x, y) =>
        window.dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", clientX: x, clientY: y, isPrimary: true, pointerId: 7 }),
        );
      grip.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", clientX: sx, clientY: sy, isPrimary: true, pointerId: 7 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
      for (let i = 1; i <= 6; i += 1) {
        fire("pointermove", sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      fire("pointerup", tx, ty);
      await new Promise((resolve) => setTimeout(resolve, 120));
      return "ok";
    },
    { testid: gripTestid, tx: target.x, ty: target.y },
  );
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Clean board state");
    await login(page);
    await page.goto(`${BASE}/tasky`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => window.localStorage.removeItem("cosmoz.tasky.board.v1"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    console.log("\n[1] Header + structure");
    const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    check("h1 is Tasky Board", h1 === "Tasky Board", h1);
    check(
      "short subtitle present",
      /Plan, track and close the work around your trading edge/.test(await page.locator('[data-testid="tasky-view"]').evaluate(() => document.body.innerText)),
    );
    check("board present", await page.locator('[data-testid="tasky-board"]').isVisible().catch(() => false));

    const columnIds = ["backlog", "todo", "in-progress", "in-review", "done"];
    for (const id of columnIds) {
      check(`column ${id}`, await page.locator(`[data-testid="tasky-column-${id}"]`).isVisible().catch(() => false));
    }
    // Left → right order
    const xs = [];
    for (const id of columnIds) {
      xs.push(await page.locator(`[data-testid="tasky-column-${id}"]`).evaluate((el) => el.getBoundingClientRect().left));
    }
    check("columns ordered left to right", xs.every((x, i) => i === 0 || x > xs[i - 1]), xs.map((x) => Math.round(x)).join(","));

    // Horizontal scroll + counts
    const boardScroll = await page.locator('[data-testid="tasky-board"]').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    check("board scrolls horizontally", boardScroll.sw > boardScroll.cw, `${boardScroll.sw}>${boardScroll.cw}`);
    const counts = {};
    for (const id of columnIds) {
      counts[id] = Number(await page.locator(`[data-testid="tasky-count-${id}"]`).innerText());
    }
    check(
      "seed counts 4/3/3/2/3",
      counts.backlog === 4 && counts.todo === 3 && counts["in-progress"] === 3 && counts["in-review"] === 2 && counts.done === 3,
      JSON.stringify(counts),
    );

    console.log("\n[2] Card anatomy (reference fidelity)");
    const c1 = page.locator('[data-testid="tasky-card-c1"]');
    check("c1 title", /Implement OAuth 2\.0 SSO integration/.test(await c1.innerText().catch(() => "")));
    check("c1 tag Feature", /Feature/.test(await c1.innerText()));
    check("c1 priority High", /High/.test(await c1.innerText()));
    check("c1 assignee AK", /AK/.test(await c1.innerText()));
    check("c1 due Apr 20", /Apr 20/.test(await c1.innerText()));
    check("c1 grip exists", await page.locator('[data-testid="tasky-grip-c1"]').isVisible().catch(() => false));

    console.log("\n[3] Add + delete card");
    await page.click('[data-testid="tasky-add-todo"]');
    await page.fill('[data-testid="tasky-add-input-todo"]', "Probe card");
    await page.click('[data-testid="tasky-add-confirm-todo"]');
    await page.waitForTimeout(400);
    check("todo count 4 after add", (await page.locator('[data-testid="tasky-count-todo"]').innerText()) === "4");
    const probeCard = page.locator("article", { hasText: "Probe card" }).first();
    const probeId = await probeCard.getAttribute("data-testid");
    await page.click(`[data-testid="tasky-delete-${probeId?.replace("tasky-card-", "")}"]`);
    await page.waitForTimeout(300);
    check("todo count 3 after delete", (await page.locator('[data-testid="tasky-count-todo"]').innerText()) === "3");

    console.log("\n[3b] Edit + duplicate card");
    await page.click('[data-testid="tasky-add-todo"]');
    await page.fill('[data-testid="tasky-add-input-todo"]', "Editable probe");
    await page.click('[data-testid="tasky-add-confirm-todo"]');
    const editable = page.locator("article", { hasText: "Editable probe" }).first();
    const editableTestId = await editable.getAttribute("data-testid");
    const editableId = editableTestId?.replace("tasky-card-", "");
    await page.click(`[data-testid="tasky-edit-${editableId}"]`);
    await page.fill(`[data-testid="tasky-edit-title-${editableId}"]`, "Edited probe");
    await page.fill(`[data-testid="tasky-edit-tag-${editableId}"]`, "Regression");
    await page.selectOption(`[data-testid="tasky-edit-priority-${editableId}"]`, "Urgent");
    await page.fill(`[data-testid="tasky-edit-assignee-${editableId}"]`, "QA");
    await page.fill(`[data-testid="tasky-edit-due-${editableId}"]`, "2026-12-31");
    await page.click(`[data-testid="tasky-edit-save-${editableId}"]`);
    await page.waitForTimeout(400);
    const editedCard = page.locator(`[data-testid="tasky-card-${editableId}"]`);
    check("card fields can be edited", /Edited probe/.test(await editedCard.innerText()) && /Regression/.test(await editedCard.innerText()) && /Urgent/.test(await editedCard.innerText()) && /QA/.test(await editedCard.innerText()));
    await page.click(`[data-testid="tasky-duplicate-${editableId}"]`);
    const duplicate = page.locator("article", { hasText: "Edited probe (copy)" }).first();
    const duplicateTestId = await duplicate.getAttribute("data-testid");
    const duplicateId = duplicateTestId?.replace("tasky-card-", "");
    check("card can be duplicated", await duplicate.isVisible().catch(() => false));
    await page.click(`[data-testid="tasky-delete-${duplicateId}"]`);
    await page.click(`[data-testid="tasky-delete-${editableId}"]`);
    await page.waitForTimeout(400);
    check("edited and duplicate probe cards cleaned up", (await page.locator('[data-testid="tasky-count-todo"]').innerText()) === "3");

    console.log("\n[4] Mouse drag Backlog → In Review");
    const grip1 = await page.locator('[data-testid="tasky-grip-c1"]').boundingBox();
    const targetRev = await columnCenter(page, "in-review");
    await page.mouse.move(grip1.x + grip1.width / 2, grip1.y + grip1.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(
        grip1.x + ((targetRev.x - grip1.x) * i) / 8,
        grip1.y + ((targetRev.y - grip1.y) * i) / 8,
      );
      await page.waitForTimeout(40);
    }
    check("drag ghost visible mid-drag", await page.locator('[data-testid="tasky-drag-ghost"]').isVisible().catch(() => false));
    await page.mouse.up();
    await page.waitForTimeout(400);
    check(
      "c1 moved to in-review",
      (await page.locator('[data-testid="tasky-card-c1"]').getAttribute("data-column")) === "in-review",
    );
    check("backlog count 3", (await page.locator('[data-testid="tasky-count-backlog"]').innerText()) === "3");
    check("in-review count 3", (await page.locator('[data-testid="tasky-count-in-review"]').innerText()) === "3");

    console.log("\n[5] Touch drag (pointerType touch) In Progress → Done");
    const result = await touchDrag(page, "tasky-grip-c8", "done");
    check("touch drag executed", result === "ok", String(result));
    await page.waitForTimeout(400);
    check(
      "c8 moved to done via touch",
      (await page.locator('[data-testid="tasky-card-c8"]').getAttribute("data-column")) === "done",
    );

    console.log("\n[6] Add list appended right");
    await page.click('[data-testid="tasky-add-list"]');
    await page.fill('[data-testid="tasky-add-list-input"]', "Watchlist");
    await page.click('[data-testid="tasky-add-list-confirm"]');
    await page.waitForTimeout(400);
    const watchColumn = page.locator('[data-tasky-column="Watchlist"]');
    check("Watchlist column exists", await watchColumn.isVisible().catch(() => false));
    const watchX = await watchColumn.evaluate((el) => el.getBoundingClientRect().left);
    const doneX = await page.locator('[data-testid="tasky-column-done"]').evaluate((el) => el.getBoundingClientRect().left);
    check("Watchlist sits right of Done", watchX > doneX, `${Math.round(watchX)}>${Math.round(doneX)}`);

    console.log("\n[6b] Rename, reorder and delete list");
    await page.click('[data-testid="tasky-add-list"]');
    await page.fill('[data-testid="tasky-add-list-input"]', "Probe list");
    await page.click('[data-testid="tasky-add-list-confirm"]');
    const probeList = page.locator('[data-tasky-column="Probe list"]');
    const probeListTestId = await probeList.getAttribute("data-testid");
    const probeListId = probeListTestId?.replace("tasky-column-", "");
    await page.click(`[data-testid="tasky-list-rename-${probeListId}"]`);
    await page.fill(`[data-testid="tasky-rename-list-input-${probeListId}"]`, "Probe renamed list");
    await page.locator(`[data-testid="tasky-rename-list-form-${probeListId}"] button[type="submit"]`).click();
    check("list can be renamed", await page.locator('[data-tasky-column="Probe renamed list"]').isVisible().catch(() => false));
    const renamedList = page.locator(`[data-testid="tasky-column-${probeListId}"]`);
    const beforeMoveX = await renamedList.evaluate((el) => el.getBoundingClientRect().left);
    await page.click(`[data-testid="tasky-list-left-${probeListId}"]`);
    const afterMoveX = await renamedList.evaluate((el) => el.getBoundingClientRect().left);
    check("list can move left", afterMoveX < beforeMoveX);
    await page.click(`[data-testid="tasky-list-right-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-delete-${probeListId}"]`);
    check("empty list can be deleted", await page.locator('[data-tasky-column="Probe renamed list"]').count() === 0);

    console.log("\n[7] Persistence across reload");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    check("c1 still in in-review", (await page.locator('[data-testid="tasky-card-c1"]').getAttribute("data-column")) === "in-review");
    check("Watchlist persisted", await page.locator('[data-tasky-column="Watchlist"]').isVisible().catch(() => false));

    console.log("\n[8] Mobile 390px");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no page horizontal overflow", overflow === 0, `${overflow}px`);
    const mScroll = await page.locator('[data-testid="tasky-board"]').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    check("board scrolls on mobile", mScroll.sw > mScroll.cw, `${mScroll.sw}>${mScroll.cw}`);
    await page.screenshot({ path: "scripts/shots/tasky-mobile.png", fullPage: true });

    console.log("\n[9] Light theme");
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "scripts/shots/tasky-light.png", fullPage: false });
    await page.evaluate(() => window.localStorage.setItem("theme", "dark"));

    console.log("\n[10] Console integrity");
    check("zero pageerrors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
    await page.screenshot({ path: "scripts/shots/tasky-desktop.png", fullPage: false });
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
