/**
 * T56 verify - the restored "right version":
 *   1. No language selector in the topbar (English-only app)
 *   2. New Profile page (hero, achievements, username/bio fields)
 *   3. Academy → Events module renders upcoming sessions
 *   4. Academy → Tasky module renders tasks + add flow
 * Screenshots: /tmp/verify-restored-*.png
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const NOISE = /\/api\/auth\/(me|refresh)\b|\/api\/alerts|\/api\/session-live/;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await ensureLogin(page);

  // ── 1. Topbar: no language selector ────────────────────────────────────
  const langCount = await page.locator('[data-testid*="language"], [aria-label*="anguage"]').count();
  console.log("LANG_SELECTOR_COUNT:", langCount);

  // ── 2. Profile page ────────────────────────────────────────────────────
  await page.goto(BASE + "/profile", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const profileChecks = {
    hero: await page.locator('[data-testid="profile-hero-name"]').isVisible().catch(() => false),
    stats: await page.locator('[data-testid="profile-stats"]').isVisible().catch(() => false),
    achievements: await page.locator('[data-testid="profile-achievements"]').isVisible().catch(() => false),
    username: await page.locator('[data-testid="profile-username"]').isVisible().catch(() => false),
    bio: await page.locator('[data-testid="profile-bio"]').isVisible().catch(() => false),
    save: await page.locator('[data-testid="profile-save"]').isVisible().catch(() => false),
  };
  console.log("PROFILE:", JSON.stringify(profileChecks));
  await page.screenshot({ path: "/tmp/verify-restored-profile.png", fullPage: true });

  // ── 3. Academy → Events ────────────────────────────────────────────────
  await page.goto(BASE + "/academy?tab=events", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const eventsTabVisible = await page.locator('[data-testid="academy-tab-events"]').isVisible().catch(() => false);
  await page.locator('[data-testid="academy-tab-events"]').click().catch(() => {});
  await page.waitForTimeout(900);
  const eventsPanel = await page.locator('[data-testid="academy-events-panel"]').isVisible().catch(() => false);
  const eventCards = await page.locator('[data-testid^="academy-event-evt-"]').count();
  const registerBtn = page.locator('[data-testid^="academy-event-register-"]').first();
  const registerVisible = await registerBtn.isVisible().catch(() => false);
  if (registerVisible) await registerBtn.click();
  await page.waitForTimeout(900);
  console.log("EVENTS:", JSON.stringify({ tab: eventsTabVisible, panel: eventsPanel, cards: eventCards, registerClicked: registerVisible }));
  await page.screenshot({ path: "/tmp/verify-restored-events.png", fullPage: true });

  // ── 4. Academy → Tasky ─────────────────────────────────────────────────
  await page.goto(BASE + "/academy?tab=tasky", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const taskyPanel = await page.locator('[data-testid="academy-tasky-panel"]').isVisible().catch(() => false);
  const taskRows = await page.locator('[data-testid^="academy-task-tsk-"]').count();
  // Add a task end-to-end
  await page.locator('[data-testid="academy-tasky-input"]').fill("Verify the restored Tasky module");
  await page.locator('[data-testid="academy-tasky-add"]').click();
  await page.waitForTimeout(1000);
  const taskRowsAfterAdd = await page.locator('[data-testid^="academy-task-tsk-"]').count();
  // Toggle the first open task
  const firstCheck = page.locator('[data-testid^="academy-task-check-"]').first();
  if (await firstCheck.isVisible().catch(() => false)) {
    await firstCheck.click();
    await page.waitForTimeout(800);
  }
  console.log("TASKY:", JSON.stringify({ panel: taskyPanel, rows: taskRows, rowsAfterAdd: taskRowsAfterAdd }));
  await page.screenshot({ path: "/tmp/verify-restored-tasky.png", fullPage: true });

  // ── 5. Settings localization: no language select ───────────────────────
  await page.goto(BASE + "/settings?category=localization", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const langSelect = await page.locator('[data-testid="settings-localization-language"]').count();
  console.log("SETTINGS_LANGUAGE_SELECT:", langSelect);
  await page.screenshot({ path: "/tmp/verify-restored-settings.png" });

  await browser.close();
  console.log("VERIFY DONE");
})().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  process.exit(1);
});
