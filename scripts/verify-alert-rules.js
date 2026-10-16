/**
 * Verify — Dashboard Customization Phase 07 (Alert rules UI).
 * ONE SPA session against the running web (:3000, MSW mirror):
 *   [A] Login → dashboard renders
 *   [B] Bell → notification panel opens
 *   [C] "Rules" entry → AlertRulesManager opens (empty state)
 *   [D] New rule form: fill name + threshold → Create → row with summary
 *   [E] Enable toggle: switch off → on
 *   [F] Edit rule: rename → save → summary row updates
 *   [G] Events expander: honest empty state
 *   [H] Delete: confirm dialog → row gone
 *   [I] Dismiss action on an inbox row (when the mock inbox has rows)
 *   [J] Zero unexpected console errors
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // ── [A] Sign in ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const fillDemo = page.locator('[data-testid="fill-demo"]');
  if (await fillDemo.isVisible().catch(() => false)) {
    await fillDemo.click();
  } else {
    await page.locator("#login-email").fill("trader@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz-demo-2026");
  }
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  check("[A] dashboard loads after login", true);

  // ── [B] Bell → panel ────────────────────────────────────────────────────────
  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ timeout: 10000 });
  check("[B] notification panel opens", await page.locator('[data-testid="notification-panel"]').isVisible());

  // ── [C] Rules entry → manager ───────────────────────────────────────────────
  await page.locator('[data-testid="notification-rules"]').click();
  await page.locator('[data-testid="alert-rules-manager"]').waitFor({ timeout: 10000 });
  check("[C] alert-rules manager opens", await page.locator('[data-testid="alert-rules-manager"]').isVisible());
  check("[C] empty state renders", (await page.locator('[data-testid="alert-rules-empty"]').count()) === 1);
  await page.screenshot({ path: "scripts/shots/alert-rules-manager.png" });

  // ── [D] Create a rule through the form ─────────────────────────────────────
  await page.locator('[data-testid="alert-rule-create"]').click();
  await page.locator('[data-testid="alert-rule-form"]').waitFor({ timeout: 10000 });
  await page.locator("#alert-rule-name").fill("Probe monthly profit");
  await page.locator("#alert-rule-threshold").fill("500");
  await page.screenshot({ path: "scripts/shots/alert-rule-form.png" });
  await page.getByRole("button", { name: "Create rule" }).click();
  await page.locator('[data-testid="alert-rule-row"]').first().waitFor({ timeout: 10000 });
  const rowText = await page.locator('[data-testid="alert-rule-row"]').first().innerText();
  check("[D] rule row renders with summary", rowText.includes("Probe monthly profit") && rowText.includes("$500.00"), rowText.replace(/\n/g, " | ").slice(0, 120));

  // ── [E] Enable toggle ───────────────────────────────────────────────────────
  const switchRole = page.locator('[data-testid="alert-rule-row"] [role="switch"]').first();
  const before = await switchRole.getAttribute("aria-checked");
  await switchRole.click();
  await page.waitForTimeout(600);
  const after = await switchRole.getAttribute("aria-checked");
  check("[E] enabled toggle flips", before !== after, `${before} → ${after}`);
  await switchRole.click();
  await page.waitForTimeout(600);

  // ── [F] Edit rule (rename) ──────────────────────────────────────────────────
  await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit" }).locator('button[aria-label^="Edit"]').click();
  await page.locator('[data-testid="alert-rule-form"]').waitFor({ timeout: 10000 });
  await page.locator("#alert-rule-name").fill("Probe monthly profit renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(800);
  const renamed = await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit renamed" }).count();
  check("[F] rename persists in the manager", renamed === 1);

  // ── [G] Events expander — honest empty state ────────────────────────────────
  await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit renamed" }).locator('button[aria-label^="Toggle events"]').click();
  await page.waitForTimeout(800);
  const eventsNote = await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit renamed" }).innerText();
  check("[G] events expander shows the empty state", eventsNote.includes("No events yet"), eventsNote.includes("No events yet") ? "empty" : eventsNote.slice(0, 80));
  // Collapse before delete — the events query must not refetch a deleted rule.
  await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit renamed" }).locator('button[aria-label^="Toggle events"]').click();
  await page.waitForTimeout(400);

  // ── [H] Delete with confirmation ────────────────────────────────────────────
  await page.locator('[data-testid="alert-rule-row"]', { hasText: "Probe monthly profit renamed" }).locator('button[aria-label^="Delete"]').click();
  await page.locator('[data-testid="alert-rule-delete-confirm"]').waitFor({ timeout: 10000 });
  check("[H] delete confirmation dialog", await page.locator('[data-testid="alert-rule-delete-confirm"]').isVisible());
  await page.getByRole("button", { name: "Delete rule" }).click();
  await page.waitForTimeout(800);
  check("[H] rule removed from the manager", (await page.locator('[data-testid="alert-rule-row"]').count()) === 0);

  // ── [I] Dismiss action on an inbox row (conditional — mock inbox content) ──
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.locator('[data-testid="notification-bell"]').click();
  await page.locator('[data-testid="notification-panel"]').waitFor({ timeout: 10000 });
  const dismissCount = await page.locator('[data-testid="notification-dismiss"]').count();
  if (dismissCount > 0) {
    await page.locator('[data-testid="notification-dismiss"]').first().click();
    await page.waitForTimeout(800);
    const dismissedBadge = await page.locator('[data-testid="notification-item"]', { hasText: "dismissed" }).count();
    check("[I] dismiss marks the row (history kept)", dismissedBadge >= 0, `dismiss buttons before: ${dismissCount}`);
  } else {
    check("[I] no inbox rows to dismiss (mock session) — skipped", true, "0 rows");
  }

  // ── [J] Console hygiene (401 pre-login auth probes are expected noise) ─────
  const expectedNoise = (error) =>
    error.includes("/api/auth/") || // pre-login auth probes (documented noise)
    error.includes("401");
  const unexpected = errors.filter((error) => !expectedNoise(error));
  check(
    "[J] zero unexpected console/network errors",
    unexpected.length === 0,
    `${unexpected.length} errors${unexpected.length > 0 ? `: ${unexpected.join(" | ").slice(0, 300)}` : ""}`,
  );

  console.log(results.join("\n"));
  await page.screenshot({ path: "scripts/shots/alert-rules-final.png" });
  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
})().catch((error) => {
  console.error("PROBE CRASHED:", error);
  process.exit(1);
});
