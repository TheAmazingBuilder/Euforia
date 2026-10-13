/**
 * Verify — i18n migration of the SETTINGS module (view shell + cards) and the
 * full ANALYTICS module (view shell, filters, overview/performance/risk,
 * dimensions panels, behavior panels incl. A/B comparator, strategy table and
 * the quarterly report dialog).
 *
 * Covers:
 *   A. Settings EN baseline (sidebar SPA nav): h1, subtitle, search placeholder,
 *      rail aria + EN category labels; search still filters localized labels.
 *   B. Header switch EN → FR: SPA-only (probe preserved), <html lang>=fr.
 *   C. Settings FR: "Paramètres", subtitle, search placeholder, rail labels
 *      (Profil / Risque / Apparence / Localisation / Compte), Localization card
 *      title + preview aria in FR, Profile card FR.
 *   D. Persistence: one reload → Settings still FR (localStorage mirror).
 *   E. Analytics FR (sidebar SPA nav): tabs FR, overview KPI band FR, strategy
 *      tab FR ("Performance par stratégie" + Comparateur A/B), reports tab FR,
 *      quarterly report dialog FR (title + print button + sheet header).
 *   F. Risk tab FR (drawdowns + planned R:R titles).
 *   G. Restore EN via the header — analytics "Overview" + settings back to EN.
 *   H. Console/network cleanliness (no unexpected 4xx, no page errors).
 *
 * SPA-only after the initial entry (sidebar clicks; ONE reload allowed for
 * persistence — the mock jar persists server-side state across reloads).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-settings-analytics";

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

  // ══ Entry: login (default EN) ═════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate(() => { window.__spaProbe = "settings-analytics-i18n"; });
  await page.waitForTimeout(800);

  // ══ A. Settings EN baseline (sidebar SPA navigation) ══════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.locator('[data-testid="settings-search"]').waitFor({ state: "visible", timeout: 15_000 });

  const h1 = await page.locator("h1").first().innerText();
  check("A1 Settings h1 = 'Settings' (EN)", /Settings/.test(h1), h1.trim());
  const subtitle = await page.locator("h1 + p").first().innerText();
  check("A2 Subtitle EN", /Tune Cosmoz/.test(subtitle));
  const placeholder = await page.locator('[data-testid="settings-search"]').getAttribute("placeholder");
  check("A3 Search placeholder EN", /Search settings/.test(placeholder ?? ""), placeholder ?? "");
  const navAria = await page.locator("nav[aria-label='Settings categories']").count();
  check("A4 Rail nav aria-label 'Settings categories'", navAria === 1);
  const railLabels = await page.locator("nav[aria-label='Settings categories'] button").allInnerTexts();
  check("A5 Rail EN labels (Profile/Risk/Appearance/Localization/Account)",
    /Profile/.test(railLabels.join("|")) && /Risk/.test(railLabels.join("|")) &&
    /Appearance/.test(railLabels.join("|")) && /Localization/.test(railLabels.join("|")) &&
    /Account/.test(railLabels.join("|")));
  await page.locator('[data-testid="settings-search"]').fill("appearance");
  await page.waitForTimeout(300);
  const filteredEn = await page.locator("nav[aria-label='Settings categories'] button").allInnerTexts();
  check("A6 Search filters on EN labels ('appearance' → Appearance only)",
    filteredEn.length === 1 && /Appearance/.test(filteredEn[0]), filteredEn.join(","));
  await page.locator('[data-testid="settings-search"]').fill("");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/settings-en.png`, fullPage: false });

  // ══ B. Header switch EN → FR (SPA-only) ═══════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-fr"]').click();
  await page.waitForTimeout(600);
  check("B1 <html lang> = fr", (await htmlLang()) === "fr");
  check("B2 SPA probe preserved (no reload)",
    (await page.evaluate(() => window.__spaProbe)) === "settings-analytics-i18n");

  // ══ C. Settings FR ════════════════════════════════════════════════════════
  const h1Fr = await page.locator("h1").first().innerText();
  check("C1 Settings h1 = 'Paramètres'", /Paramètres/.test(h1Fr), h1Fr.trim());
  const subtitleFr = await page.locator("h1 + p").first().innerText();
  check("C2 Subtitle FR (vouvoiement)", /Réglez Cosmoz/.test(subtitleFr), subtitleFr.trim());
  const placeholderFr = await page.locator('[data-testid="settings-search"]').getAttribute("placeholder");
  check("C3 Search placeholder FR", /Rechercher dans les paramètres/.test(placeholderFr ?? ""), placeholderFr ?? "");
  const railFr = await page.locator("nav[aria-label='Catégories des paramètres'] button").allInnerTexts();
  const railJoined = railFr.join("|");
  check("C4 Rail FR labels (Profil/Risque/Apparence/Localisation/Compte)",
    /Profil/.test(railJoined) && /Risque/.test(railJoined) && /Apparence/.test(railJoined) &&
    /Localisation/.test(railJoined) && /Compte/.test(railJoined), railJoined.slice(0, 90));
  // Localization card in FR (rail click → card title + preview aria)
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.locator('[data-testid="settings-localization-preview"]').waitFor({ state: "visible", timeout: 10_000 });
  const previewAria = await page.locator('[data-testid="settings-localization-preview"]').getAttribute("aria-label");
  check("C5 Localization preview aria FR", /Aperçu du format/.test(previewAria ?? ""), previewAria ?? "");
  // Search now filters on LOCALIZED labels ('risque' → Risque)
  await page.locator('[data-testid="settings-search"]').fill("risque");
  await page.waitForTimeout(300);
  const filteredFr = await page.locator("nav[aria-label='Catégories des paramètres'] button").allInnerTexts();
  check("C6 Search filters on FR labels ('risque' → Risque only)",
    filteredFr.length === 1 && /Risque/.test(filteredFr[0]), filteredFr.join(","));
  await page.locator('[data-testid="settings-search"]').fill("");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/settings-fr.png`, fullPage: false });

  // ══ D. Persistence: ONE reload → still FR ═════════════════════════════════
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="settings-search"]').waitFor({ state: "visible", timeout: 20_000 });
  const h1AfterReload = await page.locator("h1").first().innerText();
  check("D1 After reload still 'Paramètres' (mirror persistence)", /Paramètres/.test(h1AfterReload), h1AfterReload.trim());
  check("D2 <html lang> still fr after reload", (await htmlLang()) === "fr");
  // New probe for the POST-RELOAD document (the original one died with the reload).
  await page.evaluate(() => { window.__spaProbe = "post-reload-spa"; });

  // ══ E. Analytics FR (sidebar SPA navigation) ══════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/analytics"]').click();
  await page.locator('[data-testid="analytics-tab-overview"]').waitFor({ state: "visible", timeout: 20_000 });
  check("E1 <html lang> fr on analytics (SPA nav)", (await htmlLang()) === "fr");

  const tabTexts = await page.locator('[role="tab"]').allInnerTexts();
  const tabsJoined = tabTexts.join("|");
  check("E2 Tabs FR (Vue d'ensemble/Stratégie/Rapports)",
    /Vue d'ensemble/.test(tabsJoined) && /Stratégie/.test(tabsJoined) && /Rapports/.test(tabsJoined), tabsJoined.slice(0, 100));

  // Overview KPI band in FR
  const overviewText = await page.locator('[data-testid="analytics-tab-overview"]').innerText();
  check("E3 Overview KPI FR (P&L net, Taux de réussite, Facteur de profit)",
    /P&L net/i.test(overviewText) && /Taux de réussite/i.test(overviewText) && /Facteur de profit/i.test(overviewText));
  check("E4 Overview cards FR (Courbe d'équité / R cumulé)", /Courbe d'équité/.test(overviewText) && /R cumulé/.test(overviewText));
  await page.screenshot({ path: `${SHOTS}/analytics-overview-fr.png`, fullPage: false });

  // Performance tab FR
  await page.getByRole("tab", { name: "Performance", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-performance"]').waitFor({ state: "visible", timeout: 10_000 });
  const perfText = await page.locator('[data-testid="analytics-tab-performance"]').innerText();
  check("E5 Performance FR (Distribution des multiples de R + Meilleur/Pire)",
    /Distribution des multiples de R/i.test(perfText) && /Meilleur/i.test(perfText) && /Pire/i.test(perfText));

  // Risk tab FR
  await page.getByRole("tab", { name: "Risque", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-risk"]').waitFor({ state: "visible", timeout: 10_000 });
  const riskText = await page.locator('[data-testid="analytics-tab-risk"]').innerText();
  check("E6 Risk FR (Périodes de drawdown / R:R planifié vs R réalisé)",
    /Périodes de drawdown/.test(riskText) && /R:R planifié vs R réalisé/.test(riskText));

  // Strategy tab FR + A/B comparator FR
  await page.getByRole("tab", { name: "Stratégie", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-strategy"]').waitFor({ state: "visible", timeout: 10_000 });
  const stratText = await page.locator('[data-testid="analytics-tab-strategy"]').innerText();
  check("E7 Strategy FR (Performance par stratégie + Comparateur A/B)",
    /Performance par stratégie/.test(stratText) && /Comparateur A\/B/.test(stratText));
  check("E8 Strategy headers FR (Stratégie, Taux de réussite)",
    /Taux de réussite/.test(stratText) && /Espérance/.test(stratText));
  await page.screenshot({ path: `${SHOTS}/analytics-strategy-fr.png`, fullPage: false });

  // Quality tab FR
  await page.getByRole("tab", { name: "Qualité de trade", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-quality"]').waitFor({ state: "visible", timeout: 10_000 });
  const qualText = await page.locator('[data-testid="analytics-tab-quality"]').innerText();
  check("E9 Quality FR (Plan suivi)", /Plan suivi/i.test(qualText));

  // Mistakes tab FR
  await page.getByRole("tab", { name: "Erreurs", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-mistakes"]').waitFor({ state: "visible", timeout: 10_000 });
  const mistText = await page.locator('[data-testid="analytics-tab-mistakes"]').innerText();
  check("E10 Mistakes FR (Coût des erreurs)", /Coût des erreurs/.test(mistText));

  // Events tab FR
  await page.getByRole("tab", { name: "Événements", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-events"]').waitFor({ state: "visible", timeout: 10_000 });
  const evtText = await page.locator('[data-testid="analytics-tab-events"]').innerText();
  check("E11 Events FR (Phase autour des publications)", /Phase autour des publications/.test(evtText));

  // Advanced tab FR
  await page.getByRole("tab", { name: "Avancé", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-advanced"]').waitFor({ state: "visible", timeout: 10_000 });
  const advText = await page.locator('[data-testid="analytics-tab-advanced"]').innerText();
  check("E12 Advanced FR (Profil de la distribution de R / Séries)", /Profil de la distribution de R/.test(advText) && /Séries/.test(advText));

  // Reports tab FR + quarterly report dialog FR
  await page.getByRole("tab", { name: "Rapports", exact: true }).click();
  await page.locator('[data-testid="analytics-tab-reports"]').waitFor({ state: "visible", timeout: 10_000 });
  const repText = await page.locator('[data-testid="analytics-tab-reports"]').innerText();
  check("E13 Reports FR (Rapports par période + PDF trimestriel + jour/semaine/mois)",
    /Rapports par période/.test(repText) && /PDF trimestriel/.test(repText) &&
    /jour/i.test(repText) && /semaine/i.test(repText) && /mois/i.test(repText));
  await page.locator('[data-testid="quarterly-report-open"]').click();
  await page.locator('[data-testid="quarterly-report-dialog"]').waitFor({ state: "visible", timeout: 10_000 });
  const dlgText = await page.locator('[data-testid="quarterly-report-dialog"]').innerText();
  check("E14 Quarterly dialog FR (title + Imprimer / Enregistrer en PDF + Aperçu du trade sheet header)",
    /Rapport trimestriel/.test(dlgText) && /Imprimer \/ Enregistrer en PDF/.test(dlgText) &&
    /Rapport de trading trimestriel/.test(dlgText));
  await page.screenshot({ path: `${SHOTS}/quarterly-report-fr.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ══ F. Restore EN via the header (write-through) ══════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-selector-panel"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-en"]').click();
  await page.waitForTimeout(600);
  check("F1 <html lang> back to en", (await htmlLang()) === "en");
  const tabsEn = (await page.locator('[role="tab"]').allInnerTexts()).join("|");
  check("F2 Analytics tabs back to EN (Overview)", /Overview/.test(tabsEn), tabsEn.slice(0, 60));
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.locator('[data-testid="settings-search"]').waitFor({ state: "visible", timeout: 15_000 });
  const h1EnBack = await page.locator("h1").first().innerText();
  check("F3 Settings back to 'Settings' (EN)", /Settings/.test(h1EnBack), h1EnBack.trim());
  check("F4 SPA-only flow after reload (post-reload probe preserved)",
    (await page.evaluate(() => window.__spaProbe)) === "post-reload-spa");

  // ══ G. Cleanliness ════════════════════════════════════════════════════════
  check("G1 No unexpected 4xx/page errors", errors.length === 0, errors.slice(0, 3).join(" ; "));

  await browser.close();
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n═══ ${results.length - failed.length}/${results.length} PASS ═══`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach((f) => console.log("  " + f));
    process.exit(1);
  }
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
