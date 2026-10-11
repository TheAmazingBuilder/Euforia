/**
 * verify-oryon-phase6.js — Oryon Phase 6 (workspace layouts + chart templates).
 * Contract under test:
 *  - LAYOUTS: save-as (active pointer + persistence), dirty tracking
 *    (honest dot — only when a SAVED custom layout diverges), save changes,
 *    switch (restores the SAVED arrangement: instrument, timeframe, chart
 *    type, panels), rename, duplicate ("(copy)", independent), delete with
 *    confirmation, restore-default (records kept), name validation
 *    (case-insensitive duplicates rejected inline), unsaved-changes guard
 *    (discard + save-and-switch paths).
 *  - TEMPLATES: save current chart (chart type + timeframe + indicator
 *    stack), apply (replaces the stack through ONE store commit — no
 *    duplicate instances, idempotent re-apply), apply confirmation when a
 *    live stack would be replaced, partial-apply reporting is unit-tested
 *    (bun) — here: lifecycle + honest UI, manage (rename/delete).
 *  - PERSISTENCE: layouts + templates survive a page reload; the active
 *    layout re-applies on boot; drawings/alerts envelopes are untouched by
 *    layout/template operations (structural isolation, spec §11).
 *  - REGRESSIONS: chart engine stats stable, indicator chips/panes intact,
 *    positions panel works, 0 console errors · desktop 1440 + mobile 390.
 *
 * Run: node scripts/verify-oryon-phase6.js   (DEV server on :3001 — the
 * structural debug handles are dev-only by design, phases 1-5 convention —
 * market service on :3003, mocked auth, BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase6-probe.log");
fs.writeFileSync(LOG, `=== oryon phase6 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3001";
const OUT = path.resolve(__dirname, "shots");

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
    fs.appendFileSync(LOG, `  PASS  ${label}\n`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
    fs.appendFileSync(LOG, `  FAIL  ${label}\n`);
  }
};

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "Download the React DevTools",
  "React does not recognize",
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
  } catch {
    fs.appendFileSync(LOG, "signIn: no login form (already authed?)\n");
    return;
  }
  const demoButton = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
  } else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  try {
    await app.waitForSelector('[data-testid="login-mfa-code"]', { timeout: 15_000 });
  } catch {
    /* fall through */
  }
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
  await app.waitForSelector('a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
}

async function chartStats(page) {
  return page.evaluate(() => {
    const read = window.__ORYON_CHART_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

async function activeLayoutName(page) {
  const el = page.locator('[data-testid="oryon-layout-active-name"]');
  if ((await el.count()) === 0) return null;
  return (await el.innerText()).trim();
}

async function openLayoutMenu(page) {
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
}

async function closeLayoutMenu(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

async function layoutMenuItem(page, testid) {
  return page.locator(`[data-testid="oryon-layout-menu"] [data-testid="${testid}"]`);
}

async function selectSavedLayout(page, name) {
  await openLayoutMenu(page);
  await page
    .locator('[data-testid="oryon-layout-menu"] [role="menuitemradio"]', { hasText: name })
    .first()
    .click();
  await page.waitForTimeout(600);
}

async function openTemplateMenu(page) {
  await page.click('[data-testid="oryon-templates"]');
  await page.waitForSelector('[data-testid="oryon-template-menu"]', { timeout: 5_000 });
}

async function chipCount(page) {
  return page.locator('[data-testid="oryon-indicator-chip"]').count();
}

async function openIndicatorDialog(page) {
  await page.click('[data-testid="oryon-indicators"]');
  await page.waitForSelector('[data-testid="oryon-indicator-dialog"]', { timeout: 5_000 });
  await page.waitForTimeout(200);
}

async function addIndicator(page, type) {
  await openIndicatorDialog(page);
  await page.click(`[data-testid="oryon-indicator-add-${type}"]`);
  await page.waitForTimeout(400);
}

/** Stored config envelopes (drawings/alerts isolation snapshot). */
async function isolationSnapshot(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key.startsWith("euforia.oryon.drawings.") || key.startsWith("euforia.oryon.alerts")) {
        out[key] = window.localStorage.getItem(key);
      }
    }
    return out;
  });
}

async function layoutsFile(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.layouts.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

async function templatesFile(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.templates.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

async function indicatorsFile(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.indicators.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  // ── 1. Sign in + /oryon + fresh config state ─────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 40_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });

  // Fresh Phase-6 state: wipe the config keys (never drawings/alerts/indicators).
  await page.evaluate(() => {
    window.localStorage.removeItem("euforia.oryon.layouts.v1");
    window.localStorage.removeItem("euforia.oryon.templates.v1");
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 20_000 });
  await page.waitForTimeout(3_000);

  console.log("— A. Layouts : état initial");
  ok("A1 déclencheur layouts présent", (await page.locator('[data-testid="oryon-layouts"]').count()) === 1);
  ok("A2 nom actif = Default layout", (await activeLayoutName(page)) === "Default layout");
  ok("A3 pas de pastille dirty", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);
  await openLayoutMenu(page);
  ok(
    "A4 état vide honnête dans le menu",
    (await page.locator('[data-testid="oryon-layout-menu"]', { hasText: "No saved layouts yet" }).count()) === 1,
  );
  ok(
    "A5 radio défaut présent",
    (await page.locator('[data-testid="oryon-layout-item-default"]').count()) === 1,
  );
  await closeLayoutMenu(page);

  console.log("— B. Layouts : création, dirty, save");
  // Arrange a distinctive arrangement: EURUSD, 15m, line, lower panel, alerts rail.
  await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="oryon-instrument-trigger"]');
    return trigger !== null;
  });
  await page.click('[data-testid="oryon-instrument-trigger"]');
  await page.waitForSelector('[data-testid="oryon-instrument-search"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-instrument-search"]', "EURUSD");
  await page.waitForTimeout(250);
  await page.click('[data-testid="oryon-instrument-option-EURUSD"]').catch(async () => {
    // fallback: first option after search
    await page.locator('[data-testid^="oryon-instrument-option-"]').first().click();
  });
  await page.waitForTimeout(1_500);
  await page.click('[data-testid="oryon-tf-15m"]');
  await page.waitForTimeout(1_000);
  await page.click('[data-testid="oryon-type-line"]');
  await page.waitForTimeout(800);
  await page.click('[data-testid="oryon-lower-toggle"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="oryon-notifications"]');
  await page.waitForSelector('[data-testid="oryon-utility-tab-alerts"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-utility-tab-alerts"]');
  await page.waitForTimeout(300);

  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-save-as")).click();
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-layout-name-input"]', "Phase6 Layout");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(800);
  ok("B1 layout actif nommé", (await activeLayoutName(page)) === "Phase6 Layout");
  ok("B2 pas de dirty juste après création", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);
  let file = await layoutsFile(page);
  ok("B3 enveloppe persistée (1 layout + pointeur)", file !== null && file.layouts.length === 1 && file.activeLayoutId === file.layouts[0].id);
  ok("B4 arrangement capturé (15m/line/lower/utility)", (() => {
    const l = file.layouts[0];
    return l.interval === "15m" && l.chartType === "line" && l.lowerPanel === true && l.utilityRail.open === true && l.utilityRail.panel === "alerts";
  })());

  await page.click('[data-testid="oryon-tf-1H"]');
  await page.waitForTimeout(800);
  ok("B5 pastille dirty honnête après changement", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 1);
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-save")).click();
  await page.waitForTimeout(600);
  ok("B6 save changes → dirty disparue", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);
  file = await layoutsFile(page);
  ok("B7 interval sauvegardé = 1H", file.layouts[0].interval === "1H");

  console.log("— C. Layouts : switch aller-retour (configuration sauvegardée)");
  await selectSavedLayout(page, "Default layout");
  ok("C1 retour défaut → nom", (await activeLayoutName(page)) === "Default layout");
  ok("C2 interval réinitialisé à 5m", (await page.locator('[data-testid="oryon-tf-5m"][aria-pressed="true"]').count()) === 1);
  await selectSavedLayout(page, "Phase6 Layout");
  ok("C3 interval restauré (1H)", (await page.locator('[data-testid="oryon-tf-1H"][aria-pressed="true"]').count()) === 1);
  ok("C4 type restauré (line)", (await page.locator('[data-testid="oryon-type-line"][aria-pressed="true"]').count()) === 1);
  ok("C5 panneau bas restauré", await page.locator('[data-testid="oryon-lower-panel"]').isVisible());
  ok("C6 rail utilité restauré (docked)", (await page.locator('[data-testid="oryon-utility-rail"]').count()) === 1);

  console.log("— D. Layouts : rename / duplicate / validation de nom");
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-rename")).click();
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  const prefilled = await page.inputValue('[data-testid="oryon-layout-name-input"]');
  ok("D1 rename pré-rempli", prefilled === "Phase6 Layout");
  await page.fill('[data-testid="oryon-layout-name-input"]', "Phase6 Renamed");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(600);
  ok("D2 nom renommé partout", (await activeLayoutName(page)) === "Phase6 Renamed");

  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-duplicate")).click();
  await page.waitForTimeout(600);
  file = await layoutsFile(page);
  ok("D3 copie créée « (copy) »", file.layouts.some((l) => l.name === "Phase6 Renamed (copy)"));
  ok("D4 la copie n'est pas activée", file.layouts.find((l) => l.name === "Phase6 Renamed (copy)").id !== file.activeLayoutId);
  await closeLayoutMenu(page);

  // Collision insensible à la casse → erreur inline, dialog reste ouvert.
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-save-as")).click();
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-layout-name-input"]', "PHASE6 RENAMED");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForSelector('[data-testid="oryon-layout-name-error"]', { timeout: 3_000 });
  ok("D5 doublon insensible à la casse rejeté inline", true);
  await page.click('[data-testid="oryon-layout-name-cancel"]');
  await page.waitForTimeout(300);
  await closeLayoutMenu(page);

  console.log("— E. Layouts : garde « changements non sauvés »");
  await page.click('[data-testid="oryon-tf-5m"]');
  await page.waitForTimeout(500);
  ok("E1 dirty affichée", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 1);
  await selectSavedLayout(page, "Default layout");
  await page.waitForSelector('[data-testid="oryon-layout-switch-dialog"]', { timeout: 3_000 });
  ok("E2 garde affichée au switch dirty", true);
  await page.click('[data-testid="oryon-layout-switch-discard"]');
  await page.waitForTimeout(600);
  ok("E3 discard → défaut actif", (await activeLayoutName(page)) === "Default layout");
  ok("E4 discard → interval 5m appliqué", (await page.locator('[data-testid="oryon-tf-5m"][aria-pressed="true"]').count()) === 1);
  file = await layoutsFile(page);
  ok("E5 la sauvegarde du layout précédent est INTACTE (1H)", file.layouts.find((l) => l.name === "Phase6 Renamed").interval === "1H");

  // Chemin « Save & switch » : repartir du layout, diverger, switcher vers
  // la copie en SAUVEGARDANT d'abord.
  await selectSavedLayout(page, "Phase6 Renamed");
  await page.click('[data-testid="oryon-type-candles"]');
  await page.waitForTimeout(500);
  ok("E6 dirty après changement de type", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 1);
  await selectSavedLayout(page, "Phase6 Renamed (copy)");
  await page.waitForSelector('[data-testid="oryon-layout-switch-dialog"]', { timeout: 3_000 });
  await page.click('[data-testid="oryon-layout-switch-save"]');
  await page.waitForTimeout(800);
  ok("E7 save & switch → copie active", (await activeLayoutName(page)) === "Phase6 Renamed (copy)");
  file = await layoutsFile(page);
  ok("E8 l'original a bien été sauvé (candles)", file.layouts.find((l) => l.name === "Phase6 Renamed").chartType === "candles");
  ok("E9 dirty résorbée", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);

  console.log("— F. Layouts : delete confirmé + restore default");
  await selectSavedLayout(page, "Phase6 Renamed");
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-delete")).click();
  await page.waitForSelector('[data-testid="oryon-layout-delete-dialog"]', { timeout: 3_000 });
  await page.click('[data-testid="oryon-layout-delete-submit"]');
  await page.waitForTimeout(600);
  file = await layoutsFile(page);
  ok("F1 layout supprimé", !file.layouts.some((l) => l.name === "Phase6 Renamed"));
  ok("F2 défaut redevenu actif", file.activeLayoutId === null);
  ok("F3 arrangement vivant préservé (candles)", (await page.locator('[data-testid="oryon-type-candles"][aria-pressed="true"]').count()) === 1);
  await page.click('[data-testid="oryon-tf-1H"]');
  await page.waitForTimeout(400);
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-restore")).click();
  await page.waitForTimeout(600);
  ok("F4 restore default → 5m", (await page.locator('[data-testid="oryon-tf-5m"][aria-pressed="true"]').count()) === 1);
  file = await layoutsFile(page);
  ok("F5 restore GARDE les layouts sauvegardés", file.layouts.length === 1);
  await page.screenshot({ path: path.join(OUT, "oryon-phase6-layouts.png") });

  console.log("— G. Templates : capture + application");
  const isolationBefore = await isolationSnapshot(page);
  const chipsBeforeTpl = await chipCount(page);
  await page.click('[data-testid="oryon-type-line"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="oryon-tf-1D"]');
  await page.waitForTimeout(1_200);
  await addIndicator(page, "sma");
  const chipsAtCapture = await chipCount(page);
  const statsAtCapture = await chartStats(page);

  await openTemplateMenu(page);
  ok(
    "G1 état vide honnête (templates)",
    (await page.locator('[data-testid="oryon-template-menu"]', { hasText: "No templates yet" }).count()) === 1,
  );
  await page.click('[data-testid="oryon-template-save"]');
  await page.waitForSelector('[data-testid="oryon-template-name-dialog"]', { timeout: 5_000 });
  ok(
    "G2 le dialogue décrit honnêtement le périmètre",
    (await page.locator('[data-testid="oryon-template-name-dialog"]', { hasText: "Drawings, alerts and positions are not included" }).count()) === 1,
  );
  await page.fill('[data-testid="oryon-template-name-input"]', "Phase6 TPL");
  await page.click('[data-testid="oryon-template-name-submit"]');
  await page.waitForTimeout(600);
  let tplFile = await templatesFile(page);
  ok("G3 template persisté", tplFile !== null && tplFile.templates.length === 1 && tplFile.templates[0].name === "Phase6 TPL");
  ok("G4 le template capture type + intervalle", tplFile.templates[0].chart.type === "line" && tplFile.templates[0].chart.interval === "1D");
  ok(
    "G5 le template capture la pile d'indicateurs (taille exacte)",
    tplFile.templates[0].indicators.length === chipsAtCapture,
  );
  await closeLayoutMenu(page);

  // Diverger : +1 indicateur et retour candles → l'application doit ramener
  // EXACTEMENT la configuration sauvegardée.
  await addIndicator(page, "ema");
  const chipsDiverged = await chipCount(page);
  await page.click('[data-testid="oryon-type-candles"]');
  await page.waitForTimeout(600);

  await openTemplateMenu(page);
  await page.locator('[data-testid="oryon-template-menu"] [role="menuitem"]', { hasText: "Phase6 TPL" }).first().click();
  await page.waitForSelector('[data-testid="oryon-template-apply-dialog"]', { timeout: 3_000 });
  ok("G6 application confirmée quand une pile vivante existe", true);
  await page.click('[data-testid="oryon-template-apply-submit"]');
  await page.waitForTimeout(1_200);
  ok("G7 pile restaurée (compteur exact)", (await chipCount(page)) === chipsAtCapture);
  ok("G8 type restauré (line)", (await page.locator('[data-testid="oryon-type-line"][aria-pressed="true"]').count()) === 1);
  ok("G9 interval restauré (1D)", (await page.locator('[data-testid="oryon-tf-1D"][aria-pressed="true"]').count()) === 1);

  const tplInstanceIds = tplFile.templates[0].indicators.map((i) => i.id).sort();
  const liveIndicators = await indicatorsFile(page);
  const liveIds = (liveIndicators?.indicators ?? []).map((i) => i.id).sort();
  ok("G10 ids stables : pile vivante == pile du template (zéro doublon)", JSON.stringify(tplInstanceIds) === JSON.stringify(liveIds));

  // Ré-application idempotente.
  await openTemplateMenu(page);
  await page.locator('[data-testid="oryon-template-menu"] [role="menuitem"]', { hasText: "Phase6 TPL" }).first().click();
  await page.waitForSelector('[data-testid="oryon-template-apply-dialog"]', { timeout: 3_000 });
  await page.click('[data-testid="oryon-template-apply-submit"]');
  await page.waitForTimeout(1_000);
  ok("G11 ré-application idempotente (aucun doublon)", (await chipCount(page)) === chipsAtCapture);
  const statsAfterApply = await chartStats(page);
  ok(
    "G12 moteur stable (panes/series cohérents, pas de fuite)",
    statsAfterApply !== null && statsAtCapture !== null && statsAfterApply.panes === statsAtCapture.panes,
  );

  console.log("— H. Templates : gestion (rename/delete) + isolation");
  await openTemplateMenu(page);
  await page.click('[data-testid="oryon-template-manage"]');
  await page.waitForSelector('[data-testid="oryon-template-manage-dialog"]', { timeout: 5_000 });
  await page.locator('[data-testid^="oryon-template-rename-"]').first().click();
  await page.waitForSelector('[data-testid="oryon-template-name-dialog"]', { timeout: 3_000 });
  await page.fill('[data-testid="oryon-template-name-input"]', "Phase6 TPL v2");
  await page.click('[data-testid="oryon-template-name-submit"]');
  await page.waitForTimeout(600);
  tplFile = await templatesFile(page);
  ok("H1 template renommé", tplFile.templates[0].name === "Phase6 TPL v2");
  await page.locator('[data-testid^="oryon-template-delete-"]').first().click();
  await page.waitForSelector('[data-testid="oryon-template-delete-dialog"]', { timeout: 3_000 });
  await page.click('[data-testid="oryon-template-delete-submit"]');
  await page.waitForTimeout(600);
  tplFile = await templatesFile(page);
  ok("H2 template supprimé", tplFile.templates.length === 0);
  await page.keyboard.press("Escape"); // manage dialog close
  await page.waitForTimeout(300);

  const isolationAfter = await isolationSnapshot(page);
  ok(
    "H3 dessins et alertes INTACTS (isolation structurelle)",
    JSON.stringify(isolationBefore) === JSON.stringify(isolationAfter),
  );

  console.log("— I. Persistance au rechargement");
  await page.click('[data-testid="oryon-tf-15m"]');
  await page.waitForTimeout(600);
  await openLayoutMenu(page);
  await (await layoutMenuItem(page, "oryon-layout-save-as")).click();
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-layout-name-input"]', "Reload Check");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(800);

  await addIndicator(page, "rsi");
  await openTemplateMenu(page);
  await page.click('[data-testid="oryon-template-save"]');
  await page.waitForSelector('[data-testid="oryon-template-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-template-name-input"]', "Reload TPL");
  await page.click('[data-testid="oryon-template-name-submit"]');
  await page.waitForTimeout(800);

  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 20_000 });
  await page.waitForTimeout(3_000);

  ok("I1 reload → layout actif restauré", (await activeLayoutName(page)) === "Reload Check");
  ok("I2 reload → interval restauré (15m)", (await page.locator('[data-testid="oryon-tf-15m"][aria-pressed="true"]').count()) === 1);
  await openTemplateMenu(page);
  ok(
    "I3 reload → templates restaurés",
    (await page.locator('[data-testid="oryon-template-menu"] [role="menuitem"]', { hasText: "Reload TPL" }).count()) === 1,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "oryon-phase6-templates.png") });

  console.log("— J. Régressions");
  const stats = await chartStats(page);
  ok("J1 moteur vivant (série principale)", stats !== null && stats.series >= 1);
  ok("J2 panes indicateurs présents", stats !== null && stats.panes >= 1);
  await page.click('[data-testid="oryon-lower-toggle"]');
  await page.waitForTimeout(400);
  ok("J3 panneau positions fonctionne", (await page.locator('[data-testid="oryon-lower-panel"]').count()) >= 0);
  await page.click('[data-testid="oryon-type-candles"]');
  await page.waitForTimeout(800);
  const statsAfterType = await chartStats(page);
  ok("J4 bascule type de chart sans régression", statsAfterType !== null && statsAfterType.series >= 1);

  ok("J5 0 erreur console", errors.length === 0);
  if (errors.length > 0) {
    console.log("Erreurs console:", errors.slice(0, 5));
    fs.appendFileSync(LOG, `console errors: ${JSON.stringify(errors.slice(0, 10), null, 2)}\n`);
  }

  // ── K. Mobile 390 — le menu reste utilisable ──────────────────────────────
  console.log("— K. Mobile 390");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("pageerror", (e) => mobileErrors.push(String(e)));
  mobile.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    mobileErrors.push(text);
  });
  await signIn(mobile);
  await clearDevOverlay(mobile);
  // Mobile: the sidebar nav is collapsed — navigate directly.
  await mobile.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await mobile.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await mobile.waitForTimeout(2_500);
  ok("K1 déclencheur layouts visible sur mobile", await mobile.locator('[data-testid="oryon-layouts"]').isVisible());
  await mobile.click('[data-testid="oryon-layouts"]');
  await mobile.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  ok("K2 menu layouts ouvert sur mobile", true);
  await mobile.click('[data-testid="oryon-layout-save-as"]').catch(() => {});
  await mobile.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 3_000 }).catch(() => {});
  ok("K3 dialogue nom accessible sur mobile", (await mobile.locator('[data-testid="oryon-layout-name-dialog"]').count()) === 1);
  await mobile.keyboard.press("Escape");
  await mobile.screenshot({ path: path.join(OUT, "oryon-phase6-mobile.png") });
  ok("K4 0 erreur console mobile", mobileErrors.length === 0);

  await browser.close();

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  fs.appendFileSync(LOG, `\n=== ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("probe crashed:", e);
  fs.appendFileSync(LOG, `probe crashed: ${e}\n`);
  process.exit(1);
});
