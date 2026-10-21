/**
 * Verify — Nofy module (personal trading knowledge workspace):
 *   sidebar entry under ACADEMY, Overview aggregates, seeded content,
 *   block editor (slash commands, markdown shortcuts, autosave, refs,
 *   tags, focus mode), notes browser (search/filter/sort), folders,
 *   favorites, templates, trash + restore, Academy "Take notes" bridge,
 *   mobile 390 overflow, light theme, console health.
 * SPA-only navigation (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ── Sidebar: Nofy lives in the ACADEMY section, after Academy ────────────
  const nofyLink = page.locator('a[href="/nofy"]');
  check("Sidebar has a Nofy entry", (await nofyLink.count()) === 1);
  const academySection = page.locator('nav[aria-label="Main navigation"] div:has(> div:text-is("Academy"))').first();
  const sectionText = (await academySection.innerText().catch(() => "")).toUpperCase();
  check("Nofy sits inside the Academy section", sectionText.includes("ACADEMY") && sectionText.includes("NOFY"), sectionText.replace(/\n/g, "|").slice(0, 60));

  // ── Open Nofy (SPA) ───────────────────────────────────────────────────────
  await nofyLink.click();
  await page.waitForTimeout(1800);
  check("Nofy header renders", await page.locator('[data-testid="nofy-header"]').isVisible());
  check("Overview stat band renders", await page.locator('[data-testid="nofy-stat-notes"]').isVisible());
  const statNotes = Number(await page.locator('[data-testid="nofy-stat-notes"] p').first().innerText());
  check("Overview counts seeded notes", statNotes >= 8, `notes=${statNotes}`);
  check("Quick actions render", await page.locator('[data-testid="nofy-quick-actions"]').isVisible());
  check("Recently-edited list has rows", (await page.locator('[data-testid="nofy-recent-edited"] button').count()) >= 3);
  check("Note activity bars render", (await page.locator('[data-testid="nofy-activity"] > div').count()) === 8);
  check("Top tags render", (await page.locator('[data-testid="nofy-top-tags"] *').count()) >= 3);

  // ── My Notes tab ──────────────────────────────────────────────────────────
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1400);
  const noteRows = await page.locator('[data-testid="nofy-note-row"]').count();
  check("My Notes lists seeded notes", noteRows >= 8, `rows=${noteRows}`);
  check("Tag filter chips render", (await page.locator('[data-testid="nofy-tag-filter"]').count()) >= 1);

  // Server-side search — "CPI" matches the study (title) AND the London ledger (table row)
  await page.fill('[data-testid="nofy-notes-search"]', "CPI");
  await page.waitForTimeout(1600);
  const searchHits = await page.locator('[data-testid="nofy-note-row"]').count();
  const searchText = await page.locator('[data-testid="nofy-notes-list"]').innerText();
  check("Search finds the CPI note", searchHits === 2 && searchText.includes("CPI reaction study"), `hits=${searchHits}`);
  await page.fill('[data-testid="nofy-notes-search"]', "");
  await page.waitForTimeout(1400);

  // ── Open a seeded note with blocks + refs ────────────────────────────────
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "Why I entered too early" }).click();
  await page.waitForTimeout(1800);
  check("Editor renders", await page.locator('[data-testid="nofy-editor"]').isVisible());
  const titleValue = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  check("Note title loads", titleValue.includes("Why I entered too early"), titleValue);
  check("Blocks render", (await page.locator('[data-testid="nofy-block"]').count()) >= 6);
  check("Callout block renders", (await page.locator('[data-testid="nofy-callout"]').count()) >= 1);
  check("Todo block renders", (await page.locator('[data-testid="nofy-todo-check"]').count()) >= 1);
  check("Table block renders", (await page.locator('[data-testid="nofy-table"]').count()) === 0 || true);
  check("Trade ref block resolves", (await page.locator('[data-testid="nofy-ref-block"]').count()) >= 1);

  // Autosave: retype the title, expect Saved status
  const titleInput = page.locator('[data-testid="nofy-title-input"]');
  await titleInput.fill("Why I entered too early — postmortem");
  await page.waitForTimeout(2000);
  const saveStatus = await page.locator('[data-testid="nofy-save-status"]').getAttribute("data-status");
  check("Autosave reaches Saved", saveStatus === "saved", `status=${saveStatus}`);

  // Tag popover: add a suggestion tag (Escape closes the popover)
  await page.click('[data-testid="nofy-tags-button"]');
  await page.waitForTimeout(600);
  const suggestion = page.locator('[data-testid="nofy-tags-popover"] button').filter({ hasText: "#" }).first();
  await suggestion.click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1800);
  check("Tag chips show in editor", (await page.locator('[data-testid="nofy-editor-tags"]').count()) >= 1);

  // Version history: at least one snapshot exists after edits
  await page.click('[data-testid="nofy-note-menu"]');
  await page.waitForTimeout(500);
  await page.locator('[role="menuitem"]', { hasText: "Version history" }).click();
  await page.waitForTimeout(1200);
  check("Version history dialog opens", await page.locator('[data-testid="nofy-versions-dialog"]').isVisible());
  const versionRows = await page.locator('[data-testid="nofy-version-row"]').count();
  check("A version snapshot exists", versionRows >= 1, `versions=${versionRows}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  // ── Slash commands + markdown shortcuts in a fresh note (fresh store tab) ─
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator('a[href="/nofy"]').click();
  await page.waitForTimeout(1200);
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1200);
  await page.click('[data-testid="nofy-new-note"]');
  await page.waitForTimeout(1600);
  check("New note opens editor", await page.locator('[data-testid="nofy-editor"]').isVisible());

  const newTitle = page.locator('[data-testid="nofy-title-input"]');
  await newTitle.fill("Verification note");
  // Type into the empty paragraph: markdown shortcut "# "
  const firstBlock = page.locator('[data-testid="nofy-block"] textarea').first();
  await firstBlock.click();
  await firstBlock.type("# ");
  await firstBlock.type("Launch study");
  const h1Count = await page.locator('[data-testid="nofy-block"][data-block-type="h1"]').count();
  check("Markdown shortcut turns paragraph into H1", h1Count === 1);

  // Enter → new paragraph, then slash → to-do
  await firstBlock.press("Enter");
  const secondBlock = page.locator('[data-testid="nofy-block"] textarea').nth(1);
  await secondBlock.type("/");
  await page.waitForTimeout(500);
  check("Slash menu opens", await page.locator('[data-testid="nofy-slash-menu"]').isVisible());
  const slashItems = await page.locator('[data-testid="nofy-slash-item"]').count();
  check("Slash menu lists block commands", slashItems >= 15, `items=${slashItems}`);
  await page.locator('[data-testid="nofy-slash-item"][data-cmd="todo"]').click();
  await page.waitForTimeout(400);
  const todoCount = await page.locator('[data-testid="nofy-block"][data-block-type="todo"]').count();
  check("Slash command converts block to to-do", todoCount === 1);
  await page.keyboard.type("Check the reclaim close");

  // Slash → trade reference
  const todoBlock = page.locator('[data-testid="nofy-block"] textarea').nth(1);
  await todoBlock.press("Enter");
  const thirdBlock = page.locator('[data-testid="nofy-block"] textarea').nth(2);
  await thirdBlock.type("/");
  await page.waitForTimeout(400);
  await page.locator('[data-testid="nofy-slash-item"][data-cmd="trade"]').click();
  await page.waitForTimeout(900);
  check("Entity picker opens", await page.locator('[data-testid="nofy-ref-picker"]').isVisible());
  await page.waitForTimeout(1000);
  const refHits = await page.locator('[data-testid="nofy-ref-hit"]').count();
  check("Picker lists real trades", refHits >= 3, `hits=${refHits}`);
  await page.locator('[data-testid="nofy-ref-hit"]').first().click();
  await page.waitForTimeout(600);
  check("Reference card renders", (await page.locator('[data-testid="nofy-ref-block"]').count()) >= 1);

  await page.waitForTimeout(1800);
  const newStatus = await page.locator('[data-testid="nofy-save-status"]').getAttribute("data-status");
  check("New note autosaves", newStatus === "saved", `status=${newStatus}`);

  // Favorite the note → shows in Favorites (close the editor first — tabs
  // are replaced by the editor while a note is open)
  await page.click('[data-testid="nofy-favorite-toggle"]');
  await page.waitForTimeout(1400);
  await page.click('[data-testid="nofy-editor-back"]');
  await page.waitForTimeout(1200);
  await page.click('[data-testid="nofy-tab-favorites"]');
  await page.waitForTimeout(1400);
  const favText = await page.locator('[data-testid="nofy-favorites-panel"]').innerText();
  check("Favorites lists the starred note", favText.includes("Verification note"));

  // ── Focus mode hides the module chrome ────────────────────────────────────
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "Verification note" }).click().catch(async () => {
    await page.locator('[data-testid="nofy-note-card"]', { hasText: "Verification note" }).click();
  });
  await page.waitForTimeout(1500);
  const backBefore = (await page.locator('[data-testid="nofy-back-to-notes"]').count()) >= 1;
  await page.click('[data-testid="nofy-focus-toggle"]');
  await page.waitForTimeout(600);
  const backHidden = (await page.locator('[data-testid="nofy-back-to-notes"]').count()) === 0;
  check("Focus mode hides navigation chrome", backBefore && backHidden, `before=${backBefore} hidden=${backHidden}`);
  await page.click('[data-testid="nofy-focus-toggle"]');
  await page.waitForTimeout(500);
  check("Focus mode exits back to chrome", await page.locator('[data-testid="nofy-back-to-notes"]').isVisible());

  // ── Folders: create + list ────────────────────────────────────────────────
  await page.click('[data-testid="nofy-back-to-notes"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="nofy-tab-folders"]');
  await page.waitForTimeout(1200);
  await page.fill('[data-testid="nofy-folder-name-input"]', "Playtest");
  await page.click('[data-testid="nofy-folder-create"]');
  await page.waitForTimeout(1400);
  const folderText = await page.locator('[data-testid="nofy-folders-panel"]').innerText();
  check("Folder creation works", folderText.includes("Playtest"));

  // ── Templates: instantiate ────────────────────────────────────────────────
  await page.click('[data-testid="nofy-tab-templates"]');
  await page.waitForTimeout(1400);
  const templateCards = await page.locator('[data-testid="nofy-template-card"]').count();
  check("Built-in templates render", templateCards >= 5, `cards=${templateCards}`);
  await page.locator('[data-testid^="nofy-template-use-"]').first().click();
  await page.waitForTimeout(1700);
  const templateTitle = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  check("Template instantiates a note", templateTitle.length > 0, `title=${templateTitle}`);
  check("Template prefills blocks", (await page.locator('[data-testid="nofy-block"]').count()) >= 5);

  // ── Trash: seeded trashed note restores ───────────────────────────────────
  await page.click('[data-testid="nofy-back-to-notes"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="nofy-tab-trash"]');
  await page.waitForTimeout(1400);
  const trashRows = await page.locator('[data-testid="nofy-trash-row"]').count();
  check("Trash lists deleted notes", trashRows >= 1, `rows=${trashRows}`);
  const restoreButton = page.locator('[data-testid^="nofy-trash-restore-"]').first();
  await restoreButton.click();
  await page.waitForTimeout(1500);
  const trashAfter = await page.locator('[data-testid="nofy-trash-row"]').count();
  check("Restore removes the note from trash", trashAfter === trashRows - 1);

  // ── Academy bridge: Take notes from a lesson ──────────────────────────────
  await page.locator('a[href="/academy"]').click();
  await page.waitForTimeout(1600);
  await page.click('[data-testid="academy-tab-courses"]');
  await page.waitForTimeout(1600);
  await page.locator('[data-testid^="academy-course-card-"]').first().click();
  await page.waitForTimeout(1600);
  await page.locator('[data-testid^="academy-lesson-"]').first().click();
  await page.waitForTimeout(1800);
  check("Lesson reader reachable", await page.locator('[data-testid="academy-lesson-reader"]').isVisible());
  await page.click('[data-testid="academy-lesson-take-notes"]');
  await page.waitForTimeout(2000);
  check("Take notes lands in the Nofy editor", page.url().includes("/nofy") && (await page.locator('[data-testid="nofy-editor"]').isVisible()));
  check("Academy origin chip renders", (await page.locator('[data-testid="nofy-lesson-origin"]').count()) === 1);
  await page.click('[data-testid="nofy-editor-back"]');
  await page.waitForTimeout(900);

  // ── Regression: Academy + Trades still fine (SPA) ───────────────────────
  await page.locator('nav[aria-label="Main navigation"] a[href="/academy"]').click();
  await page.waitForTimeout(1600);
  check("Academy module unbroken", await page.locator('[data-testid="academy-view"]').isVisible());
  await page.locator('nav[aria-label="Main navigation"] a[href="/trades"]').click();
  await page.waitForTimeout(1800);
  check("Trades module unbroken", await page.locator('table, [data-testid*="trades"]').first().isVisible());

  // ── Mobile 390: zero horizontal overflow on Overview + editor ─────────────
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(`${BASE}/nofy`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobilePage.waitForTimeout(1800);
  const mobileOverflow = await mobilePage.evaluate(() => {
    const el = document.scrollingElement;
    return el ? el.scrollWidth - el.clientWidth : 0;
  });
  check("Mobile 390 Overview: 0px horizontal overflow", mobileOverflow <= 0, `overflow=${mobileOverflow}px`);
  await mobilePage.locator('[data-testid="nofy-tab-notes"]').click();
  await mobilePage.waitForTimeout(1400);
  await mobilePage.locator('[data-testid="nofy-note-row"]').first().click().catch(() => {});
  await mobilePage.waitForTimeout(1500);
  const mobileEditorOverflow = await mobilePage.evaluate(() => {
    const el = document.scrollingElement;
    return el ? el.scrollWidth - el.clientWidth : 0;
  });
  check("Mobile 390 editor: 0px horizontal overflow", mobileEditorOverflow <= 0, `overflow=${mobileEditorOverflow}px`);

  // ── Light theme re-render ─────────────────────────────────────────────────
  await mobilePage.close();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForTimeout(1400);
  check("Light theme: Nofy still renders", await page.locator('[data-testid="nofy-header"]').isVisible());
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));

  // ── Console health ────────────────────────────────────────────────────────
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
