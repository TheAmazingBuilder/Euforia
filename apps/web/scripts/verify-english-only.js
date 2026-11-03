/**
 * Verify - English-only mode (language switching retired).
 *
 * The FR pack, the header LanguageSelector, LocaleServerSync and the
 * Settings language row were REMOVED. The dict.* consumption pattern stays
 * (components still read strings through useI18n → dict).
 *
 * Covers:
 *   A. Stale-FR boot: localStorage mirror seeded to "fr" BEFORE load →
 *      app still boots EN (<html lang>=en), header has NO language trigger.
 *   B. Playbook (sidebar SPA nav): EN h1/subtitle/tabs/New Strategy.
 *   C. Academy (sidebar SPA nav): EN h1/subtitle/tabs.
 *   D. Settings → Localization card: language select GONE, timezone +
 *      format rows still present.
 *   E. Persistence: one reload → still EN everywhere.
 *   F. Console/network cleanliness (no unexpected 4xx, no page errors).
 *
 * SPA-only after the initial entry (sidebar clicks; ONE reload allowed).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/english-only";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Simulate a user whose localStorage still carries the retired FR choice -
  // the app must ignore it and boot EN (mirror rejected / ignored).
  await page.addInitScript(() => {
    try { window.localStorage.setItem("cosmoz:i18n:locale", "fr"); } catch {}
  });

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
  const bodyText = () => page.locator("body").innerText();

  // ══ Entry: login (EN, stale "fr" mirror seeded) ═══════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  try {
    await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  } catch (e) {
    await page.screenshot({ path: `${SHOTS}/debug-login-stuck.png`, fullPage: true });
    console.error("LOGIN STUCK - body snippet:", (await page.locator("body").innerText()).slice(0, 400));
    console.error("CAPTURED ERRORS:", errors.join(" ; ") || "none");
    throw e;
  }
  await page.evaluate(() => { window.__spaProbe = "english-only"; });
  await page.waitForTimeout(800);

  // ══ A. Header - selector removed, EN pinned, stale mirror ignored ═════════
  check("A1 <html lang> = en despite stale 'fr' mirror", (await htmlLang()) === "en");
  check("A2 No language-selector-trigger in header",
    (await page.locator('[data-testid="language-selector-trigger"]').count()) === 0);
  check("A3 No FR strings on shell (sidebar stays EN)",
    !/Tableau de bord|Paramètres/.test(await bodyText()));
  await page.screenshot({ path: `${SHOTS}/shell-en.png`, fullPage: false });

  // ══ B. Playbook EN (sidebar SPA navigation) ═══════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.locator('button[data-testid="tab-overview"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  const pbSubtitle = await page.locator("h1 + p").first().innerText();
  check("B1 Playbook subtitle EN", /Your operational trading system/.test(pbSubtitle), pbSubtitle.slice(0, 50));
  const pbTabs = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  check("B2 Playbook tabs EN", /Overview/.test(pbTabs.join("|")) && /My Strategies/.test(pbTabs.join("|")));
  check("B3 'New Strategy' button EN", (await page.getByRole("button", { name: "New Strategy" }).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/playbook-en.png`, fullPage: false });

  // ══ C. Academy EN (sidebar SPA navigation) ════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/academy"]').click();
  await page.locator('[data-testid="academy-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  const acH1 = await page.locator("h1").first().innerText();
  check("C1 Academy h1 = 'Academy'", /^Academy$/.test(acH1.trim()), acH1.trim());
  const acTabs = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  check("C2 Academy tabs EN", /Courses/.test(acTabs.join("|")) && /Glossary/.test(acTabs.join("|")));
  check("C3 No FR leak ('Cours'/'Glossaire' absent)", !/Glossaire|Entraînement/.test(acTabs.join("|")));
  await page.screenshot({ path: `${SHOTS}/academy-en.png`, fullPage: false });

  // ══ D. Settings → Localization card - language row removed ═══════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.locator('[data-testid="settings-search"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.locator('[data-testid="settings-localization-preview"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(400);
  check("D1 Language select REMOVED",
    (await page.locator('[data-testid="settings-localization-language"]').count()) === 0);
  check("D2 Timezone select still present",
    (await page.locator('[data-testid="settings-localization-timezone"]').count()) === 1);
  check("D3 Format rows still present (date/time/decimal/number/currency/week)",
    (await page.locator('[data-testid="settings-localization-date"]').count()) === 1 &&
    (await page.locator('[data-testid="settings-localization-number"]').count()) === 1);
  const settingsText = await bodyText();
  check("D4 No 'Français' option anywhere on the card", !/Français/.test(settingsText));
  await page.screenshot({ path: `${SHOTS}/settings-localization-en.png`, fullPage: false });

  // ══ E. Persistence: ONE reload → still EN ═════════════════════════════════
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  check("E1 <html lang> still en after reload", (await htmlLang()) === "en");
  check("E2 Shell still EN after reload", !/Tableau de bord/.test(await bodyText()));

  // ══ F. Console/network cleanliness ════════════════════════════════════════
  check("F1 No unexpected 4xx / page errors", errors.length === 0, errors.slice(0, 3).join(" ; "));

  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS - ${SHOTS}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(2);
});
