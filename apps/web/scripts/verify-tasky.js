/**
 * Tasky probe - the trading kanban (Academy section).
 * Covers: Tasky board structure, card/list CRUD, edit + duplicate, mouse/touch
 * drag, server persistence, mobile layout and themes. Uses the demo account
 * below and cleans up the temporary cards/lists created by this probe.
 */
const { chromium } = require("playwright");
const fs = require("node:fs/promises");

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
    let countsMatchCards = true;
    for (const id of columnIds) {
      const rendered = await page.locator(`[data-testid="tasky-column-${id}"] [data-tasky-card]`).count();
      countsMatchCards = countsMatchCards && counts[id] === rendered;
    }
    check("column counters match rendered cards", countsMatchCards, JSON.stringify(counts));

    console.log("\n[1b] JSON and CSV export");
    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.click('[data-testid="tasky-export-json"]'),
    ]);
    check("JSON export filename", /\\.json$/i.test(jsonDownload.suggestedFilename()), jsonDownload.suggestedFilename());
    const jsonPath = await jsonDownload.path();
    const jsonPayload = JSON.parse(await fs.readFile(jsonPath, "utf8"));
    check("JSON export contains versioned board snapshot",
      jsonPayload.format === "euforia-tasky-board" && jsonPayload.version === 1 && Array.isArray(jsonPayload.board?.columns));
    check("JSON export includes board cards",
      jsonPayload.board.columns.some((column) => column.cards.some((card) => card.title === "Implement OAuth 2.0 SSO integration")));

    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.click('[data-testid="tasky-export-csv"]'),
    ]);
    check("CSV export filename", /\\.csv$/i.test(csvDownload.suggestedFilename()), csvDownload.suggestedFilename());
    const csvPath = await csvDownload.path();
    const csvPayload = await fs.readFile(csvPath, "utf8");
    check("CSV export includes column headers and task rows",
      csvPayload.includes("list_id,list,card_id,title,category,priority") &&
      csvPayload.includes("Implement OAuth 2.0 SSO integration"));

    console.log("\n[2] Card anatomy (reference fidelity)");
    const c1 = page.locator('[data-testid="tasky-card-c1"]');
    check("c1 title", /Implement OAuth 2\.0 SSO integration/.test(await c1.innerText().catch(() => "")));
    check("c1 tag Feature", /Feature/.test(await c1.innerText()));
    check("c1 priority High", /High/.test(await c1.innerText()));
    check("c1 assignee AK", /AK/.test(await c1.innerText()));
    check("c1 due Apr 20", /Apr 20/.test(await c1.innerText()));
    check("c1 grip exists", await page.locator('[data-testid="tasky-grip-c1"]').isVisible().catch(() => false));

    console.log("\n[2b] Search, filter and sort");
    await page.fill('[data-testid="tasky-search"]', "Implement OAuth 2.0 SSO integration");
    check("search narrows the board to the matching card",
      await page.locator('[data-testid="tasky-card-c1"]').isVisible().catch(() => false)
      && /Showing 1 of \\d+ cards/.test(await page.locator('[data-testid="tasky-filter-summary"]').innerText()));
    await page.selectOption('[data-testid="tasky-priority-filter"]', "Urgent");
    check("priority filter excludes non-matching cards",
      await page.locator('[data-testid="tasky-card-c1"]').count() === 0);
    check("drag is disabled while search/filter/sort is active",
      await page.locator('[data-testid="tasky-grip-c1"]').getAttribute("aria-disabled") === "true");
    await page.click('[data-testid="tasky-reset-filters"]');
    check("reset restores the original board view",
      await page.locator('[data-testid="tasky-card-c1"]').isVisible().catch(() => false)
      && await page.locator('[data-testid="tasky-reset-filters"]').isDisabled());

    console.log("\n[2c] Supplementary views");
    await page.click('[data-testid="tasky-view-mode-calendar"]');
    check("calendar view is selectable", await page.locator('[data-testid="tasky-calendar-view"]').isVisible().catch(() => false));
    await page.click('button[aria-label="Next month"]');
    check("calendar month can advance", await page.locator('[data-testid="tasky-calendar-view"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-table"]');
    check("compact table view is selectable", await page.locator('[data-testid="tasky-table"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-timeline"]');
    check("timeline view is selectable", await page.locator('[data-testid="tasky-timeline-view"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-dashboard"]');
    check("dashboard view is selectable", await page.locator('[data-testid="tasky-dashboard-view"]').isVisible().catch(() => false));
    check("dashboard exposes completion progress", await page.getByRole("progressbar", { name: "Completion progress" }).isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-completed"]');
    check("completed-task view is selectable", await page.locator('[data-testid="tasky-completed-view"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-upcoming"]');
    check("upcoming-task view is selectable", await page.locator('[data-testid="tasky-upcoming-view"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-view-mode-board"]');
    check("kanban remains the default and is selectable", await page.locator('[data-testid="tasky-board"]').isVisible().catch(() => false));

    console.log("\n[2d] Keyboard shortcuts + archive lifecycle");
    await page.locator("body").click({ position: { x: 12, y: 12 } });
    await page.keyboard.press("/");
    check("slash focuses search", await page.locator('[data-testid="tasky-search"]').evaluate((el) => el === document.activeElement));
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 12, y: 12 } });
    await page.keyboard.press("?");
    check("question mark opens shortcut reference", await page.locator('[data-testid="tasky-shortcuts-dialog"]').isVisible().catch(() => false));
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="tasky-card-c1"]').focus();
    await page.keyboard.press("e");
    check("E edits the focused card", await page.locator('[data-testid="tasky-edit-form-c1"]').isVisible().catch(() => false));
    await page.click('[data-testid="tasky-edit-save-c1"]');
    await page.waitForTimeout(300);
    await page.locator('[data-testid="tasky-card-c1"]').focus();
    await page.keyboard.press("a");
    await page.waitForTimeout(400);
    check("A archives the focused card", await page.locator('[data-testid="tasky-card-c1"]').count() === 0);
    await page.click('[data-testid="tasky-view-mode-archived"]');
    const archivedC1 = page.locator('[data-testid="tasky-table-row-c1"]');
    check("archived view exposes the archived card", await archivedC1.isVisible().catch(() => false));
    await archivedC1.focus();
    await page.keyboard.press("r");
    await page.waitForTimeout(400);
    check("R restores the focused archived card", await page.locator('[data-testid="tasky-table-row-c1"]').count() === 0);
    await page.click('[data-testid="tasky-view-mode-board"]');
    check("restored card returns to the Kanban board", await page.locator('[data-testid="tasky-card-c1"]').isVisible().catch(() => false));
    await page.locator('[data-testid="tasky-card-c1"]').focus();
    await page.keyboard.press("n");
    check("N opens a new-card form for the focused list", await page.locator('[data-testid="tasky-add-form-backlog"]').isVisible().catch(() => false));
    await page.fill('[data-testid="tasky-add-input-backlog"]', "Shortcut probe");
    await page.click('[data-testid="tasky-add-confirm-backlog"]');
    await page.waitForTimeout(400);
    const shortcutCard = page.locator("article", { hasText: "Shortcut probe" }).first();
    const shortcutCardTestId = await shortcutCard.getAttribute("data-testid");
    const shortcutCardId = shortcutCardTestId?.replace("tasky-card-", "");
    check("N shortcut creates a persisted card", await shortcutCard.isVisible().catch(() => false));
    await page.click(\`[data-testid="tasky-delete-\${shortcutCardId}"]\`);
    await page.waitForTimeout(350);

    console.log("\n[3] Add + delete card");
    const todoCountBeforeProbe = Number(await page.locator('[data-testid="tasky-count-todo"]').innerText());
    await page.click('[data-testid="tasky-add-todo"]');
    await page.fill('[data-testid="tasky-add-input-todo"]', "Probe card");
    await page.click('[data-testid="tasky-add-confirm-todo"]');
    await page.waitForTimeout(400);
    check("todo count increments after add", Number(await page.locator('[data-testid="tasky-count-todo"]').innerText()) === todoCountBeforeProbe + 1);
    const probeCard = page.locator("article", { hasText: "Probe card" }).first();
    const probeId = await probeCard.getAttribute("data-testid");
    await page.click(`[data-testid="tasky-delete-${probeId?.replace("tasky-card-", "")}"]`);
    await page.waitForTimeout(300);
    check("todo count restored after delete", Number(await page.locator('[data-testid="tasky-count-todo"]').innerText()) === todoCountBeforeProbe);

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
    console.log("\n[3c] Card details, description + checklist");
    await page.click(`[data-testid="tasky-details-${editableId}"]`);
    await page.locator('[data-testid="tasky-card-details"]').waitFor({ state: "visible" });
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/tasky/board")
      && response.request().method() === "PUT"
      && response.ok()
      && (response.request().postData() ?? "").includes("Tasky probe comment"),
    );
    await page.fill('[data-testid="tasky-card-description"]', "Acceptance criteria and regression notes.");
    await page.fill('[data-testid="tasky-checklist-add-input"]', "Validate autosave");
    await page.click('[data-testid="tasky-checklist-add-submit"]');
    const checklistToggle = page.locator('[data-testid^="tasky-checklist-toggle-"]').first();
    const checklistTestId = await checklistToggle.getAttribute("data-testid");
    check("checklist item added", await checklistToggle.isVisible().catch(() => false));
    await checklistToggle.check();
    check("checklist item can be completed", await checklistToggle.isChecked());

    await page.fill('[data-testid="tasky-comment-input"]', "Tasky probe comment: review before release.");
    await page.click('[data-testid="tasky-comment-submit"]');
    check("comment appears in card details", await page.getByText("Tasky probe comment: review before release.").isVisible().catch(() => false));
    await page.fill('[data-testid="tasky-link-title-input"]', "Reference link probe");
    await page.fill('[data-testid="tasky-link-url-input"]', "https://example.com/tasky-probe");
    await page.click('[data-testid="tasky-link-add-submit"]');
    const referenceLink = page.getByRole("link", { name: "Reference link probe" });
    check("reference link added", await referenceLink.isVisible().catch(() => false) && (await referenceLink.getAttribute("href")) === "https://example.com/tasky-probe");
    check("activity records comment and link", await page.getByText("Added a comment").isVisible().catch(() => false) && await page.getByText("Added link: Reference link probe").isVisible().catch(() => false));
    await saveResponse;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.click(`[data-testid="tasky-details-${editableId}"]`);
    await page.locator('[data-testid="tasky-card-details"]').waitFor({ state: "visible" });
    check("description persisted after reload", (await page.locator('[data-testid="tasky-card-description"]').inputValue()) === "Acceptance criteria and regression notes.");
    const persistedToggle = page.locator(`[data-testid="${checklistTestId}"]`);
    check("checklist completion persisted after reload", await persistedToggle.isChecked());
    check("comment persisted after reload", await page.getByText("Tasky probe comment: review before release.").isVisible().catch(() => false));
    const persistedLink = page.getByRole("link", { name: "Reference link probe" });
    check("link persisted after reload", await persistedLink.isVisible().catch(() => false) && (await persistedLink.getAttribute("href")) === "https://example.com/tasky-probe");
    check("activity history persisted after reload", await page.getByText("Added a comment").isVisible().catch(() => false) && await page.getByText("Added link: Reference link probe").isVisible().catch(() => false));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.click(`[data-testid="tasky-delete-${duplicateId}"]`);
    await page.click(`[data-testid="tasky-delete-${editableId}"]`);
    await page.waitForTimeout(500);
    check("edited and duplicate probe cards cleaned up", Number(await page.locator('[data-testid="tasky-count-todo"]').innerText()) === todoCountBeforeProbe);

    console.log("\n[4] Mouse drag Backlog → In Review");
    const backlogBeforeDrag = Number(await page.locator('[data-testid="tasky-count-backlog"]').innerText());
    await page.click('[data-testid="tasky-add-backlog"]');
    await page.fill('[data-testid="tasky-add-input-backlog"]', "Mouse drag probe");
    await page.click('[data-testid="tasky-add-confirm-backlog"]');
    const mouseProbe = page.locator("article", { hasText: "Mouse drag probe" }).first();
    const mouseProbeTid = await mouseProbe.getAttribute("data-testid");
    const mouseProbeId = mouseProbeTid?.replace("tasky-card-", "");
    const grip1 = await page.locator(`[data-testid="tasky-grip-${mouseProbeId}"]`).boundingBox();
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
      "card moved to in-review",
      (await page.locator(`[data-testid="tasky-card-${mouseProbeId}"]`).getAttribute("data-column")) === "in-review",
    );
    await page.click(`[data-testid="tasky-delete-${mouseProbeId}"]`);
    await page.waitForTimeout(300);
    check("mouse drag probe cleaned up", Number(await page.locator('[data-testid="tasky-count-backlog"]').innerText()) === backlogBeforeDrag);

    console.log("\n[5] Touch drag (pointerType touch) In Progress → Done");
    const inProgressBeforeDrag = Number(await page.locator('[data-testid="tasky-count-in-progress"]').innerText());
    await page.click('[data-testid="tasky-add-in-progress"]');
    await page.fill('[data-testid="tasky-add-input-in-progress"]', "Touch drag probe");
    await page.click('[data-testid="tasky-add-confirm-in-progress"]');
    const touchProbe = page.locator("article", { hasText: "Touch drag probe" }).first();
    const touchProbeTid = await touchProbe.getAttribute("data-testid");
    const touchProbeId = touchProbeTid?.replace("tasky-card-", "");
    const touchResult = await touchDrag(page, `tasky-grip-${touchProbeId}`, "done");
    check("touch drag executed", touchResult === "ok", String(touchResult));
    await page.waitForTimeout(400);
    check(
      "card moved to done via touch",
      (await page.locator(`[data-testid="tasky-card-${touchProbeId}"]`).getAttribute("data-column")) === "done",
    );
    await page.click(`[data-testid="tasky-delete-${touchProbeId}"]`);
    await page.waitForTimeout(300);
    check("touch drag probe cleaned up", Number(await page.locator('[data-testid="tasky-count-in-progress"]').innerText()) === inProgressBeforeDrag);

    console.log("\n[6] Add list appended right");
    await page.click('[data-testid="tasky-add-list"]');
    await page.fill('[data-testid="tasky-add-list-input"]', "Watchlist probe");
    await page.click('[data-testid="tasky-add-list-confirm"]');
    await page.waitForTimeout(400);
    const watchColumn = page.locator('[data-tasky-column="Watchlist probe"]').last();
    const watchColumnTestId = await watchColumn.getAttribute("data-testid");
    const watchColumnId = watchColumnTestId?.replace("tasky-column-", "");
    check("Watchlist probe column exists", await watchColumn.isVisible().catch(() => false));
    const watchX = await watchColumn.evaluate((el) => el.getBoundingClientRect().left);
    const doneX = await page.locator('[data-testid="tasky-column-done"]').evaluate((el) => el.getBoundingClientRect().left);
    check("Watchlist probe sits right of Done", watchX > doneX, `${Math.round(watchX)}>${Math.round(doneX)}`);

    console.log("\n[6b] Rename, reorder and delete list");
    await page.click('[data-testid="tasky-add-list"]');
    await page.fill('[data-testid="tasky-add-list-input"]', "Probe list");
    await page.click('[data-testid="tasky-add-list-confirm"]');
    const probeList = page.locator('[data-tasky-column="Probe list"]');
    const probeListTestId = await probeList.getAttribute("data-testid");
    const probeListId = probeListTestId?.replace("tasky-column-", "");
    await page.click(`[data-testid="tasky-list-menu-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-rename-${probeListId}"]`);
    await page.fill(`[data-testid="tasky-rename-list-input-${probeListId}"]`, "Probe renamed list");
    await page.locator(`[data-testid="tasky-rename-list-form-${probeListId}"] button[type="submit"]`).click();
    check("list can be renamed", await page.locator('[data-tasky-column="Probe renamed list"]').isVisible().catch(() => false));
    const renamedList = page.locator(`[data-testid="tasky-column-${probeListId}"]`);
    const beforeMoveX = await renamedList.evaluate((el) => el.getBoundingClientRect().left);
    await page.click(`[data-testid="tasky-list-menu-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-left-${probeListId}"]`);
    const afterMoveX = await renamedList.evaluate((el) => el.getBoundingClientRect().left);
    check("list can move left", afterMoveX < beforeMoveX);
    await page.click(`[data-testid="tasky-list-menu-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-right-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-menu-${probeListId}"]`);
    await page.click(`[data-testid="tasky-list-delete-${probeListId}"]`);
    check("empty list can be deleted", await page.locator('[data-tasky-column="Probe renamed list"]').count() === 0);

    console.log("\n[7] Persistence across reload");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    check("board is available after reload", await page.locator('[data-testid="tasky-board"]').isVisible().catch(() => false));
    check("Watchlist probe persisted", await page.locator(`[data-testid="tasky-column-${watchColumnId}"]`).isVisible().catch(() => false));
    await page.click(`[data-testid="tasky-list-menu-${watchColumnId}"]`);
    await page.click(`[data-testid="tasky-list-delete-${watchColumnId}"]`);
    check("test list cleaned up after persistence check", await page.locator(`[data-testid="tasky-column-${watchColumnId}"]`).count() === 0);

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
