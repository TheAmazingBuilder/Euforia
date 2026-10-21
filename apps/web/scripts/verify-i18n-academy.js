/**
 * Verify — i18n migration of the ACADEMY module (view shell, all 6 tab
 * panels, lesson/blocks chrome, flashcards, scenario player, drills,
 * progress arcs, bookmarks, glossary chrome).
 *
 * Covers:
 *   A. Academy EN baseline (sidebar SPA nav): h1, subtitle, 6 tab labels,
 *      overview "Continue learning" band.
 *   B. Header switch EN → FR: SPA-only (probe preserved), <html lang>=fr.
 *   C. Academy FR: title/subtitle, 6 tab labels FR.
 *   D. Tab walk in FR (tab triggers clicked, no reload):
 *      overview (continue band), courses (search + filters), practice
 *      (ledger), progress (arcs), glossary (search), bookmarks (empty
 *      state CTA), plus flashcards/scenario chrome inside practice tab.
 *   E. Persistence: ONE reload → still FR (localStorage mirror).
 *   F. Restore EN via the header → tabs back to EN.
 *   G. Console/network cleanliness (no unexpected 4xx, no page errors).
 *
 * SPA-only after the initial entry (sidebar clicks; the single reload is
 * allowed only for the persistence check).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-academy";

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
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);
  const bodyText = () => page.locator("body").innerText();

  // ══ Entry: login (default EN) ═════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  try {
    await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  } catch (e) {
    await page.screenshot({ path: `${SHOTS}/debug-login-stuck.png`, fullPage: true });
    console.error("LOGIN STUCK — body snippet:", (await page.locator("body").innerText()).slice(0, 400));
    console.error("CAPTURED ERRORS:", errors.join(" ; ") || "none");
    throw e;
  }
  await page.evaluate(() => { window.__spaProbe = "academy-i18n"; });
  await page.waitForTimeout(800);

  // ══ A. Academy EN baseline (sidebar SPA navigation) ═══════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/academy"]').click();
  await page.locator('[data-testid="academy-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);

  const h1 = await page.locator("h1").first().innerText();
  check("A1 Academy h1 = 'Academy' (EN)", /^Academy$/.test(h1.trim()), h1.trim());
  const subtitle = await page.locator("h1 + p").first().innerText();
  check("A2 Subtitle EN", /Learn → practice → trade → journal/.test(subtitle), subtitle.slice(0, 60));
  const tabsEn = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  const wantEn = ["Overview", "Courses", "Practice", "Progress", "Glossary", "Bookmarks"];
  check("A3 6 tabs EN", wantEn.every((t) => tabsEn.some((x) => x.trim() === t)), tabsEn.join("|"));
  const overviewEn = await bodyText();
  check("A4 Overview continue-learning band EN", /continue learning/i.test(overviewEn));
  await page.screenshot({ path: `${SHOTS}/academy-en-overview.png`, fullPage: false });

  // ══ B. Header switch EN → FR (SPA-only) ═══════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-fr"]').click();
  await page.waitForTimeout(700);
  check("B1 <html lang> = fr", (await htmlLang()) === "fr");
  check("B2 SPA probe preserved (no reload)",
    (await page.evaluate(() => window.__spaProbe)) === "academy-i18n");

  // ══ C. Academy FR (same SPA page, no navigation) ══════════════════════════
  const h1Fr = await page.locator("h1").first().innerText();
  check("C1 h1 FR = 'Académie'", /^Académie$/.test(h1Fr.trim()), h1Fr.trim());
  const subtitleFr = await page.locator("h1 + p").first().innerText();
  check("C2 Subtitle FR", /Apprendre → pratiquer → trader/.test(subtitleFr), subtitleFr.slice(0, 60));
  const tabsFr = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  const wantFr = ["Vue d'ensemble", "Cours", "Entraînement", "Progression", "Glossaire", "Favoris"];
  check("C3 6 tabs FR", wantFr.every((t) => tabsFr.some((x) => x.trim() === t)), tabsFr.join("|"));
  const overviewFr = await bodyText();
  check("C4 Overview continue band FR", /continuer l'apprentissage/i.test(overviewFr));
  await page.screenshot({ path: `${SHOTS}/academy-fr-overview.png`, fullPage: false });

  // ══ D. Tab walk in FR (SPA tab clicks) ════════════════════════════════════
  // D1 — Cours
  await page.locator('button[data-testid="academy-tab-courses"]').click();
  await page.waitForTimeout(900);
  const coursesFr = await bodyText();
  check("D1 Courses FR (search + category filter)",
    (await page.locator('input[placeholder*="Rechercher cours"]').count()) >= 1 &&
    /Toutes les catégories/.test(coursesFr));
  await page.screenshot({ path: `${SHOTS}/academy-fr-courses.png`, fullPage: false });

  // D2 — Entraînement (flashcards + scenario player live here)
  await page.locator('button[data-testid="academy-tab-practice"]').click();
  await page.waitForTimeout(900);
  const practiceFr = await bodyText();
  check("D2 Practice FR (ledger + flashcards chrome)",
    /Registre d'entraînement/.test(practiceFr) &&
    (/Révision quotidienne — fiches/.test(practiceFr) || /Lecteur de scénarios/.test(practiceFr)));
  await page.screenshot({ path: `${SHOTS}/academy-fr-practice.png`, fullPage: false });

  // D3 — Progression
  await page.locator('button[data-testid="academy-tab-progress"]').click();
  await page.waitForTimeout(900);
  const progressFr = await bodyText();
  check("D3 Progress FR (global ring + arcs note)",
    /Progression globale/.test(progressFr) || /Chaque arc est un parcours/.test(progressFr));
  await page.screenshot({ path: `${SHOTS}/academy-fr-progress.png`, fullPage: false });

  // D4 — Glossaire
  await page.locator('button[data-testid="academy-tab-glossary"]').click();
  await page.waitForTimeout(900);
  const glossaryFr = await bodyText();
  check("D4 Glossary FR (search placeholder)",
    (await page.locator('input[placeholder*="Rechercher dans le vocabulaire"]').count()) >= 1);
  check("D4b Glossary FR layered note", /définitions en couches/.test(glossaryFr));
  await page.screenshot({ path: `${SHOTS}/academy-fr-glossary.png`, fullPage: false });

  // D5 — Favoris (empty state expected on a fresh account)
  await page.locator('button[data-testid="academy-tab-bookmarks"]').click();
  await page.waitForTimeout(900);
  const bookmarksFr = await bodyText();
  check("D5 Bookmarks FR (empty state + CTAs)",
    /Rien aux favoris pour l'instant/.test(bookmarksFr) &&
    /Parcourir les cours/.test(bookmarksFr) && /Ouvrir le glossaire/.test(bookmarksFr));
  await page.screenshot({ path: `${SHOTS}/academy-fr-bookmarks.png`, fullPage: false });

  // ══ E. Persistence: ONE reload → still FR ═════════════════════════════════
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="academy-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  check("E1 <html lang> still fr after reload", (await htmlLang()) === "fr");
  const subAfterReload = await page.locator("h1 + p").first().innerText();
  check("E2 Subtitle still FR after reload", /Apprendre → pratiquer → trader/.test(subAfterReload));

  // ══ F. Restore EN via the header ══════════════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-en"]').click();
  await page.waitForTimeout(700);
  check("F1 <html lang> = en", (await htmlLang()) === "en");
  const tabsEn2 = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  check("F2 Tabs back to EN", /Overview/.test(tabsEn2.join("|")) && /Glossary/.test(tabsEn2.join("|")));

  // ══ G. Console/network cleanliness ════════════════════════════════════════
  check("G1 No unexpected 4xx / page errors", errors.length === 0, errors.slice(0, 3).join(" ; "));

  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS — ${SHOTS}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(2);
});
