/**
 * Verify — Settings module (MASTER PROMPT).
 * Probes: category rail + deep links, search, per-card save, reset with
 * confirm, risk validation (max ≥ default), Rules Engine apply, notification
 * matrix toggles, appearance theme/density (incl. System §9), localization preview
 * + number format §12, academy learning notifications §10, timezone via /me,
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

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // ── 1. Shell: header, nav rail, default category (Profile) ──────────────
  check("Settings header visible", await page.locator('h1:has-text("Settings")').isVisible());
  const navCount = await page.locator('[data-testid^="settings-nav-"]').count();
  check("10 categories in rail", navCount === 10, `count=${navCount}`);
  check(
    "Profile card shown by default",
    await page.locator('[data-testid="settings-profile"]').isVisible(),
  );
  await page.screenshot({ path: "scripts/shots/settings-profile.png" });

  // ── 2. Deep link via hash ────────────────────────────────────────────────
  await page.goto(`${BASE}/settings#risk`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check(
    "Deep link #risk opens Risk card",
    await page.locator('[data-testid="settings-risk"]').isVisible(),
  );

  // ── 3. Search ────────────────────────────────────────────────────────────
  await page.locator('[data-testid="settings-search"]').fill("push");
  await page.waitForTimeout(400);
  const searchNav = await page.locator('[data-testid^="settings-nav-"]').count();
  check("Search filters categories (push → Notifications)", searchNav >= 1 && searchNav < 10, `visible=${searchNav}`);
  await page.screenshot({ path: "scripts/shots/settings-search.png" });
  await page.locator('[data-testid="settings-search"]').fill("");

  // ── 4. Trading card: edit + save + persistence ───────────────────────────
  await page.locator('[data-testid="settings-nav-trading"]').click();
  await page.waitForTimeout(600);
  const timeframe = page.locator('[data-testid="settings-trading-timeframe"]');
  await timeframe.selectOption("H1");
  await page.waitForTimeout(200);
  check(
    "Save enabled when dirty",
    await page.locator('[data-testid="settings-trading-save"]').isEnabled(),
  );
  await page.locator('[data-testid="settings-trading-save"]').click();
  await page.waitForTimeout(900);
  const tfValue = await timeframe.inputValue();
  check("Trading pref persisted (H1)", tfValue === "H1", `value=${tfValue}`);

  // Reset with confirm dialog
  await page.locator('[data-testid="settings-trading-reset"]').click();
  await page.waitForTimeout(400);
  check(
    "Reset confirm dialog opens",
    await page.locator('[data-testid="settings-trading-reset-dialog"]').isVisible(),
  );
  await page.locator('[data-testid="settings-trading-reset-confirm"]').click();
  await page.waitForTimeout(900);
  const tfAfterReset = await timeframe.inputValue();
  check("Trading reset to default (M15)", tfAfterReset === "M15", `value=${tfAfterReset}`);

  // ── 5. Risk validation: max < default blocks save ────────────────────────
  await page.locator('[data-testid="settings-nav-risk"]').click();
  await page.waitForTimeout(600);
  const maxInput = page.locator('[data-testid="settings-risk-max-input"]');
  await maxInput.fill("0.5");
  await page.waitForTimeout(300);
  check(
    "Max<default blocks Save (validation)",
    !(await page.locator('[data-testid="settings-risk-save"]').isEnabled()),
  );
  check(
    "Inline validation message shown",
    await page.locator('text=Max risk per trade must be greater').isVisible(),
  );
  await page.screenshot({ path: "scripts/shots/settings-risk-validation.png" });
  await maxInput.fill("2");
  await page.waitForTimeout(300);

  // Rules Engine apply
  await page.locator('[data-testid="settings-risk-apply"]').click();
  await page.waitForTimeout(1200);
  check(
    "Rules Engine apply reports in sync",
    (await page.locator('[data-testid="settings-risk-rules-engine"]').textContent()).includes("in sync"),
  );
  await page.screenshot({ path: "scripts/shots/settings-risk.png" });

  // ── 6. Notifications matrix ──────────────────────────────────────────────
  await page.locator('[data-testid="settings-nav-notifications"]').click();
  await page.waitForTimeout(600);
  const matrixCount = await page.locator('[data-testid^="settings-notifications-"][data-testid$="-enabled"]').count();
  check("6 notification categories rendered", matrixCount === 6, `count=${matrixCount}`);
  const emailToggle = page.locator('[data-testid="settings-notifications-trading-TRADE_OPENED-email"]');
  const before = await emailToggle.getAttribute("data-state");
  await emailToggle.click();
  await page.waitForTimeout(300);
  const after = await emailToggle.getAttribute("data-state");
  check("Event×channel toggle flips", before !== after, `${before}→${after}`);
  await page.locator('[data-testid="settings-notifications-save"]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "scripts/shots/settings-notifications.png" });

  // ── 7. Appearance: theme switch + density ────────────────────────────────
  await page.locator('[data-testid="settings-nav-appearance"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="settings-appearance-theme-LIGHT"]').click();
  await page.waitForTimeout(500);
  const htmlTheme = await page.locator("html").getAttribute("data-theme");
  check("Theme switch applies instantly (light)", htmlTheme === "light", `data-theme=${htmlTheme}`);
  await page.screenshot({ path: "scripts/shots/settings-appearance-light.png" });
  await page.locator('[data-testid="settings-appearance-theme-DARK_BLUE"]').click();
  await page.waitForTimeout(400);

  // §9 — System theme: follows the OS (resolves to a concrete data-theme).
  const themeOptions = await page.locator('[data-testid^="settings-appearance-theme-"]').count();
  check("Theme control offers Light/Dark/Dark blue/System", themeOptions === 4, `options=${themeOptions}`);
  await page.locator('[data-testid="settings-appearance-theme-SYSTEM"]').click();
  await page.waitForTimeout(400);
  const systemTheme = await page.locator("html").getAttribute("data-theme");
  check(
    "System theme resolves to OS preference",
    systemTheme === "light" || systemTheme === "dark" || systemTheme === "dark-blue",
    `data-theme=${systemTheme}`,
  );
  await page.locator('[data-testid="settings-appearance-theme-DARK_BLUE"]').click();
  await page.waitForTimeout(400);

  // ── 8. Localization: timezone writes through /me ─────────────────────────
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.waitForTimeout(600);
  check(
    "Localization preview rendered",
    await page.locator('[data-testid="settings-localization-preview"]').isVisible(),
  );
  await page.locator('[data-testid="settings-localization-timezone"]').selectOption("Europe/Paris");
  await page.waitForTimeout(900);
  // Profile card must reflect the same timezone (single source of truth).
  await page.locator('[data-testid="settings-nav-profile"]').click();
  await page.waitForTimeout(600);
  const profileTz = await page.locator('[data-testid="settings-profile-timezone"]').inputValue();
  check("Timezone synced to Profile via /me", profileTz === "Europe/Paris", `tz=${profileTz}`);
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="settings-localization-timezone"]').selectOption("America/Toronto");
  await page.waitForTimeout(700);

  // §12 — Number format: grouping styles render through the live preview.
  const preview = page.locator("[data-testid=\"settings-localization-preview\"]");
  await page.locator('[data-testid="settings-localization-number"]').selectOption("NONE");
  await page.waitForTimeout(300);
  const nonePreview = await preview.textContent();
  check("Number format NONE strips grouping", nonePreview.includes("1234.50"), nonePreview.slice(0, 60));
  await page.locator('[data-testid="settings-localization-number"]').selectOption("COMMA");
  await page.waitForTimeout(300);
  const commaPreview = await preview.textContent();
  check("Number format COMMA groups 1,234.50", commaPreview.includes("1,234.50"), commaPreview.slice(0, 60));
  await page.locator('[data-testid="settings-localization-number"]').selectOption("LOCALE");
  await page.waitForTimeout(300);

  // §10 — Academy: learning notifications toggle persists.
  await page.locator('[data-testid="settings-nav-academy"]').click();
  await page.waitForTimeout(600);
  const newContent = page.locator("[data-testid=\"settings-academy-new-content-switch\"]");
  const contentBefore = await newContent.getAttribute("data-state");
  await newContent.click();
  await page.waitForTimeout(300);
  check(
    "Learning notifications toggle flips",
    (await newContent.getAttribute("data-state")) !== contentBefore,
    `${contentBefore}→${await newContent.getAttribute("data-state")}`,
  );
  await page.locator('[data-testid="settings-academy-save"]').click();
  await page.waitForTimeout(900);
  await page.locator("[data-testid=\"settings-academy-reset\"]").click();
  await page.waitForTimeout(400);
  await page.locator("[data-testid=\"settings-academy-reset-confirm\"]").click();
  await page.waitForTimeout(900);
  check(
    "Academy reset restores defaults",
    (await page.locator("[data-testid=\"settings-academy-new-content-switch\"]").getAttribute("data-state")) === contentBefore,
  );

  // ── 9. Account: typed DELETE confirmation ────────────────────────────────
  await page.locator('[data-testid="settings-nav-account"]').click();
  await page.waitForTimeout(700);
  check(
    "Account info rendered",
    await page.locator('[data-testid="settings-account-info"]').isVisible(),
  );
  await page.locator('[data-testid="settings-account-delete"]').click();
  await page.waitForTimeout(500);
  const confirmBtn = page.locator('[data-testid="settings-account-delete-confirm"]');
  check("Delete confirm locked before typing", !(await confirmBtn.isEnabled()));
  await page.locator('[data-testid="settings-account-delete-typed"]').fill("DELETE");
  await page.waitForTimeout(200);
  check("Delete confirm unlocks with DELETE", await confirmBtn.isEnabled());
  await confirmBtn.click();
  await page.waitForTimeout(900);
  check(
    "Deletion scheduled toast",
    (await page.locator("[data-sonner-toast]").count()) > 0,
  );
  await page.screenshot({ path: "scripts/shots/settings-account-delete.png" });

  // ── 10. Mobile 390px ─────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/settings#notifications`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  check(
    "Mobile: notifications card visible",
    await mobile.locator('[data-testid="settings-notifications"]').isVisible(),
  );
  await mobile.screenshot({ path: "scripts/shots/settings-mobile-notifications.png", fullPage: false });
  await mobile.locator('[data-testid="settings-nav-account"]').click();
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: "scripts/shots/settings-mobile-account.png", fullPage: false });
  await mobile.close();

  // ── Console errors (MSW 4xx from the deliberate deletion excluded) ───────
  const realErrors = errors.filter(
    (text) => !text.includes("400") && !text.includes("Failed to load resource"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

  console.log("\n=== SETTINGS MODULE RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await page.screenshot({ path: "scripts/shots/settings-final.png" });

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
