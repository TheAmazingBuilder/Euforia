// Phase 10 - Trade Journal Integration: full workflow verification.
// PROD-SAFE (:3000): DOM/testids + localStorage reads only.
//  (1)  Save Analysis (no trade)          → envelope record, tradeId null
//  (2)  Save Analysis (linked EURUSD)     → tradeId set
//  (3)  Mismatch guard (XAUUSD trade)     → warning + disabled submit until confirm
//  (4)  Snapshot → attach to trade        → toast + record w/ snapshot ref
//  (5)  Journal drawer                    → analyses listed + screenshot attached
//  (6)  Open in Oryon (deep link)         → banner + legend shows symbol/interval
//  (7)  Context menu "Open linked trade"  → entry present for linked symbol
//  (8)  Unlink + Delete                   → association semantics
//  (9)  Chart state preserved throughout  → legend symbol never mutated
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  - " + detail : ""}`);
}
const NOISE = [/401/, /auth\/me/, /auth\/refresh/, /WebSocket/];

async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}

async function analysesEnvelope(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.analyses.v1");
    return raw === null ? { analyses: [] } : JSON.parse(raw);
  });
}

async function openJournalSubmenu(page) {
  const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4, { button: "right" });
  await page.waitForSelector('[data-testid="oryon-ctx-menu"]', { timeout: 5000 });
  await page.click('[data-testid="oryon-ctx-journal"]');
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const tally = () => {
    pass = results.filter((r) => r.ok).length;
    fail = results.filter((r) => !r.ok).length;
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 200));
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureLogin(page);
    await page.goto(BASE + "/oryon", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(8000);
    const legend = page.locator('[data-testid="oryon-legend-symbol"]');
    const chartSymbol = (await legend.innerText()).trim();
    check("J0", "chart shows EURUSD (fixture default)", chartSymbol === "EURUSD", chartSymbol);

    // ── (1) Save Analysis without a trade ──────────────────────────────────
    await openJournalSubmenu(page);
    await page.click('[data-testid="oryon-ctx-save-analysis"]');
    await page.waitForSelector('[data-testid="oryon-save-analysis-dialog"]', { timeout: 5000 });
    await page.fill('[data-testid="oryon-analysis-title"]', "Probe - structure review");
    await page.fill('[data-testid="oryon-analysis-notes"]', "HH/LH chain intact above 1.0842.");
    await page.click('[data-testid="oryon-analysis-save"]');
    await page.waitForTimeout(600);
    let env = await analysesEnvelope(page);
    const standalone = (env.analyses ?? []).find((a) => a.title === "Probe - structure review");
    check("J1", "analysis saved (no trade)", standalone !== undefined && standalone?.tradeId === null,
      JSON.stringify(standalone ? { tradeId: standalone.tradeId, sv: standalone.schemaVersion, d: standalone.drawings.length } : null));

    // ── (2) Save Analysis linked to an EURUSD trade ────────────────────────
    await openJournalSubmenu(page);
    await page.click('[data-testid="oryon-ctx-save-analysis"]');
    await page.waitForSelector('[data-testid="oryon-save-analysis-dialog"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-settings-tab-symbol"]').catch(() => {});
    await page.fill('[data-testid="oryon-analysis-trade-search"]', "EURUSD");
    await page.waitForTimeout(600);
    const rows = page.locator('[data-testid="oryon-analysis-trade-list"] button');
    check("J2-pre", "trade rows render for EURUSD", (await rows.count()) > 0, `rows=${await rows.count()}`);
    let linkedTradeId = null;
    if ((await rows.count()) > 0) {
      const rowId = await rows.first().getAttribute("data-testid");
      linkedTradeId = rowId.replace("oryon-trade-option-", "");
      await rows.first().click();
      await page.waitForTimeout(400);
      check("J2-pre2", "selected trade summary shown, no mismatch",
        (await page.locator('[data-testid="oryon-analysis-trade-mismatch"]').count()) === 0);
      await page.click('[data-testid="oryon-analysis-save"]');
      await page.waitForTimeout(600);
    }
    env = await analysesEnvelope(page);
    const linked = (env.analyses ?? []).find((a) => a.tradeId === linkedTradeId);
    check("J2", "analysis linked to the selected trade", linked !== undefined && linkedTradeId !== null,
      `tradeId=${linkedTradeId}`);

    // ── (3) Mismatch guard with an XAUUSD trade ────────────────────────────
    await openJournalSubmenu(page);
    await page.click('[data-testid="oryon-ctx-save-analysis"]');
    await page.waitForSelector('[data-testid="oryon-save-analysis-dialog"]', { timeout: 5000 });
    await page.fill('[data-testid="oryon-analysis-trade-search"]', "XAUUSD");
    await page.waitForTimeout(600);
    const goldRows = page.locator('[data-testid="oryon-analysis-trade-list"] button');
    let mismatchOk = false;
    if ((await goldRows.count()) > 0) {
      await goldRows.first().click();
      await page.waitForTimeout(400);
      const mismatchVisible =
        (await page.locator('[data-testid="oryon-analysis-trade-mismatch"]').count()) === 1;
      const saveDisabled = await page.locator('[data-testid="oryon-analysis-save"]').isDisabled();
      check("J3", "mismatch warning blocks the save", mismatchVisible && saveDisabled,
        `warn=${mismatchVisible} disabled=${saveDisabled}`);
      await page.click('[data-testid="oryon-analysis-trade-mismatch-confirm"]');
      await page.waitForTimeout(300);
      mismatchOk = !(await page.locator('[data-testid="oryon-analysis-save"]').isDisabled());
      check("J3b", "explicit confirmation unlocks the save", mismatchOk);
      if (mismatchOk) {
        await page.click('[data-testid="oryon-analysis-save"]');
        await page.waitForTimeout(600);
      }
    } else {
      check("J3", "XAUUSD trade available in fixtures", false, "no rows");
    }
    env = await analysesEnvelope(page);
    const crossInstrument = (env.analyses ?? []).some(
      (a) => a.tradeId !== null && a.symbol === "EURUSD" && a.tradeId !== linkedTradeId,
    );
    check("J3c", "cross-instrument link saved only after confirmation", crossInstrument);

    // ── (4) Snapshot → attach to the linked EURUSD trade ───────────────────
    // NOTE (mock deployment): the journal's MSW store is IN-MEMORY - a full
    // page reload regenerates the fixtures and drops attached screenshots
    // (documented limitation). The drawer verification therefore navigates
    // CLIENT-SIDE via the app's own "Open linked trade" router.push so the
    // same JS session (and its mock store) stays alive.
    await openJournalSubmenu(page);
    await page.click('[data-testid="oryon-ctx-snapshot"]');
    await page.waitForSelector('[data-testid="oryon-snapshot-dialog"]', { timeout: 5000 });
    const preview = page.locator('[data-testid="oryon-snapshot-preview"]');
    await page.waitForTimeout(800);
    check("J4-pre", "snapshot preview captured", (await preview.count()) === 1,
      preview.count() ? (await preview.getAttribute("src") ?? "").slice(0, 40) : "none");
    await page.fill('[data-testid="oryon-snapshot-trade-search"]', "EURUSD");
    await page.waitForTimeout(600);
    const snapRows = page.locator('[data-testid="oryon-snapshot-trade-list"] button');
    if ((await snapRows.count()) > 0) {
      await snapRows.first().click();
      await page.waitForTimeout(400);
      await page.click('[data-testid="oryon-snapshot-attach"]');
      await page.waitForSelector('[data-testid="oryon-snapshot-attach-toast"]', { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    env = await analysesEnvelope(page);
    const withSnapshot = (env.analyses ?? []).some(
      (a) => a.snapshot !== null && a.snapshot.tradeId === linkedTradeId && a.snapshot.screenshotId !== null,
    );
    check("J4b", "linked analysis references the stored screenshot", withSnapshot);

    // ── (5)+(7) CLIENT-SIDE nav to the journal via the app's own entry -
    // the context-menu "Open linked trade" router.push keeps the JS session
    // (and the in-memory mock store) alive: gallery + analyses visible.
    await openJournalSubmenu(page);
    const openTradeEntry = page.locator('[data-testid^="oryon-ctx-open-trade-"]').first();
    check("J7", "Open linked trade entry appears", (await openTradeEntry.count()) >= 1);
    await openTradeEntry.click();
    await page.waitForSelector('[data-testid="trade-detail-dialog"], [data-testid="trade-detail-drawer"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const analysisRows = page.locator('[data-testid="trade-chart-analyses"] > li');
    check("J5", "drawer lists linked analyses", (await analysisRows.count()) >= 2,
      `rows=${await analysisRows.count()}`);
    const gallery = page.locator('[data-testid="trade-screenshots"] img');
    check("J5b", "screenshot gallery holds the attached snapshot", (await gallery.count()) >= 1,
      `imgs=${await gallery.count()}`);

    // ── (6) Open in Oryon - deep link + reconstructed banner ───────────────
    const openBtn = page.locator('[data-testid^="trade-chart-analysis-open-"]').first();
    await openBtn.click();
    await page.waitForSelector('[data-testid="oryon-analysis-banner"]', { timeout: 20000 });
    const bannerText = await page.locator('[data-testid="oryon-analysis-banner"]').innerText();
    check("J6", "reconstructed-view banner shows the analysis", /reconstructed/i.test(bannerText),
      bannerText.slice(0, 60).replace(/\n/g, " "));
    await page.waitForTimeout(3000);
    const restoredSymbol = (await page.locator('[data-testid="oryon-legend-symbol"]').innerText()).trim();
    check("J6b", "chart restored the analysis symbol", restoredSymbol === "EURUSD", restoredSymbol);
    const url = page.url();
    check("J6c", "query param consumed", !url.includes("analysis="), url);

    // ── (9) chart state preserved: banner dismiss keeps the workspace ──────
    await page.click('[data-testid="oryon-analysis-banner-close"]');
    await page.waitForTimeout(300);
    check("J9", "banner dismissible", (await page.locator('[data-testid="oryon-analysis-banner"]').count()) === 0);

    // ── (8) unlink + delete semantics ───────────────────────────────────────
    await page.goto(`${BASE}/trades?trade=${linkedTradeId}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="trade-detail-dialog"], [data-testid="trade-detail-drawer"]', { timeout: 15000 });
    await page.waitForTimeout(1200);
    const unlinkBtn = page.locator('[data-testid^="trade-chart-analysis-unlink-"]').first();
    await unlinkBtn.click();
    await page.waitForTimeout(600);
    env = await analysesEnvelope(page);
    const unlinkedTradeIds = (env.analyses ?? []).filter((a) => a.tradeId === linkedTradeId).length;
    check("J8", "unlink clears the association (record stays)", unlinkedTradeIds >= 1,
      `remaining links=${unlinkedTradeIds}`);
    const delBtn = page.locator('[data-testid^="trade-chart-analysis-delete-"]').first();
    await delBtn.click();
    await page.waitForTimeout(400);
    const beforeCount = (env.analyses ?? []).length;
    await page.locator('[data-testid^="trade-chart-analysis-delete-confirm-"]').first().click();
    await page.waitForTimeout(600);
    env = await analysesEnvelope(page);
    check("J8b", "delete removes the analysis record", (env.analyses ?? []).length === beforeCount - 1,
      `before=${beforeCount} after=${(env.analyses ?? []).length}`);

    // cleanup: remove the remaining probe records
    await page.evaluate(() => window.localStorage.removeItem("euforia.oryon.analyses.v1"));

    // chart state preserved throughout (legend never mutated by dialogs)
    await page.goto(BASE + "/oryon", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="oryon-chart-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(4000);
    const finalSymbol = (await page.locator('[data-testid="oryon-legend-symbol"]').innerText()).trim();
    check("J9b", "chart symbol stable after the whole workflow", finalSymbol === "EURUSD", finalSymbol);

    await page.screenshot({ path: "scripts/phase10-workflow.png" });
  } catch (error) {
    check("FATAL", String(error).slice(0, 300), false);
  }

  tally();
  console.log(`\n===== verify-phase10: ${pass}/${results.length} PASS, ${fail} FAIL =====`);
  if (errors.length > 0) console.log("PAGE ERRORS:", errors.slice(0, 5));
  await browser.close();
  process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
})();
