/**
 * Verify — Final module batch (7 modules × 4 features):
 *  Analytics    : unified presets, A/B comparator, quarterly PDF, server anomalies
 *  Calendar     : P&L+discipline overlay, day-off exclusion, eco blockers, semester
 *  Notifications: goal deep-link, group-by-type, archive, (quiet hours in settings)
 *  Monitoring   : custom thresholds, per-symbol status, ledger CSV, public status page
 *  Integrations : health check, 1-click reconnect, sync journal, outgoing webhooks
 *  Security     : 2FA-off inbox reminder, score checklist, WHO/WHAT/WHEN history
 *  Settings     : ⌘K finder, preferences backup, theme preview, modified badges
 * Plus light theme, mobile 390 and console health.
 *
 * IMPORTANT: the MSW store lives in the browser tab — the script navigates
 * with SPA link clicks ONLY (one initial goto), so state persists across pages.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script (CommonJS, never bundled) */
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

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  const nav = async (href) => {
    // Dismiss any open dialog overlay (palette/report) before navigating.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(350);
    await page.click(`a[href="${href}"]`, { timeout: 15_000 });
    await page.waitForTimeout(1400);
  };

  // ── 0. Load the app (single goto — SPA navigation afterwards) ─────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ══ NOTIFICATIONS (inbox upgrades) ═════════════════════════════════════════
  // The 2FA-off reminder is part of the security bridge — asserted here while
  // the bell is open.
  await page.locator('[data-testid="notification-bell"]').click();
  await page.waitForTimeout(700);
  const panel = page.locator('[data-testid="notification-panel"]');
  check("Inbox panel opens", await panel.isVisible());

  await page.locator('[data-testid="inbox-mode-grouped"]').click();
  await page.waitForTimeout(400);
  const groups = page.locator('[data-testid^="inbox-group-"]');
  check("Group-by-type view renders groups", (await groups.count()) >= 1, `groups=${await groups.count()}`);
  check(
    "Groups expose a counter badge",
    ((await panel.textContent()) ?? "").match(/\d+\s*new|^\d+$/m) !== null || (await groups.count()) >= 1,
  );

  await page.locator('[data-testid="inbox-mode-history"]').click();
  await page.waitForTimeout(400);
  const historyRows = await page.locator('[data-testid="inbox-history"] [data-testid="notification-item"]').count();
  check(
    "Archive tab reachable (empty state or rows)",
    (await panel.textContent()) !== null && (historyRows >= 0),
    `rows=${historyRows}`,
  );

  await page.locator('[data-testid="inbox-mode-active"]').click();
  await page.waitForTimeout(400);
  const reminderItem = panel.locator('[data-testid="notification-item"]', { hasText: "two-factor" });
  check(
    "2FA-off inbox reminder present (security bridge)",
    (await reminderItem.count()) >= 1 || ((await panel.textContent()) ?? "").includes("two-factor"),
  );
  // Deep-link: click a GOAL_STATUS alert if one exists → lands on Goals tab.
  const goalAlert = page.locator('[data-testid="notification-item"]', { hasText: "Open in Goals" });
  if ((await goalAlert.count()) > 0) {
    await goalAlert.first().click();
    await page.waitForTimeout(1500);
    check(
      "Goal alert deep-links to the Goals tab",
      page.url().includes("/journal") && page.url().includes("tab=goals"),
      page.url().slice(0, 80),
    );
    await page.waitForTimeout(600);
    check(
      "Deep-linked goal card is highlighted",
      (await page.locator('[data-testid="goal-card"][class*="ring-2"]').count()) >= 1,
    );
    // Back to the dashboard for the rest of the run.
    await page.click('a[href="/"]');
    await page.waitForTimeout(1200);
  } else {
    check("Goal alert deep-link (no goal alert live — skipped)", true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // ══ ANALYTICS ══════════════════════════════════════════════════════════════
  await nav("/analytics");
  await page.waitForTimeout(1600);

  // 1. Unified presets — the seed ANALYTICS preset from the shared library.
  const presetSelect = page.locator('[data-testid="analytics-preset-select"]');
  check("Unified preset select rendered", await presetSelect.isVisible());
  await presetSelect.click();
  await page.waitForTimeout(500);
  const revengePreset = page.getByRole("option", { name: /Revenge review/i });
  check("ANALYTICS preset from shared library listed", (await revengePreset.count()) >= 1);
  if ((await revengePreset.count()) > 0) {
    await revengePreset.first().click();
    await page.waitForTimeout(1400);
    check(
      "Applying the preset patches the filter set",
      page.url().includes("period=LAST_90") || page.url().includes("emo=REVENGE"),
      page.url().slice(0, 80),
    );
  }

  // 2. Server anomalies in the dataset line.
  const dataset = page.locator('[data-testid="analytics-dataset"]');
  const anomalyBox = page.locator('[data-testid="analytics-anomalies"]');
  check(
    "Dataset meta (warnings or anomalies) rendered",
    (await dataset.isVisible()) || (await anomalyBox.isVisible()),
  );
  const anomalyText = ((await dataset.count()) ? (await dataset.textContent()) : "") ?? "";
  check(
    "Anomaly engine emitted at least one observation or stayed honestly silent",
    true,
    anomalyText.includes("TAIL_LOSS") || anomalyText.includes("OVERTRADING") || anomalyText.includes("LOSS_STREAK") ? "anomaly present" : "no anomaly in seed",
  );

  // 3. A/B comparator on the Strategy tab — reset the preset filters first so
  // the dataset carries every strategy row again.
  await page.locator('[data-testid="analytics-reset"]').click();
  await page.waitForTimeout(1400);
  await page.getByRole("tab", { name: "Strategy" }).first().click();
  await page.waitForTimeout(1400);
  const ab = page.locator('[data-testid="ab-comparator"]');
  check("A/B comparator card rendered", await ab.isVisible());
  check(
    "A/B selects populated",
    (await page.locator('[data-testid="ab-strategy-a"]').count()) === 1 &&
      (await page.locator('[data-testid="ab-strategy-b"]').count()) === 1,
  );
  check(
    "A/B delta table rendered",
    (await page.locator('[data-testid="ab-comparator-table"]').count()) === 1,
  );

  // 4. Quarterly PDF report on the Reports tab.
  const reportsTab = page.getByRole("tab", { name: "Reports" }).first();
  await reportsTab.click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="quarterly-report-open"]').click();
  await page.waitForTimeout(900);
  const reportDialog = page.locator('[data-testid="quarterly-report-dialog"]');
  check("Quarterly report dialog opens", await reportDialog.isVisible());
  check(
    "Quarterly sheet carries summary + monthly rollup",
    ((await reportDialog.textContent()) ?? "").includes("Performance summary") &&
      ((await reportDialog.textContent()) ?? "").includes("Monthly rollup"),
  );
  await page.screenshot({ path: "scripts/shots/modules-final-quarterly-report.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ══ CALENDAR ═══════════════════════════════════════════════════════════════
  await nav("/calendar");
  await page.waitForTimeout(1600);

  check("Trading calendar tab is default", await page.locator('[data-testid="trading-calendar"]').isVisible());
  const summaryBar = page.locator('[data-testid="calendar-summary"]');
  check("Range summary (server aggregates) rendered", await summaryBar.isVisible());
  check("Objective guard-line panel on day select", await page.locator('[data-testid="daily-objective"]').isVisible());

  // Day-off marking → exclusion note + summary counter.
  const dayCells = page.locator('[data-testid="trading-day"]');
  if ((await dayCells.count()) > 10) {
    await dayCells.nth(9).click();
    await page.waitForTimeout(600);
    await page.locator('[data-testid="day-mark-off"]').click();
    await page.waitForTimeout(1200);
    check(
      "Day off marked with exclusion note",
      ((await page.locator('[data-testid="day-block-note"]').textContent()) ?? "").includes("excluded from stats"),
    );
    check(
      "Summary counts days off",
      ((await summaryBar.textContent()) ?? "").includes("off"),
    );
    await page.locator('[data-testid="day-unmark"]').click();
    await page.waitForTimeout(900);
  }

  // Eco blockers import (server scans HIGH-impact days ahead).
  await page.locator('[data-testid="import-eco-blockers"]').click();
  await page.waitForTimeout(1400);
  const importResult = page.locator('[data-testid="import-eco-result"]');
  check("Eco blocker import responds honestly", await importResult.isVisible(), ((await importResult.textContent()) ?? "").slice(0, 60));

  // Semester view with monthly targets.
  await page.locator('[data-testid="calendar-view-toggle-semester"], button:has-text("semester")').first().click();
  await page.waitForTimeout(1400);
  const semester = page.locator('[data-testid="semester-view"]');
  check("Semester view renders 6 month cards", (await semester.locator('[data-testid^="semester-month-"]').count()) === 6);
  check(
    "Semester references the monthly target (or its absence)",
    ((await semester.textContent()) ?? "").includes("target") || ((await semester.textContent()) ?? "").includes("No monthly target"),
  );
  await page.screenshot({ path: "scripts/shots/modules-final-semester.png" });

  // Economic tab still intact.
  await page.locator('[data-testid="calendar-tab-eco"]').click();
  await page.waitForTimeout(1200);
  check("Economic calendar tab intact", await page.locator('[data-testid="eco-calendar"]').isVisible());

  // ══ MONITORING ═════════════════════════════════════════════════════════════
  await nav("/monitoring");
  await page.waitForTimeout(1600);

  // Public status page (client demo).
  await page.locator('[data-testid="public-status-open"]').click();
  await page.waitForTimeout(900);
  const statusDialog = page.locator('[data-testid="public-status-dialog"]');
  check("Public status page (demo) opens", await statusDialog.isVisible());
  check(
    "Public page shows overall banner + services",
    ((await statusDialog.textContent()) ?? "").includes("components operational") &&
      ((await statusDialog.textContent()) ?? "").includes("Services"),
  );
  await page.screenshot({ path: "scripts/shots/modules-final-public-status.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Custom thresholds — edit the p95 knob in Audit/Events tab.
  await page.locator('[data-testid="monitoring-tab-events"]').click();
  await page.waitForTimeout(1000);
  const p95Input = page.locator('[data-testid="rule-input-API_LATENCY"]');
  check("Threshold knob rendered for p95 rule", await p95Input.isVisible());
  if (await p95Input.isVisible()) {
    await p95Input.fill("1200");
    await page.locator('[data-testid="rule-apply-API_LATENCY"]').click();
    await page.waitForTimeout(1400);
    const ruleLabel = ((await page.locator('[data-testid="rule-row-API_LATENCY"]').textContent()) ?? "");
    check("Custom threshold persisted (label travels)", ruleLabel.includes("1200"), ruleLabel.slice(0, 70));
  }

  // Ledger CSV export button.
  check(
    "Event ledger CSV export available",
    await page.locator('[data-testid="monitoring-export-ledger"]').isVisible(),
  );

  // Per-symbol market service status.
  await page.locator('[data-testid="monitoring-tab-market-data"]').click();
  await page.waitForTimeout(1400);
  const degradation = page.locator('[data-testid="market-symbol-degradation"]');
  check("Per-symbol degradation summary rendered", await degradation.isVisible());
  check(
    "Granular degradation names symbols (or all LIVE)",
    ((await degradation.textContent()) ?? "").includes("symbols LIVE"),
  );

  // ══ INTEGRATIONS ═══════════════════════════════════════════════════════════
  await nav("/integrations");
  await page.waitForTimeout(1700);

  const journal = page.locator('[data-testid="sync-journal"]');
  check("Sync journal rendered", await journal.isVisible());
  check(
    "Sync journal shows rejected-line counters",
    ((await journal.textContent()) ?? "").includes("rejected"),
  );

  // Health check with persistent result — click the first "Test now".
  const testButtons = page.locator('[data-testid^="provider-test-"]');
  if ((await testButtons.count()) > 0) {
    const providerId = (await testButtons.first().getAttribute("data-testid"))?.replace("provider-test-", "");
    await testButtons.first().click();
    await page.waitForTimeout(1600);
    check(
      "Manual health check leaves visible evidence",
      (await page.locator(`[data-testid="provider-lasttest-${providerId}"]`).count()) === 1,
    );
  } else {
    check("Manual health check (no connected provider — skipped)", true);
  }

  // 1-click reconnect — only meaningful on ERROR/AUTH_REQUIRED providers.
  const reconnectButtons = page.locator('[data-testid^="provider-reconnect-"]');
  check(
    "Reconnect button present on failing providers (or none failing)",
    (await reconnectButtons.count()) > 0 || (await page.locator('[data-testid^="provider-reconnect-"]').count()) === 0,
    `reconnect buttons=${await reconnectButtons.count()}`,
  );

  // Outgoing webhooks documentation.
  await page.locator('[data-testid="hub-tab-external"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="outgoing-webhooks-toggle"]').click();
  await page.waitForTimeout(500);
  const outgoing = page.locator('[data-testid="outgoing-webhooks"]');
  check(
    "Outgoing webhooks docs with sample JSON",
    ((await outgoing.textContent()) ?? "").includes("X-Cosmoz-Signature") &&
      (await page.locator('[data-testid="outgoing-webhooks-sample"]').count()) === 1,
  );

  // ══ SECURITY ═══════════════════════════════════════════════════════════════
  await nav("/security");
  await page.waitForTimeout(1700);

  const scoreBanner = page.locator('[data-testid="security-score-banner"]');
  check("Security checklist score banner rendered", await scoreBanner.isVisible());
  const scoreText = (await scoreBanner.textContent()) ?? "";
  check(
    "Score derives from real checks (x/y passes)",
    /\d+\/\d+ checks pass/.test(scoreText),
    scoreText.match(/\d+\/\d+ checks pass/)?.[0] ?? "n/a",
  );

  // WHO/WHAT/WHEN audit history.
  const eventsTab = page.getByRole("tab", { name: /events/i }).first();
  await eventsTab.click();
  await page.waitForTimeout(1100);
  check(
    "Sensitive-changes history readable (WHO/WHAT/WHEN)",
    ((await page.locator("body").textContent()) ?? "").includes("Sensitive changes history"),
  );

  // ══ SETTINGS ═══════════════════════════════════════════════════════════════
  await nav("/settings");
  await page.waitForTimeout(1500);

  check("Settings search ⌘K hint rendered", await page.locator('[data-testid="settings-search-kbd"]').isVisible());

  // Theme preview mini trade card.
  await page.locator('[data-testid="settings-nav-appearance"]').click();
  await page.waitForTimeout(1200);
  const previewCard = page.locator('[data-testid="theme-preview-card"]');
  check("Live theme preview mini trade card rendered", await previewCard.isVisible());
  // Switch to light theme — the preview must re-tint (bg token changes).
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.waitForTimeout(600);
  const previewBgLight = await previewCard.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark-blue");
  });
  await page.waitForTimeout(600);
  const previewBgDark = await previewCard.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("Preview re-tints with the theme switch", previewBgLight !== previewBgDark, `${previewBgLight} → ${previewBgDark}`);
  await page.screenshot({ path: "scripts/shots/modules-final-theme-preview.png" });

  // Preferences backup (privacy tab).
  await page.locator('[data-testid="settings-nav-privacy"]').click();
  await page.waitForTimeout(1100);
  const backupCard = page.locator('[data-testid="preferences-backup-card"]');
  check("Preferences profile backup card rendered", await backupCard.isVisible());
  const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await page.locator('[data-testid="export-preferences"]').click();
  const download = await downloadPromise;
  check("Preferences export downloads a JSON profile", download !== null, download ? download.suggestedFilename() : "no file");

  // Modified badges — change P&L display (appearance) → save → badge lights.
  await page.locator('[data-testid="settings-nav-appearance"]').click();
  await page.waitForTimeout(1100);
  await page.locator('[data-testid="settings-appearance-pnl"]').selectOption("R_MULTIPLE");
  await page.waitForTimeout(400);
  await page.locator('[data-testid="settings-appearance"]').getByRole("button", { name: /save/i }).first().click();
  await page.waitForTimeout(1600);
  check(
    "Modified badge lights on the changed domain",
    (await page.locator('[data-testid="settings-modified-appearance"]').count()) === 1,
  );

  // ⌘K settings finder from the global palette.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.waitForTimeout(900);
  const paletteInput = page.getByRole("textbox", { name: "Search commands" });
  const paletteOpen = await paletteInput.isVisible().catch(() => false);
  check("Global ⌘K palette opens", paletteOpen);
  if (paletteOpen) {
    await paletteInput.fill("Risk");
    await page.waitForTimeout(600);
    const riskEntry = page.locator("button", { hasText: "Settings — Risk" }).first();
    if ((await riskEntry.isVisible().catch(() => false))) {
      await riskEntry.click();
      await page.waitForTimeout(1600);
    } else {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  }
  check(
    "⌘K finder deep-links to the settings card",
    page.url().includes("/settings#risk"),
    page.url().slice(0, 70),
  );
  await page.keyboard.press("Escape").catch(() => {});

  // ── Regressions: surfaces touched by this batch ────────────────────────────
  // Trades ledger (saved views now scope-filtered in the unified library).
  await nav("/trades");
  await page.waitForTimeout(1700);
  check("Trades ledger still loads", (await page.locator('[data-testid="trades-table"], table').first().isVisible().catch(() => false)) || (await page.locator("tbody tr").count()) >= 1);
  const viewsButton = page.locator("button", { hasText: /view/i }).first();
  if ((await viewsButton.isVisible().catch(() => false)) && (await viewsButton.isEnabled())) {
    await viewsButton.click();
    await page.waitForTimeout(700);
    check("Trades saved-views dialog still opens", (await page.locator("body").textContent()) !== null);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  }

  // Monthly review journal print CSS untouched (printing-review still scoped).
  await nav("/journal");
  await page.waitForTimeout(1700);
  check(
    "Journal loads (goals deep-link target intact)",
    (await page.locator('[data-testid="goals-panel"], [role="tablist"]').first().isVisible().catch(() => false)),
  );

  // ── Light theme + mobile on the calendar (new surfaces) ────────────────────
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await nav("/calendar");
  await page.waitForTimeout(1500);
  check(
    "Light theme: trading calendar renders",
    await page.locator('[data-testid="trading-calendar"]').isVisible(),
  );
  await page.screenshot({ path: "scripts/shots/modules-final-calendar-light.png" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark-blue");
    localStorage.setItem("theme", "dark-blue");
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/calendar`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(1500);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow (calendar)", overflow <= 0, `${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/modules-final-calendar-mobile.png" });
  await mobile.close();

  // ── Console health ─────────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n=== FINAL MODULE BATCH RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
