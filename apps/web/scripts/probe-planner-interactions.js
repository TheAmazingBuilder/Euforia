/**
 * Probe — cross-module interactions for the Trade Planner.
 *
 * 1. Settings → Planner: lowering the account's Max risk per trade to 0.5%
 *    must flip the READY plan's AUTO check (risk 1%) to FAILED and block
 *    readiness — the planner composes the user's risk preferences live.
 *    Restoring 2% restores PASSED/READY.
 * 2. Planner → Playbook: a linked plan shows the strategy's risk frame
 *    (default/max risk, min RR) — the playbook stays the canonical source.
 *
 * Sidebar SPA navigation only; no reload.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ── 1. Settings → risk card → lower max risk to 0.5 ────────────────────
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.waitForURL(/\/settings/, { timeout: 30_000 });
  await page.locator('[data-testid="settings-nav-risk"]').click();
  await page.locator('[data-testid="settings-risk-max-input"]').waitFor({ state: "visible", timeout: 15_000 });
  check("S1 Settings risk card exposes the max-risk field",
    (await page.locator('[data-testid="settings-risk-max-input"]').count()) === 1);
  // The card forbids max < default — lower the default first.
  await page.locator('[data-testid="settings-risk-default-input"]').fill("0.25");
  await page.locator('[data-testid="settings-risk-max-input"]').fill("0.5");
  await page.waitForTimeout(400);
  await page.locator('[data-testid="settings-risk-save"]').click();
  await page.waitForTimeout(1_200);

  // ── 2. Planner reacts: READY plan (risk 1%) becomes BLOCKED ────────────
  await page.locator('nav[aria-label="Main navigation"] a[href="/planner"]').click();
  await page.waitForURL(/\/planner/, { timeout: 30_000 });
  await page.locator('[data-testid="planner-plans-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="planner-filter-ready"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="planner-plan-card"]').first().locator('[data-testid="planner-plan-open"]').click();
  await page.locator('[data-testid="planner-editor"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const riskState = await page.locator('[data-testid="planner-check-auto-risk"]').getAttribute("data-state");
  check("P1 AUTO risk check flips to FAILED after the settings change", riskState === "FAILED", String(riskState));
  check("P2 Readiness becomes BLOCKED",
    (await page.locator('[data-testid="planner-readiness-status"]').innerText()).trim() === "Blocked");
  check("P3 Blocker message rendered from the stable code",
    (await page.locator('[data-testid="planner-readiness-blockers"]').innerText()).length > 0);

  // ── 3. Restore the preference — the same plan returns to READY ─────────
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.waitForURL(/\/settings/, { timeout: 30_000 });
  await page.locator('[data-testid="settings-nav-risk"]').click();
  await page.locator('[data-testid="settings-risk-max-input"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="settings-risk-default-input"]').fill("1");
  await page.locator('[data-testid="settings-risk-max-input"]').fill("2");
  await page.waitForTimeout(400);
  await page.locator('[data-testid="settings-risk-save"]').click();
  await page.waitForTimeout(1_200);

  await page.locator('nav[aria-label="Main navigation"] a[href="/planner"]').click();
  await page.waitForURL(/\/planner/, { timeout: 30_000 });
  await page.locator('[data-testid="planner-plans-panel"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="planner-filter-ready"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="planner-plan-card"]').first().locator('[data-testid="planner-plan-open"]').click();
  await page.locator('[data-testid="planner-editor"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  check("P4 Restoring 2% restores PASSED + READY",
    (await page.locator('[data-testid="planner-check-auto-risk"]').getAttribute("data-state")) === "PASSED" &&
    (await page.locator('[data-testid="planner-readiness-status"]').innerText()).trim() === "Ready");

  // ── 4. Playbook link: strategy risk frame on a linked plan ─────────────
  // Playbook → Planner: the plan is linked to its canonical strategy and the
  // strategy's checklist template items were composed into the plan.
  const strategyText = await page.locator('[data-testid="planner-field-strategy"]').innerText();
  const templateItems = await page.locator('[data-testid^="planner-check-tpl-"]').count();
  check("P5 Playbook link: strategy selected + template items composed",
    /Breakout NY/.test(strategyText) && templateItems >= 4,
    `${strategyText} · ${templateItems} template items`);

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((error) => {
  console.error("RUNNER ERROR:", error);
  process.exit(1);
});
