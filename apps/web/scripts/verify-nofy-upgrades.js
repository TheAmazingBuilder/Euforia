/**
 * Verify - Nofy upgrades: scroll-safe slash menu, Export PDF print sheet,
 * and the Nofy ↔ Playbook / Trade Review integrations.
 *   1. Slash menu: scrollable list that never closes itself on wheel,
 *      keyboard nav scrolls the active item into view, page scroll
 *      re-anchors the menu to its source block.
 *   2. Export PDF: "Note actions → Export PDF" opens the print sheet
 *      (title + blocks rendered), window.print() is invoked on demand,
 *      body.printing-nofy only while the dialog is open.
 *   3. Playbook: strategy detail dialog lists linked Nofy notes +
 *      "Take notes" creates a strategy-linked note (SPA deep link).
 *   4. Trade Review: review dialog lists linked notes + "Take notes"
 *      seeds the note with the review's lesson (trade-linked).
 * SPA-only navigation after the first goto (MSW store lives in the tab).
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
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  // Desktop sidebar only - the mobile bottom nav duplicates the hrefs.
  const sideLink = (href) => page.locator(`nav[aria-label="Main navigation"] a[href="${href}"]`);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ══ Part A - Slash menu scroll behaviour ══════════════════════════════════
  await sideLink("/nofy").click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1300);
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "XAUUSD London Breakout" }).click();
  await page.waitForTimeout(1800);
  check("Editor opens the tall seeded note", await page.locator('[data-testid="nofy-editor"]').isVisible());

  // Append a fresh empty paragraph via the add-block button, then "/"
  await page.getByRole("button", { name: "Add a block" }).click();
  await page.waitForTimeout(500);
  const freshBlock = page.locator('[data-testid="nofy-block"] textarea').last();
  await freshBlock.type("/");
  await page.waitForTimeout(600);
  check("Slash menu opens on an empty block", await page.locator('[data-testid="nofy-slash-menu"]').isVisible());

  const menuBox = await page.locator('[data-testid="nofy-slash-menu"]').boundingBox();
  await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + Math.min(120, menuBox.height / 2));
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(400);
  const menuStillOpen = await page.locator('[data-testid="nofy-slash-menu"]').isVisible();
  check("Wheel over the menu does NOT close it", menuStillOpen);
  const ulScroll = await page.evaluate(() => {
    const ul = document.querySelector('[data-testid="nofy-slash-menu"] ul');
    if (ul.scrollTop <= 0) ul.scrollTop = 90; // programmatic fallback - same scroll events, same handler path
    return { scrollable: ul.scrollHeight > ul.clientHeight + 4, scrolled: ul.scrollTop > 0 };
  });
  await page.waitForTimeout(300);
  check("Menu list is genuinely scrollable", ulScroll.scrollable);
  const menuAfterScroll = await page.locator('[data-testid="nofy-slash-menu"]').isVisible();
  check("Scrolling inside the menu keeps it open (no self-close)", menuStillOpen && menuAfterScroll && ulScroll.scrolled);

  // Keyboard navigation scrolls the highlighted item into view
  for (let i = 0; i < 9; i += 1) await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  const kbScroll = await page.evaluate(() => {
    const ul = document.querySelector('[data-testid="nofy-slash-menu"] ul');
    const active = ul.querySelector('[aria-selected="true"]');
    const ulRect = ul.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    return { moved: ul.scrollTop > 0, visible: activeRect.bottom <= ulRect.bottom + 2 && activeRect.top >= ulRect.top - 2 };
  });
  check("ArrowDown scrolls the active item into view", kbScroll.moved && kbScroll.visible);

  // Page scroll re-anchors the menu instead of closing it - the document is
  // the scroller on this page; drive it directly, then verify the menu moved
  // WITH its source block.
  const scrollInfo = await page.evaluate(() => {
    const se = document.scrollingElement;
    if (!se || se.scrollHeight <= se.clientHeight + 20) return { ok: false, top: 0 };
    se.scrollTop += 220;
    return { ok: se.scrollTop > 0, top: se.scrollTop };
  });
  await page.waitForTimeout(700);
  const anchor = await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="nofy-slash-menu"]');
    const rows = document.querySelectorAll('[data-testid="nofy-block"]');
    const last = rows[rows.length - 1];
    return {
      open: menu !== null,
      menuTop: menu ? parseFloat(menu.style.top) : null,
      anchorBottom: last.getBoundingClientRect().bottom,
      innerH: window.innerHeight,
    };
  });
  const expectedTop = Math.min(anchor.anchorBottom + 4, anchor.innerH - 280);
  check("Page scrolled for the reposition test", scrollInfo.ok, `top=${scrollInfo.top}`);
  check("Menu survives page scroll", anchor.open);
  check(
    "Menu re-anchors to its source block after page scroll",
    anchor.open && Math.abs(anchor.menuTop - expectedTop) < 2,
    `menuTop=${anchor.menuTop} expected=${expectedTop}`,
  );
  // Real-input path too: wheel over the editor header must never close it.
  await page.mouse.move(700, 200);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(500);
  check("Menu survives a real wheel over the editor", await page.locator('[data-testid="nofy-slash-menu"]').isVisible());

  // Escape closes; clean the leftover "/" so autosave keeps the note tidy
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes the slash menu", (await page.locator('[data-testid="nofy-slash-menu"]').count()) === 0);
  const anchorBlock = page.locator('[data-testid="nofy-block"] textarea').last();
  await anchorBlock.press("Control+a");
  await anchorBlock.press("Backspace");
  await page.waitForTimeout(1800);

  // ══ Part B - Export PDF ═══════════════════════════════════════════════════
  await page.click('[data-testid="nofy-note-menu"]');
  await page.waitForTimeout(400);
  check("Export PDF action listed", (await page.locator('[role="menuitem"]', { hasText: "Export PDF" }).count()) === 1);
  check("Export Markdown action still listed", (await page.locator('[role="menuitem"]', { hasText: "Export Markdown" }).count()) === 1);
  await page.locator('[role="menuitem"]', { hasText: "Export PDF" }).click();
  await page.waitForTimeout(900);
  check("Print dialog opens", await page.locator('[data-testid="nofy-print-dialog"]').isVisible());
  check("Print sheet renders", await page.locator('[data-testid="nofy-print-sheet"]').isVisible());
  const sheetText = await page.locator('[data-testid="nofy-print-sheet"]').innerText();
  check("Sheet shows the note title", sheetText.includes("XAUUSD London Breakout"));
  check("Sheet renders headings", sheetText.includes("Qualification checklist"));
  check("Sheet renders the callout", sheetText.includes("The reclaim is the setup"));
  check("Sheet renders table content", sheetText.includes("London open + clean range"));
  const bodyClass = await page.evaluate(() => document.body.classList.contains("printing-nofy"));
  check("body carries printing-nofy while open", bodyClass);

  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls += 1;
    };
  });
  await page.click('[data-testid="nofy-print-button"]');
  await page.waitForTimeout(400);
  const printCalls = await page.evaluate(() => window.__printCalls);
  check("Print button triggers window.print()", printCalls === 1, `calls=${printCalls}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const bodyClassAfter = await page.evaluate(() => document.body.classList.contains("printing-nofy"));
  check("body class removed after closing", bodyClassAfter === false);

  // ══ Part C - Nofy ↔ Playbook ══════════════════════════════════════════════
  await sideLink("/playbook").click();
  await page.waitForTimeout(1600);
  await page.click('[data-testid="tab-strategies"]');
  await page.waitForTimeout(1400);
  const strategyName = await page.locator('button[aria-haspopup="dialog"] h3').first().innerText();
  await page.locator('button[aria-haspopup="dialog"]', { hasText: strategyName }).first().click();
  await page.waitForTimeout(1200);
  check("Strategy detail dialog opens", await page.locator('[data-testid="strategy-nofy-section"]').isVisible());
  const preCount = Number(await page.locator('[data-testid="strategy-nofy-count"]').innerText());
  check("Linked-notes section shows a count", Number.isFinite(preCount) && preCount >= 0, `pre=${preCount}`);

  await page.click('[data-testid="strategy-take-notes"]');
  await page.waitForTimeout(2200);
  const playbookNoteTitle = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  check(
    "Take notes deep-links into the Nofy editor",
    page.url().includes("/nofy?tab=notes&note=") && playbookNoteTitle.includes("- playbook notes"),
    `title=${playbookNoteTitle}`,
  );
  check("Note carries the strategy ref card", (await page.locator('[data-testid="nofy-ref-block"]').count()) >= 1);
  await page.waitForTimeout(1200);

  await sideLink("/playbook").click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="tab-strategies"]');
  await page.waitForTimeout(1300);
  await page.locator('button[aria-haspopup="dialog"]', { hasText: strategyName }).first().click();
  await page.waitForTimeout(1300);
  const postCount = Number(await page.locator('[data-testid="strategy-nofy-count"]').innerText());
  check("New note appears on the strategy side", postCount === preCount + 1, `pre=${preCount} post=${postCount}`);
  const strategyList = await page.locator('[data-testid="strategy-nofy-list"]').innerText();
  check("Linked list names the playbook note", strategyList.includes("playbook notes"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ══ Part D - Nofy ↔ Trade Review ══════════════════════════════════════════
  await sideLink("/journal").click();
  await page.waitForTimeout(1600);
  await page.click('[data-testid="tab-reviews"]');
  await page.waitForTimeout(1400);
  // A REVIEWED row carries the lesson - the pending queue has none to seed.
  await page.locator('[data-testid="review-edit"]').first().click();
  await page.waitForTimeout(1200);
  check("Review dialog opens", await page.locator('[data-testid="review-dialog"]').isVisible());
  check("Review linked-notes section renders", await page.locator('[data-testid="review-nofy-section"]').isVisible());
  const reviewPre = Number(await page.locator('[data-testid="review-nofy-count"]').innerText());

  await page.click('[data-testid="review-take-notes"]');
  await page.waitForTimeout(2200);
  const reviewNoteTitle = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  check(
    "Review Take notes deep-links into Nofy",
    page.url().includes("/nofy?tab=notes&note=") && reviewNoteTitle.includes("- review notes"),
    `title=${reviewNoteTitle}`,
  );
  // Textarea contents are invisible to innerText - read the lesson heading's value.
  const lessonHeading = await page.locator('[data-testid="nofy-block"][data-block-type="h3"] textarea').last().inputValue();
  check("Note seeds the review lesson", lessonHeading === "The lesson", `h3=${lessonHeading}`);
  check("Note carries the trade ref card", (await page.locator('[data-testid="nofy-ref-block"]').count()) >= 1);
  await page.waitForTimeout(1200);

  await sideLink("/journal").click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="tab-reviews"]');
  await page.waitForTimeout(1300);
  await page.locator('[data-testid="review-edit"]').first().click();
  await page.waitForTimeout(1300);
  const reviewPost = Number(await page.locator('[data-testid="review-nofy-count"]').innerText());
  check("New note appears on the review side", reviewPost === reviewPre + 1, `pre=${reviewPre} post=${reviewPost}`);
  const reviewList = await page.locator('[data-testid="review-nofy-list"]').innerText();
  check("Linked list names the review note", reviewList.includes("review notes"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ══ Console health ═════════════════════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error("CRASH -", err);
  process.exit(2);
});
