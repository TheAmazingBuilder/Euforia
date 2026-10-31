/**
 * Verify - PREMIUM LanguageSelector (redesigned) + server preference sync.
 *
 * Covers:
 *   A. Premium panel structure: listbox semantics, 2 rich options (native
 *      name + translated subtitle), locale badges, sync-status chip.
 *   B. Header switch EN → FR: instant (no reload), sidebar + <html lang>
 *      + trigger code flip; "just saved" check lands on the trigger.
 *   C. SERVER WRITE-THROUGH: the switch PATCHes /me/preferences/localization
 *      - observable in-SPA on Settings → Localization (select = fr).
 *   D. MULTI-DEVICE RECONCILIATION (LocaleServerSync): mirror wiped (new
 *      device simulation) → boot EN default → account preference (fr)
 *      applied once the preferences document arrives.
 *   E. Keyboard: focus lands on the active option, arrows rove.
 *   F. Restore EN via the header (write-through again) + Settings shows en.
 *   G. Dark-mode panel rendering + console/network cleanliness.
 *
 * SPA-only after the initial entry (sidebar clicks; reloads allowed - the
 * mock jar persists server-side state across reloads, unlike the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-selector-premium";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);

  // ══ Entry: login (default EN) ═════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate(() => { window.__i18nProbe = 42; });
  // Preferences document must have arrived before the sync chip can be trusted.
  await page.waitForTimeout(1200);

  const trigger = page.locator('[data-testid="language-selector-trigger"]');
  const panel = page.locator('[data-testid="language-selector-panel"]');

  // ══ A. Premium panel structure (EN) ═══════════════════════════════════════
  check("A1 Selector visible in topbar", await page.locator('[data-testid="language-selector"]').isVisible());
  await trigger.click();
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  const listbox = panel.locator('[role="listbox"]');
  check("A2 Panel exposes a listbox", (await listbox.count()) === 1);
  const options = panel.locator('[role="option"]');
  check("A3 Two options (en/fr)", (await options.count()) === 2);
  check("A4 Native names (English / Français)",
    /English/.test(await panel.locator('[data-testid="language-option-en"]').innerText()) &&
    /Français/.test(await panel.locator('[data-testid="language-option-fr"]').innerText()));
  check("A5 EN subtitle translated on-screen", /Interface in English/.test(await panel.locator('[data-testid="language-option-en"]').innerText()));
  const enSelected = await panel.locator('[data-testid="language-option-en"]').getAttribute("aria-selected");
  check("A6 aria-selected=true on active EN", enSelected === "true");
  const chipState = await page.locator('[data-testid="language-sync-status"]').getAttribute("data-sync-state");
  check("A7 Sync chip reports account state (synced)", chipState === "synced", chipState ?? "missing");
  check("A8 Focus lands on the active option", await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el.dataset.testid === "language-option-en";
  }));
  await page.screenshot({ path: `${SHOTS}/panel-en-open.png` });

  // ══ B. Header switch EN → FR (instant, no reload) ═════════════════════════
  // Arrow-key roving focus: EN (active) → ArrowDown → FR, then Enter.
  await page.keyboard.press("ArrowDown");
  check("B0 ArrowDown roves focus to FR option", await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el.dataset.testid === "language-option-fr";
  }));
  await page.keyboard.press("Enter");
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Tableau de bord" })
    .waitFor({ timeout: 10_000 });
  check("B1 Sidebar flips to FR instantly", true);
  check("B2 <html lang> = fr", (await htmlLang()) === "fr", await htmlLang());
  check("B3 NO reload (SPA probe intact)", (await page.evaluate(() => window.__i18nProbe)) === 42);
  const triggerCode = await trigger.locator("span.font-mono").innerText();
  check("B4 Trigger code flips to FR", triggerCode.trim().toUpperCase() === "FR", triggerCode.trim());
  // "Just saved" check lands on the trigger after the PATCH resolves.
  let justSaved = true;
  try {
    await trigger.locator("svg.lucide-check").waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    justSaved = false;
  }
  check("B5 Trigger flashes the saved check (write-through ok)", justSaved);
  await page.screenshot({ path: `${SHOTS}/shell-fr-after-switch.png` });

  // ══ C. Panel in FR (translated subtitles + synced chip) ═══════════════════
  await trigger.click();
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  const frSelected = await panel.locator('[data-testid="language-option-fr"]').getAttribute("aria-selected");
  check("C1 FR option aria-selected=true", frSelected === "true");
  check("C2 Subtitles render in the active language", /Interface en anglais/.test(await panel.locator('[data-testid="language-option-en"]').innerText()));
  const chipTextFr = await page.locator('[data-testid="language-sync-status"]').innerText();
  check("C3 Sync chip localized («Synchronisé à votre compte»)", /Synchronisé à votre compte/.test(chipTextFr), chipTextFr.trim());
  await page.screenshot({ path: `${SHOTS}/panel-fr-open.png` });
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden", timeout: 5_000 });

  // ══ D. SERVER WRITE-THROUGH - Settings → Localization shows fr ═══════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.waitForURL(/\/settings/, { timeout: 20_000 });
  await page.locator('[data-testid="settings-nav-localization"]').click();
  const languageSelect = page.locator('[data-testid="settings-localization-language"]');
  await languageSelect.waitFor({ state: "visible", timeout: 15_000 });
  // The optimistic cache update must already reflect the header switch.
  const settingsValue = await languageSelect.inputValue();
  check("D1 Settings card reflects the header switch (fr)", settingsValue === "fr", settingsValue);
  await page.screenshot({ path: `${SHOTS}/settings-localization-fr.png` });

  // ══ E. MULTI-DEVICE RECONCILIATION (LocaleServerSync) ═════════════════════
  // Account document says fr. Simulate a NEW device: wipe the boot mirror →
  // reload boots EN (default) → the bridge applies the account language.
  // NOTE: the mocked API is served by a SERVICE WORKER, so Playwright route
  // gating cannot hold the preferences response back. Instead, an init
  // script records the <html lang> TIMELINE from the earliest possible
  // moment - proving the boot started EN before the reconcile flipped it.
  await page.addInitScript(() => {
    window.__langTimeline = [];
    const record = () => {
      const root = document.documentElement;
      if (root && window.__langTimeline) window.__langTimeline.push(root.lang);
    };
    record();
    document.addEventListener("DOMContentLoaded", record);
    window.addEventListener("load", record);
    let frames = 0;
    const timer = window.setInterval(() => {
      record();
      if (++frames > 60) window.clearInterval(timer);
    }, 50);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate(() => window.localStorage.removeItem("cosmoz:i18n:locale"));
  await page.reload({ waitUntil: "domcontentloaded" });
  // The bridge flips the runtime to the ACCOUNT preference once prefs land.
  let reconciled = false;
  try {
    await page
      .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Tableau de bord" })
      .waitFor({ timeout: 10_000 });
    reconciled = true;
  } catch {
    reconciled = false;
  }
  check("E2 Account preference (fr) reconciled onto the new device", reconciled);
  const timeline = await page.evaluate(() => window.__langTimeline);
  check("E1 New-device boot started EN (no mirror)", Array.isArray(timeline) && timeline[0] === "en", JSON.stringify(timeline?.slice(0, 4) ?? null));
  check("E3 <html lang> reconciled to fr", (await htmlLang()) === "fr", await htmlLang());
  await page.screenshot({ path: `${SHOTS}/reconciled-fr.png` });

  // ══ F. Restore EN via the header (write-through again) ════════════════════
  await trigger.click();
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  await panel.locator('[data-testid="language-option-en"]').click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Dashboard" })
    .waitFor({ timeout: 10_000 });
  check("F1 Header switch back to EN (instant)", true);
  check("F2 <html lang> back to en", (await htmlLang()) === "en", await htmlLang());
  // The EN write-through must be visible on Settings too.
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.waitForURL(/\/settings/, { timeout: 20_000 });
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.locator('[data-testid="settings-localization-language"]').waitFor({ state: "visible", timeout: 15_000 });
  const settingsValueEn = await page.locator('[data-testid="settings-localization-language"]').inputValue();
  check("F3 Settings card reflects the EN switch", settingsValueEn === "en", settingsValueEn);

  // ══ G. Dark-mode panel + cleanliness ══════════════════════════════════════
  await page.locator('[data-testid="theme-toggle-button"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  await page.screenshot({ path: `${SHOTS}/panel-dark-open.png` });
  check("G1 Dark-mode panel renders", await panel.isVisible());
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="theme-toggle-button"]').click(); // restore light
  await page.waitForTimeout(300);

  check("G2 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
