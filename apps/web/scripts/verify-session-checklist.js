/**
 * Verify — Trading Checklist in Session Live (checklist → Session Live
 * extension, frontend-only over the MSW mock backend).
 *
 * IMPORTANT: navigation uses sidebar clicks ONLY (SPA). NO reload is
 * performed — the mock store lives in browser memory, so a reload would
 * re-seed it (the same convention the other suites document).
 *
 * Covers:
 *   A. Sidebar: Session Live present (SPA nav).
 *   B. No session: the checklist panel shows the honest "start a session" hint.
 *   C. Start a session with strategy "Breakout NY" (has its own template) →
 *      the panel composes the checklist server-side: template name, N items,
 *      required badges, progress 0/N.
 *   D. Toggle items ON (and one back OFF→ON): progress advances 1/N → 2/N,
 *      server state survives the round-trip (no client-only optimism).
 *   E. End session: summary shows "Session Checklist 2/N" (frozen record).
 *   F. After the end: the panel returns to the no-session hint.
 *   G. Mobile 390px: no horizontal overflow.
 *   H. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/session-checklist";

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
  check("A1 Sidebar has Session Live link",
    (await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').count()) === 1);

  await sidebarClick("/session");
  await page.waitForTimeout(1500);

  // ══ B. No session → honest hint ════════════════════════════════════════
  const checklistPanel = page.locator('[data-testid="session-checklist"]');
  check("B1 Checklist panel renders in the session sidebar", (await checklistPanel.count()) === 1);
  check("B2 No-session hint shown before any session",
    (await page.locator('[data-testid="session-checklist-empty"]').count()) === 1);
  shot("B-no-session");

  // ══ C. Start a session with a templated strategy ═══════════════════════
  await page.locator('[data-testid="start-session-button"]').click();
  await page.locator('[data-testid="start-session-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator("#ss-strategy").selectOption({ label: "Breakout NY" });
  await page.locator('[data-testid="start-session-confirm"]').click();
  await page.waitForTimeout(1500);

  check("C1 Checklist composed from the strategy template",
    (await page.locator('[data-testid="session-checklist-no-template"]').count()) === 0 &&
    (await page.locator('[data-testid="session-check-item"]').count()) > 0);
  const itemCount = await page.locator('[data-testid="session-check-item"]').count();
  const progressText = (await page.locator('[data-testid="session-checklist-progress"]').innerText()).replace(/\n/g, " ");
  check("C2 Progress starts at 0/N", progressText.includes(`0/${itemCount}`), progressText);
  const panelText = await checklistPanel.innerText();
  check("C3 Template name shown (Breakout NY pre-flight)", /Breakout NY/.test(panelText));
  check("C4 Required badges render",
    (await checklistPanel.locator('span:has-text("Required")').count()) >= 1);
  shot("C-checklist-composed");

  // ══ D. Toggle items — server-backed progress ═══════════════════════════
  const firstToggle = page.locator('[data-testid="session-check-item"]').first().locator("button[role='switch'], [role='switch']").first();
  await firstToggle.click();
  await page.waitForTimeout(900);
  let progress = (await page.locator('[data-testid="session-checklist-progress"]').innerText()).replace(/\n/g, " ");
  check("D1 First toggle → 1/N", progress.includes(`1/${itemCount}`), progress);

  const secondToggle = page.locator('[data-testid="session-check-item"]').nth(1).locator("button[role='switch'], [role='switch']").first();
  await secondToggle.click();
  await page.waitForTimeout(900);
  progress = (await page.locator('[data-testid="session-checklist-progress"]').innerText()).replace(/\n/g, " ");
  check("D2 Second toggle → 2/N", progress.includes(`2/${itemCount}`), progress);
  const secondItemChecked = await page
    .locator('[data-testid="session-check-item"]')
    .nth(1)
    .getAttribute("data-checked");
  check("D3 Item row reflects checked state", secondItemChecked === "true");

  // OFF→ON round trip — unchecking must persist too.
  await secondToggle.click();
  await page.waitForTimeout(900);
  progress = (await page.locator('[data-testid="session-checklist-progress"]').innerText()).replace(/\n/g, " ");
  check("D4 Uncheck persists → back to 1/N", progress.includes(`1/${itemCount}`), progress);
  await secondToggle.click();
  await page.waitForTimeout(900);
  progress = (await page.locator('[data-testid="session-checklist-progress"]').innerText()).replace(/\n/g, " ");
  check("D5 Re-check persists → 2/N", progress.includes(`2/${itemCount}`), progress);
  shot("D-checklist-toggled");

  // ══ E. End session → frozen checklist in the summary ═══════════════════
  await page.locator('[data-testid="end-session-button"]').click();
  await page.locator('[data-testid="end-session-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  // The dialog first asks reflection questions; submit to get the summary.
  await page.locator('[data-testid="end-session-confirm"]').click();
  await page.waitForTimeout(1200);
  const summaryChecklist = page.locator('[data-testid="summary-checklist"]');
  check("E1 Summary shows the checklist completion row", (await summaryChecklist.count()) === 1);
  const summaryText = (await summaryChecklist.innerText()).replace(/\n/g, " ");
  check("E2 Summary value equals 2/N", summaryText.includes(`2/${itemCount}`), summaryText);
  shot("E-end-summary");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ══ F. After the end → honest no-session hint again ════════════════════
  await page.waitForTimeout(800);
  check("F1 Panel back to no-session hint after the end",
    (await page.locator('[data-testid="session-checklist-empty"]').count()) === 1);

  // ══ G. Mobile 390px ════════════════════════════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("G1 Mobile 390px: no horizontal overflow", overflow <= 0, `${overflow}px`);
  shot("G-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });

  // ══ H. Console/network cleanliness ═════════════════════════════════════
  const realErrors = errors.filter(
    (e) => !/socket\.io|X-TransformPort|hydration|ResizeObserver/i.test(e),
  );
  check("H1 No unexpected page/network errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
