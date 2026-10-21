/**
 * Verify — Analytics EXTENDED (Execution / Behavioral / Consistency, V1).
 *
 * IMPORTANT: navigation uses sidebar/tab clicks ONLY (SPA). Exactly ONE
 * reload is performed, for the ?tab= deep-link persistence check.
 *
 * Covers (MASTER PROMPT §63 P0 DoD + §69):
 *   A. Sidebar Analytics click → existing Overview intact + 16 tab triggers.
 *   B. Existing tabs untouched (spot-checks: Performance / Risk / Mistakes).
 *   C. Execution tab: KPI band, stop discipline, plan adherence, declared
 *      unavailable notes.
 *   D. Behavior tab: context note, period, Behavior Score (overall + 6
 *      dimensions), detected pattern cards (severity chips), playbook
 *      compliance, behavior timeline.
 *   E. Pattern details drawer: evidence, affected trades → /trades?trade=
 *      deep link opens the Trades drawer.
 *   F. Consistency tab: 6 dimension scores, risk/sizing cards, histograms,
 *      strategy usage, session focus.
 *   G. Global filters drive the extension (period LAST_30 → period chip
 *      changes; Reset restores).
 *   H. Deep link /analytics?tab=behavior survives a reload.
 *   I. Mobile 390px: no horizontal overflow on the new tabs.
 *   J. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/analytics-extended";

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
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
    await page.locator(`nav[aria-label="Main navigation"] a[href="${href}"]`).click();
    await page.waitForURL(new RegExp(href.replace("/", "\\/")), { timeout: 30_000 });
  };

  const tabTrigger = (tab) =>
    page.locator('[role="tab"]', { hasText: new RegExp(`^${tab}$`, "i") });

  const openTab = async (tab) => {
    await tabTrigger(tab).click();
    await page.locator(`[data-testid="analytics-tab-${tab.toLowerCase()}"]`)
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(400);
  };

  // ══ Entry: login ═══════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ══ A. Sidebar → Analytics: existing Overview intact ═══════════════════
  await sidebarClick("/analytics");
  await page.locator('[data-testid="analytics-tab-overview"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(600);

  const h1 = (await page.locator("h1").first().innerText()).trim();
  check("A1 Header title Analytics", /^analytics$/i.test(h1), h1);

  const triggerCount = await page.locator('[role="tab"]').count();
  check("A2 Tab strip shows 16 triggers (13 existing + 3 new)", triggerCount === 16, String(triggerCount));

  check("A3 Overview KPI grid intact",
    /net p&l/i.test(await page.locator('[data-testid="analytics-tab-overview"]').innerText()) &&
    (await page.locator('[data-testid="analytics-filters"]').count()) === 1);
  shot("A-overview");

  // ══ B. Existing tabs untouched (SPA spot-checks) ════════════════════════
  await openTab("Performance");
  check("B1 Performance tab renders unchanged",
    (await page.locator('[data-testid="analytics-tab-performance"]').innerText()).length > 100);
  await openTab("Risk");
  check("B2 Risk tab renders unchanged",
    (await page.locator('[data-testid="analytics-tab-risk"]').innerText()).length > 100);
  await openTab("Mistakes");
  check("B3 Mistakes tab renders unchanged",
    (await page.locator('[data-testid="analytics-tab-mistakes"]').count()) === 1);

  // ══ C. Execution tab ═══════════════════════════════════════════════════
  await openTab("Execution");
  const execText = await page.locator('[data-testid="analytics-tab-execution"]').innerText();
  check("C1 Execution KPI band (plan coverage / planned RR / realized R)",
    /Plan coverage/i.test(execText) && /Avg planned RR/i.test(execText) && /Avg realized R/i.test(execText));
  check("C2 Stop discipline card (with stop / moved / widened / tightened)",
    /Stop discipline/i.test(execText) && /Widened/i.test(execText) && /Tightened/i.test(execText));
  check("C3 Plan adherence block", /Plan adherence/i.test(execText));
  check("C4 Declared-unavailable notes rendered",
    (await page.locator('[data-testid="analytics-execution-unavailable"]').count()) === 1 &&
    /Not measurable yet/i.test(execText));
  shot("C-execution");

  // ══ D. Behavior tab ════════════════════════════════════════════════════
  await openTab("Behavior");
  const behText = await page.locator('[data-testid="analytics-tab-behavior"]').innerText();
  check("D1 Contextual non-diagnosis note", /not psychological diagnoses/i.test(behText));
  check("D2 Analysis period displayed", /Analysis period/i.test(behText) && /\d{4}-\d{2}-\d{2}/.test(behText));

  check("D3 Behavior Score card (overall /100)", /Trading Behavior/i.test(behText) && /\/ 100/.test(behText));
  const dimensionBars = await page.locator('[data-testid="behavior-score"] .h-1\\.5').count();
  check("D4 Score shows 6 dimensions", dimensionBars === 6, String(dimensionBars));

  const patternCards = await page.locator('[data-testid="behavior-pattern-card"]').count();
  check("D5 Pattern cards detected", patternCards >= 1, `${patternCards} cards`);
  const severityChips = await page.locator('[data-testid="behavior-pattern-severity"]').count();
  check("D6 Severity chips on every card", severityChips === patternCards, `${severityChips}/${patternCards}`);

  const patternTypes = await page.locator('[data-testid="behavior-pattern-card"]')
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-pattern-type")));
  check("D7 Revenge trading pattern detected on the seeded dataset",
    patternTypes.includes("REVENGE_TRADING"), patternTypes.join(","));

  check("D8 Playbook compliance card with rows",
    (await page.locator('[data-testid="behavior-compliance"]').innerText()).length > 40);
  check("D9 Behavior timeline card populated",
    (await page.locator('[data-testid="behavior-timeline"] li').count()) >= 1);
  shot("D-behavior");

  // ══ E. Pattern details drawer + affected trades deep link ══════════════
  const revengeCard = page.locator('[data-testid="behavior-pattern-card"][data-pattern-type="REVENGE_TRADING"]');
  await revengeCard.getByRole("button", { name: /View details/i }).click();
  await page.locator('[data-testid="behavior-pattern-drawer"]').waitFor({ state: "visible", timeout: 10_000 });
  const drawerText = await page.locator('[data-testid="behavior-pattern-drawer"]').innerText();
  check("E1 Drawer shows evidence rows", (await page.locator('[data-testid="behavior-drawer-evidence"]').count()) >= 1);
  check("E2 Drawer shows before/after comparison", /Before a loss/i.test(drawerText) && /After a loss/i.test(drawerText));

  const tradeLinks = page.locator('[data-testid="behavior-drawer-trades"] a');
  const tradeLinkCount = await tradeLinks.count();
  check("E3 Affected trades listed", tradeLinkCount >= 1, `${tradeLinkCount} links`);
  if (tradeLinkCount >= 1) {
    await tradeLinks.first().click();
    await page.waitForURL(/\/trades\?trade=/, { timeout: 15_000 });
    check("E4 Trade link opens the existing Trades drawer route",
      /\/trades\?trade=[0-9a-f-]{36}/.test(page.url()), page.url());
    await page.locator('[data-testid="trade-detail-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
    check("E5 Trades detail dialog opens on the linked trade",
      (await page.locator('[data-testid="trade-detail-dialog"]').count()) === 1);
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="trade-detail-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    await page.waitForTimeout(300);
  }
  shot("E-drawer");

  // Return to Analytics via the sidebar (SPA).
  await sidebarClick("/analytics");
  await page.locator('[data-testid="analytics-tab-overview"]').waitFor({ state: "visible", timeout: 30_000 });

  // ══ F. Consistency tab ═════════════════════════════════════════════════
  await openTab("Consistency");
  const consText = await page.locator('[data-testid="analytics-tab-consistency"]').innerText();
  check("F1 Consistency intro (descriptive, not a verdict)", /Descriptive, not a quality judgment/i.test(consText));
  check("F2 Dimension scores rendered",
    /RISK/i.test(consText) && /SIZING/i.test(consText) && /FREQUENCY/i.test(consText) &&
    /STRATEGY/i.test(consText) && /SESSION/i.test(consText));
  check("F3 Risk consistency card (median / avg / deviation)",
    /Median risk/i.test(consText) && /Average risk/i.test(consText) && /Deviation/i.test(consText));
  check("F4 Frequency card (active days / busiest day)",
    /Active days/i.test(consText) && /Busiest day/i.test(consText));
  check("F5 Strategy usage rows", /Strategy usage/i.test(consText));
  const charts = await page.locator('[data-testid="analytics-tab-consistency"] canvas').count();
  check("F6 Histograms rendered", charts >= 3, `${charts} charts`);
  check("F7 Session focus chart", /Session focus/i.test(consText));
  shot("F-consistency");

  // ══ G. Global filters drive the extension ══════════════════════════════
  await openTab("Behavior");
  const periodBefore = (await page.locator('[data-testid="analytics-tab-behavior"]').innerText())
    .match(/Analysis period · (\S+) → (\S+)/);
  await page.locator('[data-testid="filter-period"]').click();
  await page.getByRole("option", { name: "Last 30 Days" }).click();
  await page.waitForTimeout(1200);
  const periodAfter = (await page.locator('[data-testid="analytics-tab-behavior"]').innerText())
    .match(/Analysis period · (\S+) → (\S+)/);
  check("G1 Period filter recomputes the behavioral dataset",
    periodBefore !== null && periodAfter !== null &&
    (periodBefore[2] !== periodAfter[2] || periodBefore[1] !== periodAfter[1]),
    `${periodBefore ? periodBefore[1] : "?"}→${periodBefore ? periodBefore[2] : "?"} / ${periodAfter ? periodAfter[1] : "?"}→${periodAfter ? periodAfter[2] : "?"}`);

  await page.locator('[data-testid="analytics-reset"]').click();
  await page.waitForTimeout(1200);
  const resetText = (await page.locator('[data-testid="analytics-tab-behavior"]').innerText())
    .match(/Analysis period · (\S+) → (\S+)/);
  check("G2 Reset restores the full dataset",
    resetText !== null && periodBefore !== null && resetText[2] === periodBefore[2]);

  // ══ H. Deep-link persistence (the ONE reload) ══════════════════════════
  await tabTrigger("Behavior").click();
  await page.locator('[data-testid="analytics-tab-behavior"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
  const urlBeforeReload = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="analytics-tab-behavior"]').waitFor({ state: "visible", timeout: 60_000 });
  check("H1 ?tab=behavior persists across reload",
    /tab=behavior/.test(urlBeforeReload) && /tab=behavior/.test(page.url()) &&
    (await page.locator('[data-testid="behavior-score"]').count()) === 1);
  shot("H-reload");

  // ══ I. Mobile 390px ════════════════════════════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflowBehavior = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("I1 Behavior tab fits 390px", overflowBehavior <= 1, `overflow=${overflowBehavior}px`);

  await openTab("Consistency");
  const overflowConsistency = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("I2 Consistency tab fits 390px", overflowConsistency <= 1, `overflow=${overflowConsistency}px`);
  shot("I-mobile-behavior");

  // ══ J. Console / network cleanliness ═══════════════════════════════════
  check("J1 No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;

  await browser.close();
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
