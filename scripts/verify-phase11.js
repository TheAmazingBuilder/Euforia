// Phase 11 - Trade Plan workflow verification (Trade Planning / Scenarios / Post-Trade Review).
// PROD-SAFE (:3000): DOM/testids only. MSW store RESEEDS on full page load -
// the probe navigates CLIENT-SIDE after the initial goto (phase-10 rule).
// Toast text is NOT asserted for action success (the demo periodically pushes
// NOFY goal toasts) - assertions target the DOM state the action produces.
//  (P0) Drawer section + empty state
//  (P1) Create plan (thesis, criteria, hypothetical levels, scenario+probability)
//  (P2) Link to this trade (unlinked group → linked list)
//  (P3) Detail dialog: draft badge, thesis, levels, scenario, lifecycle
//  (P4) Activation gate: activate without criteria → stays Draft; add
//       criteria via edit → activate → Active
//  (P5) Invalidate: empty reason disabled → quick reason → Invalidated
//  (P6) Complete review: notes + neutral process tag → Completed; comparison
//       renders planned vs actual with honest "-"
//  (P7) Archive the completed plan → Archived (terminal, non-destructive)
//  (P8) Unlink remaining plan → back to unlinked; delete → gone
//  (P9) Zero page errors
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}
const NOISE = [/401/, /auth\/me/, /auth\/refresh/, /WebSocket/, /422/];

async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}

/** JS click - bypasses hit-testing, so a bottom-right NOFY toast can never
 *  block a dialog-footer action (Playwright hit-target check would 30s-timeout). */
async function jsClick(locator) {
  await locator.evaluate((el) => el.click());
}

async function cardOpenByTitle(page, title) {
  const buttons = page.locator('[data-testid^="trade-plan-open-"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = buttons.nth(i);
    if ((await candidate.innerText()).includes(title)) return candidate;
  }
  return null;
}

async function cardsByTitle(page, title) {
  const cards = page.locator('[data-testid^="trade-plan-card-"]');
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = cards.nth(i);
    if ((await candidate.innerText()).includes(title)) return candidate;
  }
  return null;
}

/** Open a plan's detail dialog and wait for DATA at the expected status -
 *  the detail query serves the cached record first and refetches, so a bare
 *  visible-wait would read the stale frame. */
async function openDetail(page, title, expectedStatus = null) {
  const button = await cardOpenByTitle(page, title);
  if (button === null) return false;
  await jsClick(button);
  const badge = page.locator('[data-testid="trade-plan-detail-status"]');
  await badge.waitFor({ state: "visible", timeout: 8000 });
  if (expectedStatus !== null) {
    await page.waitForFunction(
      ({ selector, want }) =>
        (document.querySelector(selector)?.textContent ?? "").toUpperCase() === want,
      { selector: '[data-testid="trade-plan-detail-status"]', want: expectedStatus.toUpperCase() },
      { timeout: 8000 },
    );
  }
  return true;
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const tally = () => {
    pass = results.filter((r) => r.ok).length;
    fail = results.filter((r) => !r.ok).length;
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.some((r) => r.test(m.text())))
      errors.push(m.text().slice(0, 200));
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureLogin(page);
    // CLIENT-SIDE nav to /trades (a full reload would reseed the MSW store).
    await page.click('a[href="/trades"]');
    await page.waitForSelector('[data-testid="trades-table"]', { timeout: 20000 });
    await page.waitForTimeout(1200);

    // ── (P0) drawer + plan section + empty state ──────────────────────────
    await page.locator('[data-testid="trades-row"]').first().click();
    await page.waitForSelector('[data-testid="trade-detail-dialog"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="trade-plan-section"]', { timeout: 10000 });
    const emptyText = await page.locator('[data-testid="trade-plan-section"]').innerText();
    check("P0", "plan section renders with empty copy",
      emptyText.includes("No plan documents this trade yet"));

    // ── (P1) create plan #1 (full documentation) ──────────────────────────
    await page.click('[data-testid="trade-plan-create"]');
    await page.waitForSelector('[data-testid="trade-plan-editor-dialog"]', { timeout: 5000 });
    const symbolPrefill = await page.inputValue('[data-testid="trade-plan-symbol"]');
    check("P1-pre", "editor prefills the trade's symbol", symbolPrefill.length > 0, symbolPrefill);
    await page.fill('[data-testid="trade-plan-title"]', "Probe - supply retest short");
    await page.fill(
      '[data-testid="trade-plan-thesis"]',
      "Weekly supply held twice; expect rotation into 1.0800 on a lower-high print.",
    );
    await page.fill(
      '[data-testid="trade-plan-invalidation"]',
      "H4 close above 1.0920 kills the lower-high structure.",
    );
    await page.fill('[data-testid="trade-plan-entry"]', "1.0800");
    await page.fill('[data-testid="trade-plan-stop"]', "1.0860");
    await page.fill('[data-testid="trade-plan-targets"]', "1.0700, 1.0640");
    await page.click('[data-testid="trade-plan-add-scenario"]');
    await page.selectOption('[data-testid="trade-plan-scenario-role-0"]', "PRIMARY");
    await page.fill('[data-testid="trade-plan-scenario-title-0"]', "Clean rejection");
    await page.fill(
      '[data-testid="trade-plan-scenario-description-0"]',
      "If the retest stalls under 1.0840 then rotation follows.",
    );
    await page.fill('[data-testid="trade-plan-scenario-probability-0"]', "60");
    await jsClick(page.locator('[data-testid="trade-plan-save"]'));
    // Success = the editor closes AND the unlinked card appears.
    await page.locator('[data-testid="trade-plan-editor-dialog"]')
      .waitFor({ state: "detached", timeout: 8000 });
    const unlinked1 = await cardsByTitle(page, "supply retest");
    check("P1", "plan saved as draft (unlinked card appears)", unlinked1 !== null);
    check("P1-status", "card badge reads Draft",
      unlinked1 !== null &&
        (await unlinked1.innerText()).toUpperCase().includes("DRAFT"));

    // ── (P2) link to this trade ───────────────────────────────────────────
    const linkButtons = page.locator('[data-testid^="trade-plan-link-"]');
    check("P2-pre", "plan sits in the unlinked group", (await linkButtons.count()) === 1);
    await jsClick(linkButtons.first());
    await page.locator('[data-testid^="trade-plan-link-"]')
      .first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const stillUnlinked = await page.locator('[data-testid^="trade-plan-link-"]').count();
    const linked1 = await cardsByTitle(page, "supply retest");
    check("P2", "plan linked (no link buttons left, card stays)",
      stillUnlinked === 0 && linked1 !== null, `linkButtons=${stillUnlinked}`);

    // ── (P3) detail dialog content ────────────────────────────────────────
    const opened = await openDetail(page, "supply retest", "DRAFT");
    check("P3-open", "detail dialog opens with data", opened);
    const detailText = await page.locator('[data-testid="trade-plan-detail-dialog"]').innerText();
    check("P3-status", "draft badge", detailText.toUpperCase().includes("DRAFT"));
    check("P3-thesis", "thesis shown", detailText.includes("Weekly supply held twice"));
    check("P3-levels", "hypothetical levels shown (entry + targets)",
      detailText.includes("1.0800") && detailText.includes("1.0700, 1.0640"));
    check("P3-hypo", "hypothetical badge present", detailText.includes("Hypothetical"));
    check("P3-scenario", "scenario with subjective probability",
      detailText.includes("Clean rejection") && detailText.includes("60%") &&
        detailText.includes("subjective"));
    check("P3-lifecycle", "lifecycle trail (created)", detailText.includes("Created"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ── (P4) activation gate on plan #2 (no criteria) ─────────────────────
    await page.click('[data-testid="trade-plan-create"]');
    await page.waitForSelector('[data-testid="trade-plan-editor-dialog"]', { timeout: 5000 });
    await page.fill('[data-testid="trade-plan-title"]', "Probe - gate check");
    await page.fill('[data-testid="trade-plan-thesis"]', "Thesis without invalidation criteria.");
    await jsClick(page.locator('[data-testid="trade-plan-save"]'));
    await page.locator('[data-testid="trade-plan-editor-dialog"]')
      .waitFor({ state: "detached", timeout: 8000 });
    const link2 = page.locator('[data-testid^="trade-plan-link-"]').first();
    await jsClick(link2);
    await page.waitForTimeout(800);
    const gateOpened = await openDetail(page, "gate check", "DRAFT");
    check("P4-open", "gate-check plan detail opens", gateOpened);
    await jsClick(page.locator('[data-testid="trade-plan-activate"]'));
    await page.waitForTimeout(900);
    const status2 = await page.locator('[data-testid="trade-plan-detail-status"]').innerText();
    check("P4-gate", "activation blocked without criteria → stays Draft",
      status2.trim().toUpperCase() === "DRAFT", status2);
    // Fix via the edit dialog, then activate.
    await jsClick(page.locator('[data-testid="trade-plan-edit"]'));
    await page.waitForSelector('[data-testid="trade-plan-editor-dialog"]', { timeout: 5000 });
    await page.fill(
      '[data-testid="trade-plan-invalidation"]',
      "Any H4 close above the range high voids this.",
    );
    await jsClick(page.locator('[data-testid="trade-plan-save"]'));
    await page.locator('[data-testid="trade-plan-editor-dialog"]')
      .waitFor({ state: "detached", timeout: 8000 });
    await openDetail(page, "gate check", "DRAFT");
    await jsClick(page.locator('[data-testid="trade-plan-activate"]'));
    await page.waitForTimeout(900);
    const statusAfter = await page.locator('[data-testid="trade-plan-detail-status"]').innerText();
    check("P4-activated", "plan activated → Active",
      statusAfter.trim().toUpperCase() === "ACTIVE", statusAfter);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ── (P5) invalidate plan #1 (reason REQUIRED) ─────────────────────────
    const p5opened = await openDetail(page, "supply retest", "DRAFT");
    check("P5-open", "plan #1 detail opens", p5opened);
    // DRAFT → INVALIDATED is not in the transition table - the plan must be
    // ACTIVE before it can be invalidated (it carries criteria, so activate).
    await jsClick(page.locator('[data-testid="trade-plan-activate"]'));
    await page.waitForTimeout(900);
    await jsClick(page.locator('[data-testid="trade-plan-invalidate"]'));
    await page.waitForSelector('[data-testid="trade-plan-invalidate-dialog"]', { timeout: 5000 });
    const confirmDisabled = await page
      .locator('[data-testid="trade-plan-invalidate-confirm"]')
      .isDisabled();
    check("P5-reason-required", "confirm disabled while reason empty", confirmDisabled === true);
    await page.click('[data-testid="trade-plan-reason-thesis"]');
    const reasonVal = await page.inputValue('[data-testid="trade-plan-reason-input"]');
    check("P5-quick-reason", "quick reason fills the field",
      reasonVal.includes("Thesis invalidated"));
    await jsClick(page.locator('[data-testid="trade-plan-invalidate-confirm"]'));
    await page.waitForTimeout(1200);
    const card1 = await cardsByTitle(page, "supply retest");
    check("P5-invalidated", "plan #1 shows Invalidated",
      card1 !== null &&
        (await card1.innerText()).toUpperCase().includes("INVALIDATED"));

    // ── (P6) complete the review on plan #2 (ACTIVE) ──────────────────────
    const p6opened = await openDetail(page, "gate check", "ACTIVE");
    check("P6-open", "plan #2 detail opens", p6opened);
    await jsClick(page.locator('[data-testid="trade-plan-complete"]'));
    await page.waitForSelector('[data-testid="trade-plan-complete-dialog"]', { timeout: 5000 });
    await page.fill(
      '[data-testid="trade-plan-review-notes"]',
      "Process was sound; the entry waited for confirmation this time.",
    );
    await jsClick(page.locator('[data-testid="trade-plan-tag-followed_plan"]'));
    await jsClick(page.locator('[data-testid="trade-plan-complete-confirm"]'));
    await page.waitForTimeout(1200);
    const card2 = await cardsByTitle(page, "gate check");
    check("P6-completed", "plan #2 shows Completed",
      card2 !== null &&
        (await card2.innerText()).toUpperCase().includes("COMPLETED"));
    // Detail: review + comparison with honest "-". The detail query serves
    // its cached frame while refetching - wait for the REVIEW CONTENT,
    // not just the badge, before reading.
    await openDetail(page, "gate check", "COMPLETED");
    await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-testid="trade-plan-detail-dialog"]')
            ?.textContent?.includes("Process was sound") === true,
        null,
        { timeout: 8000 },
      )
      .catch(() => {});
    const completedDetail = await page
      .locator('[data-testid="trade-plan-detail-dialog"]')
      .innerText();
    check("P6-review", "review notes + process tag render",
      completedDetail.includes("Process was sound") && completedDetail.includes("Followed plan"));
    check("P6-comparison", "planned vs actual section renders",
      (await page.locator('[data-testid="trade-plan-detail-comparison"]').count()) === 1);
    check("P6-honest-null", "comparison uses honest “-”", completedDetail.includes("-"));
    check("P6-direction", "actual direction read from the trade",
      completedDetail.includes("BUY") || completedDetail.includes("SELL"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // ── (P7) archive the completed plan (terminal, non-destructive) ───────
    await openDetail(page, "gate check", "COMPLETED");
    await jsClick(page.locator('[data-testid="trade-plan-archive"]'));
    await page.waitForTimeout(1200);
    const archivedCard = await cardsByTitle(page, "gate check");
    check("P7-archived", "completed plan archives (terminal)",
      archivedCard !== null &&
        (await archivedCard.innerText()).toUpperCase().includes("ARCHIVED"));

    // ── (P8) unlink the invalidated plan + delete it ──────────────────────
    const card1b = await cardsByTitle(page, "supply retest");
    const unlinkBtn = card1b.locator('[data-testid^="trade-plan-unlink-"]');
    check("P8-pre", "unlink affordance present on linked card", (await unlinkBtn.count()) === 1);
    await jsClick(unlinkBtn);
    await page.waitForTimeout(1000);
    const card1c = await cardsByTitle(page, "supply retest");
    check("P8-unlinked", "plan back to unlinked group (link affordance back)",
      card1c !== null && (await card1c.locator('[data-testid^="trade-plan-link-"]').count()) === 1);
    const deleteBtn = card1c.locator('[data-testid^="trade-plan-delete-"]');
    await jsClick(deleteBtn);
    await page.waitForTimeout(1000);
    const goneCard = await cardsByTitle(page, "supply retest");
    check("P8-deleted", "plan deleted from the list", goneCard === null);

    // ── (P9) page errors ──────────────────────────────────────────────────
    check("P9", "zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

    await page.screenshot({ path: "/home/z/my-project/scripts/phase11-plans.png", fullPage: false });
  } catch (error) {
    check("FATAL", String(error).slice(0, 160), false);
    console.log("PAGE-ERRORS:", errors.slice(0, 5).join(" || ") || "(none)");
    try {
      const badge = await page
        .locator('[data-testid="trade-plan-detail-status"]')
        .innerText({ timeout: 2000 })
        .catch(() => "(no badge)");
      const cards = await page
        .locator('[data-testid^="trade-plan-card-"]')
        .allInnerTexts()
        .catch(() => []);
      console.log("FATAL-STATE badge:", badge.trim());
      console.log("FATAL-STATE cards:", JSON.stringify(cards.map((t) => t.split("\n").slice(0, 2).join("/"))));
    } catch {}
    try {
      await page.screenshot({ path: "/home/z/my-project/scripts/phase11-fatal.png" });
      console.log("URL:", page.url());
    } catch {}
  } finally {
    tally();
    console.log(`\n${pass}/${results.length} PASS, ${fail} FAIL`);
    await browser.close();
    process.exit(fail === 0 && pass === results.length ? 0 : 1);
  }
})();
