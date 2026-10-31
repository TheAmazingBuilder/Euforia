/**
 * Verify - i18n migration of the PLAYBOOK module (view shell, all 7 tab
 * panels, dialogs, enum label maps, underperforming banner).
 *
 * Covers:
 *   A. Playbook EN baseline (sidebar SPA nav): h1, subtitle, 7 tab labels,
 *      "New Strategy" button, overview quick actions + count tiles.
 *   B. Header switch EN → FR: SPA-only (probe preserved), <html lang>=fr.
 *   C. Playbook FR: subtitle, 7 tab labels FR, "Nouvelle stratégie".
 *   D. Tab walk in FR (tab triggers clicked, no reload):
 *      strategies tab (search placeholder, "Toutes" filter, API-data names
 *      untouched, FR status badge), setups / rules / checklists (FR empty
 *      state or FR panel), performance (FR table headers or empty state),
 *      templates (FR intro).
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
const SHOTS = "/home/z/my-project/scripts/shots/i18n-playbook";

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
  page.on("response", (resp) => {
    if (/\/api\//.test(resp.url())) console.log(`  [api] ${resp.status()} ${resp.url().replace(BASE, "")}`);
  });

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
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
    console.error("LOGIN STUCK - body snippet:", (await page.locator("body").innerText()).slice(0, 400));
    console.error("CAPTURED ERRORS:", errors.join(" ; ") || "none");
    throw e;
  }
  await page.evaluate(() => { window.__spaProbe = "playbook-i18n"; });
  await page.waitForTimeout(800);

  // ══ A. Playbook EN baseline (sidebar SPA navigation) ══════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.locator('button[data-testid="tab-overview"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);

  const h1 = await page.locator("h1").first().innerText();
  check("A1 Playbook h1 = 'Playbook' (EN)", /^Playbook$/.test(h1.trim()), h1.trim());
  const subtitle = await page.locator("h1 + p").first().innerText();
  check("A2 Subtitle EN", /Your operational trading system/.test(subtitle), subtitle.slice(0, 60));
  const tabsEn = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  const wantEn = ["Overview", "My Strategies", "Setups", "Rules", "Checklists", "Performance", "Templates"];
  check("A3 7 tabs EN", wantEn.every((t) => tabsEn.some((x) => x.trim() === t)), tabsEn.join("|"));
  const newBtn = await page.getByRole("button", { name: "New Strategy" }).count();
  check("A4 'New Strategy' button", newBtn >= 1);
  const overviewEn = await bodyText();
  check("A5 Overview quick actions EN", /Create Strategy/.test(overviewEn) && /Create Setup/.test(overviewEn));
  check("A6 Overview count tiles EN", /total strategies/i.test(overviewEn));
  check("A6b Overview compliance band EN", /played it as declared|Conform|compliance/i.test(overviewEn));
  await page.screenshot({ path: `${SHOTS}/playbook-en-overview.png`, fullPage: false });

  // ══ B. Header switch EN → FR (SPA-only) ═══════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-fr"]').click();
  await page.waitForTimeout(700);
  check("B1 <html lang> = fr", (await htmlLang()) === "fr");
  check("B2 SPA probe preserved (no reload)",
    (await page.evaluate(() => window.__spaProbe)) === "playbook-i18n");

  // ══ C. Playbook FR (same SPA page, no navigation) ═════════════════════════
  const subtitleFr = await page.locator("h1 + p").first().innerText();
  check("C1 Subtitle FR", /Votre système de trading opérationnel/.test(subtitleFr), subtitleFr.slice(0, 60));
  const tabsFr = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  const wantFr = ["Vue d'ensemble", "Mes stratégies", "Setups", "Règles", "Checklists", "Performance", "Modèles"];
  check("C2 7 tabs FR", wantFr.every((t) => tabsFr.some((x) => x.trim() === t)), tabsFr.join("|"));
  const newBtnFr = await page.getByRole("button", { name: "Nouvelle stratégie" }).count();
  check("C3 'Nouvelle stratégie' button", newBtnFr >= 1);
  const overviewFr = await bodyText();
  check("C4 Overview quick actions FR", /Créer une stratégie/.test(overviewFr) && /Créer un setup/.test(overviewFr));
  check("C5 Overview count tiles FR", /stratégies au total/i.test(overviewFr));
  check("C6 Underperforming banner FR", /Stratégie sous-performante détectée/.test(overviewFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-overview.png`, fullPage: false });

  // ══ D. Tab walk in FR (SPA tab clicks) ════════════════════════════════════
  // D1 - My Strategies
  await page.locator('button[data-testid="tab-strategies"]').click();
  await page.waitForTimeout(700);
  const stratFr = await bodyText();
  check("D1a Strategies search placeholder FR",
    (await page.locator('input[placeholder*="Rechercher"]').count()) >= 1);
  check("D1b 'Toutes' filter FR", /Toutes/.test(stratFr));
  check("D1c API-data strategy names untouched", /Breakout NY/.test(stratFr) || /Votre playbook est vide/.test(stratFr));
  check("D1d FR status badge (Active/En pause/Brouillon)",
    /Active|En pause|Brouillon/.test(stratFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-strategies.png`, fullPage: false });

  // D2 - Setups
  await page.locator('button[data-testid="tab-setups"]').click();
  await page.waitForTimeout(700);
  const setupsFr = await bodyText();
  check("D2 Setups FR (rows or empty state)",
    /Breakout \+ Retest|Aucun setup pour l'instant/.test(setupsFr));
  check("D2b FR market-condition labels visible",
    /Tendance|En range|Forte volatilité|Structure haussière/.test(setupsFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-setups.png`, fullPage: false });

  // D3 - Rules
  await page.locator('button[data-testid="tab-rules"]').click();
  await page.waitForTimeout(700);
  const rulesFr = await bodyText();
  check("D3 Rules FR (intro + button + global section)",
    /Nouvelle règle/.test(rulesFr) && /Règles globales/.test(rulesFr));
  check("D3b FR rule-category chips", /Comportement|Risque|Actualités/.test(rulesFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-rules.png`, fullPage: false });

  // D4 - Checklists
  await page.locator('button[data-testid="tab-checklists"]').click();
  await page.waitForTimeout(700);
  const checkFr = await bodyText();
  check("D4 Checklists FR (intro + button + items)",
    /Nouvelle checklist/.test(checkFr) && /éléments/.test(checkFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-checklists.png`, fullPage: false });

  // D5 - Performance
  await page.locator('button[data-testid="tab-performance"]').click();
  await page.waitForTimeout(900);
  const perfFr = await bodyText();
  check("D5 Performance FR (headers or empty state)",
    /taux de réussite/i.test(perfFr) || /Pas encore de performance playbook/.test(perfFr));
  check("D5b Performance th 'Stratégie'", /Stratégie/i.test(perfFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-performance.png`, fullPage: false });

  // D6 - Templates
  await page.locator('button[data-testid="tab-templates"]').click();
  await page.waitForTimeout(900);
  const tplFr = await bodyText();
  check("D6 Templates intro FR", /Dix structures classiques/.test(tplFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-templates.png`, fullPage: false });

  // D7 - Strategy create dialog (largest migrated file) FR
  await page.locator('button[data-testid="tab-strategies"]').click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Nouvelle stratégie" }).first().click();
  await page.waitForTimeout(700);
  const dialogFr = await page.locator("[role='dialog']").innerText();
  check("D7a Strategy form dialog FR title/desc",
    /Nouvelle stratégie/.test(dialogFr) && /Définissez le setup une fois/.test(dialogFr));
  check("D7b Strategy form FR fields",
    /Nom/.test(dialogFr) && /Statut/.test(dialogFr) && /Non notée/.test(dialogFr));
  await page.screenshot({ path: `${SHOTS}/playbook-fr-strategy-form.png`, fullPage: false });
  await page.locator("[role='dialog']").press("Escape");
  await page.waitForTimeout(400);

  // ══ E. Persistence: ONE reload → still FR ═════════════════════════════════
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('button[data-testid="tab-overview"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(600);
  check("E1 <html lang> still fr after reload", (await htmlLang()) === "fr");
  const subAfterReload = await page.locator("h1 + p").first().innerText();
  check("E2 Subtitle still FR after reload", /Votre système de trading opérationnel/.test(subAfterReload));

  // ══ F. Restore EN via the header ══════════════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-en"]').click();
  await page.waitForTimeout(700);
  check("F1 <html lang> = en", (await htmlLang()) === "en");
  const tabsEn2 = await page.locator("[role='tablist'] [role='tab']").allInnerTexts();
  check("F2 Tabs back to EN", /Overview/.test(tabsEn2.join("|")) && /My Strategies/.test(tabsEn2.join("|")));

  // ══ G. Console/network cleanliness ════════════════════════════════════════
  check("G1 No unexpected 4xx / page errors", errors.length === 0, errors.slice(0, 3).join(" ; "));

  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS - ${SHOTS}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(2);
});
