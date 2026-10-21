/**
 * Verify — Plan-vs-Actual in Trade Review (planner ↔ trade-review integration).
 *
 * IMPORTANT: navigation uses sidebar clicks ONLY (SPA). Exactly ONE reload
 * is performed (persistence sanity of the executed-trade link).
 *
 * Covers:
 *   A. Sidebar: Trade Planner + Trade Review present (SPA nav).
 *   B. Seeded EXECUTED plan link: EURUSD review row carries the Planned badge;
 *      review dialog shows the Plan vs Actual comparison (6 fields, states,
 *      server summary) with the planned XAUUSD-style values formatted.
 *   C. "View plan" deep link: /planner?plan=<id> opens the EXECUTED record.
 *   D. Live link flow: open plan-seed-ready (XAUUSD, READY) → Mark executed →
 *      dialog exposes the executed-trade select → link a closed trade →
 *      confirm → EXECUTED.
 *   E. The linked trade's review row now carries the badge; its dialog shows
 *      the comparison with planned entry 2 390,00 (fr-FR tolerant regex).
 *   F. Unlinked trades show NO comparison (clean absence, not an empty block).
 *   G. The ONE reload: badge + comparison persist after refresh.
 *   H. Mobile 390px: dialog renders without horizontal overflow.
 *   I. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/plan-vs-actual";

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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
    try {
      await page.screenshot({ path: `${SHOTS}/${name}.png` });
    } catch {
      /* late screenshots must never fail the run */
    }
  };
  const sidebarClick = async (href) => {
    const link = page
      .locator(`nav[aria-label="Main navigation"] a[href="${href}"]`)
      .locator("visible=true")
      .first();
    if (!(await link.isVisible().catch(() => false))) {
      await page.locator('[aria-label="Open navigation menu"]').click();
      await link.waitFor({ state: "visible", timeout: 10_000 });
    }
    await link.click();
    await page.waitForURL(new RegExp(href.replace(/\//g, "\\/")), { timeout: 30_000 });
    await page.waitForTimeout(600);
  };

  // ══ Entry: login ═══════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ══ A. Sidebar ═════════════════════════════════════════════════════════
  check("A1 Sidebar has Trade Review link",
    (await page.locator('nav[aria-label="Main navigation"] a[href="/journal"]').count()) === 1);
  check("A2 Sidebar has Trade Planner link",
    (await page.locator('nav[aria-label="Main navigation"] a[href="/planner"]').count()) === 1);

  // ══ B. Seeded EXECUTED plan → Planned badge + comparison ═══════════════
  await sidebarClick("/journal");
  await page.locator('[data-testid="trade-review-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-testid="tab-reviews"]').click();
  await page.locator('[data-testid="reviews-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);

  const badgeCount = await page.locator('[data-testid="review-plan-badge"]').count();
  check("B1 At least one review row carries the Planned badge (seeded link)", badgeCount >= 1, String(badgeCount));

  const badgedRow = page.locator('[data-testid="review-row"]', { has: page.locator('[data-testid="review-plan-badge"]') }).first();
  const badgedSymbol = (await badgedRow.locator("span.font-mono").first().innerText()).trim();
  check("B2 Badged row is the EURUSD executed seed", badgedSymbol === "EURUSD", badgedSymbol);

  await badgedRow.locator('[data-testid="review-edit"], [data-testid="review-open"]').first().click();
  await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);

  const comparison = page.locator('[data-testid="review-plan-comparison"]');
  check("B3 Plan vs Actual block renders", (await comparison.count()) === 1);
  const fieldOrder = await page.locator('[data-testid="review-plan-row"]').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-field")),
  );
  check("B4 Comparison has the 6 fields in order",
    JSON.stringify(fieldOrder) ===
      JSON.stringify(["ENTRY", "STOP", "TARGET", "RR", "RISK_AMOUNT", "POSITION_SIZE"]),
    fieldOrder.join(","));
  const stateCount = await page.locator('[data-testid="review-plan-state"]').count();
  check("B5 Every row carries a state chip", stateCount === 6, String(stateCount));
  const summary = (await page.locator('[data-testid="review-plan-summary"]').innerText()).trim();
  check("B6 Server summary present and non-generic", summary.length > 10 && /plan/i.test(summary), summary);
  const plannedEntry = await page.locator('[data-testid="review-plan-row"][data-field="ENTRY"] td').nth(1).innerText();
  check("B7 Planned entry matches the seed 1.0860 (fr-FR tolerant)", /1[,\u202f\s]?0?860/.test(plannedEntry), plannedEntry);
  const rrPlanned = await page.locator('[data-testid="review-plan-row"][data-field="RR"] td').nth(1).innerText();
  check("B8 Planned RR shown as 1:2.0 style", /1\s*:\s*2/.test(rrPlanned), rrPlanned);
  shot("B-comparison-dialog");

  // ══ C. View plan deep link ═════════════════════════════════════════════
  await page.locator('[data-testid="review-plan-open"]').click();
  await page.waitForURL(/\/planner\?plan=/, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const editorVisible = await page.locator('[data-testid="planner-editor"]').isVisible().catch(() => false);
  check("C1 View plan opens the planner editor via deep link", editorVisible);
  const executedBadge = await page.locator('[data-testid="planner-editor-header"] [data-testid^="planner-status-"]').innerText();
  check("C2 Deep-linked plan shows EXECUTED status", /executed/i.test(executedBadge), executedBadge);
  shot("C-planner-deep-link");

  // ══ D. Live link flow: execute the READY plan with a linked trade ══════
  await sidebarClick("/planner");
  await page.locator('[data-testid="planner-plans-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  const readyCard = page
    .locator('[data-testid="planner-plan-card"]', { has: page.locator('[data-testid="planner-status-ready"]') })
    .first();
  await readyCard.click();
  await page.locator('[data-testid="planner-editor"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="planner-action-executed"]').click();
  await page.locator('[data-testid="planner-confirm-executed"]').waitFor({ state: "visible", timeout: 5_000 });
  check("D1 Executed dialog exposes the executed-trade select",
    (await page.locator('[data-testid="planner-link-trade"]').count()) === 1);

  await page.locator('[data-testid="planner-link-trade"]').click();
  await page.waitForTimeout(300);
  const options = page.locator('[data-testid="planner-link-trade-option"]');
  const optionCount = await options.count();
  check("D2 Closed trades listed in the select", optionCount >= 3, String(optionCount));
  const firstOptionText = (await options.first().innerText()).trim();
  const linkedSymbol = firstOptionText.split("·")[0].trim();
  await options.first().click();
  await page.waitForTimeout(200);
  const selectedText = (await page.locator('[data-testid="planner-link-trade"]').innerText()).trim();
  check("D3 Select reflects the chosen trade", selectedText.length > 3 && selectedText === firstOptionText, selectedText);
  shot("D-executed-dialog");

  await page.locator('[data-testid="planner-confirm-executed-confirm"]').click();
  await page.waitForTimeout(1000);
  const newStatus = await page
    .locator('[data-testid="planner-editor-header"] [data-testid^="planner-status-"]')
    .innerText();
  check("D4 Plan is now EXECUTED", /executed/i.test(newStatus), newStatus);

  // ══ E. In-session: the linked trade's review shows the comparison ══════
  // (SPA navigation only — the invalidation in useUpdateTradePlan refreshes
  // the Trade Review read models; no reload, the store is browser-memory).
  await sidebarClick("/journal");
  await page.locator('[data-testid="trade-review-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-testid="tab-reviews"]').click();
  await page.locator('[data-testid="reviews-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(900);

  const badgedRows = page.locator('[data-testid="review-row"]', { has: page.locator('[data-testid="review-plan-badge"]') });
  const badgedTotal = await badgedRows.count();
  check("E1 Badged rows present after the live link", badgedTotal >= 1, String(badgedTotal));

  // The READY plan (planned entry 2390) was linked — find the badged row whose
  // comparison shows that planned entry (the seeded EURUSD link shows 1.0860;
  // when both links share one trade, the READY plan wins the reverse lookup).
  let linkedEntryShown = false;
  let stateValues = [];
  for (let i = 0; i < Math.min(badgedTotal, 4); i++) {
    await badgedRows.nth(i).locator('[data-testid="review-edit"], [data-testid="review-open"]').first().click();
    await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(350);
    const entry = await page.locator('[data-testid="review-plan-row"][data-field="ENTRY"] td').nth(1).innerText();
    if (/2[\s\u202f,]?390/.test(entry)) {
      linkedEntryShown = true;
      stateValues = await page.locator('[data-testid="review-plan-state"]').evaluateAll((chips) =>
        chips.map((c) => c.getAttribute("data-state")),
      );
      break;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  check("E2 Live-linked trade shows the READY plan's entry 2 390,00", linkedEntryShown);
  check("E3 All 6 state chips valid values",
    stateValues.length === 6 && stateValues.every((s) => ["MATCH", "DRIFT", "MISSING"].includes(s)),
    stateValues.join(","));
  shot("E-linked-comparison");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);

  // ══ F. Unlinked trades have NO comparison block ════════════════════════
  const plainRow = page
    .locator('[data-testid="review-row"]')
    .filter({ hasNot: page.locator('[data-testid="review-plan-badge"]') })
    .first();
  await plainRow.locator('[data-testid="review-edit"], [data-testid="review-open"]').first().click();
  await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(300);
  check("F1 Unlinked trade dialog has no comparison block",
    (await page.locator('[data-testid="review-plan-comparison"]').count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ══ G. The ONE reload — deterministic seeds re-materialize the link ════
  // (the mock store lives in browser memory: user mutations are session-
  // scoped by design; SEEDED links re-materialize identically — the badge
  // and comparison must therefore still render after the refresh).
  await page.goto(`${BASE}/journal?tab=reviews`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('[data-testid="reviews-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(900);
  const reseededBadges = await page.locator('[data-testid="review-plan-badge"]').count();
  check("G1 Seeded link re-materialized after reload", reseededBadges >= 1, String(reseededBadges));
  const seededRow = page
    .locator('[data-testid="review-row"]', { has: page.locator('[data-testid="review-plan-badge"]') })
    .first();
  await seededRow.locator('[data-testid="review-edit"], [data-testid="review-open"]').first().click();
  await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(350);
  const seededEntry = await page.locator('[data-testid="review-plan-row"][data-field="ENTRY"] td').nth(1).innerText();
  check("G2 Seeded comparison intact (planned entry 1.0860)", /1[\s\u202f,]?0?860/.test(seededEntry), seededEntry);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // ══ H. Mobile 390px — dialog without horizontal overflow ═══════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileRow = page
    .locator('[data-testid="review-row"]', { has: page.locator('[data-testid="review-plan-badge"]') })
    .first();
  await mobileRow.locator('[data-testid="review-edit"], [data-testid="review-open"]').first().click();
  await page.locator('[data-testid="review-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("H1 Mobile 390px: no horizontal overflow with comparison open", overflow <= 0, `${overflow}px`);
  shot("H-mobile-comparison");
  await page.keyboard.press("Escape");

  // ══ I. Console/network cleanliness ═════════════════════════════════════
  const realErrors = errors.filter(
    (e) => !/socket\.io|X-TransformPort|hydration|ResizeObserver/i.test(e),
  );
  check("I1 No unexpected page/network errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
